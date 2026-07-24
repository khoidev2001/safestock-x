import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { IncidentController } from "../incident.controller";
import { IncidentService } from "../incident.service";
import { AuthenticatedRequest } from "../../auth/authenticated-request";

/**
 * Gap B (IDOR): mọi endpoint /incidents chỉ được chạm sự cố kho mình.
 * - scan/list nhận warehouseId trực tiếp → controller assert scope trước khi gọi service.
 * - timeline/explain/transition nhận incidentId → service tra kho chủ rồi assert scope.
 * Test tách 2 tầng: controller (scan/list) và service (getWithTimeline/transition).
 */
describe("IncidentController — chống IDOR (gap B, tầng controller)", () => {
  function makeController() {
    const incidents = {
      scanWarehouse: jest.fn().mockResolvedValue({ detected: 0 }),
      list: jest.fn().mockResolvedValue([]),
    };
    const ai = { explain: jest.fn() };
    const controller = new IncidentController(incidents as never, ai as never);
    return { controller, incidents };
  }

  const req = (warehouseId: string | null): AuthenticatedRequest =>
    ({ user: { userId: "u1", warehouseId } }) as never;

  it("scan kho khác → 403, KHÔNG quét", () => {
    const { controller, incidents } = makeController();
    expect(() => controller.scan(req("kho-A"), "kho-B")).toThrow(ForbiddenException);
    expect(incidents.scanWarehouse).not.toHaveBeenCalled();
  });

  it("scan đúng kho mình → cho qua", () => {
    const { controller, incidents } = makeController();
    controller.scan(req("kho-A"), "kho-A");
    expect(incidents.scanWarehouse).toHaveBeenCalledWith("kho-A");
  });

  it("list kho khác → 403", () => {
    const { controller, incidents } = makeController();
    expect(() => controller.list(req("kho-A"), "kho-B")).toThrow(ForbiddenException);
    expect(incidents.list).not.toHaveBeenCalled();
  });

  it("user toàn xã (null) list mọi kho → cho qua", () => {
    const { controller, incidents } = makeController();
    controller.list(req(null), "kho-B", undefined);
    expect(incidents.list).toHaveBeenCalledWith("kho-B", undefined);
  });

  it("timeline truyền scope kho của người gọi xuống service", () => {
    const incidents = {
      getWithTimeline: jest.fn().mockResolvedValue({ id: "inc-1" }),
    };
    const controller = new IncidentController(incidents as never, { explain: jest.fn() } as never);
    controller.timeline(req("kho-A"), "inc-1");
    expect(incidents.getWithTimeline).toHaveBeenCalledWith("inc-1", "kho-A");
  });

  it("acknowledge truyền scope kho xuống service", () => {
    const incidents = { transition: jest.fn().mockResolvedValue({ id: "inc-1" }) };
    const controller = new IncidentController(incidents as never, { explain: jest.fn() } as never);
    controller.acknowledge(req("kho-A"), "inc-1", { note: "xong" });
    expect(incidents.transition).toHaveBeenCalledWith(
      "inc-1",
      "acknowledge",
      "u1",
      "xong",
      "kho-A",
    );
  });
});

describe("IncidentService — chống IDOR (gap B, tầng service)", () => {
  function makeService(incidentWarehouseId: string | null) {
    const prisma = {
      incident: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            incidentWarehouseId
              ? { id: "inc-1", warehouseId: incidentWarehouseId, evidence: [], actions: [] }
              : null,
          ),
        update: jest.fn().mockResolvedValue({ id: "inc-1" }),
      },
      $transaction: jest.fn(),
    };
    const service = new IncidentService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it("getWithTimeline: trưởng thôn A xem sự cố kho B → 403", async () => {
    const { service } = makeService("kho-B");
    await expect(service.getWithTimeline("inc-1", "kho-A")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("getWithTimeline: đúng kho mình → trả sự cố", async () => {
    const { service } = makeService("kho-A");
    await expect(service.getWithTimeline("inc-1", "kho-A")).resolves.toMatchObject({ id: "inc-1" });
  });

  it("getWithTimeline: caller nội bộ (scope undefined) → không giới hạn kho", async () => {
    const { service } = makeService("kho-B");
    await expect(service.getWithTimeline("inc-1")).resolves.toMatchObject({ id: "inc-1" });
  });

  it("getWithTimeline: sự cố không tồn tại → 404 (không rò rỉ thành 403)", async () => {
    const { service } = makeService(null);
    await expect(service.getWithTimeline("inc-1", "kho-A")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("transition: trưởng thôn A đổi trạng thái sự cố kho B → 403, KHÔNG cập nhật", async () => {
    const { service, prisma } = makeService("kho-B");
    await expect(
      service.transition("inc-1", "resolve", "u1", undefined, "kho-A"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

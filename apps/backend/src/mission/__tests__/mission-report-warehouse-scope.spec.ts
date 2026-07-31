import { NotFoundException } from "@nestjs/common";
import { MissionService } from "../mission.service";

/**
 * H1 regression: resolveReportWarehouseId phải khoá theo organization của người báo cáo.
 * Không actor nào (kể cả trưởng thôn toàn xã) được ghi báo cáo sang kho tổ chức khác.
 */
function makeService(options: {
  actorOrganizationId?: string | null;
  warehouseFindFirst: jest.Mock;
}) {
  const userFindUnique = jest
    .fn()
    .mockResolvedValue(
      options.actorOrganizationId === null
        ? null
        : { organizationId: options.actorOrganizationId ?? "org-a" },
    );
  const prisma = {
    user: { findUnique: userFindUnique },
    warehouse: { findFirst: options.warehouseFindFirst },
  };
  const service = new MissionService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, userFindUnique };
}

describe("MissionService.resolveReportWarehouseId tenant scope", () => {
  it("từ chối khi kho scope thuộc tổ chức khác", async () => {
    const warehouseFindFirst = jest.fn().mockResolvedValue(null); // scoped lookup with org filter miss
    const { service, prisma } = makeService({ warehouseFindFirst });

    await expect(
      service.resolveReportWarehouseId("reporter-1", "wh-other-org"),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wh-other-org", organizationId: "org-a" },
        select: { id: true },
      }),
    );
  });

  it("từ chối khi requestedId trỏ sang kho tổ chức khác (actor toàn xã)", async () => {
    const warehouseFindFirst = jest.fn().mockResolvedValue(null);
    const { service, prisma } = makeService({ warehouseFindFirst });

    await expect(
      service.resolveReportWarehouseId("reporter-1", null, "wh-cross-tenant"),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wh-cross-tenant", organizationId: "org-a" },
        select: { id: true },
      }),
    );
  });

  it("chấp nhận kho scope cùng tổ chức", async () => {
    const warehouseFindFirst = jest.fn().mockResolvedValue({ id: "wh-scope" });
    const { service } = makeService({ warehouseFindFirst });

    await expect(service.resolveReportWarehouseId("reporter-1", "wh-scope")).resolves.toBe(
      "wh-scope",
    );
  });

  it("mặc định về kho CENTRAL cùng tổ chức khi không có scope/chỉ định", async () => {
    const warehouseFindFirst = jest.fn().mockResolvedValue({ id: "wh-central" });
    const { service, prisma } = makeService({ warehouseFindFirst });

    await expect(service.resolveReportWarehouseId("reporter-1")).resolves.toBe("wh-central");
    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: "CENTRAL", organizationId: "org-a" },
      }),
    );
  });

  it("ném NotFound khi không tìm thấy người báo cáo", async () => {
    const warehouseFindFirst = jest.fn();
    const { service } = makeService({ actorOrganizationId: null, warehouseFindFirst });

    await expect(service.resolveReportWarehouseId("ghost")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(warehouseFindFirst).not.toHaveBeenCalled();
  });
});

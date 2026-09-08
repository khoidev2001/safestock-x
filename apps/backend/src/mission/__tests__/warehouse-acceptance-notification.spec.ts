import { MissionWarehouseRequestStatus, UserRole } from "@prisma/client";
import { MissionWarehouseRequestService } from "../mission-warehouse-request.service";

/**
 * Kho bấm "tiếp nhận" — ai được báo, và báo lúc nào.
 *
 * Lực lượng hiện trường chỉ được gọi ở phiếu CUỐI CÙNG. Báo sớm hơn là nói dối
 * ("các kho đã nhận lệnh" trong khi một kho còn chưa mở ra), báo từng phiếu là
 * mỗi món một lần rung điện thoại cho đúng một chuyến đi.
 */

interface Fixture {
  /** Số phiếu của nhiệm vụ vẫn còn nằm chờ kho mở ra, ĐẾM SAU cú tiếp nhận này. */
  stillPending: number;
  acceptedCount?: number;
}

function makeService(fixture: Fixture) {
  const current = {
    id: "request-1",
    missionId: "mission-1",
    warehouseId: "warehouse-a",
    itemName: "Áo phao người lớn",
    unit: "chiếc",
    requestedQuantity: 40,
    status: MissionWarehouseRequestStatus.ACCEPTED,
    warehouse: { organizationId: "org-1", name: "Kho thôn Long Bình" },
  };
  const missionWarehouseRequest = {
    updateMany: jest.fn().mockResolvedValue({ count: fixture.acceptedCount ?? 1 }),
    findFirst: jest.fn().mockResolvedValue(current),
    count: jest.fn().mockResolvedValue(fixture.stillPending),
    findMany: jest
      .fn()
      .mockResolvedValue([{ warehouseId: "warehouse-a" }, { warehouseId: "warehouse-b" }]),
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ warehouseId: "warehouse-a" }) },
    mission: { findUnique: jest.fn().mockResolvedValue({ missionNo: 760 }) },
    missionWarehouseRequest,
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const service = new MissionWarehouseRequestService(
    prisma as never,
    {} as never,
    notifications as never,
  );
  return { service, notifications, missionWarehouseRequest };
}

function recipientsOf(notifications: { create: jest.Mock }): UserRole[] {
  return notifications.create.mock.calls.map((call) => call[0].recipientRole as UserRole);
}

describe("kho tiếp nhận yêu cầu vật tư", () => {
  it("còn phiếu chưa tiếp nhận thì chỉ báo điều phối", async () => {
    const { service, notifications } = makeService({ stillPending: 2 });

    await service.accept("request-1", "user-warehouse-a");

    expect(recipientsOf(notifications)).toEqual([UserRole.ADMIN]);
  });

  it("phiếu cuối cùng được tiếp nhận thì gọi thêm lực lượng hiện trường", async () => {
    const { service, notifications } = makeService({ stillPending: 0 });

    await service.accept("request-1", "user-warehouse-a");

    expect(recipientsOf(notifications)).toEqual([UserRole.ADMIN, UserRole.RESCUE]);
    const fieldCall = notifications.create.mock.calls.find(
      (call) => call[0].recipientRole === UserRole.RESCUE,
    );
    expect(fieldCall?.[0].missionId).toBe("mission-1");
    // Đếm KHO chứ không đếm phiếu: đội cần biết phải ghé mấy chỗ, không cần biết
    // mỗi chỗ có mấy dòng vật tư.
    expect(fieldCall?.[0].body).toContain("2 kho");
    // Và phải nói rõ không cần chờ đủ — kho nào xong trước thì tới lấy trước.
    expect(fieldCall?.[0].body).toContain("không phải chờ đủ tất cả");
  });

  it("bấm lại phiếu đã tiếp nhận thì không báo thêm lần nào", async () => {
    const { service, notifications } = makeService({ stillPending: 0, acceptedCount: 0 });

    await service.accept("request-1", "user-warehouse-a");

    expect(notifications.create).not.toHaveBeenCalled();
  });
});

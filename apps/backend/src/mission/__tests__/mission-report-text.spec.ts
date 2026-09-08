import { IncidentType } from "@safestock/shared-types";
import { MissionService } from "../mission.service";
import { IncidentInput } from "../mission.compute";

/**
 * Lời kể gốc phải theo nhiệm vụ lập từ form quản trị.
 *
 * Trước đây `generatePlan` chỉ lưu các con số đã bóc tách, nên nhiệm vụ ra đời
 * với `reportText` rỗng. Đến lúc bấm "Lập bản tham mưu" thì không còn câu nào để
 * trích dẫn — mà mọi dữ kiện trong bản tham mưu đều bắt buộc phải chỉ ra được
 * nguồn. Kết quả là người dùng bị chặn ở một nhiệm vụ họ vừa mô tả đầy đủ.
 */
const incident: IncidentInput = {
  incidentType: IncidentType.FLOOD,
  location: "Thôn Long Châu",
  affectedPeople: 120,
  durationHours: 48,
  children: 10,
  elderly: 8,
  medicalSupportCases: 2,
};

function makeService() {
  const create = jest.fn().mockResolvedValue({ id: "mission-1", requirements: [] });
  const prisma = { mission: { create } };
  const service = new MissionService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const internals = service as unknown as {
    assertWarehouseAccess: jest.Mock;
    resolveIncidentLocation: jest.Mock;
    computeRequirementQuantities: jest.Mock;
  };
  internals.assertWarehouseAccess = jest.fn().mockResolvedValue(undefined);
  internals.resolveIncidentLocation = jest.fn().mockResolvedValue({
    name: "Thôn Long Châu",
    hamletId: "hamlet-long-chau",
    point: { lat: 13.38, lng: 109.1 },
  });
  internals.computeRequirementQuantities = jest.fn().mockResolvedValue([]);
  return { service, create };
}

describe("MissionService.generatePlan giữ lời kể gốc", () => {
  it("lưu nguyên văn mô tả để bản tham mưu còn nguồn trích dẫn", async () => {
    const { service, create } = makeService();

    await service.generatePlan(
      "warehouse-1",
      incident,
      "admin-1",
      undefined,
      null,
      "  Nước ngập sâu một mét, 120 người mắc kẹt ở Thôn Long Châu  ",
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportText: "Nước ngập sâu một mét, 120 người mắc kẹt ở Thôn Long Châu",
        }),
      }),
    );
  });

  it("không có mô tả thì để trống, không dựng câu thay người dùng", async () => {
    const { service, create } = makeService();

    await service.generatePlan("warehouse-1", incident, "admin-1");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportText: null }) }),
    );
  });
});

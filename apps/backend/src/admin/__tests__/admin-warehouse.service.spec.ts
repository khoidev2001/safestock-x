import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminWarehouseService } from "../admin-warehouse.service";

describe("AdminWarehouseService", () => {
  it("trả location và provenance trong danh sách kho", async () => {
    const prisma = fakePrisma();
    prisma.warehouse.findMany.mockResolvedValue([]);
    const service = new AdminWarehouseService(prisma as never);

    await expect(service.listAll("admin-a")).resolves.toEqual([]);
    expect(prisma.warehouse.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a" },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: expect.objectContaining({
        communeId: true,
        location: true,
        locationKey: true,
        locationMethod: true,
        locationSourceUrl: true,
        locationUpdatedAt: true,
      }),
    });
  });

  it("đánh dấu MANUAL_ADMIN và xóa nguồn đại diện khi quản trị viên ghim", async () => {
    const prisma = fakePrisma();
    prisma.warehouse.findFirst.mockResolvedValue({ id: "warehouse-1" });
    prisma.warehouse.update.mockImplementation(async (args) => ({ id: args.where.id }));
    const service = new AdminWarehouseService(prisma as never);

    await expect(service.updateLocation("admin-a", "warehouse-1", 13.4, 109.1)).resolves.toEqual({
      id: "warehouse-1",
    });
    expect(prisma.warehouse.update).toHaveBeenCalledWith({
      where: { id: "warehouse-1" },
      data: expect.objectContaining({
        lat: 13.4,
        lng: 109.1,
        locationMethod: "MANUAL_ADMIN",
        locationSourceName: null,
        locationSourceUrl: null,
        locationSourceRef: null,
        locationCheckedAt: null,
        locationMethodNote: expect.any(String),
        locationUpdatedAt: expect.any(Date),
      }),
      select: expect.objectContaining({ communeId: true, locationMethod: true }),
    });
  });

  it("từ chối tọa độ ngoài phạm vi", async () => {
    const service = new AdminWarehouseService(fakePrisma() as never);

    await expect(service.updateLocation("admin-a", "warehouse-1", 91, 109.1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateLocation("admin-a", "warehouse-1", 13.4, 181)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("báo không tìm thấy kho", async () => {
    const prisma = fakePrisma();
    prisma.warehouse.findFirst.mockResolvedValue(null);
    const service = new AdminWarehouseService(prisma as never);

    await expect(service.updateLocation("admin-a", "missing", 13.4, 109.1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: "missing", organizationId: "org-a" },
    });
  });
});

function fakePrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: "ADMIN", organizationId: "org-a" }),
    },
    warehouse: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
}

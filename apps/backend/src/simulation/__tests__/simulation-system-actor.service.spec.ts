import { ConflictException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { SimulationSystemActorService } from "../simulation-system-actor.service";

jest.mock("bcryptjs", () => ({ hash: jest.fn().mockResolvedValue("random-password-hash") }));

describe("SimulationSystemActorService", () => {
  const prisma = {
    warehouse: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), upsert: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.warehouse.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, organizationId: `org-${where.id}` }),
    );
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({
        id: `actor-${create.warehouseId}`,
        organizationId: create.organizationId,
        fullName: create.fullName,
        role: create.role,
        warehouseId: create.warehouseId,
      }),
    );
  });

  it("provision concurrency-safe một actor cho mỗi kho", async () => {
    const service = new SimulationSystemActorService(prisma as never);

    const ids = await Promise.all([
      service.getActorId("warehouse-1"),
      service.getActorId("warehouse-1"),
      service.getActorId("warehouse-1"),
    ]);

    expect(ids).toEqual(["actor-warehouse-1", "actor-warehouse-1", "actor-warehouse-1"]);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "system-loadcell+warehouse-1@local.invalid" },
        update: {},
        create: expect.objectContaining({
          organizationId: "org-warehouse-1",
          warehouseId: "warehouse-1",
          role: UserRole.WAREHOUSE,
          passwordHash: "random-password-hash",
        }),
      }),
    );
  });

  it("tách actor giữa hai kho", async () => {
    const service = new SimulationSystemActorService(prisma as never);

    await expect(
      Promise.all([service.getActorId("warehouse-a"), service.getActorId("warehouse-b")]),
    ).resolves.toEqual(["actor-warehouse-a", "actor-warehouse-b"]);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
  });

  it("từ chối reserved email đã trỏ sai warehouse", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "collision-user",
      organizationId: "org-warehouse-1",
      fullName: "Ordinary user",
      role: UserRole.WAREHOUSE,
      warehouseId: "warehouse-other",
    });
    const service = new SimulationSystemActorService(prisma as never);

    await expect(service.getActorId("warehouse-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("adopt exact reserved identity mà không ghi đè mật khẩu", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "existing-system-actor",
      organizationId: "org-warehouse-1",
      fullName: "[SYSTEM] Loadcell warehouse-1",
      role: UserRole.WAREHOUSE,
      warehouseId: "warehouse-1",
    });
    const service = new SimulationSystemActorService(prisma as never);

    await expect(service.getActorId("warehouse-1")).resolves.toBe("existing-system-actor");
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("revalidate actor sau lần provision thay vì cache ID vĩnh viễn", async () => {
    const service = new SimulationSystemActorService(prisma as never);
    await expect(service.getActorId("warehouse-1")).resolves.toBe("actor-warehouse-1");
    prisma.user.findUnique.mockResolvedValue({
      id: "actor-warehouse-1",
      organizationId: "org-warehouse-1",
      fullName: "Changed by admin",
      role: UserRole.WAREHOUSE,
      warehouseId: "warehouse-1",
    });

    await expect(service.getActorId("warehouse-1")).rejects.toBeInstanceOf(ConflictException);
  });
});

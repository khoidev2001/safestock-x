import { AuditService } from "../audit.service";

describe("AuditService organization scope", () => {
  it("returns only logs created by users in the reviewer's organization", async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as never);

    const result = await service.list("reviewer-1", { limit: 999 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { organizationId: "org-1" },
          {
            organizationId: null,
            actorId: { in: ["reviewer-1", "keeper-1"] },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "audit-1",
        actor: {
          id: "keeper-1",
          fullName: "Thủ kho",
          email: "keeper@example.test",
        },
      }),
    ]);
  });

  it("stores organization and warehouse snapshots on new audit entries", async () => {
    const prisma = makePrisma();
    prisma.auditLog.create = jest.fn().mockResolvedValue({ id: "audit-new" });
    const service = new AuditService(prisma as never);

    await service.record({
      actorId: "keeper-1",
      action: "INVENTORY_ADJUST",
      entity: "ItemBatch",
      entityId: "batch-1",
      reason: "Kiểm kê thực tế",
      warehouseId: "warehouse-1",
      correlationId: "request-1",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        warehouseId: "warehouse-1",
        correlationId: "request-1",
      }),
    });
  });

  it("does not query audit logs for an actor from another organization", async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as never);

    await expect(service.list("reviewer-1", { actorId: "foreign-user" })).resolves.toEqual([]);

    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "reviewer-1",
          fullName: "Người tra soát",
          email: "reviewer@example.test",
        },
        {
          id: "keeper-1",
          fullName: "Thủ kho",
          email: "keeper@example.test",
        },
      ]),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "audit-1",
          actorId: "keeper-1",
          action: "INVENTORY_ADJUST",
          entity: "ItemBatch",
          entityId: "batch-1",
          metadata: { reason: "Kiểm kê" },
          createdAt: new Date("2026-07-27T00:00:00.000Z"),
        },
      ]),
    },
  };
}

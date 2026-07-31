import { NotFoundException } from "@nestjs/common";
import { NotificationService } from "../notification.service";

describe("NotificationService organization scope", () => {
  function makeService() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-a" }),
      },
      notification: {
        create: jest.fn().mockResolvedValue({
          id: "notification-new",
          organizationId: "org-a",
          recipientRole: "ADMIN",
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mission: {
        findUnique: jest.fn().mockResolvedValue({
          warehouse: { organizationId: "org-a" },
        }),
      },
    };
    return { prisma, service: new NotificationService(prisma as never) };
  }

  it("lists only notifications for the authenticated user's organization and role", async () => {
    const { prisma, service } = makeService();

    await service.list("admin-a", "ADMIN" as never, true);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", recipientRole: "ADMIN", read: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("does not reveal or mark a notification belonging to another organization", async () => {
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.markRead("admin-a", "ADMIN" as never, "notification-org-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notification-org-b", organizationId: "org-a", recipientRole: "ADMIN" },
      data: { read: true },
    });
  });

  it("marks unread notifications only in the current organization and role", async () => {
    const { prisma, service } = makeService();

    await service.markAllRead("admin-a", "ADMIN" as never);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", recipientRole: "ADMIN", read: false },
      data: { read: true },
    });
  });

  it("reuses the unique notification for an idempotent field-update retry", async () => {
    const { prisma, service } = makeService();
    const existing = {
      id: "notification-existing",
      organizationId: "org-a",
      recipientRole: "ADMIN",
      fieldUpdateId: "field-update-1",
    };
    prisma.notification.findUnique.mockResolvedValue(existing);

    await expect(
      service.create({
        recipientRole: "ADMIN" as never,
        kind: "FIELD_UPDATE_REPORTED" as never,
        title: "Cập nhật hiện trường",
        body: "ADMIN cần xác minh",
        missionId: "mission-1",
        fieldUpdateId: "field-update-1",
      }),
    ).resolves.toEqual(existing);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

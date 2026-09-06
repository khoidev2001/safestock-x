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
          incidentType: "FLOOD",
          affectedPeople: 190,
          location: "Long Bình",
          hamletName: "Long Bình",
        }),
      },
    };
    return { prisma, service: new NotificationService(prisma as never) };
  }

  it("chép tình huống của nhiệm vụ vào thông báo để thẻ hiện được biểu tượng và số người", async () => {
    const { prisma, service } = makeService();

    await service.create({
      recipientRole: "RESCUE" as never,
      kind: "MISSION_ASSIGNED" as never,
      title: "Phương án ứng phó mới",
      body: "Lũ lụt — 190 người.",
      missionId: "mission-1",
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        incidentType: "FLOOD",
        affectedPeople: 190,
        locationName: "Long Bình",
      }),
    });
  });

  it("người gửi đã nói rõ tình huống thì không đọc đè bằng số của nhiệm vụ", async () => {
    // Báo cáo thô của trưởng thôn: nhiệm vụ còn là chỗ trống (OTHER, 0 người),
    // chép vào là thẻ khoe một con số không ai báo.
    const { prisma, service } = makeService();

    await service.create({
      recipientRole: "ADMIN" as never,
      kind: "INCIDENT_REPORTED" as never,
      title: "Báo cáo mới từ trưởng thôn",
      body: "Ngập ngang gối ở đầu thôn",
      missionId: "mission-1",
      incidentType: null,
    });

    expect(prisma.mission.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ affectedPeople: true }) }),
    );
    const data = prisma.notification.create.mock.calls[0][0].data;
    expect(data.affectedPeople).toBeUndefined();
    expect(data.locationName).toBeUndefined();
  });

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

  it("bulk-marks only unread notifications inside the caller's organization and role", async () => {
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.markManyRead("admin-a", "ADMIN" as never, [
      "n-1",
      "n-2",
      "n-org-b",
    ]);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["n-1", "n-2", "n-org-b"] },
        organizationId: "org-a",
        recipientRole: "ADMIN",
        read: false,
      },
      data: { read: true },
    });
    expect(result).toEqual({ count: 2 });
  });

  it("does not throw when some ids were already read by a colleague", async () => {
    // Bấm vào tab phải xoá được số kể cả khi danh sách id đã cũ vài giây; ném lỗi
    // ở đây thì con số nằm nguyên tại chỗ dù người dùng đã bấm.
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markManyRead("admin-a", "ADMIN" as never, ["n-da-doc"])).resolves.toEqual({
      count: 0,
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

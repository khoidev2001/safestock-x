import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { NotificationService } from "../../notification/notification.service";
import { MissionService } from "../mission.service";

const description = "Nước lũ dâng nhanh, người dân cần được sơ tán khẩn cấp.";

function makeService(options?: {
  missionCreate?: jest.Mock;
  notificationCreate?: jest.Mock;
  existingMission?: object | null;
}) {
  const missionCreate = options?.missionCreate ?? jest.fn().mockResolvedValue({ id: "mission-1" });
  const notificationCreate =
    options?.notificationCreate ??
    jest.fn().mockResolvedValue({ id: "notification-1", recipientRole: "ADMIN" });
  const missionFindFirst = jest.fn().mockResolvedValue(options?.existingMission ?? null);
  const warehouseFindUnique = jest.fn().mockResolvedValue({ id: "warehouse-1" });
  const tx = {
    mission: { create: missionCreate },
    notification: { create: notificationCreate },
  };
  const prisma = {
    warehouse: { findUnique: warehouseFindUnique },
    mission: { findFirst: missionFindFirst },
    // Danh mục thôn để đọc tên thôn nhắc trong lời kể, gắn vào thẻ thông báo.
    hamlet: { findMany: jest.fn().mockResolvedValue([{ id: "h-1", name: "Tân An", aliases: [] }]) },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { pushPersisted: jest.fn() };
  const service = new MissionService(
    prisma as never,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    prisma,
    tx,
    missionCreate,
    notificationCreate,
    missionFindFirst,
    notifications,
  };
}

describe("MissionService.createReportDraft atomicity", () => {
  it("ghi Mission và INCIDENT_REPORTED trong cùng transaction rồi mới push", async () => {
    const state = makeService();

    await expect(
      state.service.createReportDraft({
        warehouseId: "warehouse-1",
        description,
        userId: "reporter-1",
        requestId: "request-1",
      }),
    ).resolves.toEqual({ id: "mission-1" });

    expect(state.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(state.missionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        warehouseId: "warehouse-1",
        reportText: description,
        createdByUserId: "reporter-1",
        reportRequestId: "request-1",
      }),
    });
    expect(state.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientRole: "ADMIN",
        kind: "INCIDENT_REPORTED",
        missionId: "mission-1",
        warehouseId: "warehouse-1",
      }),
    });
    expect(state.notifications.pushPersisted).toHaveBeenCalledWith({
      id: "notification-1",
      recipientRole: "ADMIN",
    });
  });

  it("không push khi persist notification lỗi và để transaction rollback", async () => {
    const notificationError = new Error("notification insert failed");
    const state = makeService({
      notificationCreate: jest.fn().mockRejectedValue(notificationError),
    });

    await expect(
      state.service.createReportDraft({
        warehouseId: "warehouse-1",
        description,
        userId: "reporter-1",
        requestId: "request-rollback",
      }),
    ).rejects.toBe(notificationError);

    expect(state.notifications.pushPersisted).not.toHaveBeenCalled();
  });

  it("retry sau unique conflict đọc lại Mission và không push notification trùng", async () => {
    const existingMission = { id: "mission-existing", reportText: description };
    const missionCreate = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate report", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );
    const state = makeService({ missionCreate, existingMission });

    await expect(
      state.service.createReportDraft({
        warehouseId: "warehouse-1",
        description,
        userId: "reporter-1",
        requestId: "request-retry",
      }),
    ).resolves.toEqual(existingMission);

    expect(state.notificationCreate).not.toHaveBeenCalled();
    expect(state.notifications.pushPersisted).not.toHaveBeenCalled();
    expect(state.missionFindFirst).toHaveBeenCalledWith({
      where: { createdByUserId: "reporter-1", reportRequestId: "request-retry" },
    });
  });

  it("không nuốt lỗi unique không tìm thấy bản ghi thắng cuộc", async () => {
    const state = makeService({
      missionCreate: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate report", {
          code: "P2002",
          clientVersion: "5.22.0",
        }),
      ),
    });

    await expect(
      state.service.createReportDraft({
        warehouseId: "warehouse-1",
        description,
        userId: "reporter-1",
        requestId: "request-race",
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("NotificationService realtime delivery", () => {
  it("không biến lỗi WebSocket thành lỗi tạo notification", async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({
          id: "notification-1",
          organizationId: "organization-1",
          recipientRole: "ADMIN",
        }),
      },
    };
    const service = new NotificationService(prisma as never);
    service.push = () => {
      throw new Error("socket unavailable");
    };

    await expect(
      service.create({
        recipientRole: "ADMIN" as never,
        kind: "INCIDENT_REPORTED" as never,
        title: "Báo cáo mới",
        body: description,
        organizationId: "organization-1",
      }),
    ).resolves.toMatchObject({ id: "notification-1" });
  });
});

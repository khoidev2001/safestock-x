import { BadRequestException, NotFoundException } from "@nestjs/common";
import { NotificationKind, UserRole } from "@prisma/client";
import { NotificationService } from "../notification.service";

const actor = { role: UserRole.ADMIN, organizationId: "org-a" };
const incident = {
  id: "incident-a",
  recipientRole: UserRole.ADMIN,
  missionId: "mission-a",
  warehouseId: "warehouse-a",
  organizationId: "org-a",
  kind: NotificationKind.INCIDENT_REPORTED,
  title: "Report",
  body: "body",
  read: false,
  createdAt: new Date(),
};

function makeStore() {
  return {
    create: jest.fn().mockResolvedValue(incident),
    findUnique: jest.fn().mockResolvedValue(incident),
    findFirst: jest.fn().mockResolvedValue(incident),
    findMany: jest.fn().mockResolvedValue([incident]),
    update: jest.fn().mockResolvedValue({ ...incident, body: "updated" }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
}

describe("NotificationService organization scope", () => {
  it("requires organizationId for incident reports and persists/delivers it", async () => {
    const store = makeStore();
    const service = new NotificationService({ notification: store } as never);
    const push = jest.fn();
    service.push = push;

    await expect(
      service.create({
        recipientRole: UserRole.ADMIN,
        kind: NotificationKind.INCIDENT_REPORTED,
        title: "Report",
        body: "body",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.create({
      recipientRole: UserRole.ADMIN,
      kind: NotificationKind.INCIDENT_REPORTED,
      title: "Report",
      body: "body",
      organizationId: "org-a",
    });
    expect(store.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ organizationId: "org-a" }),
    });
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.ADMIN, organizationId: "org-a" }),
    );
  });

  it("lists legacy-neutral or same-organization incident rows", async () => {
    const store = makeStore();
    const service = new NotificationService({ notification: store } as never);

    await service.list(actor, true);

    expect(store.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        recipientRole: UserRole.ADMIN,
        read: false,
        AND: expect.arrayContaining([
          {
            OR: [
              { kind: { not: NotificationKind.INCIDENT_REPORTED } },
              { kind: NotificationKind.INCIDENT_REPORTED, organizationId: "org-a" },
            ],
          },
        ]),
      }),
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("uses the same predicate for mark-one and mark-all", async () => {
    const store = makeStore();
    const service = new NotificationService({ notification: store } as never);

    await service.markRead("incident-a", actor);
    await service.markAllRead(actor);

    expect(store.updateMany).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ id: "incident-a", recipientRole: UserRole.ADMIN }),
      data: { read: true },
    });
    expect(store.updateMany).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({ recipientRole: UserRole.ADMIN, read: false }),
      data: { read: true },
    });
  });

  it("requires an exact warehouse target for warehouse-request notifications", async () => {
    const store = makeStore();
    const service = new NotificationService({ notification: store } as never);
    const warehouseActor = {
      role: UserRole.WAREHOUSE,
      organizationId: "org-a",
      warehouseId: "warehouse-a",
    };

    await service.list(warehouseActor);

    expect(store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { warehouseId: "warehouse-a" },
                {
                  warehouseId: null,
                  kind: {
                    notIn: [
                      NotificationKind.WAREHOUSE_REQUESTED,
                      NotificationKind.WAREHOUSE_REQUEST_ACCEPTED,
                      NotificationKind.WAREHOUSE_REQUEST_REVIEW,
                    ],
                  },
                },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it.each(["missing", "different"])(
    "does not expose a warehouse-request notification with a %s warehouse target",
    async () => {
      const store = makeStore();
      store.updateMany.mockResolvedValueOnce({ count: 0 });
      const service = new NotificationService({ notification: store } as never);
      const warehouseActor = {
        role: UserRole.WAREHOUSE,
        organizationId: "org-a",
        warehouseId: "warehouse-a",
      };

      await expect(service.markRead("warehouse-request", warehouseActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(store.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: "warehouse-request",
          recipientRole: UserRole.WAREHOUSE,
          AND: expect.arrayContaining([
            {
              OR: [
                { warehouseId: "warehouse-a" },
                {
                  warehouseId: null,
                  kind: {
                    notIn: [
                      NotificationKind.WAREHOUSE_REQUESTED,
                      NotificationKind.WAREHOUSE_REQUEST_ACCEPTED,
                      NotificationKind.WAREHOUSE_REQUEST_REVIEW,
                    ],
                  },
                },
              ],
            },
          ]),
        }),
        data: { read: true },
      });
    },
  );

  it("returns not found for mark-one when the scoped update claims no row", async () => {
    const store = makeStore();
    store.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new NotificationService({ notification: store } as never);

    await expect(service.markRead("cross-org", actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("requires a matching actor to update notifications and rejects legacy null rows", async () => {
    const store = makeStore();
    const service = new NotificationService({ notification: store } as never);
    const push = jest.fn();
    service.push = push;

    await expect(service.updateAndPush("incident-a", { body: "new" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.updateAndPush("incident-a", { body: "new" }, { role: UserRole.ADMIN, organizationId: "org-b" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    store.findUnique.mockResolvedValueOnce({ ...incident, organizationId: null });
    await expect(
      service.updateAndPush("orphan-incident", { body: "new" }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(store.update).not.toHaveBeenCalled();

    store.findUnique.mockResolvedValueOnce({
      ...incident,
      kind: NotificationKind.INCIDENT_DETECTED,
      organizationId: null,
    });
    await service.updateAndPush("neutral", { body: "new" });
    expect(store.update).toHaveBeenCalledWith({ where: { id: "neutral" }, data: { body: "new" } });
  });
});

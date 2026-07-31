import { AlertEmailStatus } from "@prisma/client";
import { AlertEmailOutboxService } from "../alert-email-outbox.service";

describe("AlertEmailOutboxService", () => {
  const job = {
    id: "outbox-1",
    incidentId: "incident-1",
    recipientEmails: ["admin@example.com"],
    observedAt: new Date("2026-07-30T08:00:00.000Z"),
    receivedAt: new Date("2026-07-30T08:02:00.000Z"),
    attempts: 1,
    incident: {
      title: "Temperature threshold exceeded",
      severity: "HIGH",
      confidence: 0.9,
      kind: "BAD_STORAGE",
      explanation: null,
      evidence: [],
    },
  };
  const prisma = {
    alertEmailOutbox: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const mail = { sendIncidentAlert: jest.fn() };
  const service = new AlertEmailOutboxService(prisma as never, mail as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.alertEmailOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.alertEmailOutbox.findMany.mockResolvedValue([{ id: "outbox-1" }]);
    prisma.alertEmailOutbox.findUnique.mockResolvedValue(job);
  });

  it("marks a claimed delivery as SENT and passes observed, received, and sent times", async () => {
    mail.sendIncidentAlert.mockResolvedValue(undefined);

    await service.processDue();

    expect(mail.sendIncidentAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: job.incident.title }),
      null,
      job.recipientEmails,
      expect.objectContaining({
        observedAt: job.observedAt,
        receivedAt: job.receivedAt,
        sentAt: expect.any(Date),
      }),
    );
    expect(prisma.alertEmailOutbox.update).toHaveBeenCalledWith({
      where: { id: "outbox-1" },
      data: { status: AlertEmailStatus.SENT, sentAt: expect.any(Date), lastError: null },
    });
  });

  it("returns a failed delivery to PENDING with an error and a later retry time", async () => {
    mail.sendIncidentAlert.mockRejectedValue(new Error("network unavailable"));

    await service.processDue();

    expect(prisma.alertEmailOutbox.update).toHaveBeenCalledWith({
      where: { id: "outbox-1" },
      data: expect.objectContaining({
        status: AlertEmailStatus.PENDING,
        lastError: "network unavailable",
        nextAttemptAt: expect.any(Date),
      }),
    });
    const update = prisma.alertEmailOutbox.update.mock.calls[0][0];
    expect(update.data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });
});

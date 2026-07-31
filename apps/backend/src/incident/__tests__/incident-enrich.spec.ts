import { IncidentService } from "../incident.service";

describe("IncidentService enrichNewIncident", () => {
  const incidentRecord = {
    id: "inc-1",
    title: "Điều kiện bảo quản không đạt",
    kind: "BAD_STORAGE",
    severity: "MEDIUM",
    confidence: 0.6,
    warehouseId: "wh-1",
    evidence: [
      { note: "Độ ẩm 90% vượt ngưỡng 85%", occurredAt: new Date("2026-07-22T03:00:00.000Z") },
    ],
    actions: [],
  };
  const prisma = { incident: { findUnique: jest.fn(), update: jest.fn() } };
  const notifications = { updateAndPush: jest.fn().mockResolvedValue({}) };
  const ai = { explain: jest.fn() };
  const outbox = { processDue: jest.fn().mockResolvedValue(undefined) };
  const service = new IncidentService(
    prisma as never,
    notifications as never,
    ai as never,
    outbox as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.incident.findUnique.mockResolvedValue(incidentRecord);
    prisma.incident.update.mockResolvedValue(incidentRecord);
  });

  it("stores an AI explanation and updates the existing notification", async () => {
    ai.explain.mockResolvedValue("Độ ẩm 90% vượt ngưỡng 85%, nguy cơ ẩm mốc vật tư.");

    await service.enrichNewIncident("inc-1", "notif-1");

    expect(ai.explain).toHaveBeenCalledTimes(1);
    expect(prisma.incident.update).toHaveBeenCalledWith({
      where: { id: "inc-1" },
      data: { explanation: "Độ ẩm 90% vượt ngưỡng 85%, nguy cơ ẩm mốc vật tư." },
    });
    expect(notifications.updateAndPush).toHaveBeenCalledWith(
      "notif-1",
      expect.objectContaining({ body: expect.stringContaining("Độ ẩm 90% vượt ngưỡng 85%") }),
    );
    expect(outbox.processDue).not.toHaveBeenCalled();
  });

  it("keeps the incident and initial notification when AI is unavailable", async () => {
    ai.explain.mockRejectedValue(new Error("AI unavailable"));

    await expect(service.enrichNewIncident("inc-1", "notif-1")).resolves.toBeUndefined();

    expect(prisma.incident.update).not.toHaveBeenCalled();
    expect(notifications.updateAndPush).not.toHaveBeenCalled();
    expect(outbox.processDue).not.toHaveBeenCalled();
  });
});

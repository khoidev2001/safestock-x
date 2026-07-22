import { IncidentService } from "../incident.service";

/**
 * enrichNewIncident: khi sự cố MỚI bật, AI giải thích → lưu explanation → đè body
 * notification (đẩy lại cùng id) → email. AI lỗi KHÔNG làm mất sự cố: không lưu
 * explanation nhưng vẫn gửi email bản rule-based, không ném ra ngoài.
 */
describe("IncidentService — enrichNewIncident (AI tự giải thích + đa kênh)", () => {
  const incidentRecord = {
    id: "inc-1",
    title: "Điều kiện bảo quản không đạt",
    kind: "BAD_STORAGE",
    severity: "MEDIUM",
    confidence: 0.6,
    warehouseId: "wh-1",
    evidence: [{ note: "Độ ẩm 90% vượt ngưỡng 85%", occurredAt: new Date("2026-07-22T10:00:00+07:00") }],
    actions: [],
  };

  const prisma = {
    incident: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    warehouse: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };
  const notifications = { updateAndPush: jest.fn().mockResolvedValue({}) };
  const ai = { explain: jest.fn() };
  const mail = { sendIncidentAlert: jest.fn().mockResolvedValue(undefined) };

  const service = new IncidentService(
    prisma as never,
    notifications as never,
    ai as never,
    mail as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.incident.findUnique.mockResolvedValue(incidentRecord);
    prisma.incident.update.mockResolvedValue(incidentRecord);
    prisma.warehouse.findUnique.mockResolvedValue({ organizationId: "org-1" });
    prisma.user.findMany.mockResolvedValue([{ notificationEmail: "admin@example.com" }]);
  });

  it("AI ok → lưu explanation, đè body notification, gửi email kèm text AI", async () => {
    ai.explain.mockResolvedValue("Độ ẩm 90% vượt ngưỡng 85%, nguy cơ ẩm mốc vật tư.");

    await service.enrichNewIncident("inc-1", "notif-1");

    // Context truyền cho AI phải chứa số đã tính (tiêu đề + độ tin cậy).
    expect(ai.explain).toHaveBeenCalledTimes(1);
    const context = ai.explain.mock.calls[0][0] as string;
    expect(context).toContain("Điều kiện bảo quản không đạt");
    expect(context).toContain("60%");

    // Lưu explanation vào đúng incident.
    expect(prisma.incident.update).toHaveBeenCalledWith({
      where: { id: "inc-1" },
      data: { explanation: "Độ ẩm 90% vượt ngưỡng 85%, nguy cơ ẩm mốc vật tư." },
    });

    // Đè body notification (cùng id → thay tại chỗ, không nhân đôi).
    expect(notifications.updateAndPush).toHaveBeenCalledTimes(1);
    const [notifId, patch] = notifications.updateAndPush.mock.calls[0];
    expect(notifId).toBe("notif-1");
    expect(patch.body).toContain("Độ ẩm 90% vượt ngưỡng 85%");

    // Email kèm text AI.
    expect(mail.sendIncidentAlert).toHaveBeenCalledTimes(1);
    expect(mail.sendIncidentAlert.mock.calls[0][1]).toBe(
      "Độ ẩm 90% vượt ngưỡng 85%, nguy cơ ẩm mốc vật tư.",
    );
    expect(mail.sendIncidentAlert.mock.calls[0][2]).toEqual(["admin@example.com"]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        notificationEmail: { not: null },
        OR: [
          { role: "ADMIN" },
          { role: "RESCUE" },
          { role: "WAREHOUSE", warehouseId: "wh-1" },
        ],
      },
      select: { notificationEmail: true },
    });
  });

  it("AI lỗi → KHÔNG lưu explanation, vẫn gửi email bản rule-based, không ném", async () => {
    ai.explain.mockRejectedValue(new Error("Không kết nối được AI service"));

    await expect(service.enrichNewIncident("inc-1", "notif-1")).resolves.toBeUndefined();

    expect(prisma.incident.update).not.toHaveBeenCalled();
    expect(notifications.updateAndPush).not.toHaveBeenCalled();
    // Email vẫn gửi với explanation = null (bản rule-based).
    expect(mail.sendIncidentAlert).toHaveBeenCalledTimes(1);
    expect(mail.sendIncidentAlert.mock.calls[0][1]).toBeNull();
  });
});

import { AlertMailService } from "../alert-mail.service";

const sendMail = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));

const incident = {
  title: "Điều kiện bảo quản không đạt",
  severity: "MEDIUM",
  confidence: 0.6,
  kind: "BAD_STORAGE",
  evidence: [
    { note: "Độ ẩm 90% vượt ngưỡng 85%", occurredAt: new Date("2026-07-22T03:00:00.000Z") },
  ],
};

function makeConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

describe("AlertMailService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails clearly when email delivery is disabled so the outbox can retry later", async () => {
    const service = new AlertMailService(makeConfig({ ALERT_EMAIL_ENABLED: "false" }));

    await expect(service.sendIncidentAlert(incident, "text AI")).rejects.toThrow("Email cảnh báo");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("fails clearly when SMTP configuration is incomplete", async () => {
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "x",
        ALERT_EMAIL_TO: "b@x.vn",
      }),
    );

    await expect(service.sendIncidentAlert(incident, "text AI")).rejects.toThrow("Email cảnh báo");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends deduplicated recipients and includes all delivery timestamps", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "465",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "app-pass",
        ALERT_EMAIL_TO: "fallback@x.vn",
      }),
    );
    const observedAt = new Date("2026-07-22T03:00:00.000Z");
    const receivedAt = new Date("2026-07-22T03:02:00.000Z");
    const sentAt = new Date("2026-07-22T03:05:00.000Z");

    await service.sendIncidentAlert(
      incident,
      "Độ ẩm 90% vượt ngưỡng, nguy cơ ẩm mốc vật tư.",
      [" Admin@x.vn ", "admin@x.vn", "rescue@x.vn"],
      { observedAt, receivedAt, sentAt },
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.bcc).toEqual(["admin@x.vn", "rescue@x.vn"]);
    expect(mail.subject).toContain("Điều kiện bảo quản không đạt");
    expect(mail.text).toContain("Phát hiện:");
    expect(mail.text).toContain("Backend nhận:");
    expect(mail.text).toContain("Email gửi:");
    expect(mail.text).toContain("Độ trễ chuyển phát:");
    expect(mail.html).toContain("background:#0f172a");
  });

  it("propagates SMTP failure so the durable outbox schedules a retry", async () => {
    sendMail.mockRejectedValue(new Error("SMTP auth failed"));
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "wrong",
        ALERT_EMAIL_TO: "admin@x.vn",
      }),
    );

    await expect(service.sendIncidentAlert(incident, "text")).rejects.toThrow("SMTP auth failed");
  });
});

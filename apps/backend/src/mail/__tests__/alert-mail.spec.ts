import { AlertMailService } from "../alert-mail.service";

// Mock nodemailer: createTransport trả transporter có sendMail điều khiển được.
const sendMail = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));
import * as nodemailer from "nodemailer";

const incident = {
  title: "Điều kiện bảo quản không đạt",
  severity: "MEDIUM",
  confidence: 0.6,
  kind: "BAD_STORAGE",
  evidence: [
    { note: "Độ ẩm 90% vượt ngưỡng 85%", occurredAt: new Date("2026-07-22T10:00:00+07:00") },
  ],
};

/** ConfigService giả: trả giá trị từ map. */
function makeConfig(map: Record<string, string>) {
  return { get: (k: string) => map[k] } as never;
}

describe("AlertMailService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("chưa bật (ALERT_EMAIL_ENABLED=false) → không tạo transport, không gửi", async () => {
    const service = new AlertMailService(makeConfig({ ALERT_EMAIL_ENABLED: "false" }));
    await service.sendIncidentAlert(incident, "text AI");
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("thiếu SMTP_HOST dù đã enable → skip êm, không gửi", async () => {
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "x",
        ALERT_EMAIL_TO: "b@x.vn",
      }),
    );
    await service.sendIncidentAlert(incident, "text AI");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("cấu hình đủ → gửi email với subject + body chứa text AI", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "465",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "app-pass",
        ALERT_EMAIL_TO: "admin@x.vn",
      }),
    );
    await service.sendIncidentAlert(incident, "Độ ẩm 90% vượt ngưỡng, nguy cơ ẩm mốc.");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.bcc).toEqual(["admin@x.vn"]);
    // From có tên hiển thị thương hiệu + địa chỉ SMTP_USER (ALERT_EMAIL_FROM trống).
    expect(mail.from).toBe('"Ứng phó nhanh" <a@gmail.com>');
    expect(mail.subject).toContain("Ứng phó nhanh");
    expect(mail.subject).toContain("Điều kiện bảo quản không đạt");
    expect(mail.text).toContain("Độ ẩm 90% vượt ngưỡng, nguy cơ ẩm mốc.");
    // Bản HTML có thương hiệu + đoạn AI.
    expect(mail.html).toContain("Ứng phó nhanh");
    expect(mail.html).toContain("Độ ẩm 90% vượt ngưỡng, nguy cơ ẩm mốc.");
    expect(mail.html).toContain('bgcolor="#0f172a"');
  });

  it("ưu tiên danh sách email cá nhân và loại bỏ địa chỉ trùng", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "app-pass",
        ALERT_EMAIL_TO: "fallback@x.vn",
      }),
    );

    await service.sendIncidentAlert(incident, null, [" Admin@x.vn ", "admin@x.vn", "rescue@x.vn"]);

    expect(sendMail.mock.calls[0][0].bcc).toEqual(["admin@x.vn", "rescue@x.vn"]);
  });

  it("explanation null → email chỉ dùng dữ liệu rule-based, không thêm ghi chú AI", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "app-pass",
        ALERT_EMAIL_TO: "admin@x.vn",
      }),
    );
    await service.sendIncidentAlert(incident, null);

    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).not.toContain("Giải thích của AI");
    expect(mail.text).not.toContain("Chưa có diễn giải chi tiết");
    expect(mail.html).not.toContain("Giải thích của AI");
    expect(mail.html).not.toContain("Chưa có diễn giải chi tiết");
    expect(mail.text).toContain("Độ ẩm 90% vượt ngưỡng 85%"); // evidence rule-based vẫn có
  });

  it("không hiển thị điểm tin cậy trong bản text và HTML", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const service = new AlertMailService(
      makeConfig({
        ALERT_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "a@gmail.com",
        SMTP_PASS: "app-pass",
        ALERT_EMAIL_TO: "admin@x.vn",
      }),
    );
    await service.sendIncidentAlert({ ...incident, confidence: 0.8 }, null);

    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).not.toContain("80%");
    expect(mail.text).not.toContain("Độ tin cậy");
    expect(mail.html).not.toContain("80%");
    expect(mail.html).not.toContain("Độ tin cậy");
    expect(mail.text).toContain("kiểm tra thực tế trước khi xử lý");
    expect(mail.html).toContain("kiểm tra thực tế trước khi xử lý");
  });

  it("transport.sendMail ném → nuốt lỗi, không ném ra ngoài", async () => {
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
    await expect(service.sendIncidentAlert(incident, "text")).resolves.toBeUndefined();
  });
});

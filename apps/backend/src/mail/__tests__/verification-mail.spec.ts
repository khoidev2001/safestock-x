import { EmailVerificationPurpose } from "@prisma/client";
import { VerificationMailService } from "../verification-mail.service";

const sendMail = jest.fn();
jest.mock("nodemailer", () => ({ createTransport: jest.fn(() => ({ sendMail })) }));

function makeService() {
  return new VerificationMailService({
    get: (key: string) =>
      ({
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "ungphonhanh@gmail.com",
        SMTP_PASS: "app-pass",
        SMTP_PORT: "465",
      })[key],
  } as never);
}

async function sendFor(purpose: EmailVerificationPurpose) {
  sendMail.mockResolvedValue({ messageId: "1" });
  await makeService().sendVerificationCode({
    email: "an@example.com",
    code: "123456",
    fullName: "Nguyễn Văn An",
    expiresInMinutes: 10,
    purpose,
  });
  return sendMail.mock.calls[0][0] as { subject: string; html: string; text: string };
}

describe("VerificationMailService — nội dung theo từng mục đích", () => {
  beforeEach(() => jest.clearAllMocks());

  it("email cảnh báo: nói về việc nhận cảnh báo sự cố", async () => {
    const mail = await sendFor(EmailVerificationPurpose.NOTIFICATION_EMAIL);

    expect(mail.subject).toContain("xác minh email nhận cảnh báo");
    expect(mail.html).toContain("Hồ sơ cá nhân");
    expect(mail.html).not.toContain("mật khẩu");
  });

  it("tạo tài khoản admin: nói về việc liên kết tài khoản, KHÔNG nói mật khẩu", async () => {
    const mail = await sendFor(EmailVerificationPurpose.ADMIN_ACCOUNT);

    expect(mail.subject).toContain("xác nhận liên kết tài khoản");
    expect(mail.html).toContain("liên kết");
    expect(mail.html).toContain("tài khoản quản trị xã");
    expect(mail.html).not.toContain("đặt lại mật khẩu");
  });

  it("quên mật khẩu: nói rõ là mã đặt lại mật khẩu và cảnh báo nếu không phải mình yêu cầu", async () => {
    const mail = await sendFor(EmailVerificationPurpose.PASSWORD_RESET);

    expect(mail.subject).toContain("mã đặt lại mật khẩu");
    expect(mail.html).toContain("Quên mật khẩu");
    expect(mail.html).toContain("thu hồi");
    // Người không yêu cầu phải được cảnh báo, vì đây là dấu hiệu bị dò tài khoản.
    expect(mail.html).toContain("báo quản trị viên");
  });

  it("mã 6 số và hạn dùng luôn có mặt ở cả ba loại thư", async () => {
    for (const purpose of Object.values(EmailVerificationPurpose)) {
      jest.clearAllMocks();
      const mail = await sendFor(purpose);
      expect(mail.subject).toContain("123456");
      expect(mail.html).toContain("123456");
      expect(mail.text).toContain("123456");
      expect(mail.html).toContain("10 phút");
    }
  });
});

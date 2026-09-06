import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { EmailVerificationPurpose } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { EmailVerificationService } from "../email-verification.service";

const PURPOSE = EmailVerificationPurpose.NOTIFICATION_EMAIL;

function makePrisma() {
  return {
    emailVerification: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe("EmailVerificationService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let mail: { isConfigured: jest.Mock; canSend: jest.Mock; sendVerificationCode: jest.Mock };
  let service: EmailVerificationService;

  beforeEach(() => {
    prisma = makePrisma();
    mail = {
      isConfigured: jest.fn(() => true),
      canSend: jest.fn(() => true),
      sendVerificationCode: jest.fn(async () => "smtp"),
    };
    service = new EmailVerificationService(prisma as never, mail as never);
    prisma.emailVerification.findMany.mockResolvedValue([]);
    prisma.emailVerification.findFirst.mockResolvedValue(null);
    prisma.emailVerification.create.mockResolvedValue({
      id: "code-1",
      email: "an@example.com",
      expiresAt: new Date("2026-09-05T00:10:00.000Z"),
    });
  });

  function issue(email = "  AN@Example.COM ", purpose: EmailVerificationPurpose = PURPOSE) {
    return service.issue({ userId: "user-1", email, purpose, recipientName: "Nguyễn Văn An" });
  }

  it("gửi mã 6 số tới email đã chuẩn hoá", async () => {
    await issue();

    expect(mail.sendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ email: "an@example.com", code: expect.stringMatching(/^\d{6}$/) }),
    );
  });

  it("không lưu mã trần vào DB", async () => {
    await issue();

    const stored = prisma.emailVerification.create.mock.calls[0][0].data;
    const sent = mail.sendVerificationCode.mock.calls[0][0].code;
    expect(stored.codeHash).not.toContain(sent);
    expect(bcrypt.compareSync(sent, stored.codeHash)).toBe(true);
  });

  it("chưa có SMTP và cũng chưa bật chế độ dev → báo 503, không tạo mã", async () => {
    mail.canSend.mockReturnValue(false);

    await expect(issue()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.emailVerification.create).not.toHaveBeenCalled();
  });

  it("chế độ dev: mã vẫn phát hành và nói rõ là chỉ nằm ở log máy chủ", async () => {
    mail.isConfigured.mockReturnValue(false);
    mail.sendVerificationCode.mockResolvedValue("dev-log");

    await expect(issue()).resolves.toEqual(expect.objectContaining({ delivery: "dev-log" }));
  });

  it("từ chối email sai định dạng trước khi chạm SMTP", async () => {
    await expect(issue("khong-phai-email")).rejects.toBeInstanceOf(BadRequestException);
    expect(mail.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("xoá mã khi SMTP gửi hỏng, không để người dùng chờ mã không tới", async () => {
    mail.sendVerificationCode.mockRejectedValue(new Error("SMTP timeout"));

    await expect(issue()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.emailVerification.delete).toHaveBeenCalledWith({ where: { id: "code-1" } });
  });

  it("chặn gửi lại trong vòng 60 giây", async () => {
    prisma.emailVerification.findMany.mockResolvedValue([{ createdAt: new Date() }]);

    await expect(issue()).rejects.toThrow("Vui lòng đợi");
    expect(mail.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("chặn khi đã gửi 5 mã chưa dùng tới, và nói rõ còn phải đợi bao lâu", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    prisma.emailVerification.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ createdAt: old })),
    );

    // Mã cũ nhất gửi 10 phút trước → còn 20 phút nữa mới rơi khỏi cửa sổ 30 phút.
    await expect(issue()).rejects.toThrow("đợi 20 phút");
  });

  it("hạn mức KHÔNG đếm mã đã xác minh xong — tạo nhiều tài khoản liên tiếp vẫn chạy", async () => {
    await issue();

    expect(prisma.emailVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ verifiedAt: null }) }),
    );
  });

  it("đếm hạn mức riêng theo từng purpose", async () => {
    await issue("an@example.com", EmailVerificationPurpose.ADMIN_ACCOUNT);

    expect(prisma.emailVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purpose: EmailVerificationPurpose.ADMIN_ACCOUNT }),
      }),
    );
  });

  it("trả email đã xác minh khi mã đúng và tiêu mã", async () => {
    prisma.emailVerification.findFirst.mockResolvedValueOnce({
      id: "code-1",
      email: "an@example.com",
      codeHash: bcrypt.hashSync("123456", 4),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.consume({ userId: "user-1", code: " 123456 ", purpose: PURPOSE }),
    ).resolves.toBe("an@example.com");
    // verifiedAt là dấu "mã này về đích", để hạn mức chống spam bỏ qua nó.
    expect(prisma.emailVerification.update).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { consumedAt: expect.any(Date), verifiedAt: expect.any(Date) },
    });
  });

  it("từ chối khi mã đang chờ thuộc địa chỉ khác địa chỉ trên form", async () => {
    prisma.emailVerification.findFirst.mockResolvedValueOnce({
      id: "code-1",
      email: "cu@example.com",
      codeHash: bcrypt.hashSync("123456", 4),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.consume({
        userId: "user-1",
        code: "123456",
        purpose: PURPOSE,
        expectedEmail: "moi@example.com",
      }),
    ).rejects.toThrow("cu@example.com");
  });

  it("mã sai thì đếm lần thử", async () => {
    prisma.emailVerification.findFirst.mockResolvedValueOnce({
      id: "code-1",
      email: "an@example.com",
      codeHash: bcrypt.hashSync("123456", 4),
      attempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.consume({ userId: "user-1", code: "000000", purpose: PURPOSE }),
    ).rejects.toThrow("Còn 3 lần thử");
    expect(prisma.emailVerification.update).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { attempts: 2 },
    });
  });

  it("khoá mã sau 5 lần sai để chặn vét cạn 6 số", async () => {
    prisma.emailVerification.findFirst.mockResolvedValueOnce({
      id: "code-1",
      email: "an@example.com",
      codeHash: bcrypt.hashSync("123456", 4),
      attempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.consume({ userId: "user-1", code: "123456", purpose: PURPOSE }),
    ).rejects.toThrow("gửi lại mã mới");
  });

  it("báo rõ khi mã đã hết hạn hoặc chưa xin", async () => {
    await expect(
      service.consume({ userId: "user-1", code: "123456", purpose: PURPOSE }),
    ).rejects.toThrow("hết hạn");
  });
});

import { EmailVerificationPurpose } from "@prisma/client";
import { NotificationEmailService } from "../notification-email.service";

describe("NotificationEmailService", () => {
  const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
  const verification = {
    normalizeEmail: (value: string) => value.trim().toLowerCase(),
    assertEmailShape: jest.fn(),
    issue: jest.fn(async () => ({ email: "an@example.com", expiresAt: new Date(), delivery: "smtp" })),
    consume: jest.fn(),
    cancel: jest.fn(),
    findPending: jest.fn(),
  };
  const service = new NotificationEmailService(prisma as never, verification as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      fullName: "Nguyễn Văn An",
      notificationEmail: null,
      notificationEmailVerifiedAt: null,
    });
    verification.findPending.mockResolvedValue(null);
  });

  it("xin mã cho đúng luồng email cảnh báo và chưa ghi gì vào hồ sơ", async () => {
    await service.requestCode("user-1", " AN@Example.COM ");

    expect(verification.issue).toHaveBeenCalledWith({
      userId: "user-1",
      email: "an@example.com",
      purpose: EmailVerificationPurpose.NOTIFICATION_EMAIL,
      recipientName: "Nguyễn Văn An",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("không gửi lại mã cho email đã xác minh sẵn", async () => {
    prisma.user.findUnique.mockResolvedValue({
      fullName: "Nguyễn Văn An",
      notificationEmail: "an@example.com",
      notificationEmailVerifiedAt: new Date(),
    });

    await expect(service.requestCode("user-1", "an@example.com")).rejects.toThrow("đã được xác minh");
    expect(verification.issue).not.toHaveBeenCalled();
  });

  it("nói rõ mã chỉ nằm ở log máy chủ khi chưa cấu hình SMTP", async () => {
    verification.issue.mockResolvedValue({
      email: "an@example.com",
      expiresAt: new Date(),
      delivery: "dev-log",
    });

    await expect(service.requestCode("user-1", "an@example.com")).resolves.toEqual(
      expect.objectContaining({ delivery: "dev-log" }),
    );
  });

  it("ghi email vào hồ sơ khi mã đúng", async () => {
    verification.consume.mockResolvedValue("an@example.com");

    await service.confirmCode("user-1", "123456");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        notificationEmail: "an@example.com",
        notificationEmailVerifiedAt: expect.any(Date),
      },
    });
  });

  it("quản trị viên KHÔNG gỡ được email — chỉ đổi", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });

    await expect(service.remove("user-1")).rejects.toThrow("không gỡ được");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("gỡ email thì xoá luôn mốc xác minh", async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: "WAREHOUSE",
      notificationEmail: null,
      notificationEmailVerifiedAt: null,
    });

    await service.remove("user-1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { notificationEmail: null, notificationEmailVerifiedAt: null },
    });
  });
});

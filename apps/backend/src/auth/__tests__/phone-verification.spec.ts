import * as bcrypt from "bcryptjs";
import { PhoneVerificationService } from "../phone-verification.service";

describe("PhoneVerificationService", () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    phoneVerification: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  const sms = {
    sendVerificationCode: jest.fn(async () => "dev-log"),
    isConfigured: () => false,
    canSend: () => true,
  };
  const service = new PhoneVerificationService(prisma as never, sms as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ phone: null });
    prisma.phoneVerification.findFirst.mockResolvedValue(null);
    prisma.phoneVerification.findMany.mockResolvedValue([]);
    prisma.phoneVerification.create.mockImplementation(async ({ data }: never) => ({
      id: "code-1",
      phone: (data as { phone: string }).phone,
      expiresAt: new Date(Date.now() + 600_000),
    }));
  });

  it("chuẩn hoá số trước khi gửi: người dùng gõ dấu cách hay dấu chấm cũng là một số", async () => {
    await service.requestCode("user-1", " 0912 345.678 ");

    expect(sms.sendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "0912345678" }),
    );
    // Số CHƯA được ghi vào hồ sơ ở bước xin mã.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("từ chối số không gửi tin nhắn tới được", async () => {
    // Số cụt, số cố định Hà Nội, đầu số không tồn tại — cả ba trông "giống số
    // điện thoại" nhưng không máy nào nhận được mã.
    for (const phone of ["12345", "02438241234", "0111234567"]) {
      await expect(service.requestCode("user-1", phone)).rejects.toThrow(
        "không nhận được tin nhắn",
      );
    }
    expect(sms.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("hiểu số viết kiểu quốc tế: +84 cũng là số đó", async () => {
    await service.requestCode("user-1", "+84 912 345 678");

    expect(sms.sendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "0912345678" }),
    );
  });

  it("trả mã trần khi chưa cấu hình nhà mạng, để còn thử được luồng", async () => {
    const state = await service.requestCode("user-1", "0912345678");

    expect(state.delivery).toBe("dev-log");
    expect(state.devCode).toMatch(/^\d{6}$/);
  });

  it("gửi hỏng thì xoá mã vừa tạo, không để người dùng chờ một tin nhắn không tới", async () => {
    sms.sendVerificationCode.mockRejectedValueOnce(new Error("nhà mạng từ chối"));

    await expect(service.requestCode("user-1", "0912345678")).rejects.toThrow("Chưa gửi được mã");
    expect(prisma.phoneVerification.delete).toHaveBeenCalledWith({ where: { id: "code-1" } });
  });

  it("chỉ ghi số vào hồ sơ khi mã đúng", async () => {
    prisma.phoneVerification.findFirst.mockResolvedValue({
      id: "code-1",
      phone: "0912345678",
      codeHash: bcrypt.hashSync("123456", 4),
      attempts: 0,
      expiresAt: new Date(Date.now() + 600_000),
    });

    await service.confirmCode("user-1", "123456");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { phone: "0912345678" },
    });
  });

  it("mã sai thì đếm lần thử và KHÔNG đụng vào hồ sơ", async () => {
    prisma.phoneVerification.findFirst.mockResolvedValue({
      id: "code-1",
      phone: "0912345678",
      codeHash: bcrypt.hashSync("123456", 4),
      attempts: 3,
      expiresAt: new Date(Date.now() + 600_000),
    });

    await expect(service.confirmCode("user-1", "000000")).rejects.toThrow("Còn 1 lần thử");
    expect(prisma.phoneVerification.update).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { attempts: 4 },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("sai quá số lần cho phép thì mã chết, buộc gửi lại", async () => {
    prisma.phoneVerification.findFirst.mockResolvedValue({
      id: "code-1",
      phone: "0912345678",
      codeHash: bcrypt.hashSync("123456", 4),
      attempts: 5,
      expiresAt: new Date(Date.now() + 600_000),
    });

    // Kể cả mã ĐÚNG cũng không qua được: hết lượt là hết lượt.
    await expect(service.confirmCode("user-1", "123456")).rejects.toThrow("quá nhiều lần");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("chặn bơm tin nhắn: gửi lại quá sớm thì bắt chờ", async () => {
    prisma.phoneVerification.findMany.mockResolvedValue([{ createdAt: new Date() }]);

    await expect(service.requestCode("user-1", "0912345678")).rejects.toThrow("Vui lòng đợi");
    expect(sms.sendVerificationCode).not.toHaveBeenCalled();
  });
});

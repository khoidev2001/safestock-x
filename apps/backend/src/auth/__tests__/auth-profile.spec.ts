import { BadRequestException } from "@nestjs/common";
import { AuthService } from "../auth.service";

describe("AuthService profile", () => {
  const profileRecord = {
    id: "user-1",
    email: "admin",
    fullName: "Nguyễn Văn An",
    phone: "0912345678",
    notificationEmail: "an@example.com",
    avatarUrl: null,
    role: "ADMIN",
    warehouseId: null,
    organization: { name: "Hội Chữ thập đỏ xã Đồng Xuân" },
    warehouse: null,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn() };
  const config = { get: jest.fn() };
  const service = new AuthService(prisma as never, jwt as never, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(profileRecord);
    prisma.user.update.mockResolvedValue(profileRecord);
  });

  it("trả hồ sơ DB với đơn vị được suy ra từ tổ chức", async () => {
    await expect(service.getProfile("user-1")).resolves.toEqual({
      id: "user-1",
      email: "admin",
      fullName: "Nguyễn Văn An",
      phone: "0912345678",
      notificationEmail: "an@example.com",
      avatarUrl: null,
      role: "ADMIN",
      warehouseId: null,
      unitName: "Hội Chữ thập đỏ xã Đồng Xuân",
      warehouseName: null,
    });
  });

  it("chuẩn hóa và chỉ cập nhật trường hồ sơ được phép", async () => {
    await service.updateProfile("user-1", {
      fullName: "  Nguyễn Văn An  ",
      phone: " 0912345678 ",
      notificationEmail: " AN@EXAMPLE.COM ",
      avatarUrl: null,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        fullName: "Nguyễn Văn An",
        phone: "0912345678",
        notificationEmail: "an@example.com",
        avatarUrl: null,
      },
    });
  });

  it("từ chối ảnh đại diện không phải data URL ảnh an toàn", async () => {
    await expect(
      service.updateProfile("user-1", { avatarUrl: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("từ chối patch rỗng", async () => {
    await expect(service.updateProfile("user-1", {})).rejects.toBeInstanceOf(BadRequestException);
  });
});

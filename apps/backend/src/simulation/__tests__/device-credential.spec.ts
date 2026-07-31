import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WarehouseKind } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { DeviceCredentialService } from "../device-credential.service";

describe("DeviceCredentialService — khởi tạo qua DI", () => {
  it("container dựng được service mà không cần khai báo ngưỡng chặn", async () => {
    // Tham số ngưỡng là interface, không tồn tại lúc chạy. Nếu để Nest tự suy ra
    // kiểu thì nó đi tìm một provider không bao giờ có và làm sập ứng dụng ngay
    // lúc khởi động — thứ mà test dùng mock hoàn toàn không nhìn thấy.
    const moduleRef = await Test.createTestingModule({
      providers: [DeviceCredentialService, { provide: PrismaService, useValue: {} }],
    }).compile();

    expect(moduleRef.get(DeviceCredentialService)).toBeInstanceOf(DeviceCredentialService);
    await moduleRef.close();
  });
});

describe("DeviceCredentialService", () => {
  const prisma = {
    warehouse: { findUnique: jest.fn() },
    deviceCredential: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  let service: DeviceCredentialService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceCredentialService(prisma as never);
    prisma.warehouse.findUnique.mockResolvedValue({
      id: "warehouse-1",
      kind: WarehouseKind.CENTRAL,
    });
    prisma.deviceCredential.update.mockResolvedValue({});
  });

  async function issueToken() {
    prisma.deviceCredential.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "cred-1",
          code: data.code,
          name: data.name,
          warehouseId: data.warehouseId,
          tokenPrefix: data.tokenPrefix,
          tokenHash: data.tokenHash,
        }),
    );
    const issued = await service.issue({
      warehouseId: "warehouse-1",
      code: "gateway_a",
      name: "Gateway kho trung tâm",
    });
    const created = prisma.deviceCredential.create.mock.calls[0]![0].data as {
      tokenPrefix: string;
      tokenHash: string;
    };
    return { issued, created };
  }

  it("không bao giờ lưu token gốc, chỉ lưu hash", async () => {
    const { issued, created } = await issueToken();

    expect(issued.token).toMatch(/^upn_[a-f0-9]{16}\./);
    expect(created.tokenHash).not.toContain(issued.token);
    // Lộ toàn bộ database vẫn không đủ để giả mạo thiết bị.
    expect(issued.token).not.toContain(created.tokenHash);
    expect(await bcrypt.compare(issued.token.split(".")[1]!, created.tokenHash)).toBe(true);
  });

  it("chấp nhận đúng token đã cấp và trả về phạm vi kho của thiết bị", async () => {
    const { issued, created } = await issueToken();
    prisma.deviceCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      code: "gateway_a",
      warehouseId: "warehouse-1",
      tokenHash: created.tokenHash,
      revokedAt: null,
    });

    await expect(service.authenticate(issued.token)).resolves.toEqual({
      source: "HARDWARE",
      deviceCredentialId: "cred-1",
      deviceCode: "gateway_a",
      warehouseId: "warehouse-1",
    });
  });

  it("từ chối token sai định dạng mà không truy vấn database", async () => {
    await expect(service.authenticate("khong-phai-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.authenticate(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.deviceCredential.findUnique).not.toHaveBeenCalled();
  });

  it("từ chối token đúng dạng nhưng bí mật sai", async () => {
    const { issued, created } = await issueToken();
    prisma.deviceCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      code: "gateway_a",
      warehouseId: "warehouse-1",
      tokenHash: created.tokenHash,
      revokedAt: null,
    });
    const prefix = issued.token.split(".")[0]!;

    await expect(service.authenticate(`${prefix}.${"x".repeat(43)}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("khoá đã thu hồi không còn dùng được", async () => {
    const { issued, created } = await issueToken();
    prisma.deviceCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      code: "gateway_a",
      warehouseId: "warehouse-1",
      tokenHash: created.tokenHash,
      revokedAt: new Date(),
    });

    await expect(service.authenticate(issued.token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("chỉ kho trung tâm được cấp khoá gateway", async () => {
    prisma.warehouse.findUnique.mockResolvedValue({
      id: "warehouse-2",
      kind: WarehouseKind.HAMLET,
    });

    await expect(
      service.issue({ warehouseId: "warehouse-2", code: "gateway_b", name: "Gateway thôn" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deviceCredential.create).not.toHaveBeenCalled();
  });

  it("cấp khoá cho kho không tồn tại báo đúng loại lỗi", async () => {
    prisma.warehouse.findUnique.mockResolvedValue(null);

    await expect(
      service.issue({ warehouseId: "khong-co", code: "gateway_c", name: "Gateway" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("khoá lạ đổi prefix mỗi lần vẫn bị chặn, và chặn TRƯỚC khi tốn bcrypt", async () => {
    // bcrypt cố ý chậm; cửa này không có JWT chắn phía trước và đang phơi ra
    // Internet. Số lượt được phục vụ chính là số phép bcrypt phải chạy, nên trần
    // của rổ khoá lạ là trần chi phí CPU mà kẻ tấn công có thể ép máy chủ trả.
    const throttled = new DeviceCredentialService(prisma as never, { unknownPerMinute: 3 });
    prisma.deviceCredential.findUnique.mockResolvedValue(null);
    const token = (index: number) =>
      `upn_${index.toString(16).padStart(16, "0")}.${"a".repeat(43)}`;

    const statuses: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      await throttled.authenticate(token(index), 1_000).catch((error: unknown) => {
        statuses.push((error as { getStatus: () => number }).getStatus());
      });
    }

    // 3 lượt đầu được phục vụ (401), phần còn lại bị chặn thẳng (429).
    expect(statuses.filter((status) => status === 401)).toHaveLength(3);
    expect(statuses.filter((status) => status === 429)).toHaveLength(9);
  });

  it("một gateway gửi quá nhanh bị giãn nhịp, gateway khác không liên luỵ", async () => {
    const throttled = new DeviceCredentialService(prisma as never, { perCredentialPerMinute: 2 });
    const { issued, created } = await issueToken();
    prisma.deviceCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      code: "gateway_a",
      warehouseId: "warehouse-1",
      tokenHash: created.tokenHash,
      revokedAt: null,
    });

    await throttled.authenticate(issued.token, 1_000);
    await throttled.authenticate(issued.token, 1_000);
    await expect(throttled.authenticate(issued.token, 1_000)).rejects.toMatchObject({
      status: 429,
    });

    // Cửa sổ sau mở lại cho chính thiết bị đó.
    await expect(throttled.authenticate(issued.token, 70_000)).resolves.toMatchObject({
      deviceCode: "gateway_a",
    });
  });

  it("heartbeat không ghi database quá một lần mỗi phút", async () => {
    const { issued, created } = await issueToken();
    prisma.deviceCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      code: "gateway_a",
      warehouseId: "warehouse-1",
      tokenHash: created.tokenHash,
      revokedAt: null,
    });

    await service.authenticate(issued.token);
    await service.authenticate(issued.token);
    await service.authenticate(issued.token);

    expect(prisma.deviceCredential.update).toHaveBeenCalledTimes(1);
  });
});

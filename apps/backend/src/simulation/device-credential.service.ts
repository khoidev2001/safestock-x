import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { TelemetrySource, WarehouseKind } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { HardwareTelemetryActor } from "./telemetry-actor";
import {
  DEVICE_REQUESTS_PER_MINUTE,
  FixedWindowRateLimiter,
  RATE_LIMIT_WINDOW_MS,
  UNKNOWN_CREDENTIAL_ATTEMPTS_PER_MINUTE,
} from "./device-rate-limit";

/** `upn_<prefix>.<secret>` — prefix tra cứu công khai, secret chỉ tồn tại ở thiết bị. */
const TOKEN_PATTERN = /^upn_([A-Za-z0-9]{16})\.([A-Za-z0-9_-]{20,120})$/;
/** Mọi khoá không tồn tại dồn về một rổ, nên đổi prefix ngẫu nhiên không né được. */
const UNKNOWN_BUCKET = "unknown";
const PREFIX_BYTES = 8;
const SECRET_BYTES = 32;
const BCRYPT_ROUNDS = 10;
/** Ghi lastSeenAt tối đa mỗi phút: heartbeat không được biến thành tải ghi DB. */
const LAST_SEEN_THROTTLE_MS = 60_000;

export interface IssuedDeviceCredential {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  /** Chỉ trả về đúng một lần lúc cấp; hệ thống không lưu lại được giá trị này. */
  token: string;
}

export interface DeviceRateLimits {
  /** Số lô tối đa mỗi phút của MỘT thiết bị. */
  perCredentialPerMinute?: number;
  /** Số lượt thử tối đa mỗi phút cho toàn bộ khoá lạ cộng lại. */
  unknownPerMinute?: number;
}

/**
 * Token DI tuỳ chọn cho ngưỡng chặn.
 *
 * Phải khai báo tường minh: `DeviceRateLimits` là interface nên không tồn tại
 * lúc chạy, và nếu để Nest tự suy ra kiểu thì nó sẽ đi tìm một provider không
 * bao giờ có và làm sập ứng dụng lúc khởi động.
 */
export const DEVICE_RATE_LIMITS = "DEVICE_RATE_LIMITS";

@Injectable()
export class DeviceCredentialService {
  private readonly lastSeenWrites = new Map<string, number>();
  /** Hạn mức của từng thiết bị: chặn một gateway hỏng tự dội vào máy chủ. */
  private readonly perCredentialLimiter: FixedWindowRateLimiter;
  /** Rổ chung cho khoá lạ: chặn kẻ đổi prefix mỗi lần để né hạn mức từng thiết bị. */
  private readonly unknownCredentialLimiter: FixedWindowRateLimiter;
  /** Hash thật của một bí mật ngẫu nhiên: giữ chi phí so sánh khi prefix không tồn tại. */
  private readonly decoyHash = bcrypt.hashSync(
    randomBytes(SECRET_BYTES).toString("base64url"),
    BCRYPT_ROUNDS,
  );

  /** `limits` chỉ dùng để test siết ngưỡng xuống mức chạy nhanh; runtime dùng mặc định. */
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(DEVICE_RATE_LIMITS) limits: DeviceRateLimits = {},
  ) {
    this.perCredentialLimiter = new FixedWindowRateLimiter(
      limits.perCredentialPerMinute ?? DEVICE_REQUESTS_PER_MINUTE,
      RATE_LIMIT_WINDOW_MS,
    );
    this.unknownCredentialLimiter = new FixedWindowRateLimiter(
      limits.unknownPerMinute ?? UNKNOWN_CREDENTIAL_ATTEMPTS_PER_MINUTE,
      RATE_LIMIT_WINDOW_MS,
    );
  }

  /**
   * Cấp khoá cho một gateway. Token gốc chỉ tồn tại trong giá trị trả về; DB chỉ
   * giữ bcrypt hash, nên lộ database không đủ để giả mạo thiết bị.
   */
  async issue(input: {
    warehouseId: string;
    code: string;
    name: string;
  }): Promise<IssuedDeviceCredential> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
      select: { id: true, kind: true },
    });
    // Cấp khoá là thao tác quản trị, không phải xác thực: lỗi ở đây là sai tham
    // số đầu vào, không phải "chưa đăng nhập".
    if (!warehouse) throw new NotFoundException("Kho không tồn tại");
    if (warehouse.kind !== WarehouseKind.CENTRAL) {
      throw new BadRequestException("Chỉ kho trung tâm có gateway thiết bị");
    }

    const tokenPrefix = randomBytes(PREFIX_BYTES).toString("hex");
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    const created = await this.prisma.deviceCredential.create({
      data: {
        warehouseId: input.warehouseId,
        code: input.code,
        name: input.name,
        tokenPrefix,
        tokenHash: await bcrypt.hash(secret, BCRYPT_ROUNDS),
      },
      select: { id: true, code: true, name: true, warehouseId: true },
    });
    return { ...created, token: `upn_${tokenPrefix}.${secret}` };
  }

  async revoke(credentialId: string): Promise<void> {
    await this.prisma.deviceCredential.updateMany({
      where: { id: credentialId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Xác thực token của gateway. Mọi nhánh thất bại đều trả cùng một thông điệp:
   * token sai, token đúng dạng nhưng không tồn tại, và token đã thu hồi không
   * được phép phân biệt với nhau từ bên ngoài.
   */
  async authenticate(
    rawToken: string | undefined,
    now: number = Date.now(),
  ): Promise<HardwareTelemetryActor> {
    // Thứ tự ở đây là có chủ đích, từ rẻ tới đắt: cú pháp → hạn mức → truy vấn
    // có index → bcrypt. Cửa này không có JWT chắn phía trước và đang phơi ra
    // Internet, nên không được phép để request rác chạm tới bcrypt.
    const parsed = TOKEN_PATTERN.exec((rawToken ?? "").trim());
    if (!parsed) throw new UnauthorizedException("Khoá thiết bị không hợp lệ");

    const tokenPrefix = parsed[1] as string;
    const secret = parsed[2] as string;
    if (!this.perCredentialLimiter.tryConsume(tokenPrefix, now)) {
      throw new HttpException(
        "Thiết bị gửi quá nhanh; hãy giãn nhịp báo",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const credential = await this.prisma.deviceCredential.findUnique({
      where: { tokenPrefix },
      select: {
        id: true,
        code: true,
        warehouseId: true,
        tokenHash: true,
        revokedAt: true,
      },
    });
    if (!credential || credential.revokedAt) {
      // Vượt rổ khoá lạ thì từ chối ngay, KHÔNG chạy so sánh giả: giữ chi phí
      // đồng đều chỉ có nghĩa khi kẻ tấn công còn được phục vụ.
      if (!this.unknownCredentialLimiter.tryConsume(UNKNOWN_BUCKET, now)) {
        throw new HttpException("Quá nhiều lượt thử khoá thiết bị", HttpStatus.TOO_MANY_REQUESTS);
      }
      // So sánh giả để thời gian phản hồi không tiết lộ prefix nào có thật.
      await bcrypt.compare(secret, this.decoyHash);
      throw new UnauthorizedException("Khoá thiết bị không hợp lệ");
    }
    if (!(await bcrypt.compare(secret, credential.tokenHash))) {
      throw new UnauthorizedException("Khoá thiết bị không hợp lệ");
    }

    await this.touch(credential.id);
    return {
      source: TelemetrySource.HARDWARE,
      deviceCredentialId: credential.id,
      deviceCode: credential.code,
      warehouseId: credential.warehouseId,
    };
  }

  private async touch(credentialId: string): Promise<void> {
    const now = Date.now();
    const written = this.lastSeenWrites.get(credentialId) ?? 0;
    if (now - written < LAST_SEEN_THROTTLE_MS) return;
    this.lastSeenWrites.set(credentialId, now);
    try {
      await this.prisma.deviceCredential.update({
        where: { id: credentialId },
        data: { lastSeenAt: new Date(now) },
      });
    } catch {
      // Heartbeat là dữ liệu quan sát, không được phép làm hỏng request số liệu.
      this.lastSeenWrites.delete(credentialId);
    }
  }
}

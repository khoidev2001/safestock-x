import { randomInt } from "crypto";
import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { VerificationSmsService, type SmsDelivery } from "../sms/verification-sms.service";
import { carrierLabelOf, isVnMobilePhone, toLocalVnPhone } from "../sms/vn-carriers";

/** Mã sống 10 phút — đủ để mở tin nhắn, ngắn đủ để mã lọt ra ngoài cũng vô dụng nhanh. */
export const PHONE_CODE_TTL_MS = 10 * 60_000;
/** Sai quá 5 lần thì mã chết, buộc gửi lại — chặn dò 6 số bằng vét cạn. */
export const PHONE_MAX_ATTEMPTS = 5;
/** Chống bơm tin nhắn vào máy người khác: tối đa 5 mã / 30 phút, cách nhau ít nhất 60 giây. */
export const PHONE_RESEND_COOLDOWN_MS = 60_000;
export const PHONE_REQUEST_WINDOW_MS = 30 * 60_000;
export const PHONE_MAX_REQUESTS_PER_WINDOW = 5;

export interface PhoneVerificationState {
  /** Số đã xác minh và đang nằm trong hồ sơ; `null` là chưa có số nào. */
  phone: string | null;
  /** Tên nhà mạng của số đang có — để người dùng soát lại số vừa gõ. */
  carrier: string | null;
  /** Số đang chờ nhập mã — để giao diện dựng lại ô nhập mã sau khi thoát ra vào lại. */
  pendingPhone: string | null;
  pendingExpiresAt: Date | null;
  /** Chỉ có ngay sau lần xin mã: "dev-log" = chưa cấu hình nhà mạng, mã không gửi đi đâu. */
  delivery?: SmsDelivery;
  /** Chỉ ở chế độ dev: mã trần để hiện thẳng trên màn hình cho người đang thử. */
  devCode?: string;
}

/**
 * Thêm số điện thoại vào hồ sơ = hai bước: xin mã → nhập mã.
 *
 * Cột `phone` CHỈ được ghi sau khi mã đúng. Số điện thoại ở đây không phải thông
 * tin trang trí: khi kho cần chi viện, người trực bấm thẳng số này để gọi. Một số
 * gõ nhầm một chữ trông y hệt số đúng, và chỉ lộ ra vào đúng lúc không còn ai
 * rảnh để tra lại — nên bắt buộc phải có mã gửi tới chính máy đó.
 */
@Injectable()
export class PhoneVerificationService {
  private readonly log = new Logger(PhoneVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: VerificationSmsService,
  ) {}

  /**
   * Bỏ khoảng trắng, dấu chấm và ngoặc; giữ dấu + đầu nếu có.
   *
   * Người dùng gõ "0912 345 678" hay "0912.345.678" đều là một số. Chuẩn hoá
   * trước khi lưu để hai lần nhập cùng một số không thành hai số khác nhau.
   */
  normalizePhone(phone: string): string {
    // Về một dạng duy nhất: 10 số bắt đầu bằng 0. "+84912345678" và "0912 345 678"
    // là cùng một máy, lưu hai kiểu thì hai lần nhập thành hai số khác nhau.
    return toLocalVnPhone(phone);
  }

  /**
   * Chốt rằng số này NHẬN ĐƯỢC tin nhắn, không chỉ là "trông giống số điện thoại".
   *
   * Đầu số quyết định: số cố định (024, 028, 0257…) và đầu số bịa ra đều lọt qua
   * một biểu thức chính quy lỏng, rồi hỏng vào đúng lúc người dùng ngồi chờ mã.
   */
  assertPhoneShape(phone: string): void {
    if (!isVnMobilePhone(phone)) {
      throw new BadRequestException(
        "Số này không nhận được tin nhắn. Nhập số di động 10 chữ số của Viettel, VinaPhone, MobiFone, Vietnamobile, Gmobile, iTelecom hoặc Wintel.",
      );
    }
  }

  async getState(userId: string): Promise<PhoneVerificationState> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user) throw new UnauthorizedException("User không tồn tại");
    const pending = await this.findActive(userId, new Date());
    return {
      phone: user.phone,
      carrier: user.phone ? carrierLabelOf(user.phone) : null,
      pendingPhone: pending?.phone ?? null,
      pendingExpiresAt: pending?.expiresAt ?? null,
    };
  }

  /** Bước 1: sinh mã 6 số, nhắn tới máy, trả về mốc hết hạn cho giao diện đếm ngược. */
  async requestCode(userId: string, rawPhone: string): Promise<PhoneVerificationState> {
    const phone = this.normalizePhone(rawPhone);
    this.assertPhoneShape(phone);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user) throw new UnauthorizedException("User không tồn tại");
    if (user.phone === phone) {
      throw new BadRequestException("Số này đã là số điện thoại của bạn.");
    }

    if (!this.sms.canSend()) {
      // Chặn trước khi tạo mã: tạo rồi mới biết không gửi được là đốt oan hạn mức
      // của người dùng cho một việc chắc chắn hỏng.
      throw new BadRequestException(
        "Máy chủ chưa cấu hình dịch vụ tin nhắn nên chưa gửi được mã xác minh.",
      );
    }

    const now = new Date();
    await this.assertRequestQuota(userId, now);

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    // Mã cũ chết ngay khi có mã mới: người dùng gõ mã trong tin nhắn cũ sẽ bị từ
    // chối, thay vì xác minh trúng một số họ vừa gõ lại cho khác đi.
    await this.cancelPending(userId, now);
    const record = await this.prisma.phoneVerification.create({
      data: {
        userId,
        phone,
        codeHash,
        expiresAt: new Date(now.getTime() + PHONE_CODE_TTL_MS),
      },
      select: { id: true, phone: true, expiresAt: true },
    });

    let delivery: SmsDelivery;
    try {
      delivery = await this.sms.sendVerificationCode({
        phone,
        code,
        expiresInMinutes: Math.round(PHONE_CODE_TTL_MS / 60_000),
      });
    } catch (error) {
      // Gửi hỏng mà vẫn giữ mã thì người dùng ngồi chờ một mã không bao giờ tới,
      // và hạn mức bị đốt oan. Xoá mã rồi báo lỗi thật.
      try {
        await this.prisma.phoneVerification.delete({ where: { id: record.id } });
      } catch {
        // Mã tự hết hạn sau PHONE_CODE_TTL_MS; xoá không được cũng không kẹt luồng.
      }
      this.log.warn(`Không gửi được mã xác minh số điện thoại: ${(error as Error).message}`);
      throw new BadRequestException("Chưa gửi được mã tới số này. Kiểm tra lại số rồi thử lại.");
    }

    return {
      ...(await this.getState(userId)),
      delivery,
      devCode: delivery === "dev-log" ? code : undefined,
    };
  }

  /** Bước 2: mã đúng → ghi số vào hồ sơ. */
  async confirmCode(userId: string, rawCode: string): Promise<PhoneVerificationState> {
    const code = String(rawCode ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new BadRequestException("Mã xác minh gồm 6 chữ số.");

    const now = new Date();
    const pending = await this.findActive(userId, now);
    if (!pending) {
      throw new BadRequestException("Mã đã hết hạn hoặc chưa được yêu cầu. Hãy gửi lại mã.");
    }
    if (pending.attempts >= PHONE_MAX_ATTEMPTS) {
      await this.prisma.phoneVerification.update({
        where: { id: pending.id },
        data: { consumedAt: now },
      });
      throw new BadRequestException("Nhập sai quá nhiều lần. Hãy gửi lại mã mới.");
    }

    if (!(await bcrypt.compare(code, pending.codeHash))) {
      const attempts = pending.attempts + 1;
      await this.prisma.phoneVerification.update({
        where: { id: pending.id },
        data: { attempts },
      });
      const remaining = PHONE_MAX_ATTEMPTS - attempts;
      throw new BadRequestException(
        remaining > 0
          ? `Mã không đúng. Còn ${remaining} lần thử.`
          : "Mã không đúng. Hãy gửi lại mã mới.",
      );
    }

    await this.prisma.phoneVerification.update({
      where: { id: pending.id },
      data: { consumedAt: now, verifiedAt: now },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { phone: pending.phone } });
    return this.getState(userId);
  }

  /** Huỷ mã đang chờ — người dùng bấm "Nhập số khác". */
  async cancelPending(userId: string, now = new Date()): Promise<PhoneVerificationState> {
    await this.prisma.phoneVerification.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    return this.getState(userId);
  }

  /**
   * Gỡ số khỏi hồ sơ.
   *
   * Không kèm xác minh gì: xoá số của chính mình chỉ làm mình khó gọi tới hơn,
   * không chiếm được gì của ai.
   */
  async remove(userId: string): Promise<PhoneVerificationState> {
    await this.prisma.user.update({ where: { id: userId }, data: { phone: null } });
    return this.cancelPending(userId);
  }

  private async findActive(userId: string, now: Date) {
    return this.prisma.phoneVerification.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
  }

  private async assertRequestQuota(userId: string, now: Date): Promise<void> {
    const since = new Date(now.getTime() - PHONE_REQUEST_WINDOW_MS);
    // Mã đã xác minh xong KHÔNG tính vào hạn mức: đổi số vài lần trong một buổi là
    // việc bình thường. Cái cần chặn là mã gửi đi rồi bỏ đó — dấu hiệu đang bơm
    // tin nhắn vào máy người khác.
    const recent = await this.prisma.phoneVerification.findMany({
      where: { userId, verifiedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last && now.getTime() - last.createdAt.getTime() < PHONE_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil(
        (PHONE_RESEND_COOLDOWN_MS - (now.getTime() - last.createdAt.getTime())) / 1000,
      );
      throw new BadRequestException(`Vui lòng đợi ${wait} giây trước khi gửi lại mã.`);
    }
    if (recent.length >= PHONE_MAX_REQUESTS_PER_WINDOW) {
      const oldest = recent[recent.length - 1]!;
      const minutes = Math.max(
        1,
        Math.ceil((oldest.createdAt.getTime() + PHONE_REQUEST_WINDOW_MS - now.getTime()) / 60_000),
      );
      throw new BadRequestException(`Đã gửi quá nhiều mã. Hãy thử lại sau ${minutes} phút.`);
    }
  }
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

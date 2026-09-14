import { UserRole } from "@safestock/shared-types";

/**
 * Xác thực hai bước bằng mã gửi qua email — phần quyết định, tách riêng để khoá bằng test.
 *
 * VÌ SAO CHỈ ADMIN: tài khoản quản trị duyệt nhiệm vụ, tạo và xoá tài khoản, xem mọi
 * kho của xã. Lộ mật khẩu của nó là mất quyền điều hành cả xã. Tài khoản kho và đội
 * cứu hộ thì dùng ngoài hiện trường, nhiều khi sóng chập chờn — bắt họ chờ thư giữa
 * lúc lũ về là đánh đổi sai.
 */

/**
 * Tài khoản ADMIN được MIỄN bước mã, gọi đích danh.
 *
 * `iot` là tài khoản MÁY của ứng dụng giả lập cảm biến: nó mang quyền ADMIN để bơm số
 * liệu, chạy không người ngồi và không có hộp thư nào để nhận mã. Bắt nó qua bước mã
 * là tắt luôn luồng cảm biến. Gọi tên cụ thể chứ không miễn theo điều kiện chung
 * chung: danh sách này là một ngoại lệ bảo mật, phải nhìn thấy được, và thêm tên vào
 * đây là một quyết định có chủ ý chứ không phải tác dụng phụ.
 */
export const LOGIN_OTP_EXEMPT_LOGINS: ReadonlySet<string> = new Set(["iot"]);

/** Thẻ thử thách sống 10 phút: đủ cho vài lượt gửi lại, không đủ để để dành dùng sau. */
export const LOGIN_CHALLENGE_TTL_SECONDS = 10 * 60;

/** Loại thẻ — chặn dùng nhầm access token hay refresh token làm thẻ thử thách. */
export const LOGIN_CHALLENGE_TYPE = "login-otp";

export interface LoginChallengePayload {
  sub: string;
  typ: typeof LOGIN_CHALLENGE_TYPE;
  /**
   * `sessionVersion` lúc nhập đúng mật khẩu. Đổi mật khẩu hay bị thu hồi quyền giữa
   * chừng thì số này tăng, và thẻ cũ phải chết theo — mật khẩu cũ không còn là bằng
   * chứng gì nữa.
   */
  sv: number;
}

export interface LoginOtpChallenge {
  otpRequired: true;
  challengeToken: string;
  /** Email đã che bớt, để người dùng biết phải mở hộp thư nào mà không lộ địa chỉ. */
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
  /** Chỉ có khi máy chủ chưa cấu hình SMTP (môi trường thử). */
  devCode?: string;
}

export function requiresLoginOtp(user: { role: string; email: string }): boolean {
  return user.role === UserRole.ADMIN && !LOGIN_OTP_EXEMPT_LOGINS.has(user.email);
}

/**
 * Che email: giữ 2 ký tự đầu, ký tự cuối trước @, và tên miền.
 *
 * Đủ để chủ tài khoản nhận ra hộp thư của mình; không đủ để người cầm được mật khẩu
 * biết địa chỉ đầy đủ mà đi dò tiếp.
 */
export function maskEmail(email: string): string {
  const [local, domain] = String(email).split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0] ?? ""}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

/**
 * Hạn mức theo IP cho hai bước mã.
 *
 * Hạn mức theo tài khoản đã có (chờ 60 giây giữa hai mã, tối đa 5 mã / 30 phút, sai
 * 5 lần là huỷ mã). Nhưng kẻ đã có mật khẩu của NHIỀU tài khoản quản trị có thể xoay
 * vòng qua từng tài khoản; chốt thêm theo IP để một máy không bơm được hàng loạt.
 */
export class IpWindowQuota {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Trả số giây phải chờ nếu đã chạm hạn mức, `0` nếu còn được phép (và đếm lượt này). */
  take(ip: string, now = Date.now()): number {
    const current = this.hits.get(ip);
    if (!current || current.resetAt <= now) {
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    if (current.count >= this.limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    current.count += 1;
    return 0;
  }
}

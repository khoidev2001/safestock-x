/**
 * Bước nhập mã khi tài khoản quản trị đăng nhập — phần tính giờ, tách riêng để test.
 *
 * Mọi mốc lấy từ MÁY CHỦ (`expiresAt`, `resendAvailableAt`), không tự đếm 60 giây từ
 * lúc bấm: đồng hồ máy người dùng lệch hay mạng chậm vài giây thì nút "Gửi lại" hiện
 * ra trong khi máy chủ vẫn chưa cho gửi, và người dùng bấm vào chỉ để nhận lỗi.
 */

export interface LoginOtpChallenge {
  otpRequired: true;
  challengeToken: string;
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
  devCode?: string;
}

export const LOGIN_OTP_EXPIRED_MESSAGE = "Mã đã hết hạn. Vui lòng gửi lại mã mới.";

export function isLoginOtpChallenge(value: unknown): value is LoginOtpChallenge {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { otpRequired?: unknown }).otpRequired === true &&
    typeof (value as { challengeToken?: unknown }).challengeToken === "string",
  );
}

/** Số giây còn lại tới một mốc, làm tròn LÊN, không bao giờ âm. */
export function secondsUntil(iso: string, now: number): number {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

export interface LoginOtpView {
  /** Giây mã còn hiệu lực; 0 là đã hết hạn. */
  secondsLeft: number;
  expired: boolean;
  /** Nút "Gửi lại mã" chỉ hiện khi máy chủ đã cho gửi lại. */
  canResend: boolean;
  /** Giây phải chờ trước khi được gửi lại. */
  resendIn: number;
}

export function loginOtpView(challenge: LoginOtpChallenge, now: number): LoginOtpView {
  const secondsLeft = secondsUntil(challenge.expiresAt, now);
  const resendIn = secondsUntil(challenge.resendAvailableAt, now);
  return { secondsLeft, expired: secondsLeft === 0, canResend: resendIn === 0, resendIn };
}

/**
 * Kiểm mã trước khi gửi lên.
 *
 * Mã đã quá hạn thì báo luôn, không gửi lên máy chủ: gửi đi chỉ để nhận về đúng câu
 * đó, mà lượt gửi lại bị tính vào hạn mức sai mã của tài khoản.
 */
export function loginOtpInputError(
  code: string,
  challenge: LoginOtpChallenge,
  now: number,
): string | null {
  if (loginOtpView(challenge, now).expired) return LOGIN_OTP_EXPIRED_MESSAGE;
  if (!/^\d{6}$/.test(code.trim())) return "Mã đăng nhập gồm 6 chữ số.";
  return null;
}

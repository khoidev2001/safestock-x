import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

interface AttemptRecord {
  failures: number;
  expiresAt: number;
  blockedUntil: number | null;
}

/** Số lần gõ sai liên tiếp trước khi khoá. */
export const MAX_FAILURES = 10;

/**
 * Từ lần sai thứ mấy thì bắt đầu đếm ngược số lần còn lại.
 *
 * Không cảnh báo ngay từ lần đầu: gõ nhầm một lần là chuyện thường ngày, đếm
 * ngược ở đó chỉ làm người dùng hoảng. Nhưng cũng không được im lặng tới lúc
 * khoá — bị khoá đột ngột giữa ca trực mà không có dấu hiệu nào báo trước là
 * mất mười lăm phút không đăng nhập được, đúng lúc đang cần.
 */
export const WARN_AFTER_FAILURES = 5;

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

/** Kết quả một lần gõ sai, để tầng gọi dựng câu báo cho người dùng. */
export interface FailureState {
  failures: number;
  /** Còn bao nhiêu lần nữa thì khoá. */
  remaining: number;
  blocked: boolean;
  /** Có nên nói ra số lần còn lại chưa. */
  shouldWarn: boolean;
}

@Injectable()
export class AuthRateLimitService {
  private readonly attempts = new Map<string, AttemptRecord>();

  assertAllowed(identifier: string, sourceIp: string): void {
    const key = this.key(identifier, sourceIp);
    const record = this.attempts.get(key);
    const now = Date.now();
    if (!record) return;
    if (record.expiresAt <= now) {
      this.attempts.delete(key);
      return;
    }
    if (record.blockedUntil && record.blockedUntil > now) {
      // Nói rõ còn bao lâu. "Thử lại sau" không trả lời được câu hỏi duy nhất
      // người đang bị khoá muốn hỏi, nên họ bấm lại liên tục và tự gia hạn khoá.
      const minutesRemaining = Math.max(1, Math.ceil((record.blockedUntil - now) / 60_000));
      throw new HttpException(
        `Đã nhập sai ${MAX_FAILURES} lần nên tài khoản tạm khoá đăng nhập. Vui lòng thử lại sau ${minutesRemaining} phút.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(identifier: string, sourceIp: string): FailureState {
    const key = this.key(identifier, sourceIp);
    const now = Date.now();
    const previous = this.attempts.get(key);
    const record: AttemptRecord =
      previous && previous.expiresAt > now
        ? previous
        : { failures: 0, expiresAt: now + WINDOW_MS, blockedUntil: null };

    record.failures += 1;
    if (record.failures >= MAX_FAILURES) {
      record.blockedUntil = now + BLOCK_MS;
    }
    this.attempts.set(key, record);

    const remaining = Math.max(MAX_FAILURES - record.failures, 0);
    return {
      failures: record.failures,
      remaining,
      blocked: record.blockedUntil !== null,
      shouldWarn: record.failures >= WARN_AFTER_FAILURES && remaining > 0,
    };
  }

  clear(identifier: string, sourceIp: string): void {
    this.attempts.delete(this.key(identifier, sourceIp));
  }

  private key(identifier: string, sourceIp: string): string {
    return [identifier.trim().toLowerCase(), sourceIp.trim() || "unknown"].join("|");
  }
}

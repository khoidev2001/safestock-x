import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

interface AttemptRecord {
  failures: number;
  expiresAt: number;
  blockedUntil: number | null;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

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
      throw new HttpException(
        "Đã có quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(identifier: string, sourceIp: string): void {
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
  }

  clear(identifier: string, sourceIp: string): void {
    this.attempts.delete(this.key(identifier, sourceIp));
  }

  private key(identifier: string, sourceIp: string): string {
    return [identifier.trim().toLowerCase(), sourceIp.trim() || "unknown"].join("|");
  }
}

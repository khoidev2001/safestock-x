/**
 * Bộ đếm cửa sổ cố định, thuần và test được (đồng hồ truyền vào).
 *
 * Dùng để chặn lạm dụng cửa số liệu thiết bị TRƯỚC khi chạm tới bcrypt. bcrypt
 * cố ý chậm, nên nếu không chặn sớm thì mỗi request rác đều đốt CPU của máy kho
 * — một vector từ chối dịch vụ rất rẻ với kẻ tấn công.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Trần số khoá theo dõi; vượt thì dọn để bộ đếm không tự thành chỗ rò bộ nhớ. */
    private readonly maxTrackedKeys = 10_000,
  ) {}

  /** true = cho đi; false = đã vượt hạn mức trong cửa sổ hiện tại. */
  tryConsume(key: string, now: number): boolean {
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      if (this.windows.size >= this.maxTrackedKeys) this.sweep(now);
      this.windows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  /** Số khoá đang theo dõi — chỉ dùng cho test và chẩn đoán. */
  get trackedKeys(): number {
    return this.windows.size;
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
    // Vẫn đầy sau khi dọn (đang bị dội khoá lạ): bỏ hết và bắt đầu lại. Bộ đếm
    // được phép mất chính xác, không được phép ăn hết bộ nhớ.
    if (this.windows.size >= this.maxTrackedKeys) this.windows.clear();
  }
}

/** Một gateway khoẻ mạnh gửi vài lô mỗi phút; ngưỡng này rộng gấp nhiều lần thực tế. */
export const DEVICE_REQUESTS_PER_MINUTE = 120;

/**
 * Trần cho khoá KHÔNG tồn tại hoặc đã thu hồi.
 *
 * Kẻ tấn công đổi prefix ngẫu nhiên mỗi lần sẽ không bao giờ dính hạn mức theo
 * từng thiết bị, nên toàn bộ số đó rơi vào chung một rổ. Thiết bị hợp lệ không
 * đi qua rổ này nên không bị ảnh hưởng.
 */
export const UNKNOWN_CREDENTIAL_ATTEMPTS_PER_MINUTE = 60;

export const RATE_LIMIT_WINDOW_MS = 60_000;

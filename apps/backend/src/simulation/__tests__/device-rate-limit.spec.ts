import {
  DEVICE_REQUESTS_PER_MINUTE,
  FixedWindowRateLimiter,
  RATE_LIMIT_WINDOW_MS,
  UNKNOWN_CREDENTIAL_ATTEMPTS_PER_MINUTE,
} from "../device-rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("cho đi đúng hạn mức rồi chặn phần dư trong cùng cửa sổ", () => {
    const limiter = new FixedWindowRateLimiter(3, 60_000);

    expect([1, 2, 3].map(() => limiter.tryConsume("a", 1_000))).toEqual([true, true, true]);
    expect(limiter.tryConsume("a", 1_000)).toBe(false);
  });

  it("mở lại hạn mức khi sang cửa sổ mới", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);

    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("a", 59_999)).toBe(false);
    expect(limiter.tryConsume("a", 60_000)).toBe(true);
  });

  it("hạn mức của thiết bị này không ăn sang thiết bị khác", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);

    expect(limiter.tryConsume("gateway-a", 0)).toBe(true);
    expect(limiter.tryConsume("gateway-a", 0)).toBe(false);
    expect(limiter.tryConsume("gateway-b", 0)).toBe(true);
  });

  it("bộ đếm không tự biến thành chỗ rò bộ nhớ khi bị dội khoá lạ", () => {
    // Kẻ tấn công đổi khoá mỗi request sẽ tạo ra vô hạn khoá theo dõi nếu không dọn.
    const limiter = new FixedWindowRateLimiter(5, 60_000, 100);

    for (let index = 0; index < 5_000; index += 1) {
      limiter.tryConsume(`key-${index}`, index);
    }

    expect(limiter.trackedKeys).toBeLessThanOrEqual(100);
  });

  it("dọn khoá hết hạn trước, không xoá oan khoá còn trong cửa sổ", () => {
    const limiter = new FixedWindowRateLimiter(5, 60_000, 3);

    limiter.tryConsume("cu-1", 0);
    limiter.tryConsume("cu-2", 0);
    // Sang cửa sổ sau: hai khoá trên đã hết hạn và phải bị dọn nhường chỗ.
    limiter.tryConsume("moi-1", 120_000);
    limiter.tryConsume("moi-2", 120_000);
    limiter.tryConsume("moi-3", 120_000);

    expect(limiter.trackedKeys).toBeLessThanOrEqual(3);
    // Khoá mới vẫn giữ được số đếm của nó sau đợt dọn.
    expect(limiter.tryConsume("moi-1", 120_000)).toBe(true);
  });

  it("ngưỡng mặc định rộng hơn nhịp báo thật của gateway", () => {
    // Gateway gửi mỗi 5 giây là 12 lô/phút; ngưỡng phải rộng hơn nhiều lần để
    // thiết bị khoẻ mạnh không bao giờ chạm trần.
    expect(DEVICE_REQUESTS_PER_MINUTE).toBeGreaterThanOrEqual(60);
    // Rổ khoá lạ thì ngược lại: phải chặt hơn hạn mức của thiết bị hợp lệ.
    expect(UNKNOWN_CREDENTIAL_ATTEMPTS_PER_MINUTE).toBeLessThan(DEVICE_REQUESTS_PER_MINUTE);
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});

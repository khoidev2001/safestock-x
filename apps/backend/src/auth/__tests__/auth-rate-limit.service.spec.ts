import { HttpException, HttpStatus } from "@nestjs/common";
import {
  AuthRateLimitService,
  MAX_FAILURES,
  WARN_AFTER_FAILURES,
} from "../auth-rate-limit.service";

describe("AuthRateLimitService", () => {
  const identifier = "admin";
  const sourceIp = "127.0.0.1";
  let service: AuthRateLimitService;

  beforeEach(() => {
    service = new AuthRateLimitService();
  });

  it("blocks a repeated failed login attempt without blocking a different principal", () => {
    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      service.recordFailure(identifier, sourceIp);
    }

    expect(() => service.assertAllowed(identifier, sourceIp)).toThrow(HttpException);
    try {
      service.assertAllowed(identifier, sourceIp);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
    expect(() => service.assertAllowed("other-admin", sourceIp)).not.toThrow();
  });

  it("clears a failure record after a successful login", () => {
    service.recordFailure(identifier, sourceIp);
    service.clear(identifier, sourceIp);

    expect(() => service.assertAllowed(identifier, sourceIp)).not.toThrow();
  });

  it("expires the block instead of retaining login state indefinitely", () => {
    jest.useFakeTimers();
    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      service.recordFailure(identifier, sourceIp);
    }

    jest.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(() => service.assertAllowed(identifier, sourceIp)).not.toThrow();
    jest.useRealTimers();
  });
});

describe("AuthRateLimitService đếm ngược trước khi khoá", () => {
  const identifier = "admindongxuan1";
  const sourceIp = "127.0.0.1";
  let service: AuthRateLimitService;

  beforeEach(() => {
    service = new AuthRateLimitService();
  });

  const failTimes = (times: number) => {
    let state = service.recordFailure(identifier, sourceIp);
    for (let i = 1; i < times; i += 1) state = service.recordFailure(identifier, sourceIp);
    return state;
  };

  it("chưa tới ngưỡng cảnh báo thì im lặng", () => {
    // Gõ nhầm một hai lần là chuyện thường; đếm ngược ngay chỉ làm người dùng hoảng.
    for (let times = 1; times < WARN_AFTER_FAILURES; times += 1) {
      expect(failTimes(times).shouldWarn).toBe(false);
      service.clear(identifier, sourceIp);
    }
  });

  it("từ lần sai thứ 5 thì bắt đầu báo số lần còn lại", () => {
    const state = failTimes(WARN_AFTER_FAILURES);
    expect(state.shouldWarn).toBe(true);
    expect(state.remaining).toBe(MAX_FAILURES - WARN_AFTER_FAILURES);
  });

  it("số lần còn lại giảm dần cho tới 0", () => {
    const remaining: number[] = [];
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      remaining.push(service.recordFailure(identifier, sourceIp).remaining);
    }
    expect(remaining[WARN_AFTER_FAILURES - 1]).toBe(5);
    expect(remaining[MAX_FAILURES - 1]).toBe(0);
    expect(remaining).toEqual([...remaining].sort((a, b) => b - a));
  });

  it("đúng lần thứ 10 mới khoá, lần thứ 9 vẫn cho thử", () => {
    const beforeBlock = failTimes(MAX_FAILURES - 1);
    expect(beforeBlock.blocked).toBe(false);
    expect(() => service.assertAllowed(identifier, sourceIp)).not.toThrow();

    const atBlock = service.recordFailure(identifier, sourceIp);
    expect(atBlock.blocked).toBe(true);
    // Lúc khoá thì thôi đếm ngược: không còn lần nào để đếm nữa.
    expect(atBlock.shouldWarn).toBe(false);
    expect(() => service.assertAllowed(identifier, sourceIp)).toThrow(HttpException);
  });

  it("câu báo khoá nói rõ còn bao nhiêu phút", () => {
    // "Thử lại sau" không trả lời được câu duy nhất người bị khoá muốn hỏi, nên
    // họ bấm lại liên tục.
    failTimes(MAX_FAILURES);
    try {
      service.assertAllowed(identifier, sourceIp);
      throw new Error("đáng lẽ phải bị khoá");
    } catch (error) {
      expect((error as HttpException).message).toMatch(/thử lại sau \d+ phút/i);
      expect((error as HttpException).message).toContain(String(MAX_FAILURES));
    }
  });
});

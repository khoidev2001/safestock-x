import { HttpException, HttpStatus } from "@nestjs/common";
import { AuthRateLimitService } from "../auth-rate-limit.service";

describe("AuthRateLimitService", () => {
  const identifier = "admin";
  const sourceIp = "127.0.0.1";
  let service: AuthRateLimitService;

  beforeEach(() => {
    service = new AuthRateLimitService();
  });

  it("blocks a repeated failed login attempt without blocking a different principal", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
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
    for (let attempt = 0; attempt < 5; attempt += 1) {
      service.recordFailure(identifier, sourceIp);
    }

    jest.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(() => service.assertAllowed(identifier, sourceIp)).not.toThrow();
    jest.useRealTimers();
  });
});

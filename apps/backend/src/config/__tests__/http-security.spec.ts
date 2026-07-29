import {
  applyApiSecurityHeaders,
  createCorsOriginValidator,
  resolveAllowedCorsOrigins,
  validateCorsOrigins,
} from "../http-security";

describe("HTTP security configuration", () => {
  it("allows only explicit local origins by default outside production", () => {
    expect(resolveAllowedCorsOrigins(undefined, "development")).toEqual([
      "http://localhost:3200",
      "http://127.0.0.1:3200",
    ]);
    expect(resolveAllowedCorsOrigins(undefined, "production")).toEqual([]);
  });

  it("normalizes an explicit allowlist and rejects arbitrary origins", () => {
    const origins = resolveAllowedCorsOrigins(
      "https://ops.example.vn/, http://192.168.1.10:3200",
      "production",
    );
    const validator = createCorsOriginValidator(origins);
    const accepted = jest.fn();
    const rejected = jest.fn();

    validator("https://ops.example.vn", accepted);
    validator("https://attacker.example", rejected);

    expect(origins).toEqual(["https://ops.example.vn", "http://192.168.1.10:3200"]);
    expect(accepted).toHaveBeenCalledWith(null, true);
    expect(rejected).toHaveBeenCalledWith(null, false);
  });

  it("keeps native and server-to-server requests usable without an Origin header", () => {
    const callback = jest.fn();
    createCorsOriginValidator([])(undefined, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("validates CORS configuration before runtime", () => {
    expect(validateCorsOrigins("https://ops.example.vn,http://192.168.1.10:3200")).toBeNull();
    expect(validateCorsOrigins("*,https://ops.example.vn")).toContain("CORS_ALLOWED_ORIGINS");
  });

  it("sets browser hardening headers only for API routes", () => {
    const setHeader = jest.fn();
    const next = jest.fn();
    applyApiSecurityHeaders({ path: "/api/auth/login" } as never, { setHeader } as never, next);

    expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(next).toHaveBeenCalledTimes(1);

    setHeader.mockClear();
    applyApiSecurityHeaders({ path: "/sim.html" } as never, { setHeader } as never, next);
    expect(setHeader).not.toHaveBeenCalled();
  });
});

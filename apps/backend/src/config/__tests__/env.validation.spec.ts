import { resolveBindAddress, validateEnv } from "../env.validation";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "access-secret-longenough",
  JWT_REFRESH_SECRET: "refresh-secret-different",
};

describe("validateEnv", () => {
  it("qua khi đủ biến bắt buộc + secret hợp lệ", () => {
    expect(() => validateEnv(valid)).not.toThrow();
    expect(validateEnv(valid)).toEqual(valid);
  });

  it("thiếu DATABASE_URL → ném lỗi rõ ràng", () => {
    const { DATABASE_URL: _DATABASE_URL, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("thiếu JWT_ACCESS_SECRET → ném lỗi", () => {
    const { JWT_ACCESS_SECRET: _JWT_ACCESS_SECRET, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("biến rỗng/khoảng trắng cũng bị coi là thiếu", () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: "   " })).toThrow(/DATABASE_URL/);
  });

  it("secret quá ngắn → ném lỗi", () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: "short" })).toThrow(/quá ngắn/);
  });

  it("2 secret trùng nhau → ném lỗi", () => {
    expect(() => validateEnv({ ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET })).toThrow(
      /không được trùng/,
    );
  });

  it("gom nhiều lỗi cùng lúc", () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/,
    );
  });

  it.each([undefined, "", "false", "FALSE"])(
    "chấp nhận SIMULATION_MUTATION_ENABLED=%p",
    (value) => {
      expect(() => validateEnv({ ...valid, SIMULATION_MUTATION_ENABLED: value })).not.toThrow();
    },
  );

  it("cho phép bật cảm biến trực tiếp trên database hiện tại", () => {
    expect(() => validateEnv({ ...valid, SIMULATION_MUTATION_ENABLED: "true" })).not.toThrow();
  });

  it("bắt production khai báo CORS allowlist thay vì âm thầm chặn web", () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: "production" })).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: "production",
        CORS_ALLOWED_ORIGINS: "http://192.168.1.10:3200",
      }),
    ).not.toThrow();
  });

  it("từ chối cờ simulator không phải boolean", () => {
    expect(() => validateEnv({ ...valid, SIMULATION_MUTATION_ENABLED: "enabled" })).toThrow(
      /SIMULATION_MUTATION_ENABLED/,
    );
  });

  it.each(["change_me_access", "change_me_refresh", "CHANGE_ME_ACCESS", "your_secret_here"])(
    "H3: từ chối secret placeholder công khai %p (đủ dài nhưng nằm trong denylist)",
    (placeholder) => {
      // Các placeholder này >= 16 ký tự nên chỉ bị chặn nhờ denylist, không nhờ độ dài.
      expect(placeholder.length).toBeGreaterThanOrEqual(16);
      expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: placeholder })).toThrow(
        /placeholder/,
      );
    },
  );

  it("từ chối chu kỳ watchdog không phải số giây nguyên", () => {
    // Gõ nhầm biến này mà vẫn khởi động được thì kho chạy nhưng không ai canh
    // cảm biến — im lặng nguy hiểm hơn nhiều so với việc chặn ngay lúc boot.
    expect(() => validateEnv({ ...valid, INCIDENT_WATCHDOG_INTERVAL_SECONDS: "sáu mươi" })).toThrow(
      /INCIDENT_WATCHDOG_INTERVAL_SECONDS/,
    );
    expect(() => validateEnv({ ...valid, INCIDENT_WATCHDOG_INTERVAL_SECONDS: "-5" })).toThrow(
      /INCIDENT_WATCHDOG_INTERVAL_SECONDS/,
    );
    expect(() => validateEnv({ ...valid, INCIDENT_WATCHDOG_INTERVAL_SECONDS: "1.5" })).toThrow(
      /INCIDENT_WATCHDOG_INTERVAL_SECONDS/,
    );
  });

  it("chấp nhận chu kỳ watchdog hợp lệ, kể cả 0 để tắt có chủ đích", () => {
    expect(() => validateEnv({ ...valid, INCIDENT_WATCHDOG_INTERVAL_SECONDS: "60" })).not.toThrow();
    expect(() => validateEnv({ ...valid, INCIDENT_WATCHDOG_INTERVAL_SECONDS: "0" })).not.toThrow();
    expect(() => validateEnv({ ...valid, INCIDENT_WATCHDOG_INTERVAL_SECONDS: "" })).not.toThrow();
  });

  it("H3: chấp nhận secret placeholder chỉ khi không nằm trong denylist", () => {
    expect(() =>
      validateEnv({ ...valid, JWT_ACCESS_SECRET: "an-actual-strong-secret-9f2a" }),
    ).not.toThrow();
  });

  it("H4: từ chối BIND_ADDRESS rác", () => {
    expect(() => validateEnv({ ...valid, BIND_ADDRESS: "not a host!!" })).toThrow(/BIND_ADDRESS/);
    expect(() => validateEnv({ ...valid, BIND_ADDRESS: "999.1.1.1" })).toThrow(/BIND_ADDRESS/);
  });

  it.each(["127.0.0.1", "0.0.0.0", "localhost", "::1", "192.168.1.10"])(
    "H4: chấp nhận BIND_ADDRESS hợp lệ %p",
    (host) => {
      expect(() => validateEnv({ ...valid, BIND_ADDRESS: host })).not.toThrow();
    },
  );

  it("H4: resolveBindAddress mặc định loopback và loại giá trị rác", () => {
    expect(resolveBindAddress({})).toBe("127.0.0.1");
    expect(resolveBindAddress({ BIND_ADDRESS: "not valid" })).toBe("127.0.0.1");
    expect(resolveBindAddress({ BIND_ADDRESS: "0.0.0.0" })).toBe("0.0.0.0");
  });
});

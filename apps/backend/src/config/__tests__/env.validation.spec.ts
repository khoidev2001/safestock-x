import { resolveBindAddress, validateEnv } from "../env.validation";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "access-secret-longenough",
  JWT_REFRESH_SECRET: "refresh-secret-different",
};

const validDemo = {
  ...valid,
  SAFESTOCK_RUNTIME: "demo",
  STACK_NAME: "safestock_demo",
  BIND_ADDRESS: "127.0.0.1",
  POSTGRES_USER: "safestock_demo",
  POSTGRES_PASSWORD: "demo-database-password",
  POSTGRES_DB: "safestock_demo",
  POSTGRES_PORT: "55434",
  DATABASE_URL:
    "postgresql://safestock_demo:demo-database-password@localhost:55434/safestock_demo?schema=public",
  REDIS_PORT: "56381",
  REDIS_URL: "redis://localhost:56381",
  POSTGRES_CONTAINER: "safestock_demo_postgres",
  API_PORT: "3110",
  SIMULATION_MUTATION_ENABLED: "true",
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

  it.each(["true", "TRUE"])(
    "chấp nhận SIMULATION_MUTATION_ENABLED=%p trong runtime demo",
    (value) => {
      expect(() => validateEnv({ ...validDemo, SIMULATION_MUTATION_ENABLED: value })).not.toThrow();
    },
  );

  it("từ chối bật simulator ngoài runtime demo", () => {
    expect(() => validateEnv({ ...valid, SIMULATION_MUTATION_ENABLED: "true" })).toThrow(
      /SAFESTOCK_RUNTIME=demo/,
    );
  });

  it("từ chối bật simulator trên database không có tên demo", () => {
    expect(() =>
      validateEnv({
        ...validDemo,
        POSTGRES_DB: "safestock",
        DATABASE_URL:
          "postgresql://safestock_demo:demo-database-password@localhost:55434/safestock?schema=public",
      }),
    ).toThrow(/PostgreSQL demo/);
  });

  it("từ chối Redis vận hành trong runtime demo", () => {
    expect(() =>
      validateEnv({
        ...validDemo,
        REDIS_PORT: "56380",
        REDIS_URL: "redis://localhost:56380",
      }),
    ).toThrow(/Redis demo/);
  });

  it.each([
    "redis://localhost:56381/15",
    "redis://localhost:56381?source=other",
    "redis://user:pass@localhost:56381",
  ])("từ chối Redis demo không đúng endpoint cố định: %s", (REDIS_URL) => {
    expect(() => validateEnv({ ...validDemo, REDIS_URL })).toThrow(/Redis demo/);
  });

  it("từ chối cấu hình database không khớp user hoặc port", () => {
    expect(() => validateEnv({ ...validDemo, POSTGRES_PORT: "55435" })).toThrow(/PostgreSQL demo/);
  });

  it("từ chối backend demo dùng cổng vận hành", () => {
    expect(() => validateEnv({ ...validDemo, API_PORT: "3100" })).toThrow(/API_PORT riêng/);
  });

  it("từ chối demo bind database và Redis ra ngoài loopback", () => {
    expect(() => validateEnv({ ...validDemo, BIND_ADDRESS: "0.0.0.0" })).toThrow(/BIND_ADDRESS/);
  });

  it("từ chối runtime không hợp lệ", () => {
    expect(() => validateEnv({ ...valid, SAFESTOCK_RUNTIME: "staging" })).toThrow(
      /SAFESTOCK_RUNTIME/,
    );
  });

  it("bắt production khai báo CORS allowlist thay vì âm thầm chặn web", () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: "production" })).toThrow(
      /CORS_ALLOWED_ORIGINS/,
    );
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

  it.each([
    "change_me_access",
    "change_me_refresh",
    "CHANGE_ME_ACCESS",
    "your_secret_here",
  ])("H3: từ chối secret placeholder công khai %p (đủ dài nhưng nằm trong denylist)", (placeholder) => {
    // Các placeholder này >= 16 ký tự nên chỉ bị chặn nhờ denylist, không nhờ độ dài.
    expect(placeholder.length).toBeGreaterThanOrEqual(16);
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: placeholder })).toThrow(/placeholder/);
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

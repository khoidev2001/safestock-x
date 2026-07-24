import { validateEnv } from "../env.validation";

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

  it("từ chối cờ simulator không phải boolean", () => {
    expect(() => validateEnv({ ...valid, SIMULATION_MUTATION_ENABLED: "enabled" })).toThrow(
      /SIMULATION_MUTATION_ENABLED/,
    );
  });
});

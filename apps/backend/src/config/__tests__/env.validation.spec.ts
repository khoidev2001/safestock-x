import { validateEnv } from "../env.validation";

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
    const { DATABASE_URL, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("thiếu JWT_ACCESS_SECRET → ném lỗi", () => {
    const { JWT_ACCESS_SECRET, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("biến rỗng/khoảng trắng cũng bị coi là thiếu", () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: "   " })).toThrow(/DATABASE_URL/);
  });

  it("secret quá ngắn → ném lỗi", () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: "short" })).toThrow(/quá ngắn/);
  });

  it("2 secret trùng nhau → ném lỗi", () => {
    expect(() =>
      validateEnv({ ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET }),
    ).toThrow(/không được trùng/);
  });

  it("gom nhiều lỗi cùng lúc", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/);
  });
});

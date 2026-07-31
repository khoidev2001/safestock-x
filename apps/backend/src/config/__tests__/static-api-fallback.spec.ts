import { MODULE_METADATA } from "@nestjs/common/constants";

/**
 * `AppModule` validate biến môi trường ngay tại thời điểm import, nên bài test
 * này phải tự cấp giá trị giả trước khi nạp module.
 *
 * Máy dev có `apps/backend/.env` nên import trần vẫn chạy, còn CI checkout sạch
 * thì không — đó là cách một bài test xanh ở local mà đỏ trên CI. Test chỉ đọc
 * metadata tĩnh của module, không mở kết nối nào, nên giá trị giả là đủ.
 */
const ENV_FOR_METADATA_ONLY: Record<string, string> = {
  DATABASE_URL: "postgresql://static-api-fallback:spec@localhost:5432/spec?schema=public",
  JWT_ACCESS_SECRET: "static-api-fallback-access-secret",
  JWT_REFRESH_SECRET: "static-api-fallback-refresh-secret",
};

interface StaticModuleImport {
  providers?: { provide?: unknown; useValue?: unknown }[];
}

describe("static API fallback", () => {
  it("does not serve the static index for unknown API routes", async () => {
    for (const [key, value] of Object.entries(ENV_FOR_METADATA_ONLY)) {
      process.env[key] ??= value;
    }
    const { AppModule } = await import("../../app.module");

    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as StaticModuleImport[];
    const optionsProvider = imports
      .flatMap((entry) => entry.providers ?? [])
      .find((provider) => provider.provide === "SERVE_STATIC_MODULE_OPTIONS");

    expect(optionsProvider?.useValue).toEqual([
      expect.objectContaining({ exclude: ["/api/{*path}"] }),
    ]);
  });
});

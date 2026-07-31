import { MODULE_METADATA } from "@nestjs/common/constants";
import { AppModule } from "../../app.module";

describe("static API fallback", () => {
  it("does not serve the static index for unknown API routes", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as Array<{
      providers?: Array<{ provide?: unknown; useValue?: unknown }>;
    }>;
    const staticImport = imports.find((entry) =>
      entry.providers?.some((provider) => provider.provide === "SERVE_STATIC_MODULE_OPTIONS"),
    );
    const optionsProvider = staticImport?.providers?.find(
      (provider) => provider.provide === "SERVE_STATIC_MODULE_OPTIONS",
    );

    expect(optionsProvider?.useValue).toEqual([
      expect.objectContaining({ exclude: ["/api/{*path}"] }),
    ]);
  });
});

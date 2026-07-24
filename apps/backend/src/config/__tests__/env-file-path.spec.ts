import { resolveEnvFilePaths } from "../env-file-path";

describe("resolveEnvFilePaths", () => {
  it("keeps the operational lookup order by default", () => {
    expect(resolveEnvFilePaths(undefined)).toEqual(["../../.env", ".env"]);
  });

  it("uses only the explicit runtime file when configured", () => {
    expect(resolveEnvFilePaths(" C:\\runtime\\.env.demo ")).toEqual(["C:\\runtime\\.env.demo"]);
  });
});

// Biên dịch và chạy các kiểm thử thuần TypeScript của bản đồ bằng công cụ sẵn có.
// Chạy: pnpm test:map
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const outputDirectory = mkdtempSync(path.join(tmpdir(), "safestock-map-tests-"));
const testSources = [
  "src/components/dashboard/map-labels.test.ts",
  "src/components/dashboard/map-view-state.test.ts",
];

try {
  const compile = spawnSync(
    "tsc",
    [
      ...testSources,
      "--target",
      "ES2021",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--jsx",
      "react-jsx",
      "--strict",
      "--esModuleInterop",
      "--skipLibCheck",
      "--isolatedModules",
      "false",
      "--incremental",
      "false",
      "--noEmit",
      "false",
      "--rootDir",
      "src",
      "--outDir",
      outputDirectory,
    ],
    { stdio: "inherit" },
  );

  if (compile.error) throw compile.error;
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    const compiledTests = testSources.map((source) =>
      path.join(outputDirectory, source.replace(/^src\//u, "").replace(/\.ts$/u, ".js")),
    );
    const tests = spawnSync(process.execPath, ["--test", ...compiledTests], {
      stdio: "inherit",
    });
    if (tests.error) throw tests.error;
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(outputDirectory, { force: true, recursive: true });
}

import assert from "node:assert/strict";
import test from "node:test";
import { resolvePortableSpawnCommand } from "./portable-spawn-command.mjs";

test("runs pnpm through Node on Windows instead of spawning pnpm.cmd directly", () => {
  assert.deepEqual(
    resolvePortableSpawnCommand("pnpm", ["--version"], {
      platform: "win32",
      execPath: "C:\\node\\node.exe",
      npmExecPath: "C:\\pnpm\\pnpm.cjs",
    }),
    {
      executable: "C:\\node\\node.exe",
      args: ["C:\\pnpm\\pnpm.cjs", "--version"],
    },
  );
});

test("keeps native executables unchanged", () => {
  assert.deepEqual(
    resolvePortableSpawnCommand("docker", ["compose"], {
      platform: "win32",
    }),
    { executable: "docker", args: ["compose"] },
  );
});

test("fails clearly when a direct Node launch has no pnpm entry point", () => {
  assert.throws(
    () =>
      resolvePortableSpawnCommand("pnpm", ["--version"], {
        platform: "win32",
        npmExecPath: "",
      }),
    /pnpm entry point/,
  );
});

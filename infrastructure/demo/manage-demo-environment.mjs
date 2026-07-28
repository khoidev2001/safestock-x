import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createSanitizedChildEnvironment,
  parseDemoCommandLine,
  requireDemoResetConfirmation,
  validateDemoEnvironment,
} from "./demo-environment-guard.mjs";
import { validateDemoContainerIdentity } from "./demo-container-identity.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const require = createRequire(resolve(repositoryRoot, "apps/backend/package.json"));
const { parse } = require("dotenv");

const args = process.argv.slice(2);
const commandLine = parseDemoCommandLine(args);
const action = commandLine.action;
const envFile = resolve(repositoryRoot, commandLine.envFile);
if (!existsSync(envFile)) {
  throw new Error(`Demo env file not found: ${envFile}`);
}

const demoEnv = parse(readFileSync(envFile));
validateDemoEnvironment(demoEnv);

const operationalKeys = Object.keys(parse(readFileSync(resolve(repositoryRoot, ".env.example"))));
const knownApplicationKeys = new Set([
  ...operationalKeys,
  ...Object.keys(demoEnv),
  "SAFESTOCK_ENV_FILE",
]);
const childEnv = createSanitizedChildEnvironment(process.env, demoEnv, knownApplicationKeys);
childEnv.SAFESTOCK_ENV_FILE = envFile;

const composeArgs = [
  "compose",
  "--env-file",
  envFile,
  "-p",
  "safestock-demo",
  "-f",
  resolve(repositoryRoot, "infrastructure/docker-compose.yml"),
];

switch (action) {
  case "validate":
    console.log(`Demo environment is valid for safestock-demo on API port ${demoEnv.API_PORT}.`);
    break;
  case "config":
    run("docker", [...composeArgs, "config", "--quiet"]);
    break;
  case "up":
    run("docker", [...composeArgs, "up", "-d", "--wait"]);
    break;
  case "down":
    run("docker", [...composeArgs, "down"]);
    break;
  case "logs":
    run("docker", [...composeArgs, "logs", "-f"]);
    break;
  case "status":
    run("docker", [...composeArgs, "ps"]);
    break;
  case "schema":
    assertDemoContainersRunning();
    run("pnpm", ["--filter", "@safestock/backend", "prisma:generate"]);
    run("pnpm", ["--filter", "@safestock/backend", "prisma:push"]);
    break;
  case "reset":
    requireDemoResetConfirmation(commandLine.confirmReset ? ["--confirm-demo-reset"] : []);
    assertDemoContainersRunning();
    run("pnpm", ["--filter", "@safestock/backend", "prisma:generate"]);
    run("pnpm", ["--filter", "@safestock/backend", "prisma:push"]);
    run("pnpm", ["--filter", "@safestock/backend", "seed", "--", "--confirm-demo-reset"]);
    break;
  case "backend": {
    assertDemoContainersRunning();
    const entryPoint = resolve(repositoryRoot, "apps/backend/dist/src/main.js");
    if (!existsSync(entryPoint)) {
      throw new Error("Backend build not found. Run pnpm --filter @safestock/backend build first.");
    }
    run(process.execPath, [entryPoint]);
    break;
  }
  default:
    throw new Error(`Unknown demo action: ${action}`);
}

function assertDemoContainersRunning() {
  const result = spawnSync(
    "docker",
    ["inspect", "safestock_demo_postgres", "safestock_demo_redis"],
    { cwd: repositoryRoot, env: childEnv, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("Demo containers are not available. Run pnpm demo:infra:up first.");
  }
  validateDemoContainerIdentity(JSON.parse(result.stdout), demoEnv);
}

function run(command, commandArgs) {
  const executable = process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
  const result = spawnSync(executable, commandArgs, {
    cwd: repositoryRoot,
    env: childEnv,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  createSanitizedChildEnvironment,
  parseDemoCommandLine,
  requireDemoResetConfirmation,
  validateDemoEnvironment,
} from "./demo-environment-guard.mjs";

const validDemo = {
  SAFESTOCK_RUNTIME: "demo",
  STACK_NAME: "safestock_demo",
  BIND_ADDRESS: "127.0.0.1",
  POSTGRES_USER: "safestock_demo",
  POSTGRES_PASSWORD: "demo-database-password",
  POSTGRES_DB: "safestock_demo",
  POSTGRES_PORT: "55434",
  DATABASE_URL:
    "postgresql://safestock_demo:demo-database-password@localhost:55434/safestock_demo?schema=public",
  POSTGRES_CONTAINER: "safestock_demo_postgres",
  REDIS_PORT: "56381",
  REDIS_URL: "redis://localhost:56381",
  JWT_ACCESS_SECRET: "demo-access-secret-long-enough",
  JWT_REFRESH_SECRET: "demo-refresh-secret-long-enough",
  SIMULATION_MUTATION_ENABLED: "true",
  API_PORT: "3110",
  ALERT_EMAIL_ENABLED: "false",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_KEY: "",
};

test("accepts a fully isolated demo environment", () => {
  assert.doesNotThrow(() => validateDemoEnvironment(validDemo));
});

test("rejects operational database and Redis targets", () => {
  assert.throws(
    () =>
      validateDemoEnvironment({
        ...validDemo,
        POSTGRES_DB: "safestock",
        DATABASE_URL:
          "postgresql://safestock_demo:demo-database-password@localhost:55433/safestock?schema=public",
        POSTGRES_PORT: "55433",
        REDIS_PORT: "56380",
        REDIS_URL: "redis://localhost:56380",
      }),
    /non-operational|demo PostgreSQL|demo Redis/,
  );
});

test("rejects placeholders and enabled external side effects", () => {
  assert.throws(
    () =>
      validateDemoEnvironment({
        ...validDemo,
        POSTGRES_PASSWORD: "change_me_demo_password",
        DATABASE_URL:
          "postgresql://safestock_demo:change_me_demo_password@localhost:55434/safestock_demo?schema=public",
        ALERT_EMAIL_ENABLED: "true",
        SUPABASE_URL: "https://example.supabase.co",
      }),
    /strong demo-only|must be false|backup credentials/,
  );
});

test("sanitizes inherited application values before applying demo config", () => {
  const child = createSanitizedChildEnvironment(
    {
      PATH: "system-path",
      DATABASE_URL: "postgresql://prod",
      database_url: "postgresql://lowercase-prod",
      REDIS_URL: "redis://prod",
      API_PORT: "3100",
      SMTP_PASS: "operational-secret",
    },
    { ...validDemo, SMTP_PASS: "" },
    new Set(["DATABASE_URL", "REDIS_URL", "API_PORT", "SMTP_PASS"]),
  );

  assert.equal(child.PATH, "system-path");
  assert.equal(child.DATABASE_URL, validDemo.DATABASE_URL);
  assert.equal(child.database_url, undefined);
  assert.equal(child.REDIS_URL, validDemo.REDIS_URL);
  assert.equal(child.API_PORT, "3110");
  assert.equal(child.SMTP_PASS, "");
});

test("requires explicit confirmation before reset", () => {
  assert.throws(() => requireDemoResetConfirmation([]), /Reset refused/);
  assert.doesNotThrow(() => requireDemoResetConfirmation(["--confirm-demo-reset"]));
});

test("parses only explicit supported launcher arguments", () => {
  assert.deepEqual(
    parseDemoCommandLine(["reset", "--env-file", "custom.env", "--confirm-demo-reset"]),
    { action: "reset", envFile: "custom.env", confirmReset: true },
  );
  assert.throws(() => parseDemoCommandLine(["reset", "--env-file"]), /exactly one/);
  assert.throws(
    () => parseDemoCommandLine(["reset", "--env-file", "a", "--env-file", "b"]),
    /exactly one/,
  );
  assert.throws(() => parseDemoCommandLine(["validate", "--extra"]), /Unexpected/);
});

test("rejects Redis paths, queries, and credentials", () => {
  for (const REDIS_URL of [
    "redis://localhost:56381/15",
    "redis://localhost:56381?source=other",
    "redis://user:pass@localhost:56381",
  ]) {
    assert.throws(() => validateDemoEnvironment({ ...validDemo, REDIS_URL }), /demo Redis/);
  }
});

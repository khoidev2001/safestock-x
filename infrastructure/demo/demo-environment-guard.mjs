const DEMO_ACTIONS = new Set([
  "validate",
  "config",
  "up",
  "down",
  "logs",
  "status",
  "schema",
  "reset",
  "backend",
]);

export function validateDemoEnvironment(env, { allowPlaceholders = false } = {}) {
  const errors = [];
  const value = (key) => String(env[key] ?? "").trim();

  if (value("SAFESTOCK_RUNTIME").toLowerCase() !== "demo") {
    errors.push("SAFESTOCK_RUNTIME must be demo");
  }
  if (value("STACK_NAME") !== "safestock_demo") {
    errors.push("STACK_NAME must be safestock_demo");
  }
  if (value("BIND_ADDRESS") !== "127.0.0.1") {
    errors.push("BIND_ADDRESS must be 127.0.0.1");
  }
  if (value("SIMULATION_MUTATION_ENABLED").toLowerCase() !== "true") {
    errors.push("SIMULATION_MUTATION_ENABLED must be true for the demo runtime");
  }

  const postgresPort = value("POSTGRES_PORT");
  const redisPort = value("REDIS_PORT");
  const apiPort = value("API_PORT");
  if (postgresPort !== "55434" || redisPort !== "56381" || apiPort !== "3110") {
    errors.push("Demo ports must be PostgreSQL 55434, Redis 56381, and API 3110");
  }

  validatePostgres(env, errors);
  validateRedis(env, errors);

  if (value("POSTGRES_CONTAINER") !== `${value("STACK_NAME")}_postgres`) {
    errors.push("POSTGRES_CONTAINER must match STACK_NAME");
  }
  if (value("ALERT_EMAIL_ENABLED").toLowerCase() !== "false") {
    errors.push("ALERT_EMAIL_ENABLED must be false in demo");
  }
  if (value("SUPABASE_URL") || value("SUPABASE_SERVICE_KEY")) {
    errors.push("Operational backup credentials are not allowed in demo");
  }

  const secrets = ["POSTGRES_PASSWORD", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  for (const key of secrets) {
    const secret = value(key);
    if (secret.length < 16 || (!allowPlaceholders && secret.toLowerCase().includes("change_me"))) {
      errors.push(`${key} must be replaced with a strong demo-only value`);
    }
  }
  if (value("JWT_ACCESS_SECRET") === value("JWT_REFRESH_SECRET")) {
    errors.push("JWT demo secrets must be different");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid demo environment:\n- ${errors.join("\n- ")}`);
  }
  return env;
}

export function createSanitizedChildEnvironment(inherited, demoEnv, knownApplicationKeys) {
  const child = { ...inherited };
  const normalizedKeys = new Set([...knownApplicationKeys].map((key) => key.toUpperCase()));
  for (const key of Object.keys(child)) {
    if (normalizedKeys.has(key.toUpperCase())) delete child[key];
  }
  return { ...child, ...demoEnv };
}

export function requireDemoResetConfirmation(args) {
  if (!args.includes("--confirm-demo-reset")) {
    throw new Error("Reset refused: pass --confirm-demo-reset after verifying .env.demo");
  }
}

export function parseDemoCommandLine(args) {
  const action = args[0] ?? "validate";
  if (!DEMO_ACTIONS.has(action)) throw new Error(`Unknown demo action: ${action}`);

  let envFile = ".env.demo";
  let envFileSeen = false;
  let confirmReset = false;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--env-file") {
      const candidate = args[index + 1];
      if (envFileSeen || !candidate || candidate.startsWith("--")) {
        throw new Error("--env-file requires exactly one explicit path");
      }
      envFileSeen = true;
      envFile = candidate;
      index += 1;
      continue;
    }
    if (argument === "--confirm-demo-reset" && action === "reset" && !confirmReset) {
      confirmReset = true;
      continue;
    }
    throw new Error(`Unexpected demo argument: ${argument}`);
  }
  return { action, envFile, confirmReset };
}

function validatePostgres(env, errors) {
  const url = parseUrl(env.DATABASE_URL, ["postgres:", "postgresql:"]);
  const database = url ? decodeURIComponent(url.pathname.replace(/^\/+/, "")) : "";
  if (
    !url ||
    url.hostname.toLowerCase() !== "localhost" ||
    String(env.POSTGRES_DB ?? "").trim() !== "safestock_demo" ||
    String(env.POSTGRES_USER ?? "").trim() !== "safestock_demo" ||
    String(env.POSTGRES_PORT ?? "").trim() !== "55434" ||
    database !== String(env.POSTGRES_DB ?? "").trim() ||
    !database.toLowerCase().includes("demo") ||
    decodeURIComponent(url.username) !== String(env.POSTGRES_USER ?? "").trim() ||
    decodeURIComponent(url.password) !== String(env.POSTGRES_PASSWORD ?? "").trim() ||
    url.port !== String(env.POSTGRES_PORT ?? "").trim()
  ) {
    errors.push("DATABASE_URL must exactly match the local demo PostgreSQL settings");
  }
}

function validateRedis(env, errors) {
  const url = parseUrl(env.REDIS_URL, ["redis:"]);
  if (
    !url ||
    url.hostname.toLowerCase() !== "localhost" ||
    String(env.REDIS_PORT ?? "").trim() !== "56381" ||
    url.port !== "56381" ||
    url.username ||
    url.password ||
    !["", "/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    errors.push("REDIS_URL must exactly match the isolated local demo Redis");
  }
}

function parseUrl(value, protocols) {
  try {
    const url = new URL(String(value ?? ""));
    return protocols.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

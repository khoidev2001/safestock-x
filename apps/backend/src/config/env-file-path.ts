const DEFAULT_ENV_FILE_PATHS = ["../../.env", ".env"];

export function resolveEnvFilePaths(explicitPath = process.env.SAFESTOCK_ENV_FILE): string[] {
  const normalized = explicitPath?.trim();
  return normalized ? [normalized] : DEFAULT_ENV_FILE_PATHS;
}

const SYSTEM_ACTOR_EMAIL_DOMAIN = "local.invalid";
const SYSTEM_ACTOR_EMAIL_PREFIX = "system-loadcell+";

export function simulationSystemActorEmail(warehouseId: string): string {
  return `${SYSTEM_ACTOR_EMAIL_PREFIX}${warehouseId}@${SYSTEM_ACTOR_EMAIL_DOMAIN}`;
}

export function simulationSystemActorName(warehouseId: string): string {
  return `[SYSTEM] Loadcell ${warehouseId}`;
}

export function isSimulationSystemActorEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.startsWith(SYSTEM_ACTOR_EMAIL_PREFIX) &&
    normalized.endsWith(`@${SYSTEM_ACTOR_EMAIL_DOMAIN}`)
  );
}

import { FIELD_FORCE_ROLE_LABEL, userRoleLabel } from "@safestock/shared-types";

export { FIELD_FORCE_ROLE_LABEL };

export function mobileRoleLabel(role: string): string {
  return userRoleLabel(role);
}

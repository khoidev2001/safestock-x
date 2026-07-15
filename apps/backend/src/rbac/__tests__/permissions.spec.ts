import {
  Permission,
  roleHasPermission,
  ROLE_PERMISSIONS,
  UserRole,
} from "@safestock/shared-types";

describe("RBAC role permissions", () => {
  it("should give WAREHOUSE full inventory operations", () => {
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.INVENTORY_EXPORT)).toBe(true);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.INVENTORY_ADJUST)).toBe(true);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.INVENTORY_RECONCILE)).toBe(true);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.MISSION_APPROVE)).toBe(true);
  });

  it("should NOT let WAREHOUSE view audit or manage users (admin-only)", () => {
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.AUDIT_VIEW)).toBe(false);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.ADMIN_USERS)).toBe(false);
  });

  it("should limit RESCUE to view + request + loan", () => {
    expect(roleHasPermission(UserRole.RESCUE, Permission.INVENTORY_READ)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_REQUEST)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.LOAN_MANAGE)).toBe(true);
  });

  it("should NOT let RESCUE touch warehouse operations", () => {
    expect(roleHasPermission(UserRole.RESCUE, Permission.INVENTORY_EXPORT)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.INVENTORY_ADJUST)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_APPROVE)).toBe(false);
  });

  it("should give ADMIN every permission", () => {
    for (const permission of Object.values(Permission)) {
      expect(roleHasPermission(UserRole.ADMIN, permission)).toBe(true);
    }
  });

  it("should map exactly 3 roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [UserRole.ADMIN, UserRole.RESCUE, UserRole.WAREHOUSE].sort(),
    );
  });
});

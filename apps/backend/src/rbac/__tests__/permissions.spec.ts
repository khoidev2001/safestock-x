import { Permission, roleHasPermission, ROLE_PERMISSIONS, UserRole } from "@safestock/shared-types";

describe("RBAC role permissions", () => {
  it("should give WAREHOUSE full inventory operations + fulfill (chuẩn bị kho)", () => {
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.INVENTORY_EXPORT)).toBe(true);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.INVENTORY_ADJUST)).toBe(true);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.INVENTORY_RECONCILE)).toBe(true);
    // Workflow mới: WAREHOUSE chuẩn bị/xuất (fulfill), KHÔNG lập/duyệt kế hoạch.
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.MISSION_FULFILL)).toBe(true);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.MISSION_CREATE)).toBe(false);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.SIMULATION_VIEW)).toBe(true);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.SIMULATION_MUTATE)).toBe(false);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.REPORT_VIEW)).toBe(true);
  });

  it("should NOT let WAREHOUSE view audit or manage users (admin-only)", () => {
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.AUDIT_VIEW)).toBe(false);
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.ADMIN_USERS)).toBe(false);
  });

  it("should limit RESCUE to view + request + confirm + loan", () => {
    expect(roleHasPermission(UserRole.RESCUE, Permission.INVENTORY_READ)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_REQUEST)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_CONFIRM)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.LOAN_MANAGE)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.SIMULATION_VIEW)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.SIMULATION_MUTATE)).toBe(false);
  });

  it("should NOT let RESCUE touch warehouse operations", () => {
    expect(roleHasPermission(UserRole.RESCUE, Permission.INVENTORY_EXPORT)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.INVENTORY_ADJUST)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_FULFILL)).toBe(false);
  });

  it("should give ADMIN every permission", () => {
    for (const permission of Object.values(Permission)) {
      expect(roleHasPermission(UserRole.ADMIN, permission)).toBe(true);
    }
  });

  it("should limit REPORTER (trưởng thôn) to reporting an incident + voice + notifications", () => {
    expect(roleHasPermission(UserRole.REPORTER, Permission.INCIDENT_REPORT_SUBMIT)).toBe(true);
    expect(roleHasPermission(UserRole.REPORTER, Permission.NOTIFICATION_VIEW)).toBe(true);
    // KHÔNG được lập/điều phối phương án hay đụng kho — chỉ báo cáo từ hiện trường.
    expect(roleHasPermission(UserRole.REPORTER, Permission.MISSION_CREATE)).toBe(false);
    expect(roleHasPermission(UserRole.REPORTER, Permission.INVENTORY_EXPORT)).toBe(false);
    expect(roleHasPermission(UserRole.REPORTER, Permission.MISSION_APPROVE)).toBe(false);
    expect(roleHasPermission(UserRole.REPORTER, Permission.MISSION_FULFILL)).toBe(false);
    expect(roleHasPermission(UserRole.REPORTER, Permission.ADMIN_USERS)).toBe(false);
  });

  it("should map exactly 4 roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [UserRole.ADMIN, UserRole.RESCUE, UserRole.WAREHOUSE, UserRole.REPORTER].sort(),
    );
  });
});

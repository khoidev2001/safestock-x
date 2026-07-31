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

  it("giữ lực lượng hiện trường ngoài mọi nghiệp vụ kho", () => {
    // Họ xem xét tình hình thực tế rồi gửi yêu cầu; việc đối chiếu tồn và quyết
    // định cho mượn là của người giữ kho.
    expect(ROLE_PERMISSIONS[UserRole.RESCUE]).toEqual([
      Permission.MISSION_VIEW,
      Permission.MISSION_CONFIRM,
      Permission.MISSION_FIELD_UPDATE,
      Permission.NOTIFICATION_VIEW,
      Permission.INCIDENT_REPORT_SUBMIT,
      Permission.INCIDENT_REPORT_VIEW_OWN,
    ]);
    expect(roleHasPermission(UserRole.RESCUE, Permission.INVENTORY_READ)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_REQUEST)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_FIELD_UPDATE)).toBe(true);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_ANALYZE)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_SIMULATE)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.LOAN_MANAGE)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.READINESS_VIEW)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.SIMULATION_VIEW)).toBe(false);
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

  it("cho phép cả hai vai ở hiện trường báo tình huống bằng giọng nói", () => {
    // Ai đứng tại chỗ xảy ra sự việc thì người đó báo: quản lý kho kiêm trưởng
    // thôn báo tình huống của thôn mình, lực lượng hiện trường báo thứ họ thấy
    // ngoài thực địa. Không ai phải gọi điện nhờ người khác nhập hộ.
    for (const role of [UserRole.WAREHOUSE, UserRole.RESCUE]) {
      expect(roleHasPermission(role, Permission.INCIDENT_REPORT_SUBMIT)).toBe(true);
      expect(roleHasPermission(role, Permission.INCIDENT_REPORT_VIEW_OWN)).toBe(true);
    }
  });

  it("cho lực lượng hiện trường nhận lệnh, từ chối và báo kết quả giao", () => {
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_CONFIRM)).toBe(true);
    // Nhưng vẫn không được tự lập phương án hay đụng vào kho.
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_CREATE)).toBe(false);
    expect(roleHasPermission(UserRole.RESCUE, Permission.MISSION_APPROVE)).toBe(false);
  });

  it("quản lý kho không tự nhận lệnh thay lực lượng hiện trường", () => {
    expect(roleHasPermission(UserRole.WAREHOUSE, Permission.MISSION_CONFIRM)).toBe(false);
  });

  it("should map exactly 3 roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [UserRole.ADMIN, UserRole.RESCUE, UserRole.WAREHOUSE].sort(),
    );
  });
});

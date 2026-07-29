// Enums + types dùng chung giữa api, web, mobile, ai-service.
// Nguồn sự thật duy nhất cho trạng thái nghiệp vụ — tránh lệch chuỗi giữa các app.

/** Trạng thái vật tư — xem PRD 3.1 */
export enum ItemStatus {
  AVAILABLE = "AVAILABLE",
  IN_USE = "IN_USE",
  MAINTENANCE = "MAINTENANCE",
  DAMAGED = "DAMAGED",
  EXPIRING_SOON = "EXPIRING_SOON",
  INSPECTION_OVERDUE = "INSPECTION_OVERDUE",
  MISPLACED = "MISPLACED",
  UNKNOWN = "UNKNOWN",
  INACCESSIBLE = "INACCESSIBLE",
}

/** Loại giao dịch kho */
export enum TransactionType {
  IMPORT = "IMPORT",
  EXPORT = "EXPORT",
  TRANSFER = "TRANSFER",
  RETURN = "RETURN",
  ADJUST = "ADJUST",
  COUNT = "COUNT",
  CONDITION = "CONDITION",
  LOAN_OUT_INTERXA = "LOAN_OUT_INTERXA",
  LOAN_IN = "LOAN_IN",
}

/** Nguồn giao dịch — độ lệch feed vào độ tin cậy Readiness */
export enum TransactionSource {
  SCAN = "SCAN",
  BULK = "BULK",
  LOADCELL = "LOADCELL",
  RFID = "RFID",
  MANUAL = "MANUAL",
}

/** Trạng thái vật tư 2 chiều — tình trạng vật lý */
export enum ItemCondition {
  NEW = "NEW",
  USED = "USED",
  NEEDS_CHECK = "NEEDS_CHECK",
  DAMAGED = "DAMAGED",
}

/** Trạng thái vật tư 2 chiều — lưu hành */
export enum CirculationStatus {
  IN_STOCK = "IN_STOCK",
  ON_LOAN = "ON_LOAN",
  RETURNED = "RETURNED",
}

/**
 * Vai trò người dùng — 3 role (xã thường 1 người phụ trách kho → gộp staff+manager).
 * WAREHOUSE: phụ trách kho, toàn quyền vận hành + thao tác nhạy cảm (tự chịu, hậu kiểm).
 * RESCUE: Lực lượng hiện trường — xem phương án và gửi cập nhật đã xác nhận.
 * ADMIN: quản trị/giám sát — quản lý user, xem toàn bộ nhật ký, hậu kiểm.
 */
export enum UserRole {
  WAREHOUSE = "WAREHOUSE",
  RESCUE = "RESCUE",
  ADMIN = "ADMIN",
  REPORTER = "REPORTER", // trưởng thôn — báo cáo tình huống từ hiện trường (mobile)
}

export const FIELD_FORCE_ROLE_LABEL = "Lực lượng hiện trường" as const;

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  [UserRole.ADMIN]: "Quản trị xã",
  [UserRole.WAREHOUSE]: "Phụ trách kho",
  [UserRole.RESCUE]: FIELD_FORCE_ROLE_LABEL,
  [UserRole.REPORTER]: "Trưởng thôn (báo cáo)",
};

export function userRoleLabel(role: UserRole | string): string {
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}

/**
 * Quyền hạt mịn. Guard kiểm PERMISSION, không kiểm role trực tiếp (dễ mở rộng).
 * Định dạng "resource:action".
 */
export enum Permission {
  INVENTORY_READ = "inventory:read",
  INVENTORY_EXPORT = "inventory:export",
  INVENTORY_IMPORT = "inventory:import",
  INVENTORY_BULK_EXPORT = "inventory:bulk_export",
  INVENTORY_ADJUST = "inventory:adjust",
  INVENTORY_RECONCILE = "inventory:reconcile",
  MISSION_VIEW = "mission:view",
  MISSION_CREATE = "mission:create",
  MISSION_REQUEST = "mission:request",
  MISSION_APPROVE = "mission:approve",
  MISSION_ANALYZE = "mission:analyze", // ADMIN chạy/xem snapshot phân tích AI
  MISSION_SIMULATE = "mission:simulate", // ADMIN chạy What-if tách biệt
  MISSION_CONFIRM = "mission:confirm", // legacy compatibility; không cấp cho role mới
  MISSION_FIELD_UPDATE = "mission:field_update", // Lực lượng hiện trường gửi ghi nhận đã xác nhận
  MISSION_FULFILL = "mission:fulfill", // WAREHOUSE chuẩn bị + xuất
  NOTIFICATION_VIEW = "notification:view",
  INCIDENT_REPORT_VIEW_OWN = "incident:report_view_own", // trưởng thôn xem lại báo cáo text của chính mình
  READINESS_VIEW = "readiness:view",
  SIMULATION_VIEW = "simulation:view",
  SIMULATION_MUTATE = "simulation:mutate",
  LOAN_MANAGE = "loan:manage",
  WAREHOUSE_MANAGE = "warehouse:manage",
  AUDIT_VIEW = "audit:view",
  ADMIN_USERS = "admin:users",
  REPORT_SUBMIT = "report:submit", // trưởng thôn gửi báo cáo kiểm kê tháng
  REPORT_VIEW = "report:view",
  REPORT_APPROVE = "report:approve", // admin xã duyệt báo cáo
  INCIDENT_REPORT_SUBMIT = "incident:report_submit", // trưởng thôn báo cáo tình huống khẩn cấp
}

/**
 * Map role → quyền. HẰNG SỐ CODE (không bảng DB — đủ cho MVP; DB động = lộ trình).
 * Nguồn sự thật duy nhất cho phân quyền, dùng chung backend + frontend.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.WAREHOUSE]: [
    // Kho: quản kho + CHUẨN BỊ/xuất theo phương án (không lập kế hoạch).
    Permission.INVENTORY_READ,
    Permission.INVENTORY_EXPORT,
    Permission.INVENTORY_IMPORT,
    Permission.INVENTORY_BULK_EXPORT,
    Permission.INVENTORY_ADJUST,
    Permission.INVENTORY_RECONCILE,
    Permission.MISSION_VIEW,
    Permission.MISSION_FULFILL, // chuẩn bị + xuất kho theo phương án
    Permission.READINESS_VIEW,
    Permission.SIMULATION_VIEW,
    Permission.LOAN_MANAGE,
    Permission.WAREHOUSE_MANAGE,
    Permission.NOTIFICATION_VIEW,
    Permission.REPORT_SUBMIT, // trưởng thôn gửi báo cáo tháng
    Permission.REPORT_VIEW,
  ],
  [UserRole.RESCUE]: [
    // Lực lượng hiện trường chỉ nhận thông tin và gửi evidence đã tự xác nhận.
    Permission.MISSION_VIEW,
    Permission.MISSION_FIELD_UPDATE,
    Permission.NOTIFICATION_VIEW,
  ],
  [UserRole.ADMIN]: [
    // ADMIN có mọi quyền.
    ...Object.values(Permission),
  ],
  [UserRole.REPORTER]: [
    // Trưởng thôn: báo cáo tình huống + xem lại báo cáo text của chính mình + thông báo.
    Permission.INCIDENT_REPORT_SUBMIT,
    Permission.INCIDENT_REPORT_VIEW_OWN,
    Permission.NOTIFICATION_VIEW,
  ],
};

/** Kiểm 1 role có quyền cụ thể không. */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Loại tình huống khẩn cấp — Mission-to-Kit */
export enum IncidentType {
  FLOOD = "FLOOD",
  STORM = "STORM",
  LANDSLIDE = "LANDSLIDE",
  FIRE = "FIRE",
  ISOLATION = "ISOLATION",
  OTHER = "OTHER",
}

/** Mức ưu tiên */
export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

/** Loại thiết bị ảo — Digital Twin */
export enum VirtualDeviceType {
  LOADCELL = "LOADCELL",
  TEMPERATURE = "TEMPERATURE",
  HUMIDITY = "HUMIDITY",
  SMOKE = "SMOKE",
  DOOR = "DOOR",
  RFID_GATEWAY = "RFID_GATEWAY",
  CAMERA_AI = "CAMERA_AI",
  POWER = "POWER",
  GATEWAY = "GATEWAY",
}

/** Trọng số Readiness Score — PRD 3.2. Tổng = 1.0 */
export const READINESS_WEIGHTS = {
  quantityAvailability: 0.28,
  itemCondition: 0.22,
  expiry: 0.15,
  accessibility: 0.15,
  environment: 0.1,
  dataReliability: 0.1,
} as const;

export type ReadinessComponentKey = keyof typeof READINESS_WEIGHTS;

/** Sự kiện cảm biến chuẩn — cả mock lẫn phần cứng thật đều xuất schema này */
export interface SensorEvent {
  eventId: string;
  deviceId: string;
  warehouseId: string;
  zoneId: string;
  eventType: string;
  value: number;
  unit: string;
  timestamp: string; // ISO 8601
  quality: number; // 0..1
  scenarioId?: string;
}

export * from "./coordination";

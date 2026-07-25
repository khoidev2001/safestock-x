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
 * RESCUE: đội cứu hộ — xem phương án, mượn-hoàn, yêu cầu vật tư.
 * ADMIN: quản trị/giám sát — quản lý user, xem toàn bộ nhật ký, hậu kiểm.
 */
export enum UserRole {
  WAREHOUSE = "WAREHOUSE",
  RESCUE = "RESCUE",
  ADMIN = "ADMIN",
  REPORTER = "REPORTER", // trưởng thôn — báo cáo tình huống từ hiện trường (mobile)
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
  MISSION_CONFIRM = "mission:confirm", // RESCUE xác nhận lấy vật tư
  MISSION_FULFILL = "mission:fulfill", // WAREHOUSE chuẩn bị + xuất
  NOTIFICATION_VIEW = "notification:view",
  READINESS_VIEW = "readiness:view",
  SIMULATION_VIEW = "simulation:view",
  SIMULATION_MUTATE = "simulation:mutate",
  LOAN_MANAGE = "loan:manage",
  WAREHOUSE_MANAGE = "warehouse:manage",
  AUDIT_VIEW = "audit:view",
  ADMIN_USERS = "admin:users",
  REPORT_SUBMIT = "report:submit", // trưởng thôn gửi báo cáo kiểm kê tháng
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
  ],
  [UserRole.RESCUE]: [
    // Cứu hộ: xem + XÁC NHẬN lấy vật tư.
    Permission.INVENTORY_READ,
    Permission.MISSION_VIEW,
    Permission.MISSION_REQUEST,
    Permission.MISSION_CONFIRM, // xác nhận lấy
    Permission.READINESS_VIEW,
    Permission.SIMULATION_VIEW,
    Permission.LOAN_MANAGE,
    Permission.NOTIFICATION_VIEW,
  ],
  [UserRole.ADMIN]: [
    // ADMIN có mọi quyền.
    ...Object.values(Permission),
  ],
  [UserRole.REPORTER]: [
    // Trưởng thôn: báo cáo tình huống + dùng ghi âm (transcribe) + xem thông báo phản hồi.
    Permission.INCIDENT_REPORT_SUBMIT,
    Permission.MISSION_CREATE, // để gọi /missions/transcribe (đang yêu cầu quyền này)
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

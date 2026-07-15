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
}

/** Vai trò người dùng */
export enum UserRole {
  WAREHOUSE_STAFF = "WAREHOUSE_STAFF",
  RESCUE_TEAM = "RESCUE_TEAM",
  MANAGER = "MANAGER",
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

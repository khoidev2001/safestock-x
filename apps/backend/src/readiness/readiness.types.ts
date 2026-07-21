import { ReadinessComponentKey } from "@safestock/shared-types";

/**
 * Điểm 1 thành phần: giá trị 0-100 đã chuẩn hóa + lý do trừ điểm (để breakdown).
 * Mọi công thức con trả về kiểu này — thuần, không side effect (CODING-STANDARDS §5.6).
 */
export interface ComponentScore {
  key: ReadinessComponentKey;
  /** 0-100 */
  score: number;
  /** Lý do bị trừ điểm, rỗng nếu đạt tối đa. Dùng cho breakdown + recommendation (C2). */
  reasons: string[];
}

/** Ngưỡng thời hạn (tháng) — configurable, có disclaimer. */
export interface ExpiryThresholds {
  longMonths: number; // còn > X tháng = tốt
  soonMonths: number; // 2..soon = cảnh báo
}

/** Input tính điểm thời hạn cho 1 lô. */
export interface ExpiryInput {
  expiryDate: Date | null;
  /** Mốc thời gian tham chiếu (server-time, #31). Truyền vào để test deterministic. */
  now: Date;
}

/** Input tính điểm tình trạng vật lý. */
export interface ConditionInput {
  condition: "NEW" | "USED" | "NEEDS_CHECK" | "DAMAGED";
}

/** Input tính điểm khả năng tiếp cận. */
export interface AccessibilityInput {
  isLocked: boolean;
}

/** Input tính điểm khả dụng số lượng. */
export interface QuantityInput {
  systemQty: number;
  /** Số kiểm kê gần nhất; null nếu chưa kiểm kê bao giờ. */
  countedQty: number | null;
  /** Số đang mượn (ON_LOAN) — không tính "mất" nhưng không sẵn sàng ngay. */
  onLoanQty: number;
}

/** Ngưỡng môi trường an toàn cho vật tư (configurable). */
export interface EnvironmentThresholds {
  maxTemperature: number; // °C
  maxHumidity: number; // %
}

/** Input tính điểm môi trường từ DeviceState gần nhất của khu. */
export interface EnvironmentInput {
  temperature: number | null;
  humidity: number | null;
}

/** Input tính điểm độ tin cậy dữ liệu. */
export interface DataReliabilityInput {
  /** Số ngày kể từ lần kiểm kê gần nhất; null nếu chưa kiểm kê. */
  daysSinceLastCount: number | null;
  /** Cảm biến môi trường của khu còn cập nhật gần đây không (updatedAt < 30ph). */
  sensorFresh: boolean;
}

/** Kết quả tính điểm tổng của 1 đối tượng (lô/kệ/khu/kho). */
export interface ReadinessResult {
  /** 0-100 */
  score: number;
  components: ComponentScore[];
}

/**
 * Toàn bộ input để tính điểm 1 lô — gom từ nhiều nguồn (batch, shelf, loan,
 * kiểm kê, cảm biến khu). Tách khỏi truy vấn DB để hàm tính thuần, test được.
 */
export interface BatchReadinessInput {
  batchId: string;
  /** Số lượng dùng làm trọng số khi roll-up lên kệ/khu/kho. */
  quantity: number;
  expiry: ExpiryInput;
  condition: ConditionInput;
  accessibility: AccessibilityInput;
  quantityAvailability: QuantityInput;
  environment: EnvironmentInput;
  dataReliability: DataReliabilityInput;
}

/** Điểm 1 lô kèm quantity (để roll-up trọng số). */
export interface WeightedReadiness {
  score: number;
  /** Trọng số roll-up = quantity của lô. */
  weight: number;
  components: ComponentScore[];
}

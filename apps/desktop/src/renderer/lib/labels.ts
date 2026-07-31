// Nhãn tiếng Việt + cấu hình slider theo loại thiết bị.
// Nhãn port từ apps/frontend/src/components/dashboard/simulator-panel.tsx.

export const deviceTypeLabels: Record<string, string> = {
  TEMPERATURE: "Nhiệt độ",
  HUMIDITY: "Độ ẩm",
  GATEWAY: "Bộ kết nối",
  POWER: "Nguồn điện",
  LOADCELL: "Cân tải",
  DOOR: "Cửa kho",
  RFID_GATEWAY: "Cổng RFID",
  SMOKE: "Cảm biến khói",
  CAMERA_AI: "Camera AI",
};

const deviceCodeLabels: Record<string, string> = {
  temp: "Cảm biến nhiệt độ",
  humid: "Cảm biến độ ẩm",
  scale: "Cân tải kệ",
  door: "Cảm biến cửa",
  gateway: "Bộ kết nối",
  power: "Nguồn điện",
  smoke: "Cảm biến khói",
  rfid: "Cổng RFID",
  camera: "Camera",
};

export function formatDeviceName(code: string, type: string): string {
  const [prefix, ...suffixParts] = code.split("_");
  const base = deviceCodeLabels[prefix.toLowerCase()] ?? deviceTypeLabels[type] ?? "Thiết bị";
  const suffix = suffixParts.join(" ");
  if (!suffix) return base;
  return `${base} ${suffix.toLowerCase() === "main" ? "chính" : suffix.toUpperCase()}`;
}

// Cấu hình slider cho từng loại cảm biến điều chỉnh được (khớp ngưỡng rule engine).
//  - eventType: đúng loại backend/rule engine kỳ vọng (BAD_STORAGE đọc theo deviceType+value;
//    WEIGHT_CHANGED bắt buộc cho loadcell để rule nghi thất thoát/lỗi cảm biến kích hoạt).
//  - hint: gợi ý ngưỡng cảnh báo để demo (không phải backend tính — chỉ chú thích UI).
export interface SliderConfig {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
  eventType: string;
  hint?: string;
}

export const sliderConfigByType: Record<string, SliderConfig> = {
  TEMPERATURE: {
    min: 0,
    max: 60,
    step: 0.5,
    defaultValue: 28,
    unit: "°C",
    eventType: "TEMP_READING",
    hint: "> 35°C → cảnh báo bảo quản sai",
  },
  HUMIDITY: {
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 60,
    unit: "%",
    eventType: "HUMID_READING",
    hint: "> 85% → cảnh báo bảo quản sai",
  },
  SMOKE: {
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    unit: "ppm",
    eventType: "SMOKE_READING",
    hint: "> 30ppm + nhiệt tăng > 15°C → nghi cháy",
  },
  LOADCELL: {
    min: 0,
    max: 100,
    step: 0.5,
    defaultValue: 50,
    unit: "kg",
    eventType: "WEIGHT_CHANGED",
    hint: "≤ 47kg → nghi thất thoát / lỗi cảm biến",
  },
};

// Chỉ các loại có trong sliderConfigByType mới render slider (điều chỉnh được).
export const ADJUSTABLE_TYPES = Object.keys(sliderConfigByType);

// Nhãn kết luận vận hành (operationalStatus của readiness).
export const operationalStatusLabels: Record<string, string> = {
  READY: "Sẵn sàng",
  NEEDS_ACTION: "Cần xử lý",
  NOT_DISPATCHABLE: "Không đạt",
};

// Nhãn mức nghiêm trọng cảnh báo.
export const severityLabels: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

export const severityTone: Record<string, string> = {
  LOW: "#3b82f6",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

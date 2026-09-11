import { SIMULATOR_ALARM_POLICY } from "../simulation/simulation-policy";
import { describeDevice } from "./device-label";

/**
 * Rule engine phát hiện sự cố — hàm THUẦN (không DB, test được).
 *
 * Hợp nhất các sự kiện cảm biến trong 1 cửa sổ thời gian, đối chiếu luật với
 * NGƯỠNG CỤ THỂ, chấm điểm nghiêm trọng theo trọng số bằng chứng.
 *
 * Nguyên tắc: engine phân biệt NHIỄU BÌNH THƯỜNG vs SỰ CỐ THẬT — không chỉ khớp
 * mẫu dữ liệu đơn lẻ (nhờ ngưỡng + tổ hợp nhiều nguồn), tránh "vòng tròn tự chứng minh".
 */

export interface SensorSignal {
  deviceCode: string;
  deviceType: string; // LOADCELL | DOOR | RFID_GATEWAY | HUMIDITY | TEMPERATURE...
  eventType: string;
  value: number;
  occurredAt: Date;
}

export type IncidentKind =
  | "SUSPECTED_LOSS"
  | "SENSOR_FAULT"
  | "BAD_STORAGE"
  | "FIRE_RISK"
  | "POWER_OUTAGE"
  | "MISPLACED_ITEM"
  | "STAT_ANOMALY"
  | "PREDICTIVE_WARNING"
  | "DEVICE_SILENT";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface EvidenceItem {
  deviceCode: string;
  eventType: string;
  value: number;
  weight: number;
  occurredAt: Date;
  note: string;
}

export interface DetectedIncident {
  kind: IncidentKind;
  severity: Severity;
  confidence: number; // 0..1
  title: string;
  evidence: EvidenceItem[];
}

// Ngưỡng cụ thể — cấu hình được (giữ hằng số cho MVP).
const temperatureHigh = SIMULATOR_ALARM_POLICY.rules.find(
  (rule) => rule.id === "temperature-high",
)!.threshold;
const humidityHigh = SIMULATOR_ALARM_POLICY.rules.find(
  (rule) => rule.id === "humidity-high",
)!.threshold;

export const RULES = {
  loadcellDropKg: 3, // loadcell giảm > 3kg = đáng ngờ
  humidityHigh, // độ ẩm > 85% = bảo quản xấu
  temperatureHigh, // nhiệt độ > 35°C
  correlationWindowMs: 5 * 60 * 1000, // ±5 phút để coi là cùng sự kiện
  smokeHigh: 30, // khói > 30ppm = đáng ngờ
  fireTempJumpC: 15, // nhiệt độ tăng > 15°C trong cửa sổ tương quan = cháy thật, không phải nhiễu
  // Bỏ lỡ 3 chu kỳ báo mới coi là mất tín hiệu: 1 lần trễ là bình thường (mạng
  // chậm, thiết bị bận), 3 lần liên tiếp thì không còn là nhiễu.
  silentCyclesBeforeAlert: 3,
  // Im lặng quá 10 chu kỳ: không còn là trục trặc thoáng qua, coi như thiết bị chết.
  silentCyclesForHigh: 10,
};

/** Trạng thái báo cáo của một thiết bị — đầu vào cho quy tắc mất tín hiệu. */
export interface DeviceSilenceSignal {
  deviceCode: string;
  deviceType: string;
  /** null = chưa từng gửi số liệu nào. */
  lastSeenAt: Date | null;
  /** Chu kỳ báo mong đợi (giây). null = không giám sát thiết bị này. */
  expectedIntervalSeconds: number | null;
}

/**
 * Mất tín hiệu thiết bị.
 *
 * Cảm biến hỏng, hết pin hoặc đứt mạng thì KHÔNG gửi gì cả. Nếu chỉ phản ứng với
 * dữ liệu nhận được, im lặng sẽ bị hiểu nhầm thành "mọi thứ bình thường" — đúng
 * lúc kho đang không được giám sát. Quy tắc này biến sự vắng mặt của dữ liệu
 * thành một sự cố hiển thị được.
 *
 * Hàm thuần: `now` được truyền vào để test không phụ thuộc đồng hồ thật.
 */
export function detectSilentDevices(devices: DeviceSilenceSignal[], now: Date): DetectedIncident[] {
  const incidents: DetectedIncident[] = [];
  for (const device of devices) {
    const interval = device.expectedIntervalSeconds;
    if (!interval || !Number.isFinite(interval) || interval <= 0) continue;

    const intervalMs = interval * 1000;
    // Chưa từng báo lần nào cũng là mất tín hiệu — thiết bị đã khai báo nhưng
    // không bao giờ lên tiếng là trường hợp lắp đặt hỏng, không phải "chờ thêm".
    const silentMs = device.lastSeenAt
      ? now.getTime() - device.lastSeenAt.getTime()
      : Number.POSITIVE_INFINITY;
    const missedCycles = silentMs / intervalMs;
    if (missedCycles < RULES.silentCyclesBeforeAlert) continue;

    const severity: Severity = missedCycles >= RULES.silentCyclesForHigh ? "HIGH" : "MEDIUM";
    incidents.push({
      kind: "DEVICE_SILENT",
      severity,
      confidence: severity === "HIGH" ? 0.95 : 0.8,
      title: `Mất tín hiệu ${describeDevice(device.deviceType, device.deviceCode)}`,
      evidence: [
        {
          deviceCode: device.deviceCode,
          eventType: "DEVICE_SILENT",
          // Số phút im lặng; vô cực (chưa từng báo) quy ước là 0 để giữ giá trị hữu hạn.
          value: Number.isFinite(silentMs) ? Math.round(silentMs / 60_000) : 0,
          weight: 1,
          occurredAt: device.lastSeenAt ?? now,
          note: device.lastSeenAt
            ? `Không nhận được số liệu trong ${Math.round(silentMs / 60_000)} phút (chu kỳ mong đợi ${interval}s)`
            : `Thiết bị đã khai báo nhưng chưa từng gửi số liệu (chu kỳ mong đợi ${interval}s)`,
        },
      ],
    });
  }
  return incidents;
}

/**
 * Phát hiện sự cố từ danh sách tín hiệu (đã lọc theo 1 kho, 1 cửa sổ).
 * Trả về danh sách sự cố (có thể rỗng nếu chỉ là nhiễu bình thường).
 */
export function detectIncidents(signals: SensorSignal[]): DetectedIncident[] {
  const incidents: DetectedIncident[] = [];

  const loss = detectSuspectedLoss(signals);
  if (loss) incidents.push(loss);

  const fault = detectSensorFault(signals);
  if (fault) incidents.push(fault);

  const storage = detectBadStorage(signals);
  if (storage) incidents.push(storage);

  const fire = detectFireRisk(signals);
  if (fire) incidents.push(fire);

  const power = detectPowerOutage(signals);
  if (power) incidents.push(power);

  const misplaced = detectMisplacedItem(signals);
  if (misplaced) incidents.push(misplaced);

  return incidents;
}

/**
 * Nghi thất thoát: loadcell giảm mạnh + cửa mở + RFID qua cổng, TRONG cửa sổ ±5ph.
 * Càng nhiều nguồn đồng thuận → confidence + severity càng cao.
 */
function detectSuspectedLoss(signals: SensorSignal[]): DetectedIncident | null {
  const drop = signals.find(
    (s) =>
      s.deviceType === "LOADCELL" &&
      s.eventType === "WEIGHT_CHANGED" &&
      s.value <= 50 - RULES.loadcellDropKg,
  );
  if (!drop) return null;

  const near = (s: SensorSignal) =>
    Math.abs(s.occurredAt.getTime() - drop.occurredAt.getTime()) <= RULES.correlationWindowMs;

  const doorOpen = signals.find(
    (s) => s.deviceType === "DOOR" && s.eventType === "DOOR_OPEN" && near(s),
  );
  const rfid = signals.find((s) => s.deviceType === "RFID_GATEWAY" && near(s));

  const evidence: EvidenceItem[] = [
    { ...toEvidence(drop), weight: 0.4, note: "Khối lượng kệ giảm bất thường" },
  ];
  if (doorOpen) evidence.push({ ...toEvidence(doorOpen), weight: 0.3, note: "Cửa kho mở" });
  if (rfid)
    evidence.push({ ...toEvidence(rfid), weight: 0.3, note: "RFID ghi nhận vật tư qua cổng" });

  // Chỉ loadcell giảm mà không nguồn nào khác → có thể là lỗi cảm biến, không kết luận thất thoát.
  const sources = evidence.length;
  if (sources < 2) return null;

  const confidence = evidence.reduce((s, e) => s + e.weight, 0);
  return {
    kind: "SUSPECTED_LOSS",
    severity: sources >= 3 ? "CRITICAL" : "HIGH",
    confidence: Math.min(1, confidence),
    title: "Nghi ngờ thất thoát vật tư",
    evidence,
  };
}

/**
 * Lỗi cảm biến: loadcell giảm mạnh NHƯNG cửa không mở + RFID không đổi
 * → nhiều khả năng cảm biến sai, không phải thất thoát.
 */
function detectSensorFault(signals: SensorSignal[]): DetectedIncident | null {
  const drop = signals.find(
    (s) =>
      s.deviceType === "LOADCELL" &&
      s.eventType === "WEIGHT_CHANGED" &&
      s.value <= 50 - RULES.loadcellDropKg,
  );
  if (!drop) return null;

  const near = (s: SensorSignal) =>
    Math.abs(s.occurredAt.getTime() - drop.occurredAt.getTime()) <= RULES.correlationWindowMs;
  const hasDoor = signals.some(
    (s) => s.deviceType === "DOOR" && s.eventType === "DOOR_OPEN" && near(s),
  );
  const hasRfid = signals.some((s) => s.deviceType === "RFID_GATEWAY" && near(s));

  // Có nguồn khác → là thất thoát (đã bắt ở trên), không phải lỗi cảm biến.
  if (hasDoor || hasRfid) return null;

  return {
    kind: "SENSOR_FAULT",
    severity: "MEDIUM",
    confidence: 0.6,
    title: "Nghi ngờ lỗi cảm biến",
    evidence: [
      {
        ...toEvidence(drop),
        weight: 1,
        note: "Khối lượng giảm nhưng không có dấu hiệu vật tư rời kho",
      },
    ],
  };
}

/** Bảo quản xấu: độ ẩm hoặc nhiệt độ vượt ngưỡng. */
function detectBadStorage(signals: SensorSignal[]): DetectedIncident | null {
  const humid = signals.find((s) => s.deviceType === "HUMIDITY" && s.value > RULES.humidityHigh);
  const temp = signals.find(
    (s) => s.deviceType === "TEMPERATURE" && s.value > RULES.temperatureHigh,
  );
  if (!humid && !temp) return null;

  const evidence: EvidenceItem[] = [];
  if (humid)
    evidence.push({
      ...toEvidence(humid),
      weight: 0.6,
      note: `Độ ẩm ${humid.value}% vượt ngưỡng ${RULES.humidityHigh}%`,
    });
  if (temp)
    evidence.push({
      ...toEvidence(temp),
      weight: 0.6,
      note: `Nhiệt độ ${temp.value}°C vượt ngưỡng ${RULES.temperatureHigh}°C`,
    });

  return {
    kind: "BAD_STORAGE",
    severity: humid && temp ? "HIGH" : "MEDIUM",
    confidence: Math.min(
      1,
      evidence.reduce((s, e) => s + e.weight, 0),
    ),
    title: "Điều kiện bảo quản không đạt",
    evidence,
  };
}

/**
 * Nghi cháy: khói vượt ngưỡng VÀ nhiệt độ tăng nhanh trong cùng cửa sổ tương quan.
 * Cần cả 2 nguồn — chỉ khói (hơi nước/bụi) hoặc chỉ nhiệt (nắng nóng) không kết luận cháy.
 */
function detectFireRisk(signals: SensorSignal[]): DetectedIncident | null {
  const smoke = signals.find((s) => s.deviceType === "SMOKE" && s.value > RULES.smokeHigh);
  if (!smoke) return null;

  const temps = signals
    .filter((s) => s.deviceType === "TEMPERATURE")
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  if (temps.length < 2) return null;

  const near = (s: SensorSignal) =>
    Math.abs(s.occurredAt.getTime() - smoke.occurredAt.getTime()) <= RULES.correlationWindowMs;
  const nearTemps = temps.filter(near);
  if (nearTemps.length === 0) return null;

  const baseline = temps[0].value;
  const peak = nearTemps.reduce((max, t) => Math.max(max, t.value), -Infinity);
  const jump = peak - baseline;
  if (jump < RULES.fireTempJumpC) return null;

  return {
    kind: "FIRE_RISK",
    severity: "CRITICAL",
    confidence: 1,
    title: "Nghi ngờ hỏa hoạn",
    evidence: [
      {
        ...toEvidence(smoke),
        weight: 0.5,
        note: `Khói ${smoke.value}ppm vượt ngưỡng ${RULES.smokeHigh}ppm`,
      },
      {
        ...toEvidence(nearTemps[nearTemps.length - 1]),
        weight: 0.5,
        note: `Nhiệt độ tăng ${jump.toFixed(1)}°C trong cửa sổ tương quan`,
      },
    ],
  };
}

/**
 * Mất điện: POWER_OFF không kèm GATEWAY_OFFLINE cùng lúc — phân biệt mất điện thật
 * vs lỗi mạng (đã là sự cố khác, tránh báo trùng).
 */
function detectPowerOutage(signals: SensorSignal[]): DetectedIncident | null {
  const off = signals.find((s) => s.deviceType === "POWER" && s.eventType === "POWER_OFF");
  if (!off) return null;

  const near = (s: SensorSignal) =>
    Math.abs(s.occurredAt.getTime() - off.occurredAt.getTime()) <= RULES.correlationWindowMs;
  const gatewayOffline = signals.some(
    (s) => s.deviceType === "GATEWAY" && s.eventType === "GATEWAY_OFFLINE" && near(s),
  );
  if (gatewayOffline) return null;

  return {
    kind: "POWER_OUTAGE",
    severity: "HIGH", // ponytail: severity cố định, chưa tính theo thời lượng mất điện — nâng cấp khi có nhu cầu phân cấp rõ hơn
    confidence: 0.8,
    title: "Mất điện kho",
    evidence: [
      { ...toEvidence(off), weight: 1, note: "Nguồn điện kho mất, không kèm lỗi kết nối gateway" },
    ],
  };
}

/** Vật tư sai vị trí: camera AI phát một kết quả nhận diện dương tính. */
function detectMisplacedItem(signals: SensorSignal[]): DetectedIncident | null {
  const detection = signals.find(
    (signal) =>
      signal.deviceType === "CAMERA_AI" &&
      signal.eventType === "VISION_DETECTION" &&
      signal.value >= 1,
  );
  if (!detection) return null;

  return {
    kind: "MISPLACED_ITEM",
    severity: "HIGH",
    confidence: 0.85,
    title: "Phát hiện vật tư sai vị trí",
    evidence: [
      {
        ...toEvidence(detection),
        weight: 1,
        note: "Camera AI phát hiện vật tư không nằm tại khu vực được quy định",
      },
    ],
  };
}

function toEvidence(s: SensorSignal): Omit<EvidenceItem, "weight" | "note"> {
  return {
    deviceCode: s.deviceCode,
    eventType: s.eventType,
    value: s.value,
    occurredAt: s.occurredAt,
  };
}

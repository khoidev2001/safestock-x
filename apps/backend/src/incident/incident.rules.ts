/**
 * Rule engine phát hiện sự cố — hàm THUẦN (không DB, test được).
 *
 * Hợp nhất các sự kiện cảm biến trong 1 cửa sổ thời gian, đối chiếu luật với
 * NGƯỠNG CỤ THỂ, chấm điểm nghiêm trọng theo trọng số bằng chứng.
 *
 * Nguyên tắc: engine phân biệt NHIỄU BÌNH THƯỜNG vs SỰ CỐ THẬT — không chỉ khớp
 * kịch bản (nhờ ngưỡng + tổ hợp nhiều nguồn), tránh "vòng tròn tự chứng minh".
 */

export interface SensorSignal {
  deviceCode: string;
  deviceType: string; // LOADCELL | DOOR | RFID_GATEWAY | HUMIDITY | TEMPERATURE...
  eventType: string;
  value: number;
  occurredAt: Date;
}

export type IncidentKind = "SUSPECTED_LOSS" | "SENSOR_FAULT" | "BAD_STORAGE";
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
const RULES = {
  loadcellDropKg: 3, // loadcell giảm > 3kg = đáng ngờ
  humidityHigh: 85, // độ ẩm > 85% = bảo quản xấu
  temperatureHigh: 35, // nhiệt độ > 35°C
  correlationWindowMs: 5 * 60 * 1000, // ±5 phút để coi là cùng sự kiện
};

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

  return incidents;
}

/**
 * Nghi thất thoát: loadcell giảm mạnh + cửa mở + RFID qua cổng, TRONG cửa sổ ±5ph.
 * Càng nhiều nguồn đồng thuận → confidence + severity càng cao.
 */
function detectSuspectedLoss(signals: SensorSignal[]): DetectedIncident | null {
  const drop = signals.find(
    (s) => s.deviceType === "LOADCELL" && s.eventType === "WEIGHT_CHANGED" && s.value <= 50 - RULES.loadcellDropKg,
  );
  if (!drop) return null;

  const near = (s: SensorSignal) =>
    Math.abs(s.occurredAt.getTime() - drop.occurredAt.getTime()) <= RULES.correlationWindowMs;

  const doorOpen = signals.find((s) => s.deviceType === "DOOR" && s.eventType === "DOOR_OPEN" && near(s));
  const rfid = signals.find((s) => s.deviceType === "RFID_GATEWAY" && near(s));

  const evidence: EvidenceItem[] = [
    { ...toEvidence(drop), weight: 0.4, note: "Khối lượng kệ giảm bất thường" },
  ];
  if (doorOpen) evidence.push({ ...toEvidence(doorOpen), weight: 0.3, note: "Cửa kho mở" });
  if (rfid) evidence.push({ ...toEvidence(rfid), weight: 0.3, note: "RFID ghi nhận vật tư qua cổng" });

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
    (s) => s.deviceType === "LOADCELL" && s.eventType === "WEIGHT_CHANGED" && s.value <= 50 - RULES.loadcellDropKg,
  );
  if (!drop) return null;

  const near = (s: SensorSignal) =>
    Math.abs(s.occurredAt.getTime() - drop.occurredAt.getTime()) <= RULES.correlationWindowMs;
  const hasDoor = signals.some((s) => s.deviceType === "DOOR" && s.eventType === "DOOR_OPEN" && near(s));
  const hasRfid = signals.some((s) => s.deviceType === "RFID_GATEWAY" && near(s));

  // Có nguồn khác → là thất thoát (đã bắt ở trên), không phải lỗi cảm biến.
  if (hasDoor || hasRfid) return null;

  return {
    kind: "SENSOR_FAULT",
    severity: "MEDIUM",
    confidence: 0.6,
    title: "Nghi ngờ lỗi cảm biến",
    evidence: [
      { ...toEvidence(drop), weight: 1, note: "Khối lượng giảm nhưng không có dấu hiệu vật tư rời kho" },
    ],
  };
}

/** Bảo quản xấu: độ ẩm hoặc nhiệt độ vượt ngưỡng. */
function detectBadStorage(signals: SensorSignal[]): DetectedIncident | null {
  const humid = signals.find(
    (s) => s.deviceType === "HUMIDITY" && s.value > RULES.humidityHigh,
  );
  const temp = signals.find(
    (s) => s.deviceType === "TEMPERATURE" && s.value > RULES.temperatureHigh,
  );
  if (!humid && !temp) return null;

  const evidence: EvidenceItem[] = [];
  if (humid) evidence.push({ ...toEvidence(humid), weight: 0.6, note: `Độ ẩm ${humid.value}% vượt ngưỡng ${RULES.humidityHigh}%` });
  if (temp) evidence.push({ ...toEvidence(temp), weight: 0.6, note: `Nhiệt độ ${temp.value}°C vượt ngưỡng ${RULES.temperatureHigh}°C` });

  return {
    kind: "BAD_STORAGE",
    severity: humid && temp ? "HIGH" : "MEDIUM",
    confidence: Math.min(1, evidence.reduce((s, e) => s + e.weight, 0)),
    title: "Điều kiện bảo quản không đạt",
    evidence,
  };
}

function toEvidence(s: SensorSignal): Omit<EvidenceItem, "weight" | "note"> {
  return { deviceCode: s.deviceCode, eventType: s.eventType, value: s.value, occurredAt: s.occurredAt };
}

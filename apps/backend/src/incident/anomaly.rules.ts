/**
 * Anomaly Detection + Cảnh báo sớm dự đoán — hàm THUẦN (không DB, test được).
 *
 * Khác với incident.rules.ts (ngưỡng tuyệt đối cố định), 2 detector ở đây dùng
 * THỐNG KÊ: z-score so với baseline lịch sử từng cảm biến (bắt lệch dù chưa vượt
 * ngưỡng cứng), và hồi quy tuyến tính ngoại suy trend (báo TRƯỚC khi vượt ngưỡng).
 *
 * Nguyên tắc chống báo giả: MIN_SAMPLES đủ lớn để độ lệch chuẩn ước lượng ổn định,
 * Z_SCORE_THRESHOLD=3 (chuẩn thống kê, ~99.7% dữ liệu bình thường nằm trong ngưỡng).
 */

import {
  RULES,
  type DetectedIncident,
  type EvidenceItem,
  type SensorSignal,
} from "./incident.rules";

export const CONTINUOUS_DEVICE_TYPES = ["TEMPERATURE", "HUMIDITY", "LOADCELL", "SMOKE"];

const ANOMALY_RULES = {
  minSamples: 10, // baseline cần đủ mẫu mới ước lượng độ lệch chuẩn ổn định
  zScoreThreshold: 3, // |z| >= 3 mới coi là bất thường
  zScoreHigh: 5, // |z| >= 5 mới nâng severity lên HIGH
  minTrendPoints: 4, // hồi quy tuyến tính cần tối thiểu 4 điểm
  predictLeadHours: 2, // chỉ báo nếu dự kiến chạm ngưỡng trong 2h tới
};

const DANGER_THRESHOLD: Record<string, number> = {
  TEMPERATURE: RULES.temperatureHigh,
  HUMIDITY: RULES.humidityHigh,
  SMOKE: RULES.smokeHigh,
};

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[], mean: number): number {
  return Math.sqrt(avg(xs.map((x) => (x - mean) ** 2)));
}

/** Least-squares đơn giản: x = phút trôi qua kể từ điểm đầu, y = value. Trả về {slope, intercept} (đơn vị: value/phút). */
function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function groupByDevice(signals: SensorSignal[]): Map<string, SensorSignal[]> {
  const map = new Map<string, SensorSignal[]>();
  for (const s of signals) {
    if (!CONTINUOUS_DEVICE_TYPES.includes(s.deviceType)) continue;
    const list = map.get(s.deviceCode) ?? [];
    list.push(s);
    map.set(s.deviceCode, list);
  }
  for (const list of map.values())
    list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return map;
}

function toEvidence(s: SensorSignal): Omit<EvidenceItem, "weight" | "note"> {
  return {
    deviceCode: s.deviceCode,
    eventType: s.eventType,
    value: s.value,
    occurredAt: s.occurredAt,
  };
}

/** Phát hiện bất thường: điểm mới nhất lệch xa baseline lịch sử (z-score), dù chưa vượt ngưỡng tuyệt đối. */
export function detectStatisticalAnomaly(history: SensorSignal[]): DetectedIncident[] {
  const incidents: DetectedIncident[] = [];
  for (const [, points] of groupByDevice(history)) {
    if (points.length < ANOMALY_RULES.minSamples) continue;

    const latest = points[points.length - 1];
    const baseline = points.slice(0, -1);
    const values = baseline.map((p) => p.value);
    const mean = avg(values);
    const sd = stddev(values, mean);
    if (sd === 0) continue; // baseline hằng định tuyệt đối — không có gì để so lệch

    const z = (latest.value - mean) / sd;
    if (Math.abs(z) < ANOMALY_RULES.zScoreThreshold) continue;

    incidents.push({
      kind: "STAT_ANOMALY",
      severity: Math.abs(z) >= ANOMALY_RULES.zScoreHigh ? "HIGH" : "MEDIUM",
      confidence: Math.min(1, Math.abs(z) / 6),
      title: `Bất thường cảm biến ${latest.deviceCode}`,
      evidence: [
        {
          ...toEvidence(latest),
          weight: 1,
          note: `Giá trị ${latest.value} lệch z-score ${z.toFixed(1)} so với baseline (mean ${mean.toFixed(1)}, sd ${sd.toFixed(2)}, n=${baseline.length})`,
        },
      ],
    });
  }
  return incidents;
}

/** Cảnh báo sớm dự đoán: ngoại suy trend gần nhất, báo TRƯỚC khi chạm ngưỡng nguy hiểm. */
export function detectPredictiveWarning(history: SensorSignal[]): DetectedIncident[] {
  const incidents: DetectedIncident[] = [];
  for (const [, points] of groupByDevice(history)) {
    const threshold = DANGER_THRESHOLD[points[0]?.deviceType];
    if (threshold === undefined) continue;
    if (points.length < ANOMALY_RULES.minTrendPoints) continue;

    const recent = points.slice(-ANOMALY_RULES.minTrendPoints);
    const latest = recent[recent.length - 1];
    if (latest.value >= threshold) continue; // đã vượt ngưỡng — nhường rule ngưỡng cũ báo

    const t0 = recent[0].occurredAt.getTime();
    const fitted = recent.map((p) => ({ x: (p.occurredAt.getTime() - t0) / 60000, y: p.value }));
    const { slope, intercept } = linearRegression(fitted);
    if (slope <= 0) continue; // không tăng — không có gì để dự đoán

    const nowX = fitted[fitted.length - 1].x;
    const minutesToThreshold = (threshold - intercept) / slope - nowX;
    if (minutesToThreshold < 0 || minutesToThreshold > ANOMALY_RULES.predictLeadHours * 60)
      continue;

    const severity =
      minutesToThreshold <= 30 ? "CRITICAL" : minutesToThreshold <= 60 ? "HIGH" : "MEDIUM";
    incidents.push({
      kind: "PREDICTIVE_WARNING",
      severity,
      confidence: 0.8,
      title: `Dự đoán ${latest.deviceCode} sẽ vượt ngưỡng`,
      evidence: [
        {
          ...toEvidence(latest),
          weight: 1,
          note: `Xu hướng tăng ${slope.toFixed(2)}/phút, dự kiến vượt ngưỡng ${threshold} trong ~${Math.round(minutesToThreshold)} phút`,
        },
      ],
    });
  }
  return incidents;
}

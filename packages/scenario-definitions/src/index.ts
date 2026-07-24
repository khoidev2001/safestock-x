// Kịch bản mô phỏng cảm biến — timeline-scrubber (mỗi event có offsetMs tính sẵn).
// Deterministic: cùng seed → cùng dãy event (kể cả nhiễu). Dùng cho Phase B runner.

export interface ScenarioEvent {
  offsetMs: number; // thời điểm phát tính từ lúc bắt đầu run
  deviceCode: string;
  eventType: string;
  value: number;
}

export interface NoiseSpec {
  deviceCode: string;
  eventType: string;
  base: number; // giá trị nền
  amplitude: number; // biên độ dao động (± quanh base)
  everyMs: number; // chu kỳ phát nhiễu
}

export interface Scenario {
  key: string;
  name: string;
  description: string;
  durationMs: number;
  events: ScenarioEvent[]; // sự kiện kịch bản (cố định)
  noise?: NoiseSpec[]; // nhiễu nền (seeded) — làm engine phải phân biệt nhiễu vs sự cố
}

/** RNG deterministic (mulberry32). Cùng seed → cùng chuỗi số. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bung nhiễu thành list event cụ thể theo seed — deterministic.
 * Trả về event có value = base + (rand*2-1)*amplitude.
 */
export function expandNoise(noise: NoiseSpec[], durationMs: number, seed: number): ScenarioEvent[] {
  const rand = mulberry32(seed);
  const out: ScenarioEvent[] = [];
  for (const n of noise) {
    for (let t = n.everyMs; t <= durationMs; t += n.everyMs) {
      const value = +(n.base + (rand() * 2 - 1) * n.amplitude).toFixed(2);
      out.push({ offsetMs: t, deviceCode: n.deviceCode, eventType: n.eventType, value });
    }
  }
  return out;
}

/**
 * Trả về toàn bộ event của scenario (kịch bản + nhiễu seeded), đã sort theo offsetMs.
 * Đây là "timeline" mà runner scrub qua.
 */
export function buildTimeline(scenario: Scenario, seed: number): ScenarioEvent[] {
  const noiseEvents = scenario.noise ? expandNoise(scenario.noise, scenario.durationMs, seed) : [];
  return [...scenario.events, ...noiseEvents].sort((a, b) => a.offsetMs - b.offsetMs);
}

// ===== 6 kịch bản (PRD 3.4) =====

const SCENARIOS: Scenario[] = [
  {
    key: "normal",
    name: "Bình thường",
    description: "Nhiệt/ẩm ổn định, loadcell khớp phiếu xuất, không cảnh báo. Có nhiễu nền.",
    durationMs: 60000,
    events: [
      { offsetMs: 5000, deviceCode: "door_main", eventType: "DOOR_OPEN", value: 1 },
      { offsetMs: 8000, deviceCode: "scale_A1", eventType: "WEIGHT_CHANGED", value: 48 },
      { offsetMs: 12000, deviceCode: "door_main", eventType: "DOOR_CLOSE", value: 0 },
    ],
    noise: [
      { deviceCode: "temp_A", eventType: "TEMP_READING", base: 28, amplitude: 0.6, everyMs: 5000 },
      { deviceCode: "humid_A", eventType: "HUMID_READING", base: 60, amplitude: 2, everyMs: 5000 },
    ],
  },
  {
    key: "suspected_loss",
    name: "Nghi thất thoát",
    description: "Loadcell giảm + cửa mở + RFID + không phiếu xuất → cảnh báo.",
    durationMs: 30000,
    events: [
      { offsetMs: 2000, deviceCode: "door_main", eventType: "DOOR_OPEN", value: 1 },
      { offsetMs: 3000, deviceCode: "scale_A1", eventType: "WEIGHT_CHANGED", value: 44 }, // giảm ~4kg
      { offsetMs: 3500, deviceCode: "gateway_01", eventType: "RFID_DETECTED", value: 19 }, // ITEM-019
      { offsetMs: 6000, deviceCode: "door_main", eventType: "DOOR_CLOSE", value: 0 },
    ],
  },
  {
    key: "sensor_fault",
    name: "Lỗi cảm biến",
    description:
      "Loadcell giảm bất thường nhưng cửa không mở + RFID không đổi + camera không phát hiện.",
    durationMs: 20000,
    events: [
      { offsetMs: 4000, deviceCode: "scale_B1", eventType: "WEIGHT_CHANGED", value: 30 }, // giảm mạnh vô lý
    ],
  },
  {
    key: "bad_storage",
    name: "Điều kiện bảo quản xấu",
    description: "Độ ẩm tăng liên tục, nhiệt vượt ngưỡng → vật tư y tế giảm Readiness.",
    durationMs: 40000,
    events: [
      { offsetMs: 5000, deviceCode: "humid_B", eventType: "HUMID_READING", value: 72 },
      { offsetMs: 15000, deviceCode: "humid_B", eventType: "HUMID_READING", value: 82 },
      { offsetMs: 25000, deviceCode: "humid_B", eventType: "HUMID_READING", value: 90 },
      { offsetMs: 30000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 36 },
    ],
  },
  {
    key: "disconnect",
    name: "Mất kết nối",
    description: "Gateway offline, event vào hàng đợi, gửi bù khi online lại.",
    durationMs: 25000,
    events: [
      { offsetMs: 3000, deviceCode: "gateway_01", eventType: "GATEWAY_OFFLINE", value: 0 },
      { offsetMs: 18000, deviceCode: "gateway_01", eventType: "GATEWAY_ONLINE", value: 1 },
    ],
  },
  {
    key: "misplaced",
    name: "Vật tư sai vị trí",
    description: "Camera AI phát hiện vật tư ở sai khu (expected A, detected C).",
    durationMs: 15000,
    events: [{ offsetMs: 5000, deviceCode: "scale_A2", eventType: "VISION_DETECTION", value: 1 }],
  },
  {
    key: "fire",
    name: "Nghi cháy",
    description:
      "Khói tăng đột biến + nhiệt độ tăng nhanh trong ~10s, không kèm hoạt động cửa/RFID.",
    durationMs: 15000,
    events: [
      { offsetMs: 2000, deviceCode: "smoke_B", eventType: "SMOKE_READING", value: 0 },
      { offsetMs: 5000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 28.5 }, // lệch seed 0.5°C để ép ghi baseline thật (seed = 28, không lệch thì bị lọc "không đổi")
      { offsetMs: 8000, deviceCode: "smoke_B", eventType: "SMOKE_READING", value: 25 },
      { offsetMs: 10000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 42 },
      { offsetMs: 11000, deviceCode: "smoke_B", eventType: "SMOKE_READING", value: 45 },
      { offsetMs: 12000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 55 },
    ],
  },
  {
    key: "heat_drift",
    name: "Nhiệt tăng dần (cảnh báo sớm)",
    description:
      "Nhiệt độ tăng đều, CHƯA chạm ngưỡng 35°C — minh hoạ cảnh báo sớm dự đoán báo TRƯỚC khi rule ngưỡng cũ kịp phát hiện.",
    durationMs: 20000,
    events: [
      { offsetMs: 2000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 28 },
      { offsetMs: 6000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 30 },
      { offsetMs: 10000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 31.5 },
      { offsetMs: 14000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 33 },
      { offsetMs: 18000, deviceCode: "temp_B", eventType: "TEMP_READING", value: 34 },
    ],
  },
  {
    key: "power_outage",
    name: "Mất điện",
    description: "Nguồn điện mất rồi có lại sau một khoảng, không kèm gateway offline.",
    durationMs: 25000,
    events: [
      { offsetMs: 3000, deviceCode: "power_main", eventType: "POWER_OFF", value: 0 },
      { offsetMs: 18000, deviceCode: "power_main", eventType: "POWER_ON", value: 1 },
    ],
  },
];

export const scenarios = SCENARIOS;

export function getScenario(key: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

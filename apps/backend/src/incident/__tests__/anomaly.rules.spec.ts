import { mulberry32 } from "@safestock/scenario-definitions";
import { detectStatisticalAnomaly, detectPredictiveWarning } from "../anomaly.rules";
import { RULES, type SensorSignal } from "../incident.rules";

const T0 = new Date("2026-07-15T21:00:00+07:00");
const at = (secondsAfter: number) => new Date(T0.getTime() + secondsAfter * 1000);

const sig = (over: Partial<SensorSignal>): SensorSignal => ({
  deviceCode: "temp_A",
  deviceType: "TEMPERATURE",
  eventType: "TEMP_READING",
  value: 28,
  occurredAt: T0,
  ...over,
});

describe("detectStatisticalAnomaly", () => {
  it("should NOT flag false positive on normal scenario noise (base 28, amplitude 0.6, seed 42)", () => {
    // Dùng đúng tham số nhiễu scenario `normal` — chống báo giả, case quan trọng nhất.
    const rand = mulberry32(42);
    const signals: SensorSignal[] = Array.from({ length: 30 }, (_, i) =>
      sig({ value: +(28 + (rand() * 2 - 1) * 0.6).toFixed(2), occurredAt: at(i * 5) }),
    );
    const incidents = detectStatisticalAnomaly(signals);
    expect(incidents.find((i) => i.kind === "STAT_ANOMALY")).toBeUndefined();
  });

  it("should flag anomaly when latest point deviates sharply from stable baseline", () => {
    const baseline = Array.from({ length: 10 }, (_, i) =>
      sig({ value: 28 + (i % 2 === 0 ? 0.1 : -0.1), occurredAt: at(i * 5) }),
    );
    const spike = sig({ value: 40, occurredAt: at(55) });
    const incidents = detectStatisticalAnomaly([...baseline, spike]);
    const anomaly = incidents.find((i) => i.kind === "STAT_ANOMALY");
    expect(anomaly).toBeDefined();
    expect(anomaly?.severity).toBe("HIGH");
  });

  it("should NOT compute baseline with fewer than MIN_SAMPLES points", () => {
    const signals: SensorSignal[] = Array.from({ length: 9 }, (_, i) =>
      sig({ value: 28, occurredAt: at(i * 5) }),
    );
    signals.push(sig({ value: 40, occurredAt: at(50) }));
    expect(detectStatisticalAnomaly(signals)).toHaveLength(0);
  });
});

describe("detectPredictiveWarning", () => {
  it("should flag predictive warning when trend extrapolates to threshold within lead window", () => {
    // Tăng đều 0.5°C/phút từ 32°C tại t=3min — chạm 35°C (RULES.temperatureHigh) trong ~3 phút nữa.
    const signals: SensorSignal[] = [
      sig({ value: 32, occurredAt: at(0) }),
      sig({ value: 32.5, occurredAt: at(60) }),
      sig({ value: 33, occurredAt: at(120) }),
      sig({ value: 33.5, occurredAt: at(180) }),
    ];
    const incidents = detectPredictiveWarning(signals);
    const warning = incidents.find((i) => i.kind === "PREDICTIVE_WARNING");
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe("CRITICAL"); // ~3 phút <= 30
  });

  it("should NOT flag when current value already exceeds threshold (deferred to threshold rule)", () => {
    const signals: SensorSignal[] = [
      sig({ value: 34, occurredAt: at(0) }),
      sig({ value: 35, occurredAt: at(60) }),
      sig({ value: 36, occurredAt: at(120) }),
      sig({ value: RULES.temperatureHigh + 1, occurredAt: at(180) }),
    ];
    expect(
      detectPredictiveWarning(signals).find((i) => i.kind === "PREDICTIVE_WARNING"),
    ).toBeUndefined();
  });

  it("should NOT flag when trend is flat or decreasing", () => {
    const flat: SensorSignal[] = [
      sig({ value: 28, occurredAt: at(0) }),
      sig({ value: 28, occurredAt: at(60) }),
      sig({ value: 28, occurredAt: at(120) }),
      sig({ value: 28, occurredAt: at(180) }),
    ];
    expect(detectPredictiveWarning(flat)).toHaveLength(0);

    const decreasing: SensorSignal[] = [
      sig({ value: 30, occurredAt: at(0) }),
      sig({ value: 29, occurredAt: at(60) }),
      sig({ value: 28, occurredAt: at(120) }),
      sig({ value: 27, occurredAt: at(180) }),
    ];
    expect(detectPredictiveWarning(decreasing)).toHaveLength(0);
  });

  it("should NOT flag when threshold is reached outside the lead window", () => {
    // Tăng rất chậm — 0.01°C/phút từ 28°C, còn xa ngưỡng 35°C hơn 2h tới.
    const signals: SensorSignal[] = [
      sig({ value: 28, occurredAt: at(0) }),
      sig({ value: 28.01, occurredAt: at(60) }),
      sig({ value: 28.02, occurredAt: at(120) }),
      sig({ value: 28.03, occurredAt: at(180) }),
    ];
    expect(detectPredictiveWarning(signals)).toHaveLength(0);
  });
});

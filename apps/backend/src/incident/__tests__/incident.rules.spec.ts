import { detectIncidents, SensorSignal } from "../incident.rules";

const T0 = new Date("2026-07-15T21:00:00+07:00");
const at = (secondsAfter: number) => new Date(T0.getTime() + secondsAfter * 1000);

const sig = (over: Partial<SensorSignal>): SensorSignal => ({
  deviceCode: "scale_A1",
  deviceType: "LOADCELL",
  eventType: "WEIGHT_CHANGED",
  value: 44, // giảm 6kg từ 50
  occurredAt: T0,
  ...over,
});

describe("detectIncidents — suspected loss", () => {
  it("should flag suspected loss when loadcell drop + door + rfid coincide", () => {
    const signals: SensorSignal[] = [
      sig({ value: 44 }),
      sig({
        deviceCode: "door_main",
        deviceType: "DOOR",
        eventType: "DOOR_OPEN",
        value: 1,
        occurredAt: at(2),
      }),
      sig({
        deviceCode: "gateway_01",
        deviceType: "RFID_GATEWAY",
        eventType: "RFID_DETECTED",
        value: 19,
        occurredAt: at(3),
      }),
    ];
    const incidents = detectIncidents(signals);
    const loss = incidents.find((i) => i.kind === "SUSPECTED_LOSS");
    expect(loss).toBeDefined();
    expect(loss?.severity).toBe("CRITICAL"); // 3 nguồn
    expect(loss?.evidence.length).toBe(3);
    expect(loss?.confidence).toBeGreaterThan(0.9);
  });

  it("should be HIGH (not CRITICAL) with only 2 sources", () => {
    const signals: SensorSignal[] = [
      sig({ value: 44 }),
      sig({
        deviceCode: "door_main",
        deviceType: "DOOR",
        eventType: "DOOR_OPEN",
        value: 1,
        occurredAt: at(2),
      }),
    ];
    const loss = detectIncidents(signals).find((i) => i.kind === "SUSPECTED_LOSS");
    expect(loss?.severity).toBe("HIGH");
  });

  it("should NOT flag loss when drop alone (could be sensor fault)", () => {
    const incidents = detectIncidents([sig({ value: 44 })]);
    expect(incidents.find((i) => i.kind === "SUSPECTED_LOSS")).toBeUndefined();
  });

  it("should NOT flag loss when drop is below threshold (noise)", () => {
    // giảm chỉ 1kg (48) < ngưỡng 3kg → không phải sự cố
    const incidents = detectIncidents([sig({ value: 49 })]);
    expect(incidents).toHaveLength(0);
  });

  it("should NOT correlate events outside the time window", () => {
    const signals: SensorSignal[] = [
      sig({ value: 44 }),
      // cửa mở 10 phút sau → ngoài cửa sổ ±5ph
      sig({
        deviceCode: "door_main",
        deviceType: "DOOR",
        eventType: "DOOR_OPEN",
        value: 1,
        occurredAt: at(600),
      }),
    ];
    expect(detectIncidents(signals).find((i) => i.kind === "SUSPECTED_LOSS")).toBeUndefined();
  });
});

describe("detectIncidents — sensor fault", () => {
  it("should flag sensor fault when drop with NO door/rfid", () => {
    const fault = detectIncidents([sig({ value: 44 })]).find((i) => i.kind === "SENSOR_FAULT");
    expect(fault).toBeDefined();
    expect(fault?.severity).toBe("MEDIUM");
  });

  it("should NOT flag sensor fault when door present (it's a loss instead)", () => {
    const signals: SensorSignal[] = [
      sig({ value: 44 }),
      sig({
        deviceCode: "door_main",
        deviceType: "DOOR",
        eventType: "DOOR_OPEN",
        value: 1,
        occurredAt: at(2),
      }),
    ];
    expect(detectIncidents(signals).find((i) => i.kind === "SENSOR_FAULT")).toBeUndefined();
  });
});

describe("detectIncidents — bad storage", () => {
  it("should flag bad storage when humidity exceeds threshold", () => {
    const signals: SensorSignal[] = [
      sig({ deviceCode: "humid_B", deviceType: "HUMIDITY", eventType: "HUMID_READING", value: 95 }),
    ];
    const storage = detectIncidents(signals).find((i) => i.kind === "BAD_STORAGE");
    expect(storage).toBeDefined();
    expect(storage?.severity).toBe("MEDIUM");
  });

  it("should be HIGH when both humidity and temperature exceed", () => {
    const signals: SensorSignal[] = [
      sig({ deviceCode: "humid_B", deviceType: "HUMIDITY", value: 95 }),
      sig({ deviceCode: "temp_B", deviceType: "TEMPERATURE", value: 40 }),
    ];
    const storage = detectIncidents(signals).find((i) => i.kind === "BAD_STORAGE");
    expect(storage?.severity).toBe("HIGH");
  });

  it("should NOT flag when humidity is normal", () => {
    const signals: SensorSignal[] = [
      sig({ deviceCode: "humid_B", deviceType: "HUMIDITY", value: 60 }),
    ];
    expect(detectIncidents(signals)).toHaveLength(0);
  });
});

describe("detectIncidents — fire risk", () => {
  it("should flag CRITICAL fire risk when smoke + temperature jump coincide", () => {
    const signals: SensorSignal[] = [
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 28,
        occurredAt: T0,
      }),
      sig({
        deviceCode: "smoke_B",
        deviceType: "SMOKE",
        eventType: "SMOKE_READING",
        value: 45,
        occurredAt: at(10),
      }),
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 55,
        occurredAt: at(12),
      }),
    ];
    const fire = detectIncidents(signals).find((i) => i.kind === "FIRE_RISK");
    expect(fire).toBeDefined();
    expect(fire?.severity).toBe("CRITICAL");
    expect(fire?.evidence.length).toBe(2);
  });

  it("should NOT flag fire when only smoke rises (no temperature jump)", () => {
    const signals: SensorSignal[] = [
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 28,
        occurredAt: T0,
      }),
      sig({
        deviceCode: "smoke_B",
        deviceType: "SMOKE",
        eventType: "SMOKE_READING",
        value: 45,
        occurredAt: at(10),
      }),
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 29,
        occurredAt: at(12),
      }),
    ];
    expect(detectIncidents(signals).find((i) => i.kind === "FIRE_RISK")).toBeUndefined();
  });

  it("should NOT flag fire when only temperature rises (no smoke)", () => {
    const signals: SensorSignal[] = [
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 28,
        occurredAt: T0,
      }),
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 55,
        occurredAt: at(12),
      }),
    ];
    expect(detectIncidents(signals).find((i) => i.kind === "FIRE_RISK")).toBeUndefined();
  });

  it("should NOT flag fire when smoke is below threshold", () => {
    const signals: SensorSignal[] = [
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 28,
        occurredAt: T0,
      }),
      sig({
        deviceCode: "smoke_B",
        deviceType: "SMOKE",
        eventType: "SMOKE_READING",
        value: 20,
        occurredAt: at(10),
      }),
      sig({
        deviceCode: "temp_B",
        deviceType: "TEMPERATURE",
        eventType: "TEMP_READING",
        value: 55,
        occurredAt: at(12),
      }),
    ];
    expect(detectIncidents(signals).find((i) => i.kind === "FIRE_RISK")).toBeUndefined();
  });
});

describe("detectIncidents — power outage", () => {
  it("should flag power outage on POWER_OFF alone", () => {
    const signals: SensorSignal[] = [
      sig({ deviceCode: "power_main", deviceType: "POWER", eventType: "POWER_OFF", value: 0 }),
    ];
    const outage = detectIncidents(signals).find((i) => i.kind === "POWER_OUTAGE");
    expect(outage).toBeDefined();
    expect(outage?.severity).toBe("HIGH");
  });

  it("should NOT flag power outage when gateway is offline at the same time", () => {
    const signals: SensorSignal[] = [
      sig({ deviceCode: "power_main", deviceType: "POWER", eventType: "POWER_OFF", value: 0 }),
      sig({
        deviceCode: "gateway_01",
        deviceType: "GATEWAY",
        eventType: "GATEWAY_OFFLINE",
        value: 0,
        occurredAt: at(1),
      }),
    ];
    expect(detectIncidents(signals).find((i) => i.kind === "POWER_OUTAGE")).toBeUndefined();
  });
});

describe("detectIncidents — misplaced item", () => {
  it("should flag misplaced item when camera AI emits a positive detection", () => {
    const signals: SensorSignal[] = [
      sig({
        deviceCode: "camera_main",
        deviceType: "CAMERA_AI",
        eventType: "VISION_DETECTION",
        value: 1,
      }),
    ];

    const misplaced = detectIncidents(signals).find((i) => i.kind === "MISPLACED_ITEM");

    expect(misplaced).toBeDefined();
    expect(misplaced?.severity).toBe("HIGH");
    expect(misplaced?.evidence).toEqual([
      expect.objectContaining({
        deviceCode: "camera_main",
        eventType: "VISION_DETECTION",
        value: 1,
      }),
    ]);
  });

  it("should not flag misplaced item for a negative camera result", () => {
    const signals: SensorSignal[] = [
      sig({
        deviceCode: "camera_main",
        deviceType: "CAMERA_AI",
        eventType: "VISION_DETECTION",
        value: 0,
      }),
    ];

    expect(detectIncidents(signals).find((i) => i.kind === "MISPLACED_ITEM")).toBeUndefined();
  });
});

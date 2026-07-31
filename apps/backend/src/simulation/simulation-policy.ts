export interface SimulatorAlarmRule {
  id: string;
  deviceType: "TEMPERATURE" | "HUMIDITY";
  operator: "GT";
  threshold: number;
  title: string;
}

export interface SimulatorAlarmPolicy {
  version: string;
  rules: readonly SimulatorAlarmRule[];
}

export interface SimulatorReading {
  code: string;
  type: string;
  value: number;
}

export interface SimulatorAlarmBreach {
  ruleId: string;
  title: string;
  deviceCode: string;
  value: number;
  threshold: number;
}

/**
 * Canonical threshold policy for the confirmed simulator flow.
 *
 * The desktop receives this object through the authenticated API and caches it
 * for local bell evaluation. The server remains the authority for incident and
 * email decisions, because correlation rules (for example fire risk) need the
 * complete persisted history.
 */
export const SIMULATOR_ALARM_POLICY: SimulatorAlarmPolicy = {
  version: "2026-07-30.1",
  rules: [
    {
      id: "temperature-high",
      deviceType: "TEMPERATURE",
      operator: "GT",
      threshold: 35,
      title: "Nhiệt độ kho vượt ngưỡng bảo quản",
    },
    {
      id: "humidity-high",
      deviceType: "HUMIDITY",
      operator: "GT",
      threshold: 85,
      title: "Độ ẩm kho vượt ngưỡng bảo quản",
    },
  ],
};

export function evaluateSimulatorAlarmPolicy(
  readings: readonly SimulatorReading[],
  policy: SimulatorAlarmPolicy = SIMULATOR_ALARM_POLICY,
): SimulatorAlarmBreach[] {
  const breaches: SimulatorAlarmBreach[] = [];
  for (const rule of policy.rules) {
    for (const reading of readings) {
      if (reading.type !== rule.deviceType || reading.value <= rule.threshold) continue;
      breaches.push({
        ruleId: rule.id,
        title: rule.title,
        deviceCode: reading.code,
        value: reading.value,
        threshold: rule.threshold,
      });
    }
  }
  return breaches;
}

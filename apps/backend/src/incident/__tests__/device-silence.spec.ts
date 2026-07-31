import { detectSilentDevices, RULES } from "../incident.rules";

describe("detectSilentDevices", () => {
  const now = new Date("2026-07-31T08:00:00.000Z");
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  const device = (overrides: Partial<Parameters<typeof detectSilentDevices>[0][number]> = {}) => ({
    deviceCode: "temp_A",
    deviceType: "TEMPERATURE",
    lastSeenAt: minutesAgo(1),
    expectedIntervalSeconds: 60,
    ...overrides,
  });

  it("bỏ qua thiết bị không khai báo chu kỳ báo", () => {
    // Thiết bị mô phỏng do người kéo tay không có nhịp cố định; giám sát im lặng
    // cho nó sẽ đẻ ra cảnh báo giả mỗi khi không ai ngồi trước máy.
    expect(
      detectSilentDevices([device({ expectedIntervalSeconds: null, lastSeenAt: null })], now),
    ).toEqual([]);
  });

  it("chưa tới ngưỡng bỏ lỡ thì im lặng", () => {
    const justLate = RULES.silentCyclesBeforeAlert - 1;
    expect(detectSilentDevices([device({ lastSeenAt: minutesAgo(justLate) })], now)).toEqual([]);
  });

  it("bỏ lỡ đủ số chu kỳ thì báo sự cố mức trung bình", () => {
    const incidents = detectSilentDevices(
      [device({ lastSeenAt: minutesAgo(RULES.silentCyclesBeforeAlert) })],
      now,
    );

    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toEqual(
      expect.objectContaining({ kind: "DEVICE_SILENT", severity: "MEDIUM" }),
    );
    expect(incidents[0]!.evidence[0]).toEqual(
      expect.objectContaining({ deviceCode: "temp_A", eventType: "DEVICE_SILENT" }),
    );
  });

  it("im lặng rất lâu thì nâng lên mức cao", () => {
    const incidents = detectSilentDevices(
      [device({ lastSeenAt: minutesAgo(RULES.silentCyclesForHigh) })],
      now,
    );

    expect(incidents[0]).toEqual(expect.objectContaining({ severity: "HIGH" }));
  });

  it("thiết bị đã khai báo nhưng chưa từng gửi số liệu cũng là mất tín hiệu", () => {
    // Lắp đặt hỏng phải lộ ra ngay, không được coi là 'đang chờ số liệu đầu tiên'.
    const incidents = detectSilentDevices([device({ lastSeenAt: null })], now);

    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.severity).toBe("HIGH");
    expect(incidents[0]!.evidence[0]!.value).toBe(0);
    expect(Number.isFinite(incidents[0]!.evidence[0]!.value)).toBe(true);
  });

  it("chu kỳ báo vô lý không được biến thành cảnh báo", () => {
    expect(detectSilentDevices([device({ expectedIntervalSeconds: 0 })], now)).toEqual([]);
    expect(detectSilentDevices([device({ expectedIntervalSeconds: -5 })], now)).toEqual([]);
  });

  it("mỗi thiết bị im lặng là một sự cố riêng", () => {
    const incidents = detectSilentDevices(
      [
        device({ deviceCode: "temp_A", lastSeenAt: null }),
        device({ deviceCode: "humid_B", lastSeenAt: null }),
        device({ deviceCode: "temp_C", lastSeenAt: minutesAgo(0) }),
      ],
      now,
    );

    expect(incidents.map((incident) => incident.evidence[0]!.deviceCode)).toEqual([
      "temp_A",
      "humid_B",
    ]);
  });
});

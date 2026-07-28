import { getScenario } from "@safestock/scenario-definitions";

describe("scenario device contract", () => {
  it.each([
    ["suspected_loss", "rfid_main", "RFID_DETECTED"],
    ["misplaced", "camera_main", "VISION_DETECTION"],
    ["fire", "smoke_main", "SMOKE_READING"],
  ])("%s dùng đúng thiết bị trung tâm %s", (scenarioKey, deviceCode, eventType) => {
    const scenario = getScenario(scenarioKey);

    expect(scenario).toBeDefined();
    expect(scenario?.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ deviceCode, eventType })]),
    );
  });
});

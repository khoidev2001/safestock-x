import {
  ActionZone,
  resolveActionZone,
  shouldBlockNewMission,
  shouldNotifyManager,
} from "../action-zone";

describe("resolveActionZone", () => {
  it("should return READY at or above ready threshold", () => {
    expect(resolveActionZone(91)).toBe(ActionZone.READY);
    expect(resolveActionZone(80)).toBe(ActionZone.READY);
  });

  it("should return ATTENTION between attention and ready", () => {
    expect(resolveActionZone(78)).toBe(ActionZone.ATTENTION);
    expect(resolveActionZone(70)).toBe(ActionZone.ATTENTION);
  });

  it("should return DEGRADED between degraded and attention", () => {
    expect(resolveActionZone(64)).toBe(ActionZone.DEGRADED);
    expect(resolveActionZone(50)).toBe(ActionZone.DEGRADED);
  });

  it("should return CRITICAL below degraded", () => {
    expect(resolveActionZone(45)).toBe(ActionZone.CRITICAL);
    expect(resolveActionZone(0)).toBe(ActionZone.CRITICAL);
  });

  it("should respect custom thresholds", () => {
    const strict = { ready: 90, attention: 80, degraded: 60 };
    expect(resolveActionZone(85, strict)).toBe(ActionZone.ATTENTION);
  });
});

describe("action triggers", () => {
  it("should notify manager only when degraded or critical", () => {
    expect(shouldNotifyManager(ActionZone.READY)).toBe(false);
    expect(shouldNotifyManager(ActionZone.ATTENTION)).toBe(false);
    expect(shouldNotifyManager(ActionZone.DEGRADED)).toBe(true);
    expect(shouldNotifyManager(ActionZone.CRITICAL)).toBe(true);
  });

  it("should block new mission only when critical", () => {
    expect(shouldBlockNewMission(ActionZone.DEGRADED)).toBe(false);
    expect(shouldBlockNewMission(ActionZone.CRITICAL)).toBe(true);
  });
});

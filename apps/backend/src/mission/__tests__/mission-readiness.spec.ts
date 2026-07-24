import { Allocation } from "../mission.compute";
import { assessMissionReadiness } from "../mission-readiness";

function allocation(sku: string, required: number, allocated: number): Allocation {
  return {
    sku,
    itemName: sku,
    unit: "đơn vị",
    required,
    allocated,
    shortage: required - allocated,
    batches: [],
  };
}

describe("assessMissionReadiness", () => {
  it("returns ready when every required item is fully allocated", () => {
    const result = assessMissionReadiness([
      allocation("WATER-01", 100, 100),
      allocation("LIFEJACKET-ADULT", 20, 20),
    ]);

    expect(result.status).toBe("READY");
    expect(result.fulfillment).toBe(100);
    expect(result.blockers).toHaveLength(0);
  });

  it("returns needs action when an item is only partially fulfilled", () => {
    const result = assessMissionReadiness([
      allocation("WATER-01", 100, 80),
      allocation("LIFEJACKET-ADULT", 20, 20),
    ]);

    expect(result.status).toBe("NEEDS_ACTION");
    expect(result.fulfillment).toBe(80);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ sku: "WATER-01", status: "NEEDS_ACTION", shortage: 20 }),
    );
  });

  it("blocks dispatch when an essential item has no eligible stock", () => {
    const result = assessMissionReadiness(
      [allocation("LIFEJACKET-ADULT", 20, 0)],
      new Map([["LIFEJACKET-ADULT", ["Lô hiện có nằm trên kệ bị khóa", "Lô khác đã hết hạn"]]]),
    );

    expect(result.status).toBe("NOT_DISPATCHABLE");
    expect(result.fulfillment).toBe(0);
    expect(result.blockers[0]).toEqual(expect.objectContaining({ sku: "LIFEJACKET-ADULT" }));
    expect(result.blockers[0].reasons).toContain("Lô hiện có nằm trên kệ bị khóa");
  });
});

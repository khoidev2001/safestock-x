import { ReadinessService } from "../readiness.service";

describe("ReadinessService best-effort retry", () => {
  it("returns true when a derived recalculation succeeds", async () => {
    const service = new ReadinessService({} as never, {} as never);
    jest
      .spyOn(service, "recalculateWarehouse")
      .mockResolvedValue({ warehouseId: "warehouse-1" } as never);
    await expect(service.recalculateWarehouseBestEffort("warehouse-1", "test")).resolves.toBe(true);
  });

  it("returns false without turning a caller mutation into a readiness failure", async () => {
    const service = new ReadinessService({} as never, {} as never);
    jest
      .spyOn(service, "recalculateWarehouse")
      .mockRejectedValue(new Error("database unavailable"));
    await expect(service.recalculateWarehouseBestEffort("warehouse-1", "test")).resolves.toBe(
      false,
    );
  });
});

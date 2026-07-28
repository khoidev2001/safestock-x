import { Logger } from "@nestjs/common";
import {
  isReadinessStale,
  ReadinessService,
} from "../readiness.service";

describe("readiness freshness", () => {
  it("marks scores older than fifteen minutes as stale", () => {
    const now = new Date("2026-07-27T12:30:00.000Z");
    expect(
      isReadinessStale(new Date("2026-07-27T12:14:59.999Z"), now),
    ).toBe(true);
    expect(
      isReadinessStale(new Date("2026-07-27T12:15:00.000Z"), now),
    ).toBe(false);
  });
});

describe("ReadinessService best-effort retry", () => {
  it("retries a transient recalculation failure and reports success", async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new ReadinessService({} as never, {} as never);
    jest
      .spyOn(
        service as unknown as {
          recalculateWarehouseOnce: () => Promise<unknown>;
        },
        "recalculateWarehouseOnce",
      )
      .mockRejectedValueOnce(new Error("transient-1"))
      .mockRejectedValueOnce(new Error("transient-2"))
      .mockResolvedValueOnce({ warehouseId: "warehouse-1" } as never);

    await expect(
      service.recalculateWarehouse("warehouse-1"),
    ).resolves.toEqual({ warehouseId: "warehouse-1" });
    expect(
      (
        service as unknown as {
          recalculateWarehouseOnce: jest.Mock;
        }
      ).recalculateWarehouseOnce,
    ).toHaveBeenCalledTimes(3);
  });

  it("throws after the bounded retry budget is exhausted", async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new ReadinessService({} as never, {} as never);
    jest
      .spyOn(
        service as unknown as {
          recalculateWarehouseOnce: () => Promise<unknown>;
        },
        "recalculateWarehouseOnce",
      )
      .mockRejectedValue(new Error("database unavailable"));

    await expect(
      service.recalculateWarehouse("warehouse-1"),
    ).rejects.toThrow("database unavailable");
    expect(
      (
        service as unknown as {
          recalculateWarehouseOnce: jest.Mock;
        }
      ).recalculateWarehouseOnce,
    ).toHaveBeenCalledTimes(3);
  });
});

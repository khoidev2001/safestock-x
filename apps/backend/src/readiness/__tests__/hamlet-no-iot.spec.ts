import { ReadinessService } from "../readiness.service";

describe("ReadinessService — kho thôn không có IoT", () => {
  it("bỏ qua mọi thiết bị cũ khi gom môi trường cho kho thôn", async () => {
    const prisma = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ kind: "HAMLET" }),
      },
      virtualDevice: {
        findMany: jest.fn(),
      },
    };
    const service = new ReadinessService(prisma as never, {} as never);

    const environments = await (
      service as unknown as {
        loadZoneEnvironments(warehouseId: string, now: Date): Promise<Map<string, unknown>>;
      }
    ).loadZoneEnvironments("warehouse-hamlet", new Date("2026-07-27T08:00:00Z"));

    expect(environments.size).toBe(0);
    expect(prisma.virtualDevice.findMany).not.toHaveBeenCalled();
  });
});

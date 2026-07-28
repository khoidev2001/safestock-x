import { seedDevices } from "../../../prisma/seed-support";

describe("seedDevices — phạm vi IoT", () => {
  it("chỉ đăng ký thiết bị cho kho trung tâm, không tạo IoT ở kho thôn", async () => {
    let nextId = 1;
    const prisma = {
      virtualDevice: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: `device-${nextId++}`,
        })),
      },
    };

    await seedDevices(prisma as never, {
      centralWarehouse: { id: "warehouse-central" } as never,
      centralZones: new Map(),
      centralShelves: new Map(),
    });

    const warehouseIds = prisma.virtualDevice.create.mock.calls.map(
      ([input]) => input.data.warehouseId,
    );
    const deviceCodes = prisma.virtualDevice.create.mock.calls.map(([input]) => input.data.code);
    expect(warehouseIds.length).toBeGreaterThan(0);
    expect(new Set(warehouseIds)).toEqual(new Set(["warehouse-central"]));
    expect(deviceCodes).toEqual(
      expect.arrayContaining([
        "door_main",
        "gateway_01",
        "smoke_main",
        "power_main",
        "rfid_main",
        "camera_main",
      ]),
    );
  });
});

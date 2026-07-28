import { MissionService } from "../mission.service";

describe("warehouse route snapshot", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-27T04:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("stores graph provenance and both endpoints with the route result", async () => {
    const service = Object.create(MissionService.prototype) as unknown as {
      prisma: unknown;
      localRouting: unknown;
      warehouseEtas: (mission: unknown) => Promise<unknown[]>;
    };
    service.prisma = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ communeId: "dong-xuan" }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "warehouse-1",
            name: "Kho trung tâm",
            kind: "CENTRAL",
            lat: 13.3667,
            lng: 109.0333,
          },
        ]),
      },
    };
    service.localRouting = {
      route: jest.fn().mockResolvedValue({
        status: "ROUTED",
        geometry: {
          type: "LineString",
          coordinates: [
            [109.0333, 13.3667],
            [109.08, 13.42],
          ],
        },
        distanceKm: 16.6,
        etaMinutes: 22,
        engine: "local-osrm",
        graphVersion: "dong-xuan-2026-07-27",
      }),
    };

    const [warehouse] = await service.warehouseEtas({
      warehouseId: "warehouse-1",
      incidentLat: 13.42,
      incidentLng: 109.08,
      requirements: [
        {
          sku: "WATER-01",
          itemName: "Nước uống",
          unit: "thùng",
          allocations: [{ warehouseId: "warehouse-1", qty: 5 }],
        },
      ],
    });

    expect(warehouse).toMatchObject({
      routeStatus: "ROUTED",
      graphVersion: "dong-xuan-2026-07-27",
      routeProvenance: {
        engine: "local-osrm",
        graphVersion: "dong-xuan-2026-07-27",
        calculatedAt: "2026-07-27T04:00:00.000Z",
        origin: { lat: 13.3667, lng: 109.0333 },
        destination: { lat: 13.42, lng: 109.08 },
      },
    });
  });
});

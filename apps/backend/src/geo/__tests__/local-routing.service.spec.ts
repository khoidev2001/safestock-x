import { ConfigService } from "@nestjs/config";
import { LocalRoutingService } from "../local-routing.service";

describe("LocalRoutingService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("reports engine unavailable when no LAN routing URL is configured", async () => {
    const service = new LocalRoutingService({ get: jest.fn() } as unknown as ConfigService);

    await expect(
      service.route({ lat: 13.3, lng: 109 }, { lat: 13.4, lng: 109.1 }),
    ).resolves.toEqual({
      status: "ENGINE_UNAVAILABLE",
      geometry: null,
      distanceKm: null,
      etaMinutes: null,
      engine: "local-osrm",
      graphVersion: null,
    });
  });

  it("fails closed when the graph version is missing or still a placeholder", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const missingVersion = new LocalRoutingService({
      get: jest.fn((key: string) => (key === "LOCAL_ROUTING_URL" ? "http://osrm:5000" : null)),
    } as unknown as ConfigService);
    const placeholderVersion = new LocalRoutingService({
      get: jest.fn((key: string) =>
        key === "LOCAL_ROUTING_URL" ? "http://osrm:5000" : "dong-xuan-unconfigured",
      ),
    } as unknown as ConfigService);

    await expect(
      missingVersion.route({ lat: 13.3, lng: 109 }, { lat: 13.4, lng: 109.1 }),
    ).resolves.toMatchObject({
      status: "ENGINE_UNAVAILABLE",
      geometry: null,
      graphVersion: null,
    });
    await expect(
      placeholderVersion.route({ lat: 13.3, lng: 109 }, { lat: 13.4, lng: 109.1 }),
    ).resolves.toMatchObject({
      status: "ENGINE_UNAVAILABLE",
      geometry: null,
      graphVersion: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps OSRM road geometry and metrics", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        code: "Ok",
        routes: [
          {
            distance: 2450,
            duration: 480,
            geometry: {
              type: "LineString",
              coordinates: [
                [109, 13.3],
                [109.1, 13.4],
              ],
            },
          },
        ],
      }),
    } as unknown as Response);
    const service = new LocalRoutingService({
      get: jest.fn((key: string) =>
        key === "LOCAL_ROUTING_URL" ? "http://osrm:5000" : "dong-xuan-v1",
      ),
    } as unknown as ConfigService);

    await expect(
      service.route({ lat: 13.3, lng: 109 }, { lat: 13.4, lng: 109.1 }),
    ).resolves.toMatchObject({
      status: "ROUTED",
      distanceKm: 2.5,
      // 2,5km trong 480s = 18,75km/h, đã chậm hơn trần 30km/h nên giữ ước lượng của
      // OSRM (8 phút chạy) rồi cộng phụ phí mỗi chuyến 4 phút. Xem `relief-eta.ts`.
      etaMinutes: 12,
      geometry: {
        type: "LineString",
        coordinates: [
          [109, 13.3],
          [109.1, 13.4],
        ],
      },
      graphVersion: "dong-xuan-v1",
    });
  });

  it("never invents a line when OSRM has no route", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ code: "NoRoute", routes: [] }),
    } as unknown as Response);
    const service = new LocalRoutingService({
      get: jest.fn((key: string) =>
        key === "LOCAL_ROUTING_URL" ? "http://osrm:5000" : "dong-xuan-v1",
      ),
    } as unknown as ConfigService);

    await expect(
      service.route({ lat: 13.3, lng: 109 }, { lat: 13.4, lng: 109.1 }),
    ).resolves.toMatchObject({
      status: "ROUTE_NOT_FOUND",
      geometry: null,
      distanceKm: null,
      etaMinutes: null,
    });
  });
});

import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { GeoService } from "../geo.service";
import { LatLng } from "../haversine";

const A: LatLng = { lat: 12.6667, lng: 108.0382 };
const dest: LatLng = { lat: 12.6265, lng: 108.0855 };

function makeConfig(over: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    GEO_MONTHLY_CAP: "8500",
    GEO_ASSUMED_SPEED_KMH: "30",
    ...over,
  };
  return { get: (k: string) => values[k] } as ConfigService;
}

describe("GeoService — không có key", () => {
  it("luôn dùng Haversine khi thiếu GOOGLE_MAPS_API_KEY", async () => {
    const prisma = { apiUsage: { findUnique: jest.fn() } } as unknown as PrismaService;
    const geo = new GeoService(makeConfig(), prisma);

    const [r] = await geo.distanceAndEta([A], dest);
    expect(r.source).toBe("haversine");
    expect(r.km).toBeGreaterThan(0);
    // Không đụng DB khi không có key.
    expect(prisma.apiUsage.findUnique).not.toHaveBeenCalled();
  });

  it("origins rỗng → mảng rỗng", async () => {
    const prisma = {} as PrismaService;
    const geo = new GeoService(makeConfig(), prisma);
    expect(await geo.distanceAndEta([], dest)).toEqual([]);
  });
});

describe("GeoService — có key nhưng chạm quota", () => {
  it("counter ≥ cap → fallback Haversine, KHÔNG gọi Google", async () => {
    const prisma = {
      apiUsage: {
        findUnique: jest.fn().mockResolvedValue({ count: 8500 }),
        upsert: jest.fn(),
      },
    } as unknown as PrismaService;
    const geo = new GeoService(makeConfig({ GOOGLE_MAPS_API_KEY: "fake" }), prisma);
    const fetchSpy = jest.spyOn(global, "fetch");

    const [r] = await geo.distanceAndEta([A], dest);
    expect(r.source).toBe("haversine");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.apiUsage.upsert).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

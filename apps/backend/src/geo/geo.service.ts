import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { estimateEtaMinutes, haversineKm, LatLng } from "./haversine";

export interface DistanceResult {
  km: number;
  etaMinutes: number;
  source: "google" | "haversine";
}

const GOOGLE_PROVIDER = "google-routes";

/**
 * Khoảng cách + ETA từ nhiều kho tới 1 điểm nạn.
 * Google Routes làm chính (chính xác đường bộ VN); Haversine fallback khi:
 * mất mạng / không có key / đã chạm quota tháng. 2 lớp chặn quota → không bị trừ tiền:
 *  - app tự lùi Haversine khi counter ≥ GEO_MONTHLY_CAP (mặc định 8500)
 *  - Google Cloud Console đặt hard cap 9000 (< free tier 10000) — ngoài code.
 */
@Injectable()
export class GeoService {
  private readonly log = new Logger(GeoService.name);
  private readonly apiKey: string | undefined;
  private readonly monthlyCap: number;
  private readonly assumedSpeedKmh: number;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = config.get("GOOGLE_MAPS_API_KEY") || undefined;
    this.monthlyCap = Number(config.get("GEO_MONTHLY_CAP") ?? 8500);
    this.assumedSpeedKmh = Number(config.get("GEO_ASSUMED_SPEED_KMH") ?? 30);
  }

  /** Khoảng cách + ETA mỗi origin → dest, cùng thứ tự origins đưa vào. */
  async distanceAndEta(origins: LatLng[], dest: LatLng): Promise<DistanceResult[]> {
    if (origins.length === 0) return [];

    if (await this.canUseGoogle(origins.length)) {
      try {
        const viaGoogle = await this.googleRouteMatrix(origins, dest);
        await this.bumpUsage(origins.length);
        return viaGoogle;
      } catch (error) {
        this.log.warn(`Google Routes lỗi, fallback Haversine: ${(error as Error).message}`);
      }
    }
    return origins.map((o) => this.viaHaversine(o, dest));
  }

  private viaHaversine(origin: LatLng, dest: LatLng): DistanceResult {
    const km = haversineKm(origin, dest);
    return {
      km: Math.round(km * 10) / 10,
      etaMinutes: estimateEtaMinutes(km, this.assumedSpeedKmh),
      source: "haversine",
    };
  }

  /** Còn được gọi Google không: có key + chưa chạm cap tháng. */
  private async canUseGoogle(elements: number): Promise<boolean> {
    if (!this.apiKey) return false;
    const used = await this.currentUsage();
    return used + elements <= this.monthlyCap;
  }

  private yearMonth(): string {
    // Không dùng new Date() động ở test; ở runtime OK. Format YYYY-MM.
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  private async currentUsage(): Promise<number> {
    const row = await this.prisma.apiUsage.findUnique({
      where: { provider_yearMonth: { provider: GOOGLE_PROVIDER, yearMonth: this.yearMonth() } },
    });
    return row?.count ?? 0;
  }

  private async bumpUsage(by: number): Promise<void> {
    const yearMonth = this.yearMonth();
    await this.prisma.apiUsage.upsert({
      where: { provider_yearMonth: { provider: GOOGLE_PROVIDER, yearMonth } },
      create: { provider: GOOGLE_PROVIDER, yearMonth, count: by },
      update: { count: { increment: by } },
    });
  }

  /** Google Routes Compute Route Matrix: n origins × 1 dest. */
  private async googleRouteMatrix(origins: LatLng[], dest: LatLng): Promise<DistanceResult[]> {
    const url =
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
    const body = {
      origins: origins.map((o) => ({
        waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
      })),
      destinations: [
        { waypoint: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } } },
      ],
      travelMode: "DRIVE",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey as string,
        "X-Goog-FieldMask": "originIndex,distanceMeters,duration",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

    // Trả về mảng phần tử {originIndex, distanceMeters, duration:"123s"}.
    const rows = (await response.json()) as {
      originIndex: number;
      distanceMeters?: number;
      duration?: string;
    }[];

    const byIndex = new Map(rows.map((r) => [r.originIndex, r]));
    return origins.map((o, i) => {
      const row = byIndex.get(i);
      if (!row || row.distanceMeters == null) return this.viaHaversine(o, dest);
      const km = Math.round((row.distanceMeters / 1000) * 10) / 10;
      const seconds = row.duration ? parseInt(row.duration.replace("s", ""), 10) : 0;
      return { km, etaMinutes: Math.round(seconds / 60), source: "google" as const };
    });
  }
}

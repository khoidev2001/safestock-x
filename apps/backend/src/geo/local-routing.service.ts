import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LatLng } from "./haversine";
import { reliefEtaAssumptions, reliefEtaMinutes, type ReliefEtaAssumptions } from "./relief-eta";

export type LocalRouteStatus = "ROUTED" | "ENGINE_UNAVAILABLE" | "ROUTE_NOT_FOUND" | "TIMEOUT";

export interface LocalRouteResult {
  status: LocalRouteStatus;
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  engine: "local-osrm";
  graphVersion: string | null;
}

/** Adapter OSRM chạy trong LAN. Không fallback Google/Haversine và không vẽ đường thẳng giả. */
@Injectable()
export class LocalRoutingService {
  private readonly log = new Logger(LocalRoutingService.name);
  private readonly baseUrl: string | null;
  private readonly graphVersion: string | null;
  /**
   * ETA không lấy thẳng `duration` của OSRM: đó là tốc độ xe con chạy thông thoáng.
   * Xem `relief-eta.ts` để biết vì sao và mô hình thay thế.
   */
  private readonly etaAssumptions: ReliefEtaAssumptions;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("LOCAL_ROUTING_URL")?.replace(/\/$/, "") || null;
    const configuredGraphVersion =
      config.get<string>("LOCAL_ROUTING_GRAPH_VERSION")?.trim() || null;
    this.graphVersion =
      configuredGraphVersion &&
      !/(unconfigured|placeholder|unknown|replace[-_ ]?me|todo)/i.test(configuredGraphVersion)
        ? configuredGraphVersion
        : null;
    this.etaAssumptions = reliefEtaAssumptions((key) => config.get(key));
  }

  async route(origin: LatLng, destination: LatLng): Promise<LocalRouteResult> {
    if (!this.baseUrl || !this.graphVersion) {
      return this.failure("ENGINE_UNAVAILABLE");
    }
    const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `${this.baseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        this.log.warn(`Local OSRM HTTP ${response.status}`);
        return this.failure(response.status === 400 ? "ROUTE_NOT_FOUND" : "ENGINE_UNAVAILABLE");
      }
      const payload = (await response.json()) as {
        code?: string;
        routes?: {
          distance?: number;
          duration?: number;
          geometry?: { type?: string; coordinates?: unknown };
        }[];
      };
      const route = payload.routes?.[0];
      if (
        payload.code !== "Ok" ||
        !route ||
        route.geometry?.type !== "LineString" ||
        !isLineStringCoordinates(route.geometry.coordinates)
      ) {
        return this.failure("ROUTE_NOT_FOUND");
      }
      const distanceKm =
        route.distance == null ? null : Math.round((route.distance / 1000) * 10) / 10;
      return {
        status: "ROUTED",
        geometry: { type: "LineString", coordinates: route.geometry.coordinates },
        distanceKm,
        // Cố ý tính từ `distanceKm` đã làm tròn, không từ mét thô: đây đúng là con
        // số hiện cạnh ETA trên màn hình, nên hai thứ phải khớp nhau khi người dùng
        // tự nhẩm lại.
        etaMinutes: reliefEtaMinutes(distanceKm, route.duration ?? null, this.etaAssumptions),
        engine: "local-osrm",
        graphVersion: this.graphVersion,
      };
    } catch (error) {
      const status =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "TIMEOUT"
          : "ENGINE_UNAVAILABLE";
      this.log.warn(`Local OSRM lỗi: ${(error as Error).message}`);
      return this.failure(status);
    }
  }

  private failure(status: Exclude<LocalRouteStatus, "ROUTED">): LocalRouteResult {
    return {
      status,
      geometry: null,
      distanceKm: null,
      etaMinutes: null,
      engine: "local-osrm",
      graphVersion: this.graphVersion,
    };
  }
}

function isLineStringCoordinates(value: unknown): value is [number, number][] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
  );
}

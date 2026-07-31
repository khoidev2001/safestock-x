export const GEO_REFERENCE_REGISTRY_VERSION = "dong-xuan-geo-reference-2026.07.28" as const;

export type GeoReferenceKind = "BRIDGE" | "ROAD";

export interface GeoReference {
  id: string;
  label: string;
  kind: GeoReferenceKind;
  aliases: readonly string[];
  anchor?: { lat: number; lng: number };
}

export interface RouteReferenceSnapshot {
  routeId: string;
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  roadRefs: string[];
}

export type GeoRouteResolution =
  | { status: "NO_REFERENCE" }
  | { status: "MATCHED"; reference: GeoReference; routeIds: string[] }
  | { status: "MISSING_TOPOLOGY"; reference: GeoReference };

const REFERENCES: readonly GeoReference[] = [
  {
    id: "dx-bridge-la-hai",
    label: "Cầu La Hai",
    kind: "BRIDGE",
    aliases: ["cầu la hai", "la hai bridge"],
    anchor: { lat: 13.3721288, lng: 109.1122399 },
  },
  {
    id: "xl-bridge-da-chat",
    label: "Cầu Đá Chát",
    kind: "BRIDGE",
    aliases: ["cầu đá chát", "da chat bridge"],
    anchor: { lat: 13.4771939, lng: 109.0363351 },
  },
  {
    id: "ext-bridge-tam-giang",
    label: "Cầu Tam Giang",
    kind: "BRIDGE",
    aliases: ["cầu tam giang"],
    anchor: { lat: 13.4483714, lng: 109.2168327 },
  },
  {
    id: "tab-bridge-song-cai",
    label: "Cầu Sông Cái Phú Yên",
    kind: "BRIDGE",
    aliases: ["cầu sông cái", "cầu sông cái phú yên"],
    anchor: { lat: 13.3308304, lng: 109.1983194 },
  },
  {
    id: "road-dt641",
    label: "ĐT641",
    kind: "ROAD",
    aliases: ["đt641", "đường tỉnh 641"],
  },
  {
    id: "road-tl642",
    label: "TL 642",
    kind: "ROAD",
    aliases: ["tl642", "tl 642", "đt642", "dt642", "tỉnh lộ 642"],
  },
  {
    id: "road-ql19c",
    label: "QL19C",
    kind: "ROAD",
    aliases: ["ql19c", "quốc lộ 19c"],
  },
  {
    id: "road-dt644",
    label: "ĐT644",
    kind: "ROAD",
    aliases: ["đt644", "đường tỉnh 644"],
  },
  {
    id: "road-dt647",
    label: "Đường tỉnh 647",
    kind: "ROAD",
    aliases: ["đt647", "dt647", "đường tỉnh 647"],
  },
] as const;

const BRIDGE_ROUTE_BUFFER_METERS = 750;

export function resolveGeoRouteReference(
  sourceText: string,
  routes: RouteReferenceSnapshot[],
): GeoRouteResolution {
  const reference = findReference(sourceText);
  if (!reference) return { status: "NO_REFERENCE" };

  const routeIds = routes
    .filter((route) => routeMatchesReference(route, reference))
    .map((route) => route.routeId);
  if (routeIds.length > 0) return { status: "MATCHED", reference, routeIds };
  return { status: "MISSING_TOPOLOGY", reference };
}

export function parseRouteReferenceSnapshots(value: unknown): RouteReferenceSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.routeId !== "string" || !entry.routeId.trim()) return [];
    const geometry = parseGeometry(entry.geometry);
    const roadRefs = Array.isArray(entry.roadRefs)
      ? entry.roadRefs.filter(
          (item): item is string => typeof item === "string" && Boolean(item.trim()),
        )
      : [];
    return [{ routeId: entry.routeId.trim(), geometry, roadRefs }];
  });
}

export function listGeoReferences(): readonly GeoReference[] {
  return REFERENCES;
}

function findReference(sourceText: string): GeoReference | null {
  const normalized = fold(sourceText);
  const matches = REFERENCES.filter((reference) =>
    reference.aliases.some((alias) => containsPhrase(normalized, fold(alias))),
  );
  return matches.length === 1 ? matches[0] : null;
}

function routeMatchesReference(route: RouteReferenceSnapshot, reference: GeoReference): boolean {
  if (reference.kind === "ROAD") {
    const normalizedRefs = route.roadRefs.map(fold);
    return normalizedRefs.some(
      (roadRef) =>
        roadRef === fold(reference.id) ||
        roadRef === fold(reference.label) ||
        reference.aliases.some((alias) => roadRef === fold(alias)),
    );
  }
  if (!reference.anchor || !route.geometry) return false;
  return (
    lineDistanceMeters(route.geometry.coordinates, reference.anchor) <= BRIDGE_ROUTE_BUFFER_METERS
  );
}

function parseGeometry(value: unknown): RouteReferenceSnapshot["geometry"] {
  if (!isRecord(value) || value.type !== "LineString" || !Array.isArray(value.coordinates))
    return null;
  const coordinates = value.coordinates.filter(
    (point): point is [number, number] =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

function lineDistanceMeters(
  coordinates: [number, number][],
  point: { lat: number; lng: number },
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    minimum = Math.min(
      minimum,
      segmentDistanceMeters(coordinates[index - 1], coordinates[index], point),
    );
  }
  return minimum;
}

function segmentDistanceMeters(
  start: [number, number],
  end: [number, number],
  point: { lat: number; lng: number },
): number {
  const latitudeRadians = (point.lat * Math.PI) / 180;
  const metersPerLongitudeDegree = 111_320 * Math.cos(latitudeRadians);
  const metersPerLatitudeDegree = 110_540;
  const ax = (start[0] - point.lng) * metersPerLongitudeDegree;
  const ay = (start[1] - point.lat) * metersPerLatitudeDegree;
  const bx = (end[0] - point.lng) * metersPerLongitudeDegree;
  const by = (end[1] - point.lat) * metersPerLatitudeDegree;
  const abx = bx - ax;
  const aby = by - ay;
  const denominator = abx * abx + aby * aby;
  const ratio =
    denominator === 0 ? 0 : Math.max(0, Math.min(1, -(ax * abx + ay * aby) / denominator));
  return Math.hypot(ax + ratio * abx, ay + ratio * aby);
}

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text.replace(/[^a-z0-9]+/g, " ")} `.includes(
    ` ${phrase.replace(/[^a-z0-9]+/g, " ")} `,
  );
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

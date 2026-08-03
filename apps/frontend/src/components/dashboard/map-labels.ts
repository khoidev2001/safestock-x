import type { AdminWarehouse } from "../../lib/warehouse-api";
import type { MapMarkerKind } from "./map-markers";

export const COMMUNE_LABEL_MIN_ZOOM = 10;
export const PLACE_LABEL_MIN_ZOOM = 13;

export interface PlaceFeature {
  type?: "Feature";
  properties: {
    name: string;
    displayName?: string;
    group: string;
    kind?: string;
    osmId?: string;
    communeName?: string;
  };
  geometry: { type: "Point"; coordinates: [number, number] };
}

export interface CommuneLabel {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface LabelCandidate {
  id: string;
  category: "warehouse" | "commune" | "place";
  lat: number;
  lng: number;
  label: string;
  markerKind?: MapMarkerKind;
  priority: number;
  minZoom: number;
  maxZoom?: number;
  estimatedWidth: number;
  estimatedHeight: number;
  anchor: "center" | "marker-top" | "icon-right";
  warehouse?: AdminWarehouse;
  place?: PlaceFeature;
}

export interface ScreenLabelCandidate extends LabelCandidate {
  rect: ScreenRect;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GeoData {
  type: "FeatureCollection";
  features: unknown[];
}

export function buildLabelCandidates({
  communes,
  places,
  warehouses,
}: {
  communes: CommuneLabel[];
  places: PlaceFeature[];
  warehouses: AdminWarehouse[];
}): LabelCandidate[] {
  const candidates: LabelCandidate[] = [];

  for (const warehouse of warehouses) {
    if (warehouse.lat == null || warehouse.lng == null) continue;
    const central = warehouse.kind === "CENTRAL";
    candidates.push({
      id: `warehouse:${warehouse.id}`,
      category: "warehouse",
      lat: warehouse.lat,
      lng: warehouse.lng,
      label: formatWarehouseLabel(warehouse),
      markerKind: central ? "central-warehouse" : "hamlet-warehouse",
      priority: central ? 1000 : 900,
      minZoom: central ? 10 : 12,
      estimatedWidth: estimateTextWidth(formatWarehouseLabel(warehouse), central ? 13 : 12, 700),
      estimatedHeight: 22,
      anchor: "marker-top",
      warehouse,
    });
  }

  for (const commune of communes) {
    candidates.push({
      id: `commune:${commune.id}`,
      category: "commune",
      lat: commune.lat,
      lng: commune.lng,
      label: commune.name,
      priority: 800,
      minZoom: COMMUNE_LABEL_MIN_ZOOM,
      estimatedWidth: estimateTextWidth(commune.name, 14, 800),
      estimatedHeight: 22,
      anchor: "center",
    });
  }

  for (const place of places) {
    if (!isShownPlaceGroup(place.properties.group)) continue;
    const [lng, lat] = place.geometry.coordinates;
    const markerKind = placeMarkerKind(place.properties.group);
    const label = formatPlaceLabel(place);
    candidates.push({
      id: `place:${place.properties.osmId ?? `${label}:${lat}:${lng}`}`,
      category: "place",
      lat,
      lng,
      label,
      markerKind,
      priority: markerKind === "place" ? 600 : markerKind === "health" ? 500 : 400,
      minZoom: markerKind === "place" ? PLACE_LABEL_MIN_ZOOM : 14,
      estimatedWidth: estimateTextWidth(label, markerKind === "place" ? 12.5 : 11.5, 600),
      estimatedHeight: 20,
      anchor: "icon-right",
      place,
    });
  }

  return candidates;
}

export function selectVisibleLabels(
  candidates: LabelCandidate[],
  project: (lat: number, lng: number) => { x: number; y: number },
  zoom: number,
  viewport: { width: number; height: number },
): ScreenLabelCandidate[] {
  const projected = candidates
    .filter(
      (candidate) =>
        zoom >= candidate.minZoom && (candidate.maxZoom == null || zoom <= candidate.maxZoom),
    )
    .map((candidate) => {
      const point = project(candidate.lat, candidate.lng);
      return { ...candidate, rect: candidateRect(candidate, point.x, point.y) };
    })
    .filter(({ rect }) => intersectsViewport(rect, viewport))
    .sort(compareCandidates);

  const accepted: ScreenLabelCandidate[] = [];
  for (const candidate of projected) {
    if (accepted.some((other) => rectanglesOverlap(candidate.rect, other.rect))) continue;
    accepted.push(candidate);
  }
  return accepted;
}

export function computeCommuneLabels(geo: GeoData): CommuneLabel[] {
  const labels: CommuneLabel[] = [];
  const features = (geo.features ?? []) as Array<{
    properties?: { name?: string; fullName?: string; osmId?: number };
    geometry?: { type: string; coordinates: unknown };
  }>;
  for (let index = 0; index < features.length; index++) {
    const feature = features[index];
    const name = feature.properties?.fullName ?? feature.properties?.name;
    if (!name || !feature.geometry) continue;
    const center = polygonLabelPoint(feature.geometry);
    if (!center) continue;
    labels.push({
      id: String(feature.properties?.osmId ?? `${name}-${index}`),
      name,
      lat: center[1],
      lng: center[0],
    });
  }
  return labels;
}

/**
 * Kho trung tâm giữ tên đầy đủ vì chỉ có một, và nó là gốc của mọi chuyến hàng.
 * Kho thôn rút về đúng tên thôn: 17 nhãn "Kho thôn ..." lặp lại chỉ tổ chiếm chỗ,
 * người xem cần biết đó là thôn nào chứ không cần nhắc lại đó là cái kho.
 */
export function formatWarehouseLabel(warehouse: AdminWarehouse): string {
  if (warehouse.kind === "CENTRAL") {
    return /^Kho\s/u.test(warehouse.name) ? warehouse.name : `Kho tổng xã ${warehouse.name}`;
  }
  return warehouse.name.replace(/^Kho\s+thôn\s+/iu, "");
}

export function formatPlaceLabel(feature: PlaceFeature): string {
  const properties = feature.properties;
  if (properties.displayName) return properties.displayName;
  const prefix = settlementPrefix(properties.kind);
  const name =
    properties.group === "place" && prefix && !hasKnownPrefix(properties.name)
      ? `${prefix} ${properties.name}`
      : properties.name;
  return properties.communeName ? `${name} · ${properties.communeName}` : name;
}

/**
 * Nhóm địa danh được vẽ lên bản đồ điều phối — hiện KHÔNG nhóm nào.
 *
 * Bản đồ điều phối chỉ để trả lời một câu: hàng đang ở đâu và chở đi đâu. Trạm y
 * tế, trường học, trụ sở, chợ, cơ sở tôn giáo và cả tên thôn/xóm đều bị bỏ vì
 * chúng phủ kín màn hình bằng thứ không dùng để ra quyết định. Nền tile vẫn có
 * sẵn tên địa danh cho ai cần định hướng.
 *
 * Dữ liệu còn nguyên trong daklak-places.geojson; muốn bật lại nhóm nào chỉ cần
 * thêm vào đây.
 */
const SHOWN_PLACE_GROUPS = new Set<string>();

export function isShownPlaceGroup(group: string): boolean {
  return SHOWN_PLACE_GROUPS.has(group);
}

export function placeMarkerKind(group: string): MapMarkerKind {
  if (group === "place" || group === "health" || group === "school" || group === "civic") {
    return group;
  }
  if (group === "commerce" || group === "worship") return group;
  return "poi";
}

export function compareCandidates(a: LabelCandidate, b: LabelCandidate): number {
  return b.priority - a.priority || a.id.localeCompare(b.id, "vi");
}

export function rectanglesOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function candidateRect(candidate: LabelCandidate, x: number, y: number): ScreenRect {
  const width = candidate.estimatedWidth;
  const height = candidate.estimatedHeight;
  if (candidate.anchor === "marker-top") {
    return { left: x - width / 2, top: y - 52, right: x + width / 2, bottom: y - 30 };
  }
  if (candidate.anchor === "icon-right") {
    return { left: x - 14, top: y - height / 2, right: x + width + 18, bottom: y + height / 2 };
  }
  return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 };
}

function intersectsViewport(rect: ScreenRect, viewport: { width: number; height: number }) {
  return (
    rect.right >= 0 &&
    rect.bottom >= 0 &&
    rect.left <= viewport.width &&
    rect.top <= viewport.height
  );
}

function estimateTextWidth(text: string, fontSize: number, weight: number): number {
  const averageCharacterWidth = fontSize * (weight >= 700 ? 0.62 : 0.56);
  return Math.min(280, Math.max(54, text.length * averageCharacterWidth + 16));
}

function settlementPrefix(kind?: string): string | null {
  if (["hamlet", "village", "neighbourhood", "quarter"].includes(kind ?? "")) return "Thôn";
  if (kind === "town" || kind === "suburb") return "Khu vực";
  if (kind === "isolated_dwelling") return "Xóm";
  return null;
}

function hasKnownPrefix(name: string): boolean {
  return /^(Thôn|Buôn|Bon|Buôn làng|Xóm|Tổ dân phố|Khu phố|Khu vực|Địa điểm)\s/iu.test(name);
}

function polygonLabelPoint(geometry: {
  type: string;
  coordinates: unknown;
}): [number, number] | null {
  type Ring = [number, number][];
  let rings: Ring[] = [];
  if (geometry.type === "Polygon") {
    rings = (geometry.coordinates as Ring[]).slice(0, 1);
  } else if (geometry.type === "MultiPolygon") {
    rings = (geometry.coordinates as Ring[][])
      .map((polygon) => polygon[0])
      .filter((ring): ring is Ring => Boolean(ring));
  } else {
    return null;
  }
  const ring = rings.sort((a, b) => Math.abs(ringSignedArea(b)) - Math.abs(ringSignedArea(a)))[0];
  if (!ring?.length) return null;
  const sums = ring.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [sums[0] / ring.length, sums[1] / ring.length];
}

function ringSignedArea(ring: [number, number][]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

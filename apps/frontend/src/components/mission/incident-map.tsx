"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { AdminWarehouse } from "@/lib/warehouse-api";
import type { DispatchRoute } from "@/lib/mission-api";
import type { LatLng } from "@/lib/geo";
import {
  BLANK_TILE,
  CLUSTER_BOUNDS,
  CLUSTER_MIN_ZOOM,
  DEFAULT_CENTER,
  MAX_DETAIL_ZOOM,
  OFFLINE_MAX_NATIVE_ZOOM,
  OFFLINE_PACK_MIN_ZOOM,
  OFFLINE_TILE_ATTRIBUTION,
  OFFLINE_TILE_URL,
  PROVINCE_BOUNDS,
} from "@/components/dashboard/map-tiles";

function pinIcon(color: string, size = 30): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5" fill="white"/></svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function fmtDistance(km: number): string {
  return `${km.toFixed(1)} km`;
}

export interface IncidentMapProps {
  /** Kho có góp hàng cho phương án — kèm tuyến, quãng đường và danh sách vật tư. */
  warehouses: DispatchRoute[];
  /**
   * Toàn bộ kho trong xã, hiện ngay cả khi chưa lập phương án.
   *
   * Thiếu lớp này thì trước lúc bấm tính nhu cầu, bản đồ trống trơn — người dùng
   * không biết mình đang ghim gần kho nào, mà đó lại đúng là thứ cần thấy để chọn
   * điểm. Kho nào đã vào phương án thì nhường chỗ cho marker có tuyến ở trên.
   */
  baseWarehouses?: AdminWarehouse[];
  incidentPoint: LatLng | null;
  /**
   * Có thì bản đồ cho bấm/kéo để ghim điểm sự cố. Không truyền thì chỉ xem.
   * Một bản đồ làm cả hai việc: trước khi lập phương án thì chọn chỗ, sau khi
   * lập thì xem tuyến — thay vì bày hai bản đồ trống giống nhau cạnh nhau.
   */
  onPickIncident?: (point: LatLng) => void;
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export function IncidentMap({
  warehouses,
  baseWarehouses,
  incidentPoint,
  onPickIncident,
}: IncidentMapProps) {
  const centralIcon = useMemo(() => pinIcon("var(--color-accent, #2f9e6e)"), []);
  const hamletIcon = useMemo(() => pinIcon("var(--text-muted, #8a8f98)", 26), []);
  const incidentIcon = useMemo(() => pinIcon("var(--color-critical, #d64545)", 34), []);

  // Kho đã vào phương án vẽ bằng marker có tuyến; ở đây chỉ còn kho chưa tham gia.
  const otherWarehouses = useMemo(() => {
    const dispatched = new Set(warehouses.map((w) => w.id));
    return (baseWarehouses ?? []).filter(
      (w) => w.lat != null && w.lng != null && !dispatched.has(w.id),
    );
  }, [baseWarehouses, warehouses]);

  const boundsPoints = useMemo(() => {
    const pts: LatLng[] = warehouses.map((w) => ({ lat: w.lat, lng: w.lng }));
    for (const w of otherWarehouses) pts.push({ lat: w.lat as number, lng: w.lng as number });
    if (incidentPoint) pts.push(incidentPoint);
    return pts;
  }, [warehouses, otherWarehouses, incidentPoint]);

  const center = boundsPoints[0] ?? { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };

  return (
    <div className="space-y-2">
      {/* Vuông: bản đồ nằm cạnh form theo cột dọc, khung vuông giữ cân với chiều
          cao form và không bóp méo khi cột hẹp lại. */}
      <div className="aspect-square w-full overflow-hidden rounded-md border">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          minZoom={OFFLINE_PACK_MIN_ZOOM}
          maxZoom={MAX_DETAIL_ZOOM}
          maxBounds={PROVINCE_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url={OFFLINE_TILE_URL}
            attribution={OFFLINE_TILE_ATTRIBUTION}
            maxZoom={MAX_DETAIL_ZOOM}
            maxNativeZoom={OFFLINE_MAX_NATIVE_ZOOM}
            errorTileUrl={BLANK_TILE}
          />
          <BoundsForZoom />
          <FitBounds points={boundsPoints} />
          {onPickIncident ? <ClickToPin onPick={onPickIncident} /> : null}
          {/* Kho chưa tham gia phương án — vẫn phải thấy để biết ghim gần kho nào. */}
          {otherWarehouses.map((w) => (
            <Marker
              key={`base-${w.id}`}
              position={[w.lat as number, w.lng as number]}
              icon={w.kind === "CENTRAL" ? centralIcon : hamletIcon}
              opacity={0.75}
            >
              <Popup>
                <strong>{w.name}</strong>
                <br />
                {w.kind === "CENTRAL" ? "Kho tổng xã" : "Kho thôn"}
                <br />
                <span className="tabular">
                  {(w.lat as number).toFixed(5)}, {(w.lng as number).toFixed(5)}
                </span>
              </Popup>
              <Tooltip direction="right" offset={[10, -10]}>
                {w.name.replace(/^Kho\s+thôn\s+/iu, "")}
              </Tooltip>
            </Marker>
          ))}
          {warehouses.map((w, index) =>
            w.routeStatus === "ROUTED" && w.routeGeometry ? (
              <Polyline
                key={`route-${w.id}`}
                positions={w.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng])}
                pathOptions={{
                  color: ROUTE_COLORS[index % ROUTE_COLORS.length],
                  weight: 5,
                  opacity: 0.9,
                }}
              />
            ) : null,
          )}
          {warehouses.map((w) => (
            <Marker
              key={w.id}
              position={[w.lat, w.lng]}
              icon={w.kind === "CENTRAL" ? centralIcon : hamletIcon}
            >
              <Popup>
                <strong>{w.name}</strong>
                <br />
                {w.kind === "CENTRAL" ? "Kho tổng" : "Kho thôn"}
                {w.routeStatus === "ROUTED" && w.distanceKm != null ? (
                  <>
                    <br />
                    {fmtDistance(w.distanceKm)} · ~{w.etaMinutes} phút
                  </>
                ) : (
                  <>
                    <br />
                    Chưa tính được tuyến ({w.routeStatus})
                  </>
                )}
                {w.contributions.map((item) => (
                  <span key={item.sku} className="block">
                    {item.itemName}: {item.quantity} {item.unit}
                  </span>
                ))}
              </Popup>
            </Marker>
          ))}
          {incidentPoint ? (
            <Marker
              position={[incidentPoint.lat, incidentPoint.lng]}
              icon={incidentIcon}
              draggable={Boolean(onPickIncident)}
              eventHandlers={
                onPickIncident
                  ? {
                      dragend: (event) => {
                        const point = (event.target as L.Marker).getLatLng();
                        onPickIncident({ lat: point.lat, lng: point.lng });
                      },
                    }
                  : undefined
              }
            >
              <Popup>Điểm nạn</Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
        <LegendDot color="var(--color-critical, #d64545)" label="Điểm nạn" />
        <LegendDot color="var(--color-accent, #2f9e6e)" label="Kho tổng" />
        <LegendDot color="var(--text-muted, #8a8f98)" label="Kho thôn" />
        {incidentPoint ? (
          <span className="tabular">
            {incidentPoint.lat.toFixed(6)}, {incidentPoint.lng.toFixed(6)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ClickToPin({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

/** Khớp bản đồ quản trị: nhìn xa được cả tỉnh, nhìn gần bó vào vùng có ảnh chi tiết. */
function BoundsForZoom() {
  const map = useMap();
  useEffect(() => {
    const apply = () => {
      map.setMaxBounds(
        L.latLngBounds(map.getZoom() >= CLUSTER_MIN_ZOOM ? CLUSTER_BOUNDS : PROVINCE_BOUNDS),
      );
    };
    apply();
    map.on("zoomend", apply);
    return () => {
      map.off("zoomend", apply);
    };
  }, [map]);
  return null;
}

const ROUTE_COLORS = ["#2563eb", "#0284c7", "#4f46e5", "#0891b2", "#1d4ed8"];

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

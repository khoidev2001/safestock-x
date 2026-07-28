"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { DispatchRoute } from "@/lib/mission-api";
import type { LatLng } from "@/lib/geo";

const TILE_LIGHT = "/tiles/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · bản đồ offline';

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
  warehouses: DispatchRoute[];
  incidentPoint: LatLng | null;
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
  incidentPoint,
}: IncidentMapProps) {
  const centralIcon = useMemo(() => pinIcon("var(--color-accent, #2f9e6e)"), []);
  const hamletIcon = useMemo(() => pinIcon("var(--text-muted, #8a8f98)", 26), []);
  const incidentIcon = useMemo(() => pinIcon("var(--color-critical, #d64545)", 34), []);

  const boundsPoints = useMemo(() => {
    const pts: LatLng[] = warehouses.map((w) => ({ lat: w.lat, lng: w.lng }));
    if (incidentPoint) pts.push(incidentPoint);
    return pts;
  }, [warehouses, incidentPoint]);

  const center = boundsPoints[0] ?? { lat: 13.38, lng: 109.045 };

  return (
    <div className="space-y-2">
      <div className="h-[320px] overflow-hidden rounded-md border">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer url={TILE_LIGHT} attribution={TILE_ATTRIBUTION} maxZoom={15} />
          <FitBounds points={boundsPoints} />
          {warehouses.map((w, index) =>
            w.routeStatus === "ROUTED" && w.routeGeometry ? (
              <Polyline
                key={`route-${w.id}`}
                positions={w.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng])}
                pathOptions={{ color: ROUTE_COLORS[index % ROUTE_COLORS.length], weight: 5, opacity: 0.9 }}
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
                  ) : <><br />Chưa tính được tuyến ({w.routeStatus})</>}
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
      </div>
    </div>
  );
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

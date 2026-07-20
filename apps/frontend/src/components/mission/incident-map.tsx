"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { ClusterWarehouse } from "@/lib/mission-api";
import { haversineKm, type LatLng } from "@/lib/geo";

const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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

interface OfficialEntry {
  distanceKm: number;
  etaMinutes: number;
}

export interface IncidentMapProps {
  warehouses: ClusterWarehouse[];
  incidentPoint: LatLng | null;
  onPickPoint?: (point: LatLng) => void;
  officialDistances?: Map<string, OfficialEntry>;
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

function ClickPicker({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

export function IncidentMap({ warehouses, incidentPoint, onPickPoint, officialDistances }: IncidentMapProps) {
  const centralIcon = useMemo(() => pinIcon("var(--color-accent, #2f9e6e)"), []);
  const hamletIcon = useMemo(() => pinIcon("var(--text-muted, #8a8f98)", 26), []);
  const incidentIcon = useMemo(() => pinIcon("var(--color-critical, #d64545)", 34), []);

  const boundsPoints = useMemo(() => {
    const pts: LatLng[] = warehouses.map((w) => ({ lat: w.lat, lng: w.lng }));
    if (incidentPoint) pts.push(incidentPoint);
    return pts;
  }, [warehouses, incidentPoint]);

  const center = boundsPoints[0] ?? { lat: 13.38, lng: 109.045 };

  function distanceFor(w: ClusterWarehouse): { km: number; official: boolean } {
    const official = officialDistances?.get(w.name);
    if (official) return { km: official.distanceKm, official: true };
    if (incidentPoint) return { km: haversineKm(incidentPoint, w), official: false };
    return { km: NaN, official: false };
  }

  return (
    <div className="space-y-2">
      <div className="h-[320px] overflow-hidden rounded-md border">
        <MapContainer center={[center.lat, center.lng]} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer url={TILE_LIGHT} attribution={TILE_ATTRIBUTION} />
          <FitBounds points={boundsPoints} />
          {onPickPoint ? <ClickPicker onPick={onPickPoint} /> : null}
          {warehouses.map((w) => {
            const { km, official } = distanceFor(w);
            return (
              <Marker key={w.id} position={[w.lat, w.lng]} icon={w.kind === "CENTRAL" ? centralIcon : hamletIcon}>
                <Popup>
                  <strong>{w.name}</strong>
                  <br />
                  {w.kind === "CENTRAL" ? "Kho tổng" : "Kho thôn"}
                  {Number.isFinite(km) ? (
                    <>
                      <br />
                      {fmtDistance(km)} {official ? "" : "(ước tính)"}
                    </>
                  ) : null}
                </Popup>
              </Marker>
            );
          })}
          {incidentPoint ? (
            <Marker
              position={[incidentPoint.lat, incidentPoint.lng]}
              icon={incidentIcon}
              draggable={Boolean(onPickPoint)}
              eventHandlers={
                onPickPoint
                  ? {
                      dragend: (e) => {
                        const marker = e.target as L.Marker;
                        const pos = marker.getLatLng();
                        onPickPoint({ lat: pos.lat, lng: pos.lng });
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

      {onPickPoint ? <CoordInputs point={incidentPoint} onPick={onPickPoint} /> : null}

      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
        <LegendDot color="var(--color-critical, #d64545)" label="Điểm nạn" />
        <LegendDot color="var(--color-accent, #2f9e6e)" label="Kho tổng" />
        <LegendDot color="var(--text-muted, #8a8f98)" label="Kho thôn" />
      </div>
    </div>
  );
}

function CoordInputs({ point, onPick }: { point: LatLng | null; onPick: (point: LatLng) => void }) {
  const lat = point?.lat ?? "";
  const lng = point?.lng ?? "";
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex items-center gap-1 text-[var(--text-muted)]">
        Vĩ độ
        <input
          className="w-28 rounded-md border bg-[var(--surface)] px-2 py-1 tabular"
          type="number"
          step="0.0001"
          value={lat}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onPick({ lat: v, lng: point?.lng ?? 0 });
          }}
        />
      </label>
      <label className="flex items-center gap-1 text-[var(--text-muted)]">
        Kinh độ
        <input
          className="w-28 rounded-md border bg-[var(--surface)] px-2 py-1 tabular"
          type="number"
          step="0.0001"
          value={lng}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onPick({ lat: point?.lat ?? 0, lng: v });
          }}
        />
      </label>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

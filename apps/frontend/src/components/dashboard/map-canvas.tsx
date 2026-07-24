"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  GeoJSON,
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { AdminWarehouse } from "@/lib/warehouse-api";

// Các lớp nền bản đồ — mặc định Địa hình (Topo) như yêu cầu.
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const BASE_LAYERS = [
  {
    id: "offline",
    // Offline: tile đã tải sẵn 5 xã cụm Đồng Xuân (zoom 10-15) ở public/tiles.
    // Mất mạng vẫn hiện. Ngoài vùng/zoom đã tải → tile trắng (errorTileUrl xử lý).
    name: "Offline (5 xã, không cần mạng)",
    url: "/tiles/{z}/{x}/{y}.png",
    attribution: `${OSM_ATTR} · &copy; <a href="https://www.maptiler.com/">MapTiler</a> · offline cụm Đồng Xuân`,
    maxZoom: 15,
    // Tile tải từ endpoint raster 256px, cùng lưới XYZ chuẩn với Leaflet/OSM.
    offline: true,
  },
  {
    id: "osm",
    name: "Đường phố (OSM, cần mạng)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTR,
    maxZoom: 19,
    offline: false,
  },
  {
    id: "topo",
    name: "Địa hình (Topo)",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: `${OSM_ATTR} · <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
    maxZoom: 17,
    offline: false,
  },
  {
    id: "satellite",
    name: "Vệ tinh",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    offline: false,
  },
];

// Tile xám 1x1 (base64) cho ô ngoài vùng offline — thay vì ô vỡ.
const BLANK_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

// Tâm cụm xã Đồng Xuân (fallback khi chưa kho nào có toạ độ).
const DEFAULT_CENTER: [number, number] = [13.38, 109.05];

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

interface GeoData {
  type: "FeatureCollection";
  features: unknown[];
}

export interface MapCanvasProps {
  warehouses: AdminWarehouse[];
  devMode: boolean;
  pickingId: string | null; // kho đang chờ đặt toạ độ (dev mode, click map)
  onMarkerMove: (id: string, lat: number, lng: number) => void;
  onPickOnMap: (lat: number, lng: number) => void;
}

export function MapCanvas({
  warehouses,
  devMode,
  pickingId,
  onMarkerMove,
  onPickOnMap,
}: MapCanvasProps) {
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [preferredBaseLayer, setPreferredBaseLayer] = useState<"offline" | "osm">(() =>
    typeof navigator !== "undefined" && navigator.onLine ? "osm" : "offline",
  );
  const centralIcon = useMemo(() => pinIcon("var(--color-accent, #2f9e6e)"), []);
  const hamletIcon = useMemo(() => pinIcon("var(--text-muted, #8a8f98)", 26), []);

  useEffect(() => {
    fetch("/geo/communes.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  useEffect(() => {
    const selectOnlineMap = () => setPreferredBaseLayer("osm");
    const selectOfflineMap = () => setPreferredBaseLayer("offline");

    window.addEventListener("online", selectOnlineMap);
    window.addEventListener("offline", selectOfflineMap);
    return () => {
      window.removeEventListener("online", selectOnlineMap);
      window.removeEventListener("offline", selectOfflineMap);
    };
  }, []);

  const located = warehouses.filter((w) => w.lat != null && w.lng != null);
  const boundsPoints = located.map((w) => ({ lat: w.lat as number, lng: w.lng as number }));

  return (
    <div className="h-[calc(100dvh-190px)] min-h-[520px] overflow-hidden rounded-md border">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <LayersControl position="topright">
          {BASE_LAYERS.map((layer) => (
            <LayersControl.BaseLayer
              key={layer.id}
              name={layer.name}
              checked={layer.id === preferredBaseLayer}
            >
              <TileLayer
                url={layer.url}
                attribution={layer.attribution}
                maxZoom={layer.maxZoom}
                tileSize={256}
                zoomOffset={0}
                errorTileUrl={layer.offline ? BLANK_TILE : undefined}
              />
            </LayersControl.BaseLayer>
          ))}
        </LayersControl>
        {geo ? (
          <GeoJSON
            data={geo as never}
            style={() => ({
              color: "var(--color-accent, #2f9e6e)",
              weight: 1.5,
              fillColor: "var(--color-accent, #2f9e6e)",
              fillOpacity: 0.05,
            })}
          />
        ) : null}
        <FitBounds points={boundsPoints} />
        {devMode && pickingId ? <ClickPicker onPick={onPickOnMap} /> : null}
        {located.map((w) => (
          <Marker
            key={w.id}
            position={[w.lat as number, w.lng as number]}
            icon={w.kind === "CENTRAL" ? centralIcon : hamletIcon}
            draggable={devMode}
            eventHandlers={
              devMode
                ? {
                    dragend: (e) => {
                      const p = (e.target as L.Marker).getLatLng();
                      onMarkerMove(w.id, p.lat, p.lng);
                    },
                  }
                : undefined
            }
          >
            <Popup>
              <strong>{w.name}</strong>
              <br />
              {w.kind === "CENTRAL" ? "Kho tổng xã" : "Kho thôn"}
              <br />
              <span className="tabular">
                {(w.lat as number).toFixed(5)}, {(w.lng as number).toFixed(5)}
              </span>
              {devMode ? (
                <>
                  <br />
                  <em>Kéo marker để đổi vị trí</em>
                </>
              ) : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
      padding: [30, 30],
      maxZoom: 14,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

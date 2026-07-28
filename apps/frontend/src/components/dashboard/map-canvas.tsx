"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  GeoJSON,
  LayerGroup,
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { AdminWarehouse } from "@/lib/warehouse-api";
import type { AdminHamlet } from "@/lib/hamlet-api";

// Zoom sâu nhất cho phép — đủ để thấy từng mái nhà và ngõ nhỏ.
const MAX_DETAIL_ZOOM = 19;

// Nguồn tile Esri: ảnh vệ tinh + 2 lớp nhãn trong suốt (đường & địa danh).
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_TRANSPORT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const CARTO_ATTR =
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';
// Nền kiểu Google Maps vẽ Ô NHÀ (building footprint) + đường, KHÔNG chữ nào —
// nhờ vậy không còn nhãn "huyện" nào lọt vào; tên địa danh do ta tự vẽ (đã lọc).
const CARTO_VOYAGER_NOLABELS =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png";

// Các lớp nền bản đồ — mặc định Vệ tinh + nhãn đường (thấy nhà & đường rõ nhất).
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const BASE_LAYERS = [
  {
    id: "streets",
    // Nền vector kiểu Google Maps: vẽ ô nhà (building footprint) + đường, KHÔNG
    // có chữ nào nên không lọt nhãn "huyện"; tên địa danh do ta tự vẽ (đã lọc).
    name: "Bản đồ nhà & đường (giống Google)",
    url: CARTO_VOYAGER_NOLABELS,
    attribution: `${OSM_ATTR} · ${CARTO_ATTR}`,
    maxZoom: MAX_DETAIL_ZOOM,
    offline: false,
  },
  {
    id: "hybrid",
    // Ảnh vệ tinh thật (thấy mái nhà, cây cối) + chỉ chồng lớp ĐƯỜNG (không chồng
    // lớp tên địa danh của Esri để tránh nhãn "huyện"); tên do ta tự vẽ.
    name: "Vệ tinh + đường",
    url: ESRI_IMAGERY,
    overlayUrls: [ESRI_TRANSPORT],
    attribution: "&copy; Esri, Maxar, Earthstar Geographics · đường &copy; Esri",
    maxZoom: MAX_DETAIL_ZOOM,
    offline: false,
  },
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
    maxZoom: MAX_DETAIL_ZOOM,
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
    name: "Vệ tinh (không nhãn)",
    url: ESRI_IMAGERY,
    attribution: "&copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: MAX_DETAIL_ZOOM,
    offline: false,
  },
];

// Tile xám 1x1 (base64) cho ô ngoài vùng offline — thay vì ô vỡ.
const BLANK_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

// Tâm Đắk Lắk (fallback khi chưa kho nào có toạ độ).
const DEFAULT_CENTER: [number, number] = [12.67, 108.05];

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

// Địa danh/POI tự vẽ (đã lọc bỏ "huyện") — mỗi mục 1 ghim + tên tô màu.
interface PlaceFeature {
  properties: { name: string; group: string; kind?: string };
  geometry: { type: "Point"; coordinates: [number, number] };
}
interface PlacesData {
  type: "FeatureCollection";
  features: PlaceFeature[];
}

// Màu ghim theo nhóm POI — đồng bộ với chú giải dưới bản đồ.
const PLACE_COLORS: Record<string, string> = {
  place: "#7a2e12", // thôn/xóm/làng — quan trọng nhất cho cứu hộ
  health: "#d64545", // y tế
  school: "#2f6fd6", // trường học
  civic: "#7b41c9", // hành chính/công (UBND, công an, bưu điện…)
  commerce: "#1f7a52", // chợ, cây xăng, cửa hàng, ngân hàng
  worship: "#a06a1f", // cơ sở tôn giáo
  poi: "#555b66", // khác
};
// Zoom tối thiểu để hiện ghim địa danh — tránh dày đặc khi nhìn toàn tỉnh.
const PLACE_MIN_ZOOM = 13;

export interface MapCanvasProps {
  warehouses: AdminWarehouse[];
  hamlets: AdminHamlet[];
  devMode: boolean;
  pickingTarget: MapMarkerTarget | null;
  onMarkerMove: (
    kind: MapMarkerTarget["kind"],
    id: string,
    lat: number,
    lng: number,
  ) => void;
  onPickOnMap: (lat: number, lng: number) => void;
}

export interface MapMarkerTarget {
  kind: "warehouse" | "hamlet";
  id: string;
}

export function MapCanvas({
  warehouses,
  hamlets,
  devMode,
  pickingTarget,
  onMarkerMove,
  onPickOnMap,
}: MapCanvasProps) {
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [places, setPlaces] = useState<PlacesData | null>(null);
  // Local-first is the competition default. Public Internet availability must
  // not silently switch the promised offline workflow back to a CDN layer.
  const [preferredBaseLayer] = useState<"offline" | "streets">("offline");
  const centralIcon = useMemo(() => pinIcon("var(--color-accent, #2f9e6e)"), []);
  const warehouseHamletIcon = useMemo(
    () => pinIcon("var(--text-muted, #8a8f98)", 26),
    [],
  );
  const verifiedHamletIcon = useMemo(() => pinIcon("#7a2e12", 24), []);
  const unverifiedHamletIcon = useMemo(() => pinIcon("#d97706", 24), []);

  useEffect(() => {
    // Ưu tiên gói local Đồng Xuân + 6 xã giáp ranh; toàn tỉnh chỉ là fallback.
    const load = async () => {
      for (const src of ["/geo/communes.geojson", "/geo/daklak-communes.geojson"]) {
        try {
          const r = await fetch(src);
          if (r.ok) {
            setGeo(await r.json());
            return;
          }
        } catch {
          /* thử nguồn kế tiếp */
        }
      }
      setGeo(null);
    };
    load();
  }, []);

  useEffect(() => {
    // Địa danh tự vẽ (đã bỏ "huyện"). Không có file cũng không sao — chỉ là lớp phủ.
    fetch("/geo/daklak-places.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlaces(d))
      .catch(() => setPlaces(null));
  }, []);

  const located = warehouses.filter((w) => w.lat != null && w.lng != null);
  const locatedHamlets = hamlets.filter(
    (hamlet) => hamlet.lat != null && hamlet.lng != null,
  );
  const boundsPoints = [
    ...located.map((w) => ({ lat: w.lat as number, lng: w.lng as number })),
    ...locatedHamlets.map((hamlet) => ({
      lat: hamlet.lat as number,
      lng: hamlet.lng as number,
    })),
  ];

  return (
    <div className="h-[calc(100dvh-190px)] min-h-[520px] overflow-hidden rounded-md border">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        maxZoom={MAX_DETAIL_ZOOM}
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
              <LayerGroup>
                <TileLayer
                  url={layer.url}
                  attribution={layer.attribution}
                  maxZoom={layer.maxZoom}
                  // Ảnh vệ tinh Esri chỉ có ảnh tới zoom 19; zoom sâu hơn thì
                  // phóng to lại ô 19 thay vì hiện ô trắng.
                  maxNativeZoom={layer.offline ? undefined : 19}
                  tileSize={256}
                  zoomOffset={0}
                  errorTileUrl={layer.offline ? BLANK_TILE : undefined}
                />
                {layer.overlayUrls?.map((overlayUrl) => (
                  <TileLayer
                    key={overlayUrl}
                    url={overlayUrl}
                    maxZoom={layer.maxZoom}
                    maxNativeZoom={19}
                    tileSize={256}
                    zoomOffset={0}
                  />
                ))}
              </LayerGroup>
            </LayersControl.BaseLayer>
          ))}
          {/* Địa danh tự vẽ: ghim + tên tô màu (đã bỏ mọi nhãn "huyện"). */}
          <LayersControl.Overlay checked name="Địa danh (ghim + tên tô màu)">
            <LayerGroup>{places ? <PlacePins places={places} /> : null}</LayerGroup>
          </LayersControl.Overlay>
          {/* Ranh giới + tên xã/phường — bật sẵn, tắt được khi cần. */}
          <LayersControl.Overlay checked name="Ranh giới xã/phường">
            <LayerGroup>
              {geo ? <CommuneBoundaries geo={geo} /> : null}
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
        <FitBounds points={boundsPoints} />
        {devMode && pickingTarget ? <ClickPicker onPick={onPickOnMap} /> : null}
        {located.map((w) => (
          <Marker
            key={w.id}
            position={[w.lat as number, w.lng as number]}
            icon={w.kind === "CENTRAL" ? centralIcon : warehouseHamletIcon}
            draggable={devMode}
            eventHandlers={
              devMode
                ? {
                    dragend: (e) => {
                      const p = (e.target as L.Marker).getLatLng();
                      onMarkerMove("warehouse", w.id, p.lat, p.lng);
                    },
                  }
                : undefined
            }
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -26]}
              className={`wh-label ${w.kind === "CENTRAL" ? "wh-label-central" : ""}`}
            >
              {w.name.replace(/^Kho (thôn|cứu trợ trung tâm) /, "")}
            </Tooltip>
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
        {locatedHamlets.map((hamlet) => (
          <Marker
            key={`hamlet-${hamlet.id}`}
            position={[hamlet.lat as number, hamlet.lng as number]}
            icon={hamlet.verified ? verifiedHamletIcon : unverifiedHamletIcon}
            draggable={devMode}
            eventHandlers={
              devMode
                ? {
                    dragend: (event) => {
                      const point = (event.target as L.Marker).getLatLng();
                      onMarkerMove("hamlet", hamlet.id, point.lat, point.lng);
                    },
                  }
                : undefined
            }
          >
            <Tooltip direction="right" offset={[10, -12]}>
              {hamlet.name}
            </Tooltip>
            <Popup>
              <strong>{hamlet.name}</strong>
              <br />
              {hamlet.verified ? "Điểm thôn đã xác minh" : "Điểm thôn chờ xác minh"}
              <br />
              <span className="tabular">
                {(hamlet.lat as number).toFixed(5)},{" "}
                {(hamlet.lng as number).toFixed(5)}
              </span>
              {devMode ? (
                <>
                  <br />
                  <em>Kéo marker để đổi vị trí; cần xác minh lại sau khi lưu.</em>
                </>
              ) : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// Zoom tối thiểu để hiện nhãn tên xã — dưới mức này chỉ hiện viền (tránh 102
// nhãn chồng nhau ở mức nhìn toàn tỉnh, giống cách Google Maps lộ dần nhãn).
const COMMUNE_LABEL_MIN_ZOOM = 10;

// Ranh giới xã/phường + nhãn tên (kiểu Google Maps: viền + chữ ở tâm xã).
function CommuneBoundaries({ geo }: { geo: GeoData }) {
  const map = useMap();
  const labels = useMemo(() => computeCommuneLabels(geo), [geo]);
  const [showLabels, setShowLabels] = useState(() => map.getZoom() >= COMMUNE_LABEL_MIN_ZOOM);
  useMapEvents({
    zoomend: () => setShowLabels(map.getZoom() >= COMMUNE_LABEL_MIN_ZOOM),
  });
  return (
    <>
      <GeoJSON
        data={geo as never}
        style={() => ({
          color: "#e05a2b",
          weight: 1.4,
          fillColor: "#f0a020",
          fillOpacity: 0.04,
          // Đường viền nét đứt mảnh cho giống bản đồ hành chính.
          dashArray: "4 3",
        })}
      />
      {showLabels
        ? labels.map((lbl) => (
            <Marker
              key={lbl.key}
              position={[lbl.lat, lbl.lng]}
              icon={communeLabelIcon(lbl.name)}
              interactive={false}
              keyboard={false}
            />
          ))
        : null}
    </>
  );
}

// Ghim địa danh tự vẽ: chấm màu + tên tô màu, chỉ hiện khi zoom đủ gần để không
// rối. Giới hạn số ghim hiển thị theo khung nhìn để giữ mượt khi có hàng nghìn mục.
function PlacePins({ places }: { places: PlacesData }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [bounds, setBounds] = useState(() => map.getBounds());
  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
      setBounds(map.getBounds());
    },
    moveend: () => setBounds(map.getBounds()),
  });
  const visible = useMemo(() => {
    if (zoom < PLACE_MIN_ZOOM) return [];
    const out: PlaceFeature[] = [];
    for (const f of places.features) {
      const [lng, lat] = f.geometry.coordinates;
      if (bounds.contains([lat, lng])) out.push(f);
      if (out.length >= 400) break; // trần an toàn cho hiệu năng
    }
    return out;
  }, [places, zoom, bounds]);

  return (
    <>
      {visible.map((f, i) => {
        const [lng, lat] = f.geometry.coordinates;
        return (
          <Marker
            key={`${f.properties.name}-${i}`}
            position={[lat, lng]}
            icon={placePinIcon(f.properties.name, f.properties.group)}
            interactive={false}
            keyboard={false}
          />
        );
      })}
    </>
  );
}

// DivIcon cho địa danh: chấm tròn màu nhóm + tên tô cùng màu, halo trắng.
function placePinIcon(name: string, group: string): L.DivIcon {
  const color = PLACE_COLORS[group] ?? PLACE_COLORS.poi;
  const safe = name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const nameClass = group === "place" ? "place-name place-name-place" : "place-name";
  return L.divIcon({
    html: `<span class="place-pin"><span class="place-dot" style="background:${color}"></span><span class="${nameClass}" style="color:${color}">${safe}</span></span>`,
    className: "place-pin-wrap",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Nhãn tên xã là DivIcon (không phải tooltip) để căn giữa ngay tại tâm xã.
function communeLabelIcon(name: string): L.DivIcon {
  const safe = name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return L.divIcon({
    html: `<span class="commune-label">${safe}</span>`,
    className: "commune-label-wrap",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Tính điểm đặt nhãn cho mỗi xã: tâm của polygon lớn nhất (đại diện diện tích).
function computeCommuneLabels(
  geo: GeoData,
): { key: string; name: string; lat: number; lng: number }[] {
  const out: { key: string; name: string; lat: number; lng: number }[] = [];
  const features = (geo.features ?? []) as Array<{
    properties?: { name?: string; fullName?: string; osmId?: number };
    geometry?: { type: string; coordinates: unknown };
  }>;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const name = f.properties?.name ?? f.properties?.fullName;
    if (!name || !f.geometry) continue;
    const center = polygonLabelPoint(f.geometry);
    if (!center) continue;
    out.push({
      key: String(f.properties?.osmId ?? `${name}-${i}`),
      name,
      lat: center[1],
      lng: center[0],
    });
  }
  return out;
}

// Lấy tâm (trung bình đỉnh) của ring lớn nhất trong Polygon/MultiPolygon.
function polygonLabelPoint(geometry: {
  type: string;
  coordinates: unknown;
}): [number, number] | null {
  type Ring = [number, number][];
  let rings: Ring[] = [];
  if (geometry.type === "Polygon") {
    rings = (geometry.coordinates as Ring[]).slice(0, 1);
  } else if (geometry.type === "MultiPolygon") {
    rings = (geometry.coordinates as Ring[][]).map((poly) => poly[0]);
  } else {
    return null;
  }
  let best: Ring | null = null;
  let bestArea = -1;
  for (const ring of rings) {
    const area = Math.abs(ringSignedArea(ring));
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  if (!best || best.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of best) {
    sx += x;
    sy += y;
  }
  return [sx / best.length, sy / best.length];
}

function ringSignedArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      // Một kho: zoom sâu để thấy rõ nhà & đường quanh kho.
      map.setView([points[0].lat, points[0].lng], 17);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
      padding: [30, 30],
      // Cho phép ôm sát cụm kho tới mức thấy từng con đường, nhưng không
      // vượt quá 17 khi các kho nằm quá gần nhau (tránh zoom quá đà).
      maxZoom: 17,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

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
import {
  buildLabelCandidates,
  selectVisibleLabels,
  type GeoData,
  type PlaceFeature,
  type ScreenLabelCandidate,
} from "./map-labels";
import { markerIconHtml } from "./map-markers";

// Zoom sâu nhất cho phép — đủ để thấy từng mái nhà và ngõ nhỏ.
export const MAX_DETAIL_ZOOM = 19;

// Giới hạn khung nhìn theo đúng gói tile offline trong public/tiles, để mọi mức
// zoom và mọi hướng kéo đều còn ảnh nền — không bao giờ lộ nền xám trống.
//
// Thu nhỏ nhất là z9: tỉnh Đắk Lắk mới rộng 1.97°, khung bản đồ ~1030px chứa 2.83°
// ở z9 nhưng chỉ 1.41° ở z10 — nên z9 là mức đầu tiên thấy trọn tỉnh.
export const OFFLINE_PACK_MIN_ZOOM = 9;

// Gói tile có hai tầng nên vùng cho phép kéo cũng phải đổi theo zoom: nhìn xa thì
// được cả tỉnh, nhìn gần thì bó vào cụm 5 xã — đó là chỗ duy nhất có ảnh chi tiết.
// Toạ độ lấy từ chính tên file tile, tầng nào cũng dùng mép hẹp nhất của tầng đó.
export const PROVINCE_BOUNDS: [[number, number], [number, number]] = [
  [11.52, 106.88],
  [14.43, 110.04],
];
export const CLUSTER_BOUNDS: [[number, number], [number, number]] = [
  [13.23, 108.94],
  [13.62, 109.26],
];
export const CLUSTER_MIN_ZOOM = 12;

// Nguồn tile Esri: ảnh vệ tinh + 2 lớp nhãn trong suốt (đường & địa danh).
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_TRANSPORT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const CARTO_ATTR = '&copy; <a href="https://carto.com/attributions">CARTO</a>';
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
    maxNativeZoom: 19,
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
    maxNativeZoom: 19,
    offline: false,
  },
  {
    id: "offline",
    // Offline: tile đã tải sẵn 5 xã cụm Đồng Xuân (zoom 10-15) ở public/tiles.
    // Mất mạng vẫn hiện. Ngoài vùng/zoom đã tải → tile trắng (errorTileUrl xử lý).
    name: "Offline (5 xã, không cần mạng)",
    url: "/tiles/{z}/{x}/{y}.png",
    attribution: `${OSM_ATTR} · &copy; <a href="https://www.maptiler.com/">MapTiler</a> · offline cụm Đồng Xuân`,
    // Chỉ tải sẵn tới zoom 15. Đây là mức SÂU NHẤT CÓ ẢNH THẬT, không phải mức
    // ngừng hiển thị: zoom sâu hơn thì phóng to ô 15 lên. Trước đây đặt vào maxZoom
    // khiến Leaflet ẩn hẳn lớp nền khi zoom quá 15 — đúng lúc người dùng phóng to
    // để ghim toạ độ thì bản đồ trắng trơn.
    maxNativeZoom: 15,
    // Tile tải từ endpoint raster 256px, cùng lưới XYZ chuẩn với Leaflet/OSM.
    offline: true,
  },
  {
    id: "osm",
    name: "Đường phố (OSM, cần mạng)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTR,
    maxNativeZoom: 19,
    offline: false,
  },
  {
    id: "topo",
    name: "Địa hình (Topo)",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: `${OSM_ATTR} · <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
    maxNativeZoom: 17,
    offline: false,
  },
  {
    id: "satellite",
    name: "Vệ tinh (không nhãn)",
    url: ESRI_IMAGERY,
    attribution: "&copy; Esri, Maxar, Earthstar Geographics",
    maxNativeZoom: 19,
    offline: false,
  },
];

// Tile xám 1x1 (base64) cho ô ngoài vùng offline — thay vì ô vỡ.
export const BLANK_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

// Fallback khi chưa kho nào có toạ độ: UBND xã Đồng Xuân — nơi đặt kho trung tâm.
// Trước đây lấy tâm Đắk Lắk (12.67, 108.05), cách vùng có tile ~60km về tây nam,
// nên trong khoảnh khắc trước khi FitBounds chạy — hoặc mãi mãi, nếu chưa kho nào
// có toạ độ — bản đồ mở ra đúng chỗ không có ảnh nền.
export const DEFAULT_CENTER: [number, number] = [13.3782428, 109.104259];

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

interface PlacesData {
  type: "FeatureCollection";
  features: PlaceFeature[];
}

export interface MapCanvasProps {
  warehouses: AdminWarehouse[];
  hamlets: AdminHamlet[];
  devMode: boolean;
  pickingTarget: MapMarkerTarget | null;
  onMarkerMove: (kind: MapMarkerTarget["kind"], id: string, lat: number, lng: number) => void;
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
  const warehouseHamletIcon = useMemo(() => pinIcon("var(--text-muted, #8a8f98)", 26), []);
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
  const locatedHamlets = hamlets.filter((hamlet) => hamlet.lat != null && hamlet.lng != null);
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
        minZoom={OFFLINE_PACK_MIN_ZOOM}
        maxZoom={MAX_DETAIL_ZOOM}
        maxBounds={PROVINCE_BOUNDS}
        // Chạm mép là dội lại hẳn, không cho kéo ra ngoài rồi mới bật về.
        maxBoundsViscosity={1}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <BoundsForZoom />
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
                  // Mọi lớp đều hiển thị tới mức zoom sâu nhất của bản đồ. Nguồn nào
                  // hết ảnh trước (offline 15, topo 17, vệ tinh 19) thì phóng to ô
                  // cuối cùng — mờ dần chứ không bao giờ trắng bản đồ.
                  maxZoom={MAX_DETAIL_ZOOM}
                  maxNativeZoom={layer.maxNativeZoom}
                  tileSize={256}
                  zoomOffset={0}
                  errorTileUrl={layer.offline ? BLANK_TILE : undefined}
                />
                {layer.overlayUrls?.map((overlayUrl) => (
                  <TileLayer
                    key={overlayUrl}
                    url={overlayUrl}
                    maxZoom={MAX_DETAIL_ZOOM}
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
            <LayerGroup>
              <SemanticMapLabels places={places} warehouses={warehouses} />
            </LayerGroup>
          </LayersControl.Overlay>
          {/* Ranh giới + tên xã/phường — bật sẵn, tắt được khi cần. */}
          <LayersControl.Overlay checked name="Ranh giới xã/phường">
            <LayerGroup>{geo ? <CommuneBoundaries geo={geo} /> : null}</LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
        <FitBounds points={boundsPoints} />
        {devMode && pickingTarget ? <ClickPicker onPick={onPickOnMap} /> : null}
        {/* Kho nào cũng có dấu ghim: chữ không neo vào đâu thì không biết kho đứng
            chính xác chỗ nào. Cái được bỏ là icon nhỏ đi kèm NHÃN, xem semanticLabelIcon. */}
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
        {/* Điểm ứng phó của thôn trùng đúng vị trí kho thôn nên hiện cả hai là hai
            dấu chồng lên nhau. Chỉ hiện khi ADMIN đang ghim toạ độ. */}
        {(devMode ? locatedHamlets : []).map((hamlet) => (
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
                {(hamlet.lat as number).toFixed(5)}, {(hamlet.lng as number).toFixed(5)}
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

// Ranh giới xã/phường + nhãn tên (kiểu Google Maps: viền + chữ ở tâm xã).
function CommuneBoundaries({ geo }: { geo: GeoData }) {
  return (
    <GeoJSON
      data={geo as never}
      style={() => ({
        color: "#e05a2b",
        weight: 1.4,
        fillColor: "#f0a020",
        fillOpacity: 0.04,
        // Đường viền nét đứt mảnh cho giống cách bản đồ hành chính.
        dashArray: "4 3",
      })}
    />
  );
}

// Ghim địa danh tự vẽ: chấm màu + tên tô màu, chỉ hiện khi zoom đủ gần để không
// rối. Giới hạn số ghim hiển thị theo khung nhìn để giữ mượt khi có hàng nghìn mục.
function SemanticMapLabels({
  places,
  warehouses,
}: {
  places: PlacesData | null;
  warehouses: AdminWarehouse[];
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [viewport, setViewport] = useState(() => {
    const size = map.getSize();
    return { width: size.x, height: size.y };
  });
  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
      const size = map.getSize();
      setViewport({ width: size.x, height: size.y });
    },
    moveend: () => {
      const size = map.getSize();
      setViewport({ width: size.x, height: size.y });
    },
    resize: () => {
      const size = map.getSize();
      setViewport({ width: size.x, height: size.y });
    },
  });
  const candidates = useMemo(
    () =>
      buildLabelCandidates({
        // Tên xã và địa danh đều bỏ: bản đồ điều phối chỉ hiện kho. Ranh giới xã
        // vẫn vẽ nên vẫn biết đang nhìn vùng nào, khỏi cần nhãn đè lên.
        communes: [],
        places: places?.features ?? [],
        warehouses,
      }),
    [places, warehouses],
  );
  const visible = useMemo(
    () =>
      selectVisibleLabels(
        candidates,
        (lat, lng) => {
          const point = map.latLngToContainerPoint([lat, lng]);
          return { x: point.x, y: point.y };
        },
        zoom,
        viewport,
      ),
    [candidates, map, viewport, zoom],
  );

  return (
    <>
      {visible.map((candidate) => (
        <Marker
          key={candidate.id}
          position={[candidate.lat, candidate.lng]}
          icon={semanticLabelIcon(candidate)}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}

// DivIcon cho địa danh: chấm tròn màu nhóm + tên tô cùng màu, halo trắng.
function semanticLabelIcon(candidate: ScreenLabelCandidate): L.DivIcon {
  const safe = escapeHtml(candidate.label);
  const kind = candidate.markerKind ?? "poi";
  // Kho thôn chỉ còn chữ. 17 icon giống hệt nhau rải khắp bản đồ không nói thêm
  // được gì, trong khi che mất đường và địa hình quanh kho.
  const glyph = kind === "hamlet-warehouse" ? "" : markerIconHtml(kind);
  return L.divIcon({
    html: `<span class="semantic-map-label semantic-map-label-${candidate.anchor}">${glyph}<span class="semantic-map-label-text">${safe}</span></span>`,
    className: "semantic-map-label-wrap",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

/**
 * Đổi vùng cho phép kéo theo mức zoom, vì gói tile offline có hai tầng: cả tỉnh ở
 * mức nhìn xa, riêng cụm 5 xã ở mức nhìn gần. Không đổi theo thì hoặc là không
 * thu nhỏ ra khỏi cụm được, hoặc là phóng to rồi kéo lạc sang vùng không có ảnh.
 */
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

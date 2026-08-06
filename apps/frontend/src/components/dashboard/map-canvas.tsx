"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { AdminWarehouse } from "@/lib/warehouse-api";
import {
  buildLabelCandidates,
  selectVisibleLabels,
  type PlaceFeature,
  type ScreenLabelCandidate,
} from "./map-labels";
import { CommuneBoundaries, useCommuneGeo } from "./commune-boundaries";
import { markerIconHtml } from "./map-markers";
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
} from "./map-tiles";

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
  devMode: boolean;
  pickingTarget: MapMarkerTarget | null;
  onMarkerMove: (kind: MapMarkerTarget["kind"], id: string, lat: number, lng: number) => void;
  onPickOnMap: (lat: number, lng: number) => void;
}

export interface MapMarkerTarget {
  kind: "warehouse";
  id: string;
}

export function MapCanvas({
  warehouses,
  devMode,
  pickingTarget,
  onMarkerMove,
  onPickOnMap,
}: MapCanvasProps) {
  const geo = useCommuneGeo();
  const [places, setPlaces] = useState<PlacesData | null>(null);
  const centralIcon = useMemo(() => pinIcon("var(--color-accent, #2f9e6e)"), []);
  const warehouseHamletIcon = useMemo(() => pinIcon("var(--text-muted, #8a8f98)", 26), []);

  useEffect(() => {
    // Địa danh tự vẽ (đã bỏ "huyện"). Không có file cũng không sao — chỉ là lớp phủ.
    fetch("/geo/daklak-places.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlaces(d))
      .catch(() => setPlaces(null));
  }, []);

  const located = warehouses.filter((w) => w.lat != null && w.lng != null);
  const boundsPoints = located.map((w) => ({ lat: w.lat as number, lng: w.lng as number }));

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
        {/* Một nền duy nhất: gói tile offline không nhãn.
            Bỏ năm lớp trực tuyến cũ (OSM, Topo, vệ tinh Esri, CARTO) vì chúng kéo
            ảnh từ Internet — trái với cam kết chạy được khi mất mạng — và phần lớn
            còn nung sẵn tên địa danh vào ảnh, đúng thứ vừa mất công bỏ đi. */}
        <TileLayer
          url={OFFLINE_TILE_URL}
          attribution={OFFLINE_TILE_ATTRIBUTION}
          // Hiển thị tới zoom sâu nhất; hết ảnh thật ở 15 thì phóng to ô cuối cùng,
          // mờ dần chứ không bao giờ trắng bản đồ.
          maxZoom={MAX_DETAIL_ZOOM}
          maxNativeZoom={OFFLINE_MAX_NATIVE_ZOOM}
          tileSize={256}
          zoomOffset={0}
          errorTileUrl={BLANK_TILE}
        />
        <SemanticMapLabels places={places} warehouses={warehouses} />
        {geo ? <CommuneBoundaries geo={geo} /> : null}
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
      </MapContainer>
    </div>
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

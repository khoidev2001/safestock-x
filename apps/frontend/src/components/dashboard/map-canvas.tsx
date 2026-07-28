"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { AdminWarehouse } from "@/lib/warehouse-api";
import { warehouseLocationLabel } from "@/lib/warehouse-location";
import {
  buildLabelCandidates,
  computeCommuneLabels,
  type GeoData,
  type LabelCandidate,
  type PlaceFeature,
  selectVisibleLabels,
} from "./map-labels";
import { markerIconHtml, type MapMarkerKind } from "./map-markers";

// World Imagery exposes deeper cache levels, but the Đồng Xuân area only has native
// detail through level 18. Stopping here avoids Esri's “Map data not yet available” tile.
const MAX_SATELLITE_ZOOM = 18;
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_CENTER: [number, number] = [13.38, 109.05];

interface PlacesData {
  type: "FeatureCollection";
  features: PlaceFeature[];
}

export interface MapCanvasProps {
  warehouses: AdminWarehouse[];
  persistedWarehouses: AdminWarehouse[];
  devMode: boolean;
  pickingId: string | null;
  onMarkerMove: (id: string, lat: number, lng: number) => void;
  onPickOnMap: (lat: number, lng: number) => void;
}

export function MapCanvas({
  warehouses,
  persistedWarehouses,
  devMode,
  pickingId,
  onMarkerMove,
  onPickOnMap,
}: MapCanvasProps) {
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [places, setPlaces] = useState<PlacesData | null>(null);
  const markerIcons = useMemo(() => createMarkerIcons(), []);
  const selectedMarkerIcons = useMemo(() => createMarkerIcons(true), []);
  const communeLabels = useMemo(() => (geo ? computeCommuneLabels(geo) : []), [geo]);
  const candidates = useMemo(
    () =>
      buildLabelCandidates({
        communes: communeLabels,
        places: places?.features ?? [],
        warehouses,
      }),
    [communeLabels, places, warehouses],
  );
  const persistedPoints = useMemo(
    () =>
      persistedWarehouses
        .filter((warehouse) => warehouse.lat != null && warehouse.lng != null)
        .map((warehouse) => ({ lat: warehouse.lat as number, lng: warehouse.lng as number })),
    [persistedWarehouses],
  );

  useEffect(() => {
    const load = async () => {
      for (const source of ["/geo/daklak-communes.geojson", "/geo/communes.geojson"]) {
        try {
          const response = await fetch(source);
          if (response.ok) {
            setGeo(await response.json());
            return;
          }
        } catch {
          // Thử dữ liệu fallback khi nguồn chính chưa sẵn sàng.
        }
      }
      setGeo(null);
    };
    void load();
  }, []);

  useEffect(() => {
    fetch("/geo/daklak-places.geojson")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setPlaces(data))
      .catch(() => setPlaces(null));
  }, []);

  return (
    <div className="h-[calc(100dvh-190px)] min-h-[520px] overflow-hidden rounded-md border">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        maxZoom={MAX_SATELLITE_ZOOM}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={ESRI_IMAGERY}
          attribution="&copy; Esri, Maxar, Earthstar Geographics"
          maxZoom={MAX_SATELLITE_ZOOM}
          maxNativeZoom={MAX_SATELLITE_ZOOM}
          tileSize={256}
          zoomOffset={0}
        />
        {geo ? (
          <GeoJSON
            data={geo as never}
            style={() => ({
              color: "#e05a2b",
              weight: 1.4,
              fillColor: "#f0a020",
              fillOpacity: 0.04,
              dashArray: "4 3",
            })}
          />
        ) : null}
        <InitialFitBounds points={persistedPoints} />
        {devMode && pickingId ? <ClickPicker onPick={onPickOnMap} /> : null}
        <DeclutteredMarkers
          candidates={candidates}
          devMode={devMode}
          markerIcons={markerIcons}
          selectedMarkerIcons={selectedMarkerIcons}
          pickingId={pickingId}
          onMarkerMove={onMarkerMove}
        />
      </MapContainer>
    </div>
  );
}

function DeclutteredMarkers({
  candidates,
  devMode,
  markerIcons,
  selectedMarkerIcons,
  pickingId,
  onMarkerMove,
}: {
  candidates: LabelCandidate[];
  devMode: boolean;
  markerIcons: Record<MapMarkerKind, L.DivIcon>;
  selectedMarkerIcons: Record<MapMarkerKind, L.DivIcon>;
  pickingId: string | null;
  onMarkerMove: (id: string, lat: number, lng: number) => void;
}) {
  const map = useMap();
  const [viewState, setViewState] = useState(() => readMapView(map));
  useMapEvents({
    moveend: () => setViewState(readMapView(map)),
    resize: () => setViewState(readMapView(map)),
    zoomend: () => setViewState(readMapView(map)),
  });

  const collisionCandidates = useMemo(
    () =>
      candidates.map((candidate) =>
        candidate.warehouse?.id === pickingId ? { ...candidate, priority: 2000 } : candidate,
      ),
    [candidates, pickingId],
  );
  const visible = useMemo(
    () =>
      selectVisibleLabels(
        collisionCandidates,
        (lat, lng) => map.latLngToContainerPoint([lat, lng]),
        viewState.zoom,
        { width: viewState.width, height: viewState.height },
      ),
    [collisionCandidates, map, viewState],
  );
  const warehouseCandidates = candidates.filter((candidate) => candidate.category === "warehouse");

  return (
    <>
      {warehouseCandidates.map((candidate) => {
        const warehouse = candidate.warehouse;
        if (!warehouse || !candidate.markerKind) return null;
        const selected = devMode && pickingId === warehouse.id;
        return (
          <Marker
            key={`marker:${candidate.id}`}
            position={[candidate.lat, candidate.lng]}
            icon={
              selected
                ? selectedMarkerIcons[candidate.markerKind]
                : markerIcons[candidate.markerKind]
            }
            draggable={selected}
            zIndexOffset={selected ? 1000 : warehouse.kind === "CENTRAL" ? 500 : 400}
            eventHandlers={
              selected
                ? {
                    dragend: (event) => {
                      const point = (event.target as L.Marker).getLatLng();
                      onMarkerMove(warehouse.id, point.lat, point.lng);
                    },
                  }
                : undefined
            }
          >
            <Popup>
              <strong>{warehouse.name}</strong>
              <br />
              {warehouse.kind === "CENTRAL" ? "Kho tổng xã" : "Kho thôn"}
              <br />
              <span className="tabular">
                {candidate.lat.toFixed(5)}, {candidate.lng.toFixed(5)}
              </span>
              <br />
              {warehouseLocationLabel(warehouse)}
              {warehouse.locationSourceUrl ? (
                <>
                  <br />
                  <a href={warehouse.locationSourceUrl} target="_blank" rel="noreferrer">
                    Xem nguồn vị trí
                  </a>
                </>
              ) : null}
              {selected ? (
                <>
                  <br />
                  <em>Kéo marker hoặc bấm vị trí khác trên bản đồ</em>
                </>
              ) : null}
            </Popup>
          </Marker>
        );
      })}

      {visible.map((candidate) => {
        if (candidate.category === "commune") {
          return (
            <Marker
              key={candidate.id}
              position={[candidate.lat, candidate.lng]}
              icon={communeLabelIcon(candidate.label)}
              interactive={false}
              keyboard={false}
            />
          );
        }

        if (candidate.category === "place" && candidate.markerKind) {
          return (
            <Marker
              key={candidate.id}
              position={[candidate.lat, candidate.lng]}
              icon={placeLabelIcon(candidate.label, candidate.markerKind)}
              interactive={false}
              keyboard={false}
            />
          );
        }

        if (!candidate.markerKind) return null;
        return (
          <Marker
            key={`label:${candidate.id}`}
            position={[candidate.lat, candidate.lng]}
            icon={warehouseLabelIcon(candidate.label, candidate.markerKind)}
            interactive={false}
            keyboard={false}
          />
        );
      })}
    </>
  );
}

function readMapView(map: L.Map): { width: number; height: number; zoom: number } {
  const size = map.getSize();
  return { width: size.x, height: size.y, zoom: map.getZoom() };
}

function createMarkerIcons(selected = false): Record<MapMarkerKind, L.DivIcon> {
  return {
    "central-warehouse": mapDivIcon("central-warehouse", 34, 34, selected),
    "hamlet-warehouse": mapDivIcon("hamlet-warehouse", 30, 30, selected),
    place: mapDivIcon("place", 22, 22, selected),
    health: mapDivIcon("health", 22, 22, selected),
    school: mapDivIcon("school", 22, 22, selected),
    civic: mapDivIcon("civic", 22, 22, selected),
    commerce: mapDivIcon("commerce", 22, 22, selected),
    worship: mapDivIcon("worship", 22, 22, selected),
    poi: mapDivIcon("poi", 22, 22, selected),
  };
}

function mapDivIcon(
  kind: MapMarkerKind,
  width: number,
  height: number,
  selected: boolean,
): L.DivIcon {
  return L.divIcon({
    html: markerIconHtml(kind, width),
    className: selected ? "map-marker-icon-wrap map-marker-icon-selected" : "map-marker-icon-wrap",
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    popupAnchor: [0, -height / 2],
  });
}

function warehouseLabelIcon(label: string, kind: MapMarkerKind): L.DivIcon {
  return L.divIcon({
    html: `<span class="map-warehouse-label map-warehouse-label-${kind}">${escapeHtml(label)}</span>`,
    className: "map-label-icon-wrap",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function placeLabelIcon(label: string, kind: MapMarkerKind): L.DivIcon {
  return L.divIcon({
    html: `<span class="map-place-label map-place-label-${kind}">${markerIconHtml(kind, 22)}<span>${escapeHtml(label)}</span></span>`,
    className: "map-label-icon-wrap",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function communeLabelIcon(label: string): L.DivIcon {
  return L.divIcon({
    html: `<span class="map-commune-label">${escapeHtml(label)}</span>`,
    className: "map-label-icon-wrap",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function InitialFitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const [hasFitted, setHasFitted] = useState(false);
  const key = points.map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (hasFitted || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 17);
    } else {
      map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng])), {
        padding: [30, 30],
        maxZoom: 17,
      });
    }
    setHasFitted(true);
  }, [hasFitted, key, map, points]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

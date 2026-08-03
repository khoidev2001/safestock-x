"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  BLANK_TILE,
  CLUSTER_BOUNDS,
  CLUSTER_MIN_ZOOM,
  DEFAULT_CENTER,
  MAX_DETAIL_ZOOM,
  OFFLINE_PACK_MIN_ZOOM,
  PROVINCE_BOUNDS,
} from "@/components/dashboard/map-canvas";
import type { LatLng } from "@/lib/geo";

/**
 * Ghim đúng chỗ đang xảy ra sự việc, ngay trong lúc lập phương án.
 *
 * Trước đây điểm sự cố chỉ lấy được từ danh mục thôn đã xác minh, nên thôn nào chưa
 * ghim là bó tay — mà sự việc thì không đợi ai cấu hình bản đồ. Ngập giữa hai thôn,
 * sạt lở trên đường liên xã, người mắc kẹt ngoài đồng đều không có tên trong danh mục.
 *
 * Backend đã nhận toạ độ rời từ đầu (resolveIncidentLocation với explicitPoint);
 * chỉ giao diện là chưa mở đường cho người dùng nhập.
 */
export function IncidentPointPicker({
  value,
  onChange,
  disabled,
}: {
  value: LatLng | null;
  onChange: (point: LatLng | null) => void;
  disabled?: boolean;
}) {
  const icon = useMemo(
    () =>
      L.divIcon({
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#d64545" stroke="white" stroke-width="1.5"><path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5" fill="white"/></svg>`,
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      }),
    [],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          {value
            ? "Bấm chỗ khác để dời, hoặc kéo dấu ghim."
            : "Bấm lên bản đồ để ghim đúng chỗ đang xảy ra sự việc."}
        </p>
        {value && !disabled ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium"
          >
            Bỏ ghim
          </button>
        ) : null}
      </div>

      <div className="h-64 overflow-hidden rounded-md border">
        <MapContainer
          center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
          zoom={13}
          minZoom={OFFLINE_PACK_MIN_ZOOM}
          maxZoom={MAX_DETAIL_ZOOM}
          maxBounds={PROVINCE_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          {/* Cùng gói tile offline với bản đồ chính: mất mạng vẫn ghim được. */}
          <TileLayer
            url="/tiles/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors · offline cụm Đồng Xuân"
            maxZoom={MAX_DETAIL_ZOOM}
            maxNativeZoom={15}
            tileSize={256}
            errorTileUrl={BLANK_TILE}
          />
          <BoundsForZoom />
          {!disabled ? <ClickToPin onPick={onChange} /> : null}
          {value ? (
            <Marker
              position={[value.lat, value.lng]}
              icon={icon}
              draggable={!disabled}
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = event.target.getLatLng();
                  onChange({ lat, lng });
                },
              }}
            />
          ) : null}
        </MapContainer>
      </div>

      {value ? (
        <p className="tabular text-xs text-[var(--text-muted)]">
          Đã ghim: {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
        </p>
      ) : null}
    </div>
  );
}

function ClickToPin({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

/** Khớp bản đồ chính: nhìn xa được cả tỉnh, nhìn gần bó vào vùng có ảnh chi tiết. */
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

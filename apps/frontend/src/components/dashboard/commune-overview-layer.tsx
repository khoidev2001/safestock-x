"use client";

import L from "leaflet";
import { useMemo } from "react";
import { GeoJSON, Marker } from "react-leaflet";
import type { GeoData } from "./map-labels";

/**
 * Bản đồ ở mức nhìn xa: mỗi xã một mảng màu kèm tên, thay cho các kho thôn.
 *
 * Thu nhỏ tới mức thấy cả vùng thì mười bảy kho thôn dồn vào một nhúm vài chục
 * pixel — nhãn đè lên nhau thành một vệt chữ không đọc được, mà đọc được cũng
 * không dùng vào việc gì: ở tầm nhìn đó người ta đang hỏi "vùng nào", chưa hỏi
 * "kho nào". Nên đổi hẳn đơn vị hiển thị: xã thay cho kho.
 *
 * Phóng to qua ngưỡng thì lớp này tắt và các kho hiện lại — cùng một bản đồ trả
 * lời hai câu hỏi khác nhau ở hai tầm nhìn khác nhau.
 */

/**
 * Màu của từng xã.
 *
 * Chọn theo tông đủ tách nhau trên nền ảnh vệ tinh vốn xanh lục và nâu: không
 * dùng xanh lá (trùng nền và trùng màu kho đang tiếp tế) cũng không dùng đỏ
 * (dành riêng cho điểm gặp nạn — một mảng đỏ rộng bằng cả xã sẽ đọc thành báo
 * động).
 */
const COMMUNE_COLORS = [
  "#4f7cff",
  "#b45cf0",
  "#e88c1a",
  "#12a5b8",
  "#d4478f",
  "#8a6bd8",
  "#c9a227",
];

/** Màu ổn định theo TÊN, không theo thứ tự trong file: thêm bớt xã không làm cả bản đồ đổi màu. */
function communeColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COMMUNE_COLORS[hash % COMMUNE_COLORS.length];
}

interface CommuneFeature {
  properties?: { name?: string; fullName?: string };
  geometry?: unknown;
}

function featureName(feature: CommuneFeature): string {
  return feature.properties?.name ?? feature.properties?.fullName ?? "Không rõ tên";
}

export function CommuneOverviewLayer({ geo }: { geo: GeoData }) {
  /**
   * Tâm để đặt nhãn, lấy theo khung bao của từng vùng.
   *
   * Tâm khung bao không phải trọng tâm hình học, nên với xã hình vòng cung nó có
   * thể lệch ra ngoài một chút. Chấp nhận: ở tầm nhìn này lệch vài trăm mét không
   * đọc ra khác biệt, còn tính trọng tâm đa giác thì phải kéo thêm thư viện.
   */
  const labels = useMemo(() => (geo.features as CommuneFeature[])
      .map((feature) => {
        if (!feature.geometry) return null;
        try {
          const center = L.geoJSON(feature as never)
            .getBounds()
            .getCenter();
          const name = featureName(feature);
          return { name, lat: center.lat, lng: center.lng, color: communeColor(name) };
        } catch {
          return null;
        }
      })
      .filter((label): label is NonNullable<typeof label> => label != null), [geo]);

  return (
    <>
      <GeoJSON
        data={geo as never}
        // Lớp nền thông tin, không được nuốt cú bấm ghim bên dưới.
        interactive={false}
        key="commune-overview"
        style={(feature) => {
          const color = communeColor(featureName((feature ?? {}) as CommuneFeature));
          return {
            color,
            weight: 1.6,
            fillColor: color,
            // Đủ để phân biệt vùng, đủ mỏng để vẫn thấy địa hình bên dưới — người
            // dùng cần biết ranh giới xã nằm ở đâu so với sông và đường.
            fillOpacity: 0.28,
            opacity: 0.95,
          };
        }}
      />
      {labels.map((label) => (
        <Marker
          icon={communeLabelIcon(label.name, label.color)}
          interactive={false}
          key={`commune-label-${label.name}`}
          position={[label.lat, label.lng]}
        />
      ))}
    </>
  );
}

/**
 * Nhãn tên xã: chữ trắng trên nền màu của chính xã đó.
 *
 * Nền đặc chứ không phải chữ trần có viền: ảnh vệ tinh bên dưới lúc sáng lúc tối
 * tuỳ mảng rừng hay mảng ruộng, chữ trần sẽ mất hút ở một nửa số vùng.
 */
function communeLabelIcon(name: string, color: string): L.DivIcon {
  const width = Math.max(64, name.length * 8 + 20);
  return L.divIcon({
    className: "",
    html:
      `<span style="display:inline-flex;align-items:center;justify-content:center;` +
      `padding:3px 9px;border-radius:999px;background:${color};color:#fff;` +
      `font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);` +
      `border:1px solid rgba(255,255,255,.75)">${escapeHtml(name)}</span>`,
    iconSize: [width, 22],
    iconAnchor: [width / 2, 11],
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

"use client";

import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import { type GeoData } from "./map-labels";

/**
 * Nạp ranh giới xã/phường một lần cho mỗi bản đồ.
 *
 * Ưu tiên gói local Đồng Xuân + 6 xã giáp ranh; toàn tỉnh chỉ là phương án dự
 * phòng. Không có file nào cũng không sao — bản đồ vẫn chạy, chỉ thiếu lớp viền.
 */
export function useCommuneGeo(): GeoData | null {
  const [geo, setGeo] = useState<GeoData | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (const src of ["/geo/communes.geojson", "/geo/daklak-communes.geojson"]) {
        try {
          const response = await fetch(src);
          if (!response.ok) continue;
          const data = await response.json();
          if (!cancelled) setGeo(data);
          return;
        } catch {
          /* thử nguồn kế tiếp */
        }
      }
      if (!cancelled) setGeo(null);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  return geo;
}

/**
 * Ranh giới xã/phường, viền nét đứt mảnh cho giống bản đồ hành chính.
 *
 * Dùng chung cho bản đồ quản trị và bản đồ điều phối: nhìn hai nơi phải ra cùng
 * một đường ranh, nếu mỗi nơi tự vẽ một kiểu thì người dùng sẽ nghi ngờ chính dữ
 * liệu ranh giới.
 */
export function CommuneBoundaries({ geo }: { geo: GeoData }) {
  return (
    <GeoJSON
      data={geo as never}
      // Lớp trang trí: không được nuốt cú bấm chọn điểm nạn bên dưới.
      interactive={false}
      style={() => ({
        color: "#e05a2b",
        weight: 1.4,
        fillColor: "#f0a020",
        fillOpacity: 0.04,
        dashArray: "4 3",
      })}
    />
  );
}

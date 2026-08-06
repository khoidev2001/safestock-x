/**
 * Vị trí kho thôn do ADMIN ghim tay trên bản đồ.
 *
 * Bổ sung cho VERIFIED_HAMLET_WAREHOUSE_LOCATIONS: registry kia là Nhà văn hoá tra
 * được trên Google Maps (5 thôn). 12 thôn còn lại Maps trả sai vùng hoặc sai tên
 * (xem danh mục §3.2) nên người vận hành phải xác nhận với địa phương rồi ghim tay.
 *
 * Hai nguồn giữ tách nhau có chủ đích: không được để một toạ độ ghim tay đội lốt
 * "đã xác minh trên Google Maps". Ai đọc dữ liệu phải truy được ai chịu trách nhiệm.
 *
 * Toạ độ này dùng cho CẢ kho lẫn điểm ứng phó của thôn, vì kho thôn đặt ngay tại
 * Nhà văn hoá — cũng là chỗ tập kết khi thôn có sự cố. Một điểm, một trách nhiệm.
 *
 * Thêm thôn mới: ghim trên /map rồi chạy
 *   pnpm --filter @safestock/backend exec ts-node prisma/sync-hamlet-pins.ts
 * Lệnh đó chép toạ độ sang bảng kho và in sẵn khối để chép vào đây. Không chép
 * thì toạ độ mất khi seed lại và máy khác clone về vẫn thiếu.
 */

export interface AdminPinnedWarehouseLocation {
  lat: number;
  lng: number;
  /** Ngày ADMIN xác nhận, theo giờ địa phương. */
  pinnedAt: string;
}

export const ADMIN_PINNED_HAMLET_WAREHOUSES: Record<string, AdminPinnedWarehouseLocation> = {
  "long-binh": { lat: 13.40865629720884, lng: 109.1031185621659, pinnedAt: "2026-08-03" },
  "long-chau": { lat: 13.38066012986432, lng: 109.1068446615843, pinnedAt: "2026-08-02" },
  "long-ha": { lat: 13.3618884340976, lng: 109.0980374945975, pinnedAt: "2026-08-02" },
  "long-hoa": { lat: 13.39613231842647, lng: 109.1142774126387, pinnedAt: "2026-08-03" },
  "long-my": { lat: 13.39928007318946, lng: 109.1051272312625, pinnedAt: "2026-08-02" },
  "long-thang": { lat: 13.37585878988407, lng: 109.1014598996733, pinnedAt: "2026-08-02" },
  "long-thach": { lat: 13.41573623142623, lng: 109.0978672457646, pinnedAt: "2026-08-02" },
  "tan-an": { lat: 13.35488207514473, lng: 109.1459161772277, pinnedAt: "2026-08-03" },
  "tan-hoa": { lat: 13.33517299086576, lng: 109.1666808598435, pinnedAt: "2026-08-03" },
  "tan-phu": { lat: 13.34519476012113, lng: 109.1497632584694, pinnedAt: "2026-08-03" },
  "tan-phuoc": { lat: 13.36118279685856, lng: 109.1645246232576, pinnedAt: "2026-08-02" },
  "tan-vinh": { lat: 13.33801253435521, lng: 109.1555222991073, pinnedAt: "2026-08-03" },
};

export function getAdminPinnedHamletWarehouse(
  hamletKey: string,
): AdminPinnedWarehouseLocation | null {
  return ADMIN_PINNED_HAMLET_WAREHOUSES[hamletKey] ?? null;
}

export interface HamletPoint {
  lat: number | null;
  lng: number | null;
  verified: boolean;
  verifiedAt: Date | null;
}

/**
 * Toạ độ chốt của một thôn, gộp hai nguồn theo thứ tự ưu tiên.
 *
 * Nhà văn hoá tra được trên Maps thì ưu tiên, vì đó là địa điểm có thật ai cũng
 * kiểm chứng lại được. Không có thì dùng điểm ADMIN ghim. Không có cả hai thì để
 * trống — hệ thống sẽ từ chối điều phối tới thôn đó, đúng như thiết kế.
 */
export function resolveHamletPoint(
  hamletKey: string,
  mapVerified: { lat: number | null; lng: number | null; verifiedAt: string },
): HamletPoint {
  if (mapVerified.lat != null && mapVerified.lng != null) {
    return {
      lat: mapVerified.lat,
      lng: mapVerified.lng,
      verified: true,
      verifiedAt: new Date(mapVerified.verifiedAt),
    };
  }

  const pinned = getAdminPinnedHamletWarehouse(hamletKey);
  if (pinned) {
    return {
      lat: pinned.lat,
      lng: pinned.lng,
      verified: true,
      verifiedAt: new Date(pinned.pinnedAt),
    };
  }

  return { lat: null, lng: null, verified: false, verifiedAt: null };
}

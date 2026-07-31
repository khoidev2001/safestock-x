export type MobileTab =
  "home" | "readiness" | "inventory" | "monthly-report" | "missions" | "alerts" | "report";

/**
 * App điện thoại có ĐÚNG HAI giao diện, chọn theo vai lúc đăng nhập.
 *
 * Quản lý kho tại chỗ (kiêm trưởng thôn): giữ kho, kiểm kê, và báo tình huống
 * của thôn mình.
 *
 * Lực lượng hiện trường: nhận lệnh, ghi nhận tại chỗ, báo tình huống mới thấy.
 * KHÔNG có nghiệp vụ kho — họ xem xét tình hình thực tế rồi gửi yêu cầu, việc
 * đối chiếu tồn và quyết định cho mượn là của người giữ kho.
 *
 * ADMIN làm việc trên web; nếu đăng nhập điện thoại thì chỉ để quét QR nhập/xuất
 * ngay tại kệ, không mang theo cả bảng điều hành lên màn hình nhỏ.
 */
export function tabsForRole(role: string): MobileTab[] {
  if (role === "ADMIN") return ["inventory"];
  if (role === "RESCUE") return ["missions", "report", "alerts"];
  return ["home", "readiness", "inventory", "monthly-report", "report", "alerts"];
}

/** Tab mở đầu sau khi đăng nhập: việc chính của vai đó, không phải màn chung chung. */
export function initialTabForRole(role: string): MobileTab {
  return tabsForRole(role)[0] ?? "alerts";
}

export interface InventorySummaryInput {
  quantity: number;
  condition: string;
  expiryDate: string | null;
  item: { sku: string };
}

export interface InventorySummary {
  batches: number;
  skus: number;
  quantity: number;
  damagedBatches: number;
  expiringSoonBatches: number;
}

const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60 * 1000;

export function buildInventorySummary(
  batches: InventorySummaryInput[],
  now = new Date(),
): InventorySummary {
  const expiryLimit = now.getTime() + EXPIRY_WARNING_MS;
  return {
    batches: batches.length,
    skus: new Set(batches.map((batch) => batch.item.sku)).size,
    quantity: batches.reduce((total, batch) => total + Math.max(0, batch.quantity), 0),
    damagedBatches: batches.filter((batch) => batch.condition === "DAMAGED").length,
    expiringSoonBatches: batches.filter((batch) => {
      if (!batch.expiryDate) return false;
      const expiry = Date.parse(batch.expiryDate);
      return Number.isFinite(expiry) && expiry >= now.getTime() && expiry <= expiryLimit;
    }).length,
  };
}

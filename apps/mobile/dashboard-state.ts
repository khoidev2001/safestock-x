export type MobileTab = "home" | "report" | "warehouse" | "missions" | "alerts" | "account";

/**
 * Ba mục con nằm trong tab Quản lý kho.
 *
 * Trước đây Sẵn sàng, Kho và Kiểm kê là ba tab riêng, nên trưởng thôn phải nhìn
 * SÁU ô ở thanh dưới — mà ba trong số đó cùng nói về một cái kho, chỉ khác góc
 * nhìn. Thanh tab hẹp, sáu nhãn bị cắt cụt, và người dùng phải nhớ "mức sẵn
 * sàng" nằm ở tab nào. Gom lại một cửa: chọn kho trước, rồi chọn xem gì.
 */
export type WarehouseSection = "readiness" | "inventory" | "monthly-report";

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
 *
 * Tab Tài khoản có ở MỌI vai: đó là chỗ duy nhất chắc chắn tìm thấy nút đăng
 * xuất, nên không vai nào được thiếu — kể cả vai chỉ có đúng một tab nghiệp vụ.
 */
export function tabsForRole(role: string): MobileTab[] {
  if (role === "ADMIN") return ["warehouse", "account"];
  if (role === "RESCUE") return ["missions", "report", "alerts", "account"];
  return ["home", "report", "warehouse", "alerts", "account"];
}

/**
 * Mục con hiện ra khi mở tab Quản lý kho.
 *
 * ADMIN chỉ vào đây để quét QR nhập/xuất tại kệ, nên chỉ có mục Kho — không kèm
 * mức sẵn sàng và báo cáo kiểm kê tháng, vốn là việc của người giữ kho tại chỗ.
 * Một mục thì thanh chọn mục tự ẩn, khỏi bày ra một nút không có gì để chuyển.
 */
export function warehouseSectionsForRole(role: string): WarehouseSection[] {
  if (role === "ADMIN") return ["inventory"];
  // Kho đứng đầu vì đó là việc hằng ngày — nhập, xuất, quét QR tại kệ. Mức sẵn
  // sàng chỉ liếc khi có cảnh báo, còn kiểm kê thì mỗi tháng một lần.
  return ["inventory", "readiness", "monthly-report"];
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

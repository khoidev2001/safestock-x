/**
 * Dự báo cạn kho (THUẦN, test được) — DỰ BÁO THỐNG KÊ, không phải phép chia trung bình:
 *   EWMA (trung bình trượt trọng số mũ) → tốc độ tiêu thụ gần đây đã làm mượt,
 *   độ lệch chuẩn nhu cầu ngày → khoảng tin cậy số ngày còn lại,
 *   safety-stock chuẩn ngành → điểm đặt hàng lại.
 * Gọi đúng tên là "dự báo thống kê" (không phóng đại thành deep learning):
 * chạy offline, kiểm chứng bằng unit test khóa công thức.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Trọng số EWMA: ngày gần đây nặng hơn. 0.35 ~ "nhớ" ~5-6 ngày gần nhất. */
const EWMA_ALPHA = 0.35;
/** Lead time (ngày) để hàng nhập về kho — dùng cho điểm đặt hàng lại. */
const LEAD_TIME_DAYS = 3;
/** Hệ số z mức phục vụ ~90% cho safety stock. */
const SERVICE_Z = 1.28;
/** Số ngày CÓ xuất tối thiểu để đạt độ tin cậy tối đa. */
const CONFIDENCE_SATURATION_DAYS = 8;

export interface ExportTxn {
  sku: string;
  itemName: string;
  quantity: number;
  createdAt: Date;
}

export interface StockLevel {
  sku: string;
  itemName: string;
  quantity: number;
}

export interface ForecastResult {
  sku: string;
  itemName: string;
  quantity: number;
  /** Trung bình phẳng tổng/windowDays — giữ làm số THAM CHIẾU ("trung bình"). */
  avgPerDay: number;
  /** Tốc độ tiêu thụ gần đây đã làm mượt (EWMA) — CƠ SỞ của daysLeft. */
  ewmaPerDay: number;
  /** Độ lệch chuẩn nhu cầu ngày — đo biến động. */
  dailyStdDev: number;
  /** Số ngày còn lại (trung tâm) = tồn / ewmaPerDay; null nếu chưa có tốc độ. */
  daysLeft: number | null;
  /** Cận DƯỚI (~68%): kịch bản tiêu thụ nhanh hơn. */
  daysLeftLow: number | null;
  /** Cận TRÊN (~68%): kịch bản tiêu thụ chậm hơn (đã sàn để không ra vô cực). */
  daysLeftHigh: number | null;
  /** Điểm đặt hàng lại (safety stock): nên nhập khi tồn ≤ mức này. */
  reorderPoint: number;
  /** Độ tin cậy [0,1] theo số ngày có dữ liệu xuất. */
  confidence: number;
  lowStock: boolean;
}

/** EWMA trên chuỗi cũ→mới. daily[0]=hôm nay (mới nhất) nên duyệt từ CUỐI mảng về đầu. */
function ewma(daily: number[], alpha: number): number {
  if (daily.length === 0) return 0;
  let s = daily[daily.length - 1]; // khởi tạo = ngày xa nhất
  for (let i = daily.length - 2; i >= 0; i--) {
    s = alpha * daily[i] + (1 - alpha) * s;
  }
  return s;
}

/** Độ lệch chuẩn quần thể (population std) của chuỗi nhu cầu ngày. */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Dự báo số ngày còn lại + khoảng tin cậy + điểm đặt hàng lại cho mỗi SKU.
 * SKU chưa xuất lần nào (ewmaPerDay=0) → daysLeft null, không lowStock.
 * SKU CÓ lịch sử xuất nhưng tồn khả dụng = 0 (đã cạn sạch) → daysLeft=0, lowStock=true
 * — đây là thứ cần báo gấp nhất.
 */
export function computeForecast(
  exports: ExportTxn[],
  stock: StockLevel[],
  windowDays: number,
  now: Date,
): ForecastResult[] {
  // Bin nhu cầu theo ngày: daily[0]=hôm nay ... daily[windowDays-1]=xa nhất.
  const dailyBySku = new Map<string, number[]>();
  const nameBySku = new Map<string, string>();
  for (const t of exports) {
    const dayIndex = Math.floor((now.getTime() - t.createdAt.getTime()) / DAY_MS);
    if (dayIndex < 0 || dayIndex >= windowDays) continue; // ngoài cửa sổ (gồm cả tương lai)
    let daily = dailyBySku.get(t.sku);
    if (!daily) {
      daily = new Array<number>(windowDays).fill(0);
      dailyBySku.set(t.sku, daily);
    }
    daily[dayIndex] += t.quantity;
    nameBySku.set(t.sku, t.itemName);
  }

  const stockBySku = new Map(stock.map((s) => [s.sku, s]));
  const skus = new Set<string>([...stockBySku.keys(), ...dailyBySku.keys()]);

  return [...skus].map((sku) => {
    const s = stockBySku.get(sku);
    const quantity = s?.quantity ?? 0;
    const itemName = s?.itemName ?? nameBySku.get(sku) ?? sku;
    const daily = dailyBySku.get(sku) ?? new Array<number>(windowDays).fill(0);

    const total = daily.reduce((a, b) => a + b, 0);
    const avgPerDay = total / windowDays;
    const ewmaPerDay = ewma(daily, EWMA_ALPHA);
    const dailyStdDev = stdDev(daily);
    const activeDays = daily.filter((d) => d > 0).length;
    const confidence = Math.min(1, activeDays / CONFIDENCE_SATURATION_DAYS);

    const reorderPoint =
      ewmaPerDay * LEAD_TIME_DAYS + SERVICE_Z * dailyStdDev * Math.sqrt(LEAD_TIME_DAYS);

    let daysLeft: number | null = null;
    let daysLeftLow: number | null = null;
    let daysLeftHigh: number | null = null;
    if (ewmaPerDay > 0) {
      // Với trọng số dương, ewmaPerDay>0 ⇔ có xuất trong window ⇔ total>0.
      const rateHigh = ewmaPerDay + dailyStdDev; // tiêu thụ nhanh → còn ít ngày hơn
      // Sàn cận chậm ở NỬA tốc độ mượt: tránh mẫu số ~0 khiến daysLeftHigh ra vô cực.
      const rateLow = Math.max(ewmaPerDay - dailyStdDev, ewmaPerDay * 0.5);
      daysLeft = quantity / ewmaPerDay; // cạn sạch (quantity 0) → 0
      daysLeftLow = quantity / rateHigh;
      daysLeftHigh = quantity / rateLow;
    }

    // Nguyên tắc hơn ngưỡng "daysLeft < 7" cũ: đặt hàng lại khi tồn chạm safety stock.
    // Bao gồm cả cạn sạch (quantity 0, có lịch sử) vì 0 ≤ reorderPoint.
    const lowStock = ewmaPerDay > 0 && quantity <= reorderPoint;

    return {
      sku,
      itemName,
      quantity,
      avgPerDay,
      ewmaPerDay,
      dailyStdDev,
      daysLeft,
      daysLeftLow,
      daysLeftHigh,
      reorderPoint,
      confidence,
      lowStock,
    };
  });
}

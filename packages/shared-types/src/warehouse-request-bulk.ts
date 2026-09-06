/**
 * Việc làm GỘP cho cả loạt phiếu vật tư của một nhiệm vụ.
 *
 * Đặt ở gói dùng chung vì web và điện thoại đều bày ba cái nút ấy, và chúng phải
 * lộ ra theo ĐÚNG một quy tắc. Mỗi bên tự suy lấy thì sớm muộn cũng có ngày điện
 * thoại mời bấm "Xuất tất cả" trong khi còn dòng chưa ai tiếp nhận — máy chủ
 * chặn, còn người dùng nhận một câu báo lỗi cho việc lẽ ra phần mềm phải tự biết.
 */

export type BulkActionKind = "accept" | "prepare" | "pickup";

export interface BulkRequestLike {
  id: string;
  status: string;
  preparedQuantity: number;
}

export interface BulkActionPlan<T> {
  /** Việc kế tiếp làm được cho cả loạt; `null` là không còn gì để làm gộp. */
  kind: BulkActionKind | null;
  /** Đúng những dòng mà việc đó áp dụng được. */
  rows: T[];
  /** Dòng đã xuất nhưng đang khai lấy THIẾU — phải ký riêng, không gộp được. */
  partialPickupCount: number;
}

/**
 * Việc kế tiếp làm gộp được cho cả loạt là gì.
 *
 * BA MỐC NỐI ĐUÔI, mỗi lúc chỉ lộ ra MỘT: tiếp nhận hết → xuất hết → ký nhận hết.
 * Hiện cả ba cùng lúc thì người dùng phải tự đoán bấm cái nào trước, mà bấm sai thứ
 * tự thì backend chặn — họ nhận một câu báo lỗi cho việc lẽ ra phần mềm phải tự biết.
 * Còn dòng nào chưa tiếp nhận thì chưa thể nói tới xuất, nên cứ mốc sớm nhất còn dở
 * là mốc được hiện.
 *
 * KÝ NHẬN CHỈ GỘP DÒNG LẤY ĐỦ. Dòng nào người dùng đã gõ số nhỏ hơn số kho soạn là
 * dòng có chuyện — hàng thiếu, xe không chở hết, lô bị ướt. Ký gộp cho nó là ký thay
 * một khoản hàng chưa hề nhận được, mà chữ ký ấy chính là bằng chứng đối chiếu về
 * sau. Trả riêng `partialPickupCount` để màn hình nói được vì sao còn dòng ở lại,
 * thay vì lặng lẽ bỏ qua và để người dùng tưởng đã xong hết.
 */
export function planBulkAction<T extends BulkRequestLike>(
  rows: T[],
  typedPickupQuantity: (request: T) => string,
): BulkActionPlan<T> {
  const pending = rows.filter((request) => request.status === "PENDING");
  const accepted = rows.filter((request) => request.status === "ACCEPTED");
  const prepared = rows.filter((request) => request.status === "PREPARED");

  // Bỏ trống ô số nghĩa là lấy đủ — cùng quy ước với nút của từng dòng.
  const fullPickup = prepared.filter((request) => {
    const typed = typedPickupQuantity(request).trim();
    return typed === "" || Number(typed) === request.preparedQuantity;
  });
  const partialPickupCount = prepared.length - fullPickup.length;

  if (pending.length > 0) return { kind: "accept", rows: pending, partialPickupCount };
  if (accepted.length > 0) return { kind: "prepare", rows: accepted, partialPickupCount };
  if (fullPickup.length > 0) return { kind: "pickup", rows: fullPickup, partialPickupCount };
  return { kind: null, rows: [], partialPickupCount };
}

export const BULK_ACTION_LABEL: Record<BulkActionKind, string> = {
  accept: "Tiếp nhận tất cả",
  prepare: "Xuất tất cả",
  pickup: "Ký nhận tất cả",
};

export interface RequestLike {
  warehouseId: string;
  warehouse?: { name?: string | null } | null;
  status: string;
}

export interface WarehouseProgress {
  warehouseId: string;
  name: string;
  /** Số dòng KHO đã xuất — gồm cả dòng đội đã mang đi. */
  prepared: number;
  /** Số dòng ĐỘI đã ký nhận. */
  pickedUp: number;
  total: number;
  /**
   * XONG nghĩa là ĐỘI ĐÃ KÝ NHẬN ĐỦ, không phải kho đã xuất xong.
   *
   * Kho xuất hàng ra sân rồi mà chưa ai tới lấy thì việc chưa xong: hàng vẫn nằm
   * đó, người cần vẫn chưa có. Bật xong ở bước xuất là báo cho điều phối một tin
   * mừng chưa xảy ra, và họ thôi không gọi nữa.
   */
  done: boolean;
  /** Kho đã xuất hết nhưng đội chưa lấy xong — trạng thái giữa, phải nhìn thấy được. */
  awaitingPickup: boolean;
}

/**
 * Tiến độ chuẩn bị vật tư TÁCH THEO TỪNG KHO.
 *
 * Trước đây khối này chỉ ghi một con số gộp kiểu "1/5 vật tư đã xuất". Con số đó
 * không trả lời được câu hỏi duy nhất mà điều phối cần hỏi lúc đang chờ: **kho
 * nào xong rồi, kho nào chưa** — để còn gọi điện đúng nơi. Người dùng phải tự
 * cuộn hết danh sách rồi cộng nhẩm theo tên kho.
 *
 * BA MỐC chứ không phải hai: kho chưa xuất xong → kho đã xuất, chờ đội tới lấy →
 * đội đã ký nhận đủ. Gộp hai mốc sau làm một thì điều phối tưởng việc đã xong
 * trong khi hàng còn nằm ở sân kho, và họ thôi không gọi nhắc nữa.
 *
 * Xếp kho CHƯA XONG lên trước: đó mới là việc phải làm, kho đã xong chỉ để đối
 * chiếu. Cùng trạng thái thì xếp theo tên cho ổn định giữa các lần tải lại.
 */
export function warehouseProgress(requests: RequestLike[]): WarehouseProgress[] {
  const byWarehouse = new Map<string, WarehouseProgress>();

  for (const request of requests) {
    const key = request.warehouseId;
    const current = byWarehouse.get(key) ?? {
      warehouseId: key,
      name: request.warehouse?.name?.trim() || "Kho chưa đặt tên",
      prepared: 0,
      pickedUp: 0,
      total: 0,
      done: false,
      awaitingPickup: false,
    };
    current.total += 1;
    // Đếm HAI mốc riêng. Kho xuất là một việc, đội lấy là việc khác, và khoảng
    // giữa hai việc ấy là lúc hàng nằm ở sân kho chờ người tới.
    if (request.status === "PREPARED" || request.status === "PICKED_UP") current.prepared += 1;
    if (request.status === "PICKED_UP") current.pickedUp += 1;
    byWarehouse.set(key, current);
  }

  const rows = [...byWarehouse.values()].map((row) => ({
    ...row,
    done: row.pickedUp === row.total,
    awaitingPickup: row.prepared === row.total && row.pickedUp < row.total,
  }));
  return rows.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.name.localeCompare(b.name, "vi");
  });
}

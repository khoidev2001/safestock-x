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
  const theoKho = new Map<string, WarehouseProgress>();

  for (const request of requests) {
    const key = request.warehouseId;
    const current = theoKho.get(key) ?? {
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
    theoKho.set(key, current);
  }

  const rows = [...theoKho.values()].map((row) => ({
    ...row,
    done: row.pickedUp === row.total,
    awaitingPickup: row.prepared === row.total && row.pickedUp < row.total,
  }));
  return rows.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.name.localeCompare(b.name, "vi");
  });
}

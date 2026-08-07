export interface RequestLike {
  warehouseId: string;
  warehouse?: { name?: string | null } | null;
  status: string;
}

export interface WarehouseProgress {
  warehouseId: string;
  name: string;
  prepared: number;
  total: number;
  done: boolean;
}

/**
 * Tiến độ chuẩn bị vật tư TÁCH THEO TỪNG KHO.
 *
 * Trước đây khối này chỉ ghi một con số gộp kiểu "1/5 vật tư đã xuất". Con số đó
 * không trả lời được câu hỏi duy nhất mà điều phối cần hỏi lúc đang chờ: **kho
 * nào xong rồi, kho nào chưa** — để còn gọi điện đúng nơi. Người dùng phải tự
 * cuộn hết danh sách rồi cộng nhẩm theo tên kho.
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
      total: 0,
      done: false,
    };
    current.total += 1;
    // PICKED_UP cũng tính là ĐÃ XUẤT. Hàng đã có người ký nhận mang đi thì
    // đương nhiên kho đã soạn xong; đếm thiếu nó là kho vừa làm xong bỗng lùi về
    // "chưa xong" ngay khi người lấy hàng ký tên.
    if (request.status === "PREPARED" || request.status === "PICKED_UP") current.prepared += 1;
    theoKho.set(key, current);
  }

  const rows = [...theoKho.values()].map((row) => ({ ...row, done: row.prepared === row.total }));
  return rows.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.name.localeCompare(b.name, "vi");
  });
}

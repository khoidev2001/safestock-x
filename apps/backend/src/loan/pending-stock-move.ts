export interface PendingStockMove {
  effect: "DEDUCT" | "ADD";
  userId: string;
  batchId: string;
  quantity: number;
  scopeWarehouseId: string | null;
  note: string;
  /** Khoá chống trùng của kho — thứ làm cho việc chạy lại an toàn. */
  requestId: string;
}

/**
 * Đọc lời hứa chuyển kho từ cột JSON, từ chối mọi thứ không đủ hình.
 *
 * Cột JSON không có kiểu ở tầng cơ sở dữ liệu, nên bản ghi cũ, bản ghi do người
 * sửa tay, hay bản ghi từ một phiên bản mã khác đều có thể nằm ở đó. Chạy lại một
 * lệnh chuyển kho dựng từ dữ liệu méo là chuyển nhầm hàng thật — thà bỏ qua và để
 * người đối chiếu tay còn hơn.
 *
 * `quantity` phải là số nguyên DƯƠNG: chuyển 0 thì chẳng để làm gì, còn số âm là
 * đảo chiều lệnh chuyển.
 */
export function parsePendingStockMove(raw: unknown): PendingStockMove | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.effect !== "DEDUCT" && o.effect !== "ADD") return null;
  if (typeof o.userId !== "string" || o.userId.length === 0) return null;
  if (typeof o.batchId !== "string" || o.batchId.length === 0) return null;
  if (typeof o.requestId !== "string" || o.requestId.length === 0) return null;
  if (typeof o.note !== "string") return null;
  if (typeof o.quantity !== "number" || !Number.isInteger(o.quantity) || o.quantity <= 0) {
    return null;
  }
  if (o.scopeWarehouseId !== null && typeof o.scopeWarehouseId !== "string") return null;

  return {
    effect: o.effect,
    userId: o.userId,
    batchId: o.batchId,
    quantity: o.quantity,
    scopeWarehouseId: o.scopeWarehouseId as string | null,
    note: o.note,
    requestId: o.requestId,
  };
}

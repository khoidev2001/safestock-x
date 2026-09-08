import { BadRequestException } from "@nestjs/common";
import { isRequestExported } from "./mission-request-status";
import { resizeRequestAllocations, type MissionAllocationRow } from "./mission-warehouse-request";
import type { MissionWarehouseRequestStatus } from "@prisma/client";

/**
 * Vật tư đội cứu hộ còn cầm sau khi đóng nhiệm vụ — hàm thuần, khoá bằng test.
 *
 * Việc khó ở đây không phải "giữ bao nhiêu" mà là "giữ ĐÚNG NHỮNG LÔ NÀO". Trả về
 * kho là cộng lại tồn cho từng lô cụ thể, nên chọn nhầm lô là cộng hàng vào một
 * lô khác hạn dùng, và sổ kho lệch mà không ai thấy lệch ở đâu.
 */

/** Một phiếu vật tư đã đi qua kho, đủ dữ kiện để biết thực sự lấy đi những gì. */
export interface HoldingSourceRequest {
  id: string;
  warehouseId: string;
  sku: string;
  itemName: string;
  unit: string;
  status: MissionWarehouseRequestStatus;
  /** Danh sách lô kho ĐÃ THẬT SỰ đưa ra, chốt lúc bấm "đã chuẩn bị". */
  preparedAllocations: unknown;
  /** Số người đi lấy đã ký nhận. Rỗng = chưa ai ký, khác hẳn ký nhận 0. */
  pickedUpQuantity: number | null;
}

/** Một dòng sẽ ghi vào sổ tạm giữ. */
export interface HoldingRow {
  warehouseId: string;
  sku: string;
  itemName: string;
  unit: string;
  quantity: number;
  batches: MissionAllocationRow[];
}

/** Số đội khai còn giữ cho một mã vật tư. */
export interface DeclaredHolding {
  sku: string;
  quantity: number;
}

/**
 * Tổng số đã có người ký nhận cho một mã vật tư.
 *
 * Chỉ đếm phiếu đã rời kho VÀ đã có chữ ký. Phiếu `pickedUpQuantity` rỗng nghĩa là
 * hàng còn nằm trên sân kho chờ người tới lấy — không ai đang cầm nó cả.
 */
export function pickedUpQuantityBySku(requests: HoldingSourceRequest[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const request of eligibleRequests(requests)) {
    totals.set(request.sku, (totals.get(request.sku) ?? 0) + (request.pickedUpQuantity as number));
  }
  return totals;
}

/**
 * Dựng các dòng sổ tạm giữ từ những gì ĐÃ THẬT SỰ rời kho.
 *
 * Nguồn sự thật là `preparedAllocations` — đúng danh sách lô đã đưa cho lệnh xuất
 * kho — chứ KHÔNG phải `MissionRequirement.allocations`. Hai thứ lệch nhau ngay khi
 * điều phối cắt bớt một phiếu trước lúc kho xuất: phần phân bổ trên nhiệm vụ vẫn
 * ghi con số cũ, còn hàng đi ra khỏi kho là con số mới.
 *
 * Đội khai giữ nhiều hơn số đã ký nhận thì CHẶN chứ không lặng lẽ kẹp xuống: đó là
 * lỗi nhập liệu, mà kẹp âm thầm là biến một con số sai thành một con số trông hợp lệ.
 *
 * Mỗi (kho, mã vật tư) là MỘT dòng riêng: trả hàng là trả về đúng cái kho đã xuất
 * nó ra, và hai kho khác nhau thì hai người khác nhau ký nhận lại.
 */
export function buildHoldingRows(
  requests: HoldingSourceRequest[],
  declared: DeclaredHolding[],
): HoldingRow[] {
  const eligible = eligibleRequests(requests);
  const pickedUp = pickedUpQuantityBySku(requests);
  const rows: HoldingRow[] = [];

  for (const item of declared) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      throw new BadRequestException(`Số lượng đang giữ của ${item.sku} phải là số nguyên không âm`);
    }
    if (item.quantity === 0) continue;

    const available = pickedUp.get(item.sku) ?? 0;
    if (item.quantity > available) {
      throw new BadRequestException(
        `Không giữ được nhiều hơn số đã ký nhận: ${item.sku} đã nhận ${available}, khai giữ ${item.quantity}.`,
      );
    }

    // Thứ tự CHỐT CHẾT theo (kho, id phiếu), giống hệt thứ tự lúc tạo phiếu. Hai
    // lượt chạy trên cùng dữ liệu phải ra cùng một danh sách lô, nếu không thì
    // gửi lại cùng một báo cáo lại sinh ra một sổ tạm giữ khác.
    const sources = eligible
      .filter((request) => request.sku === item.sku)
      .sort(
        (left, right) =>
          left.warehouseId.localeCompare(right.warehouseId) || left.id.localeCompare(right.id),
      );

    let remaining = item.quantity;
    const byWarehouse = new Map<string, HoldingRow>();
    for (const request of sources) {
      if (remaining <= 0) break;
      // Cắt phiếu về đúng phần đã ký nhận TRƯỚC: kho soạn 10 mà người đi lấy chỉ
      // cầm được 8 thì hai lô cuối chưa bao giờ ra khỏi kho.
      const signedFor = resizeRequestAllocations(
        request.preparedAllocations,
        request.pickedUpQuantity as number,
      );
      const take = Math.min(remaining, sumQuantity(signedFor));
      if (take <= 0) continue;
      const batches = resizeRequestAllocations(signedFor, take);
      remaining -= take;

      const current = byWarehouse.get(request.warehouseId);
      if (current) {
        current.quantity += take;
        current.batches.push(...batches);
        continue;
      }
      byWarehouse.set(request.warehouseId, {
        warehouseId: request.warehouseId,
        sku: item.sku,
        itemName: request.itemName,
        unit: request.unit,
        quantity: take,
        batches,
      });
    }
    rows.push(...byWarehouse.values());
  }

  return rows;
}

/**
 * Phần được hoàn về kho khi giao thất bại, đã TRỪ đi phần đội còn giữ.
 *
 * Nhiệm vụ giao thất bại thì hệ thống tự nhập lại toàn bộ hàng đã xuất. Nếu cùng
 * lúc đó đội khai vẫn đang cầm một phần, thì cùng một đống hàng vừa được cộng lại
 * vào lô vừa được ghi là đang nằm trên xe — tồn kho tăng khống, và chỉ tới đợt
 * kiểm kê sau mới lòi ra mà không ai lần được nguyên nhân.
 */
export function subtractHeldFromRestock(
  restock: { batchId: string; quantity: number }[],
  held: HoldingRow[],
): { batchId: string; quantity: number }[] {
  const heldByBatch = new Map<string, number>();
  for (const row of held) {
    for (const batch of row.batches) {
      heldByBatch.set(batch.batchId, (heldByBatch.get(batch.batchId) ?? 0) + batch.qty);
    }
  }
  return restock
    .map((item) => {
      const stillHeld = heldByBatch.get(item.batchId) ?? 0;
      if (stillHeld <= 0) return item;
      const remaining = Math.max(0, item.quantity - stillHeld);
      heldByBatch.set(item.batchId, Math.max(0, stillHeld - item.quantity));
      return { batchId: item.batchId, quantity: remaining };
    })
    .filter((item) => item.quantity > 0);
}

/** Gộp các dòng đang giữ thành lời nhắc đọc được cho thông báo. */
export function summarizeHoldings(rows: { itemName: string; unit: string; quantity: number }[]) {
  return rows.map((row) => `${row.itemName} ${row.quantity} ${row.unit}`).join("; ");
}

// ---- helpers ----

function eligibleRequests(requests: HoldingSourceRequest[]): HoldingSourceRequest[] {
  return requests.filter(
    (request) =>
      isRequestExported(request.status) &&
      request.pickedUpQuantity != null &&
      request.pickedUpQuantity > 0,
  );
}

function sumQuantity(rows: MissionAllocationRow[]): number {
  return rows.reduce((total, row) => total + row.qty, 0);
}

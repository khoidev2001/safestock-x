/**
 * Lực lượng hiện trường chốt từng món phải lấy bao nhiêu từ kho — luật thuần.
 *
 * Đây là chặng trước đây không có. Kho soạn đúng số định mức, kể cả khi đội đang
 * cầm sẵn hai chục áo phao từ chuyến trước — vật tư ra khỏi kho hai lần cho cùng
 * một nhu cầu, và lần thứ hai thì kho hết hàng cho nhiệm vụ khác.
 *
 * Tách khỏi màn hình vì đây là phần dễ sai nhất và cũng là phần duy nhất kiểm
 * được bằng test: người đang đứng ngoài mưa gõ số vào, và mọi cách gõ sai đều
 * phải bị chặn NGAY trên máy, không phải sau một vòng mạng chập chờn.
 */

export type PickupDecision = "TAKE_ALL" | "TAKE_PARTIAL" | "TAKE_NONE";

export const PICKUP_DECISION_LABEL: Record<PickupDecision, string> = {
  TAKE_ALL: "Lấy hết từ kho",
  TAKE_PARTIAL: "Lấy một phần",
  TAKE_NONE: "Không cần lấy",
};

/** Một dòng trong bản tham mưu, kèm phần đội đang cầm sẵn nếu có. */
export interface DecisionRow {
  sku: string;
  itemName: string;
  unit: string;
  required: number;
  /** Số món này đội đang giữ từ nhiệm vụ trước. */
  heldQuantity: number;
}

/** Lựa chọn đang gõ dở trên máy: số lượng giữ dạng CHUỖI như mọi ô nhập khác. */
export interface DecisionDraft {
  decision?: PickupDecision;
  quantity?: string;
}

export interface PreparedDecision {
  sku: string;
  decision: PickupDecision;
  quantity?: number;
}

/**
 * Món này có được PHÉP đổi số không, hay cứ lấy đúng số điều phối đưa.
 *
 * Đội chỉ có quyền hạ số xuống ở những món HỌ ĐANG CẦM SẴN — đó là thứ duy nhất
 * họ biết mà điều phối không biết, và cũng là lý do cả chặng này tồn tại. Món
 * không nằm trong sổ tạm giữ thì con số của điều phối là con số duy nhất có căn
 * cứ; mở ô cho gõ ở đó là mời người đang đứng ngoài mưa ước lượng lại một định
 * mức đã tính theo số người, rồi kho soạn theo cái ước lượng ấy.
 */
export function isDecisionLocked(row: DecisionRow): boolean {
  return row.heldQuantity <= 0;
}

/**
 * Ít nhất phải lấy bao nhiêu từ kho thì bản tham mưu mới được phủ kín.
 *
 * `cần − đang giữ`, không âm. Đây là SÀN, không phải gợi ý: đội chỉ được hạ số
 * xuống bằng đúng phần họ đang cầm sẵn, vì đó là thứ duy nhất họ biết mà điều
 * phối không biết. Hạ thấp hơn nữa là tự sửa định mức đã tính theo số người —
 * và cú sửa đó không hiện ra ở đâu cả.
 *
 * Ca hỏng đã gặp: cần 2 cuộn dây, đội giữ 1, chọn "không cần lấy". Máy chủ nhận,
 * kho không soạn cuộn nào, và màn hình điều phối đọc ra "Không cần lấy từ kho ·
 * đội đang giữ 1 cuộn" — nghe như đã đủ, trong khi nhiệm vụ thiếu đúng một cuộn
 * và không dòng nào trên trang nói ra điều đó.
 */
export function minimumWarehouseQuantity(row: DecisionRow): number {
  return Math.max(0, row.required - row.heldQuantity);
}

/** "Không cần lấy" chỉ trung thực khi đội đang cầm đủ cả phần cần. */
export function canTakeNone(row: DecisionRow): boolean {
  return minimumWarehouseQuantity(row) === 0;
}

/**
 * Gợi ý sẵn lựa chọn theo phần đội đang cầm.
 *
 * Đang giữ đủ thì mặc định KHÔNG CẦN LẤY; giữ được một phần thì mặc định lấy nốt
 * phần thiếu. Người dùng đổi lại được — nhưng để trống hết và bắt họ tự tính
 * "cần 30, đang có 20, vậy lấy 10" giữa lúc đang vội là chỗ đẻ ra số sai.
 */
export function suggestDecision(row: DecisionRow): DecisionDraft {
  if (row.heldQuantity <= 0) return { decision: "TAKE_ALL" };
  if (row.heldQuantity >= row.required) return { decision: "TAKE_NONE" };
  return { decision: "TAKE_PARTIAL", quantity: String(row.required - row.heldQuantity) };
}

/** Câu mô tả phần đội đang cầm, để hiện ngay dưới tên vật tư. */
export function heldSummary(row: DecisionRow): string | null {
  if (row.heldQuantity <= 0) return null;
  if (row.heldQuantity >= row.required) {
    return `Đội đang giữ ${row.heldQuantity} ${row.unit} — đủ cho nhiệm vụ này.`;
  }
  return `Đội đang giữ ${row.heldQuantity} ${row.unit}, còn thiếu ${
    row.required - row.heldQuantity
  } ${row.unit}.`;
}

/**
 * Kiểm toàn bộ câu trả lời trước khi gửi.
 *
 * Trả về lỗi ĐẦU TIÊN kèm tên vật tư chứ không phải danh sách lỗi: màn hình điện
 * thoại chỉ đủ chỗ cho một câu, và người đọc cần biết phải sửa ô nào chứ không
 * cần biết mình sai mấy chỗ.
 */
export function validateDecisions(
  rows: DecisionRow[],
  drafts: Record<string, DecisionDraft>,
): { ok: true; decisions: PreparedDecision[] } | { ok: false; message: string } {
  const decisions: PreparedDecision[] = [];
  for (const row of rows) {
    // Món đội không giữ sẵn: lấy đúng số điều phối đưa, không hỏi và không nhận
    // câu trả lời nào khác. Màn hình cũng không vẽ ô nào cho nó, nên đọc `drafts`
    // ở đây là đọc một ô không tồn tại và chặn nhầm cả lượt gửi.
    if (isDecisionLocked(row)) {
      decisions.push({ sku: row.sku, decision: "TAKE_ALL" });
      continue;
    }
    const draft = drafts[row.sku];
    if (!draft?.decision) {
      return { ok: false, message: `Chưa chọn cách lấy cho ${row.itemName}.` };
    }
    if (draft.decision === "TAKE_NONE" && !canTakeNone(row)) {
      const minimum = minimumWarehouseQuantity(row);
      return {
        ok: false,
        message: `${row.itemName}: đội chỉ giữ ${row.heldQuantity}/${row.required} ${row.unit}, phải lấy ít nhất ${minimum} ${row.unit} từ kho.`,
      };
    }
    if (draft.decision !== "TAKE_PARTIAL") {
      decisions.push({ sku: row.sku, decision: draft.decision });
      continue;
    }
    const raw = (draft.quantity ?? "").trim();
    if (raw === "") {
      return { ok: false, message: `Nhập số lượng cần lấy của ${row.itemName}.` };
    }
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return {
        ok: false,
        message: `Số lượng của ${row.itemName} phải là số nguyên lớn hơn 0.`,
      };
    }
    if (quantity >= row.required) {
      // Gõ đúng bằng số cần thì đó là "lấy hết", và bấm đúng nút ấy mới đọc lại
      // được là đội ĐỒNG Ý với bản tham mưu chứ không phải tự nghĩ ra con số.
      return {
        ok: false,
        message: `${row.itemName}: lấy một phần phải nhỏ hơn ${row.required} ${row.unit}. Cần lấy đủ thì chọn "Lấy hết từ kho".`,
      };
    }
    const minimum = minimumWarehouseQuantity(row);
    if (quantity < minimum) {
      // Phần hụt ở đây KHÔNG hiện ra ở màn nào phía sau: kho soạn đúng số này,
      // bản tham mưu vẫn ghi số cũ, và chênh lệch chỉ lộ ra lúc phát tận tay dân.
      return {
        ok: false,
        message: `${row.itemName}: đội đang giữ ${row.heldQuantity} ${row.unit}, nên phải lấy ít nhất ${minimum} ${row.unit} từ kho cho đủ ${row.required}.`,
      };
    }
    decisions.push({ sku: row.sku, decision: "TAKE_PARTIAL", quantity });
  }
  return { ok: true, decisions };
}

/** Câu tóm tắt trên nút xác nhận, để người ta thấy mình sắp gửi gì đi. */
export function summarizeDecisions(rows: DecisionRow[], decisions: PreparedDecision[]): string {
  const bySku = new Map(rows.map((row) => [row.sku, row] as const));
  const toDraw = decisions.filter((decision) => decision.decision !== "TAKE_NONE");
  if (toDraw.length === 0) return "Không cần lấy vật tư nào từ kho.";
  return toDraw
    .map((decision) => {
      const row = bySku.get(decision.sku);
      if (!row) return decision.sku;
      const quantity = decision.decision === "TAKE_ALL" ? row.required : (decision.quantity ?? 0);
      return `${row.itemName} ${quantity} ${row.unit}`;
    })
    .join("; ");
}

/**
 * Số còn giữ mặc định khi đội bấm "chưa hoàn trả" lúc đóng nhiệm vụ.
 *
 * Mặc định là TOÀN BỘ phần tái sử dụng đã ký nhận. Đoán thấp xuống là làm sổ đẹp
 * bằng cách bỏ quên hàng; người dùng sửa xuống được nếu đã phát bớt.
 */
export function defaultHeldItems(
  rows: { sku: string; pickedUpQuantity: number }[],
): { sku: string; quantity: number }[] {
  return rows
    .filter((row) => row.pickedUpQuantity > 0)
    .map((row) => ({ sku: row.sku, quantity: row.pickedUpQuantity }));
}

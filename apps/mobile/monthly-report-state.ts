export interface MonthlyReportBatch {
  id: string;
  batchCode: string;
  quantity: number;
  condition: string;
  expiryDate: string | null;
  shelf: { code: string };
  loans?: {
    quantity: number;
    returnedOk: number;
    returnedDamaged: number;
    lost: number;
  }[];
  item: {
    sku: string;
    name: string;
    unit?: string;
    category?: { unit?: string };
  };
}

export interface MonthlyReportRow {
  batchId: string;
  batchCode: string;
  shelfCode: string;
  sku: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  condition: string | null;
  note: string | null;
}

export interface MonthlyReportDraftRow extends Omit<MonthlyReportRow, "quantity"> {
  systemQuantity: number;
  countedQuantity: string;
}

export function buildMonthlyReportRows(batches: MonthlyReportBatch[]): MonthlyReportRow[] {
  return batches
    .filter((batch) => batch.item.sku.trim() && batch.id.trim())
    .map((batch) => {
      const outstanding = (batch.loans ?? []).reduce(
        (total, loan) =>
          total + Math.max(0, loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost),
        0,
      );
      return {
        batchId: batch.id,
        batchCode: batch.batchCode,
        shelfCode: batch.shelf.code,
        sku: batch.item.sku.trim(),
        itemName: batch.item.name.trim(),
        quantity: Math.max(0, batch.quantity - outstanding),
        unit: batch.item.category?.unit ?? batch.item.unit ?? "",
        expiryDate: batch.expiryDate?.slice(0, 10) ?? null,
        condition: batch.condition || null,
        note: null,
      };
    })
    .sort(
      (left, right) =>
        left.sku.localeCompare(right.sku) ||
        left.batchCode.localeCompare(right.batchCode) ||
        left.batchId.localeCompare(right.batchId),
    );
}

export function buildMonthlyReportDraft(batches: MonthlyReportBatch[]): MonthlyReportDraftRow[] {
  return buildMonthlyReportRows(batches).map(({ quantity, ...row }) => ({
    ...row,
    systemQuantity: quantity,
    countedQuantity: "",
  }));
}

export function finalizeMonthlyReportDraft(draft: MonthlyReportDraftRow[]): MonthlyReportRow[] {
  return draft.map(({ systemQuantity: _systemQuantity, countedQuantity, ...row }) => {
    const normalized = countedQuantity.trim();
    const quantity = Number(normalized);
    if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(quantity)) {
      throw new Error(`Nhập số đếm thực tế cho ${row.sku} · lô ${row.batchCode}`);
    }
    return { ...row, quantity };
  });
}

/** Trạng thái báo cáo tháng, đúng bằng enum của máy chủ. */
export type MonthlyReportStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface SubmittedReportSummary {
  warehouseId: string;
  period: string;
  status: string;
}

/**
 * Báo cáo đang CHẶN kỳ này, nếu có.
 *
 * Máy chủ từ chối gửi khi kho đã có báo cáo kỳ đó ở trạng thái PENDING hoặc
 * APPROVED (report.service → createPendingReport). Bị TỪ CHỐI thì được gửi lại —
 * đó chính là mục đích của việc từ chối.
 *
 * Có hàm này ở phía điện thoại để màn hình chặn NGAY TỪ ĐẦU thay vì để người
 * dùng đếm xong vài chục lô rồi mới nhận lỗi 409. Luật phải khớp từng chữ với
 * máy chủ: rộng hơn thì khoá nhầm một kỳ hợp lệ, hẹp hơn thì vẫn để họ gõ phí
 * công. Máy chủ vẫn là nơi quyết định cuối cùng — đây chỉ là lớp báo sớm.
 */
export function blockingMonthlyReport<T extends SubmittedReportSummary>(
  reports: T[],
  warehouseId: string,
  period: string,
): T | null {
  if (!warehouseId || !period) return null;
  return (
    reports.find(
      (report) =>
        report.warehouseId === warehouseId &&
        report.period === period &&
        (report.status === "PENDING" || report.status === "APPROVED"),
    ) ?? null
  );
}

/** Kỳ báo cáo hợp lệ: đúng dạng YYYY-MM và tháng nằm trong 01–12. */
export function isValidReportPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period.trim());
}

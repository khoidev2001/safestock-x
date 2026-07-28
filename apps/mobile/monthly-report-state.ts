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

export function buildMonthlyReportRows(
  batches: MonthlyReportBatch[],
): MonthlyReportRow[] {
  return batches
    .filter((batch) => batch.item.sku.trim() && batch.id.trim())
    .map((batch) => {
      const outstanding = (batch.loans ?? []).reduce(
        (total, loan) =>
          total +
          Math.max(
            0,
            loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost,
          ),
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

export function buildMonthlyReportDraft(
  batches: MonthlyReportBatch[],
): MonthlyReportDraftRow[] {
  return buildMonthlyReportRows(batches).map(({ quantity, ...row }) => ({
    ...row,
    systemQuantity: quantity,
    countedQuantity: "",
  }));
}

export function finalizeMonthlyReportDraft(
  draft: MonthlyReportDraftRow[],
): MonthlyReportRow[] {
  return draft.map(({ systemQuantity: _systemQuantity, countedQuantity, ...row }) => {
    const normalized = countedQuantity.trim();
    const quantity = Number(normalized);
    if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(quantity)) {
      throw new Error(
        `Nhập số đếm thực tế cho ${row.sku} · lô ${row.batchCode}`,
      );
    }
    return { ...row, quantity };
  });
}

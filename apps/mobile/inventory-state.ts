export type InventoryAction =
  | "import"
  | "export"
  | "transfer"
  | "reconcile"
  | "adjust"
  | "condition"
  | "bulk-export"
  | "borrow"
  | "return";

const STOCK_ACTIONS = new Set<InventoryAction>([
  "import",
  "export",
  "transfer",
  "reconcile",
  "adjust",
  "condition",
  "bulk-export",
]);

/**
 * ADMIN làm việc trên web. Khi cầm điện thoại, họ chỉ quét QR để nhập/xuất ngay
 * tại kệ — không mang cả bảng điều hành lên màn hình nhỏ.
 */
const ADMIN_MOBILE_ACTIONS = new Set<InventoryAction>(["import", "export"]);

export function canPerformInventoryAction(role: string, action: InventoryAction): boolean {
  if (role === "WAREHOUSE") return true;
  if (role === "ADMIN") return ADMIN_MOBILE_ACTIONS.has(action);
  // Lực lượng hiện trường không đụng vào kho: họ gửi yêu cầu, người giữ kho đối
  // chiếu tồn rồi quyết định cho mượn.
  return false;
}

export interface ScannedInventoryCode {
  sku: string;
  batchCode: string | null;
}

export function parseScannedInventoryCode(payload: string): ScannedInventoryCode | null {
  const value = payload.trim();
  if (!value) return null;

  const direct = normalizeSku(value);
  if (direct) return { sku: direct, batchCode: null };

  try {
    const parsed = JSON.parse(value) as {
      sku?: unknown;
      batch?: unknown;
      batchCode?: unknown;
    };
    const sku = typeof parsed.sku === "string" ? normalizeSku(parsed.sku) : null;
    if (sku) {
      return {
        sku,
        batchCode: normalizeBatchCode(parsed.batchCode ?? parsed.batch),
      };
    }
  } catch {
    // Payload không phải JSON; thử URL bên dưới.
  }

  try {
    const url = new URL(value);
    const sku = normalizeSku(url.searchParams.get("sku") ?? "");
    if (!sku) return null;
    return {
      sku,
      batchCode: normalizeBatchCode(
        url.searchParams.get("batch") ?? url.searchParams.get("batchCode"),
      ),
    };
  } catch {
    return null;
  }
}

export function parseScannedSku(payload: string): string | null {
  return parseScannedInventoryCode(payload)?.sku ?? null;
}

function normalizeSku(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(normalized) ? normalized : null;
}

function normalizeBatchCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(normalized) ? normalized : null;
}

export interface LoanReturnInput {
  ok: number;
  damaged: number;
  lost: number;
}

export type LoanReturnValidation =
  { valid: true; total: number } | { valid: false; total: number; reason: string };

export function validateLoanReturn(
  outstanding: number,
  input: LoanReturnInput,
): LoanReturnValidation {
  const total = input.ok + input.damaged + input.lost;
  if (
    !Number.isInteger(input.ok) ||
    !Number.isInteger(input.damaged) ||
    !Number.isInteger(input.lost) ||
    input.ok < 0 ||
    input.damaged < 0 ||
    input.lost < 0
  ) {
    return { valid: false, total, reason: "Số hoàn phải là số nguyên không âm" };
  }
  if (total <= 0) {
    return { valid: false, total, reason: "Chưa nhập số lượng hoàn" };
  }
  if (total > outstanding) {
    return { valid: false, total, reason: "Số hoàn vượt quá số còn nợ" };
  }
  return { valid: true, total };
}

export function isStockAction(action: InventoryAction): boolean {
  return STOCK_ACTIONS.has(action);
}

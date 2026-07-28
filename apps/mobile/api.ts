import { requireApiBase } from "./config";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  fullName?: string | null;
  phone?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  unitName?: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  missionId?: string | null;
}

export interface WarehouseSummary {
  id: string;
  name: string;
  location?: string | null;
}

export type ReadinessComponentKey =
  | "quantityAvailability"
  | "itemCondition"
  | "expiry"
  | "accessibility"
  | "environment"
  | "dataReliability";

export type OperationalStatus =
  | "READY"
  | "NEEDS_ACTION"
  | "NOT_DISPATCHABLE";

export interface WarehouseReadiness {
  id: string;
  warehouseId: string;
  score: number;
  referenceScore: number;
  operationalStatus: OperationalStatus;
  zone: "READY" | "ATTENTION" | "DEGRADED" | "CRITICAL";
  computedAt: string;
  isStale?: boolean;
  ageMs?: number;
  blockers: {
    code: string;
    title: string;
    reasons: string[];
    source: "INCIDENT" | "READINESS_DIMENSION";
  }[];
  dimensions: {
    key: ReadinessComponentKey;
    status: OperationalStatus;
    referenceScore: number;
    reasons: string[];
    recommendedAction: string | null;
  }[];
  recommendedActions: string[];
  components: {
    key: ReadinessComponentKey;
    value: number;
    weight: number;
    reasons: string[];
  }[];
}

export interface InventoryBatch {
  id: string;
  code?: string;
  batchCode: string;
  quantity: number;
  condition: string;
  circulation: string;
  expiryDate: string | null;
  loans?: {
    quantity: number;
    returnedOk: number;
    returnedDamaged: number;
    lost: number;
  }[];
  item: {
    id: string;
    name: string;
    sku: string;
    unit?: string;
    category?: { name: string; unit?: string };
  };
  shelf: {
    id: string;
    code: string;
    name?: string;
    zone: { id: string; name: string; code: string };
  };
}

export interface InventoryCatalogItem {
  id: string;
  name: string;
  sku: string;
  consumable: boolean;
  category: { id: string; name: string; unit: string };
}

export interface IncidentSummary {
  id: string;
  title: string;
  kind: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  state: string;
  confidence: number;
  detectedAt: string;
  explanation?: string | null;
}

export interface WarehouseInsights {
  weatherAlert: {
    totalRainMm: number;
    alert: boolean;
    periodHours: 72;
    daily: { date: string; precipitationMm: number }[];
    cached?: boolean;
    stale?: boolean;
  } | null;
  weatherDemand: {
    sku: string;
    itemName: string;
    unit: string;
    projectedDemand72h: number;
    shortage: number;
    demandFactor: number;
    atRisk: boolean;
  }[];
}

export interface DailyBriefing {
  generatedAt: string;
  source: "AI" | "TEMPLATE";
  narrative: string;
  priorities: string[];
}

export interface SemanticInventoryResponse {
  available: boolean;
  mode: "EMBEDDING" | "LEXICAL_FALLBACK";
  results: { sku: string; score: number }[];
}

export interface WarehouseTree extends WarehouseSummary {
  zones: {
    id: string;
    code: string;
    name: string;
    shelves: {
      id: string;
      code: string;
      isLocked: boolean;
      _count?: { batches: number };
    }[];
  }[];
}

export type StockReportStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface StockReportRow {
  batchId?: string | null;
  batchCode?: string | null;
  shelfCode?: string | null;
  sku: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  condition: string | null;
  note: string | null;
}

export interface StockReport {
  id: string;
  warehouseId: string;
  period: string;
  status: StockReportStatus;
  rows?: StockReportRow[];
  note?: string | null;
  createdAt: string;
  warehouse?: { name: string };
  submittedBy?: { fullName: string };
}

export interface LoanRecord {
  id: string;
  quantity: number;
  returnedOk: number;
  returnedDamaged: number;
  lost: number;
  status: string;
  borrowedAt: string;
  batch: {
    id: string;
    batchCode: string;
    item: { id: string; name: string; sku: string; unit?: string };
  };
}

export function createMutationRequestId(prefix = "mobile"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Đăng nhập → nhận token + hồ sơ. Ném lỗi có message tiếng Việt từ backend. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await request(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Đăng nhập thất bại");
  }
  return res.json();
}

export async function refreshSession(
  refreshToken: string,
): Promise<LoginResult> {
  const res = await request(apiUrl("/api/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.message ?? "Phiên đăng nhập đã hết hạn", res.status);
  }
  return res.json();
}

/** Danh sách thông báo của role hiện tại (mới nhất trước). */
export async function fetchNotifications(token: string): Promise<Notification[]> {
  const res = await request(apiUrl("/api/notifications"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Không tải được danh sách thông báo");
  return res.json();
}

/** Giọng nói (WAV 16kHz base64) → text tiếng Việt bằng PhoWhisper local (proxy AI). */
export async function transcribe(
  token: string,
  audioBase64: string,
  mimeType = "audio/wav",
): Promise<{ text: string }> {
  const res = await request(apiUrl("/api/missions/transcribe"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64, mimeType }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Nhận dạng giọng nói chưa sẵn sàng");
  }
  return res.json();
}

/**
 * Trưởng thôn gửi báo cáo tình huống từ hiện trường → backend tạo DRAFT + báo cơ quan
 * điều phối (ADMIN). Trả { missionId }. Toạ độ tuỳ chọn (ghim điểm nạn nếu có).
 */
export async function submitReport(
  token: string,
  input: {
    description: string;
    incidentLat?: number;
    incidentLng?: number;
    requestId?: string;
  },
): Promise<{ missionId: string }> {
  const res = await request(apiUrl("/api/missions/report"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Không gửi được báo cáo");
  }
  return res.json();
}

export interface MissionRequirement {
  id: string;
  sku: string;
  itemName: string;
  required: number;
  allocated: number;
  shortage: number;
  unit: string;
}

export interface MissionDetail {
  id: string;
  incidentType: string;
  affectedPeople: number;
  durationHours: number;
  status: string;
  fulfillment: number;
  location?: string | null;
  priority?: string | null;
  createdAt?: string | null;
  adminNote?: string | null;
  rejectionReason?: string | null;
  deliveryOutcome?: DeliveryOutcome | null;
  deliveryNote?: string | null;
  requirements: MissionRequirement[];
}

export type DeliveryOutcome = "DELIVERED" | "PARTIAL" | "FAILED";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Chi tiết 1 nhiệm vụ (loại, số người, vật tư cần/cấp/thiếu, trạng thái). */
export async function fetchMission(token: string, id: string): Promise<MissionDetail> {
  const res = await request(apiUrl(`/api/missions/${id}`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Không tải được chi tiết nhiệm vụ");
  return res.json();
}

/** Chấp nhận nhiệm vụ (PENDING_RESCUE → PENDING_WAREHOUSE). */
export async function confirmMission(token: string, id: string): Promise<MissionDetail> {
  const res = await request(apiUrl(`/api/missions/${id}/confirm`), {
    method: "POST",
    headers: authHeader(token),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Không chấp nhận được nhiệm vụ");
  }
  return res.json();
}

/**
 * Từ chối / rút nhiệm vụ kèm lý do. PENDING_RESCUE = từ chối trước khi nhận;
 * RESCUE_CONFIRMED/PENDING_WAREHOUSE = báo không tiếp tục được sau khi đã nhận.
 */
export async function rejectMission(
  token: string,
  id: string,
  reason: string,
): Promise<MissionDetail> {
  const res = await request(apiUrl(`/api/missions/${id}/reject`), {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Không từ chối được nhiệm vụ");
  }
  return res.json();
}

/** Xác nhận đã giao tới hiện trường + kết quả (READY → COMPLETED, báo admin + kho). */
export async function completeMission(
  token: string,
  id: string,
  outcome: DeliveryOutcome,
  note?: string,
): Promise<MissionDetail> {
  const res = await request(apiUrl(`/api/missions/${id}/complete`), {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ outcome, note }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Không xác nhận được kết quả giao");
  }
  return res.json();
}

export async function fetchFirstWarehouse(
  token: string,
): Promise<WarehouseSummary> {
  const res = await request(apiUrl("/api/simulator/first-warehouse"), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không xác định được kho phụ trách");
  return res.json();
}

export async function fetchWarehouses(
  token: string,
): Promise<WarehouseSummary[]> {
  const res = await request(apiUrl("/api/admin/warehouses"), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tải được danh sách kho");
  return res.json();
}

export async function fetchWarehouseReadiness(
  token: string,
  warehouseId: string,
): Promise<WarehouseReadiness> {
  const path = `/api/readiness/warehouses/${encodeURIComponent(warehouseId)}`;
  let res = await request(apiUrl(path), { headers: authHeader(token) });
  if (!res.ok) throw await apiFailure(res, "Không tải được mức sẵn sàng");
  const current = (await res.json()) as WarehouseReadiness | null;
  if (current) return current;

  res = await request(apiUrl(`${path}/recalculate`), {
    method: "POST",
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tính được mức sẵn sàng");
  res = await request(apiUrl(path), { headers: authHeader(token) });
  if (!res.ok) throw await apiFailure(res, "Không tải được mức sẵn sàng");
  const calculated = (await res.json()) as WarehouseReadiness | null;
  if (!calculated) throw new Error("Kho chưa có dữ liệu để tính mức sẵn sàng");
  return calculated;
}

export async function fetchWarehouseBatches(
  token: string,
  warehouseId: string,
): Promise<InventoryBatch[]> {
  const batches: InventoryBatch[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query: string = cursor
      ? `?cursor=${encodeURIComponent(cursor)}`
      : "";
    const res = await request(
      apiUrl(
        `/api/inventory/warehouses/${encodeURIComponent(warehouseId)}/batches-page${query}`,
      ),
      { headers: authHeader(token) },
    );
    if (!res.ok) throw await apiFailure(res, "Không tải được tồn kho");
    const page: {
      data: InventoryBatch[];
      nextCursor: string | null;
    } = await res.json();
    batches.push(...page.data);
    cursor = page.nextCursor;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error("Phân trang tồn kho trả cursor bị lặp");
      }
      seenCursors.add(cursor);
    }
  } while (cursor);
  return batches;
}

export async function fetchOpenIncidents(
  token: string,
  warehouseId: string,
): Promise<IncidentSummary[]> {
  const res = await request(
    apiUrl(`/api/incidents/warehouses/${encodeURIComponent(warehouseId)}?state=OPEN`),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được cảnh báo đang mở");
  return res.json();
}

export async function fetchWarehouseInsights(
  token: string,
  warehouseId: string,
): Promise<WarehouseInsights> {
  const res = await request(
    apiUrl(`/api/insights/warehouses/${encodeURIComponent(warehouseId)}`),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được dự báo vận hành");
  return res.json();
}

export async function fetchDailyBriefing(
  token: string,
  warehouseId: string,
): Promise<DailyBriefing> {
  const res = await request(
    apiUrl(
      `/api/insights/warehouses/${encodeURIComponent(warehouseId)}/daily-briefing`,
    ),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tạo được bản tin đầu ngày");
  return res.json();
}

export async function semanticSearchInventory(
  token: string,
  warehouseId: string,
  query: string,
): Promise<SemanticInventoryResponse> {
  const res = await request(
    apiUrl(
      `/api/inventory/warehouses/${encodeURIComponent(warehouseId)}/semantic-search?query=${encodeURIComponent(query)}&limit=8`,
    ),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tìm ngữ nghĩa được vật tư");
  return res.json();
}

export async function fetchWarehouseTree(
  token: string,
  warehouseId: string,
): Promise<WarehouseTree> {
  const res = await request(
    apiUrl(`/api/inventory/warehouses/${encodeURIComponent(warehouseId)}/tree`),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được sơ đồ kho");
  return res.json();
}

export async function fetchTransferDestinations(
  token: string,
  warehouseId: string,
): Promise<WarehouseTree[]> {
  const res = await request(
    apiUrl(
      `/api/inventory/warehouses/${encodeURIComponent(warehouseId)}/transfer-destinations`,
    ),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được kho/kệ đích");
  return res.json();
}

export async function fetchStockReports(token: string): Promise<StockReport[]> {
  const res = await request(apiUrl("/api/reports"), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tải được báo cáo tháng");
  return res.json();
}

export async function fetchStockReport(
  token: string,
  id: string,
): Promise<StockReport> {
  const res = await request(apiUrl(`/api/reports/${encodeURIComponent(id)}`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tải được nội dung báo cáo");
  return res.json();
}

export function submitStockReport(
  token: string,
  input: {
    warehouseId: string;
    period: string;
    rows: StockReportRow[];
    requestId: string;
  },
): Promise<StockReport> {
  return postAuthorized(token, "/api/reports", input);
}

export function approveStockReport(token: string, id: string) {
  return postAuthorized(
    token,
    `/api/reports/${encodeURIComponent(id)}/approve`,
    {},
  );
}

export function rejectStockReport(token: string, id: string, note: string) {
  return postAuthorized(
    token,
    `/api/reports/${encodeURIComponent(id)}/reject`,
    { note },
  );
}

export async function fetchOpenLoans(
  token: string,
  warehouseId: string,
): Promise<LoanRecord[]> {
  const res = await request(
    apiUrl(`/api/loans/warehouses/${encodeURIComponent(warehouseId)}/open`),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được phiếu mượn");
  return res.json();
}

export async function fetchInventoryCatalog(
  token: string,
): Promise<InventoryCatalogItem[]> {
  const res = await request(apiUrl("/api/inventory/catalog"), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tải được danh mục vật tư");
  return res.json();
}

export function receiveInventoryBatch(
  token: string,
  input: {
    itemId?: string;
    newItem?: {
      sku: string;
      name: string;
      consumable: boolean;
      categoryName: string;
      unit: string;
    };
    shelfId: string;
    batchCode: string;
    quantity: number;
    expiryDate?: string;
    note?: string;
    requestId: string;
  },
) {
  return postAuthorized(token, "/api/inventory/batches", input);
}

export function importBatch(
  token: string,
  batchId: string,
  quantity: number,
  note?: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/inventory/import", {
    batchId,
    quantity,
    note,
    requestId,
  });
}

export function exportBatch(
  token: string,
  batchId: string,
  quantity: number,
  note?: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/inventory/export", {
    batchId,
    quantity,
    note,
    requestId,
  });
}

export function transferBatch(
  token: string,
  batchId: string,
  toShelfId: string,
  quantity: number,
  note?: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/inventory/transfer", {
    batchId,
    toShelfId,
    quantity,
    note,
    requestId,
  });
}

export function reconcileBatch(
  token: string,
  batchId: string,
  countedQty: number,
  applyOverride: boolean,
  note?: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/inventory/reconcile", {
    batchId,
    countedQty,
    applyOverride,
    note,
    requestId,
  });
}

export function adjustBatch(
  token: string,
  batchId: string,
  newQuantity: number,
  reason: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/inventory/adjust", {
    batchId,
    newQuantity,
    reason,
    requestId,
  });
}

export function setBatchCondition(
  token: string,
  batchId: string,
  condition: "NEW" | "USED" | "NEEDS_CHECK" | "DAMAGED",
  note: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/inventory/condition", {
    batchId,
    condition,
    note,
    requestId,
  });
}

export function bulkExportBatches(
  token: string,
  items: { batchId: string; quantity: number }[],
  note?: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/inventory/bulk-export", {
    items,
    note,
    requestId,
  });
}

export function borrowBatch(
  token: string,
  batchId: string,
  quantity: number,
  missionId?: string,
  requestId?: string,
) {
  return postAuthorized(token, "/api/loans", {
    batchId,
    quantity,
    missionId,
    requestId,
  });
}

export function returnLoan(
  token: string,
  loanId: string,
  input: { ok: number; damaged: number; lost: number; requestId?: string },
) {
  return postAuthorized(
    token,
    `/api/loans/${encodeURIComponent(loanId)}/return`,
    input,
  );
}

function apiUrl(path: string): string {
  return `${requireApiBase()}${path}`;
}

async function request(
  input: string,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Máy chủ LAN không phản hồi. Kiểm tra Wi-Fi nội bộ.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiFailure(response: Response, fallback: string): Promise<ApiError> {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  const message = Array.isArray(data.message)
    ? data.message.join(". ")
    : data.message;
  return new ApiError(message ?? fallback, response.status);
}

async function postAuthorized<T = unknown>(
  token: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await request(apiUrl(path), {
    method: "POST",
    headers: {
      ...authHeader(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await apiFailure(response, "Thao tác không thành công");
  return response.json();
}

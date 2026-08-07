import { apiFetch } from "./api";

export interface WarehouseSummary {
  id: string;
  name: string;
}

export interface WarehouseTree extends WarehouseSummary {
  location?: string | null;
  zones: WarehouseZone[];
}

export interface WarehouseZone {
  id: string;
  name: string;
  code: string;
  shelves: ShelfSummary[];
}

export interface ShelfSummary {
  id: string;
  code: string;
  name?: string;
  isLocked: boolean;
  _count?: { batches: number };
}

export interface ReadinessComponent {
  key: ReadinessComponentKey;
  value: number;
  weight: number;
  reasons: string[];
}

export type ReadinessComponentKey =
  | "quantityAvailability"
  | "itemCondition"
  | "expiry"
  | "accessibility"
  | "environment"
  | "dataReliability";

export interface ReadinessRecommendation {
  id: string;
  component: ReadinessComponentKey;
  message: string;
}

export type OperationalStatus = "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";

export interface ReadinessBlocker {
  code: string;
  title: string;
  reasons: string[];
  source: "INCIDENT" | "READINESS_DIMENSION";
}

export interface ReadinessDimension {
  key: ReadinessComponentKey;
  status: OperationalStatus;
  referenceScore: number;
  reasons: string[];
  recommendedAction: string | null;
}

export interface WarehouseReadiness {
  id: string;
  warehouseId: string;
  targetType: string;
  targetId: string;
  score: number;
  referenceScore: number;
  operationalStatus: OperationalStatus;
  blockers: ReadinessBlocker[];
  dimensions: ReadinessDimension[];
  recommendedActions: string[];
  zone: "READY" | "ATTENTION" | "DEGRADED" | "CRITICAL";
  computedAt: string;
  components: ReadinessComponent[];
  recommendations: ReadinessRecommendation[];
}

export interface InventoryBatch {
  id: string;
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
    category: { name: string; unit: string };
  };
  shelf: {
    id: string;
    code: string;
    name: string;
    zone: { id: string; name: string; code: string };
  } | null;
}

export interface VirtualDevice {
  id: string;
  code: string;
  type: string;
  currentValue: number | null;
  unit: string | null;
  currentAt: string | null;
  updatedAt: string;
}

export interface SensorTimelineEvent {
  id: string;
  eventType: string;
  value: number;
  unit: string | null;
  observedAt: string;
  createdAt: string;
  submission: { receivedAt: string; idempotencyKey: string } | null;
  device: { code: string; type: string };
}

export interface IncidentSummary {
  id: string;
  title: string;
  kind: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  state: string;
  confidence: number;
  detectedAt: string;
  // LLM diễn giải (tiếng Việt) — backend tự sinh khi sự cố mới bật; list() trả sẵn nếu có.
  explanation?: string | null;
}

export async function getFirstWarehouse(): Promise<WarehouseSummary> {
  return apiFetch<WarehouseSummary>("/api/simulator/first-warehouse");
}

export async function getWarehouseTree(warehouseId: string): Promise<WarehouseTree> {
  return apiFetch<WarehouseTree>(`/api/inventory/warehouses/${warehouseId}/tree`);
}

export async function getInventoryBatches(warehouseId: string): Promise<InventoryBatch[]> {
  const batches: InventoryBatch[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const page: {
      data: InventoryBatch[];
      nextCursor: string | null;
    } = await apiFetch<{
      data: InventoryBatch[];
      nextCursor: string | null;
    }>(`/api/inventory/warehouses/${warehouseId}/batches-page${query}`);
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

export function getTransferDestinations(warehouseId: string): Promise<WarehouseTree[]> {
  return apiFetch<WarehouseTree[]>(
    `/api/inventory/warehouses/${warehouseId}/transfer-destinations`,
  );
}

export interface InventoryTransactionHistory {
  id: string;
  type: "IMPORT" | "EXPORT" | "TRANSFER" | "ADJUST" | "COUNT" | "CONDITION" | "RETURN";
  source: string;
  quantity: number;
  beforeQuantity: number | null;
  afterQuantity: number | null;
  quantityDelta: number | null;
  note: string | null;
  createdAt: string;
  user: { fullName: string };
  batch: {
    id: string;
    batchCode: string;
    item: { sku: string; name: string };
    shelf: {
      code: string;
      zone: { code: string; name: string };
    } | null;
  };
}

export function getInventoryTransactions(
  warehouseId: string,
  limit = 100,
): Promise<InventoryTransactionHistory[]> {
  return apiFetch<InventoryTransactionHistory[]>(
    `/api/inventory/warehouses/${warehouseId}/transactions?limit=${limit}`,
  );
}

export interface SemanticInventoryResult {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  unit: string;
  availableQuantity?: number;
  score: number;
}

export interface SemanticInventoryResponse {
  available: boolean;
  mode: "EMBEDDING" | "LEXICAL_FALLBACK";
  reason: string | null;
  results: SemanticInventoryResult[];
}

export interface NormalizeInventoryResponse extends SemanticInventoryResponse {
  input: string;
  reviewRequired: true;
  autoApplied: false;
}

export function semanticSearchInventory(
  warehouseId: string,
  query: string,
): Promise<SemanticInventoryResponse> {
  const params = new URLSearchParams({ query, limit: "6" });
  return apiFetch<SemanticInventoryResponse>(
    `/api/inventory/warehouses/${warehouseId}/semantic-search?${params}`,
  );
}

export function normalizeInventoryInput(name: string): Promise<NormalizeInventoryResponse> {
  return apiFetch<NormalizeInventoryResponse>("/api/inventory/normalize-input", {
    method: "POST",
    body: JSON.stringify({ name, limit: 5 }),
  });
}

export interface InventoryCatalogItem {
  id: string;
  name: string;
  sku: string;
  consumable: boolean;
  categoryId: string;
  category: { id: string; name: string; unit: string };
}

export type ReceiveBatchInput = {
  itemId?: string;
  newItem?: {
    sku: string;
    name: string;
    consumable: boolean;
    categoryId?: string;
    categoryName?: string;
    unit?: string;
  };
  shelfId: string;
  batchCode: string;
  quantity: number;
  expiryDate?: string;
  condition?: string;
  note?: string;
  requestId: string;
};

export function createMutationRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `request-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function getInventoryCatalog(): Promise<InventoryCatalogItem[]> {
  return apiFetch<InventoryCatalogItem[]>("/api/inventory/catalog");
}

export function receiveInventoryBatch(input: ReceiveBatchInput) {
  return apiFetch<{
    batch: InventoryBatch;
    qrPayload: string;
  }>("/api/inventory/batches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function importInventoryBatch(input: {
  batchId: string;
  quantity: number;
  note?: string;
  requestId: string;
}) {
  return apiFetch("/api/inventory/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function exportInventoryBatch(input: {
  batchId: string;
  quantity: number;
  note?: string;
  requestId: string;
}) {
  return apiFetch("/api/inventory/export", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function transferInventoryBatch(input: {
  batchId: string;
  toShelfId: string;
  quantity: number;
  note?: string;
  requestId: string;
}) {
  return apiFetch("/api/inventory/transfer", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function adjustInventoryBatch(input: {
  batchId: string;
  newQuantity: number;
  reason: string;
  requestId: string;
}) {
  return apiFetch("/api/inventory/adjust", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateInventoryCondition(input: {
  batchId: string;
  condition: string;
  note: string;
  requestId: string;
}) {
  return apiFetch("/api/inventory/condition", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function bulkExportInventory(input: {
  items: { batchId: string; quantity: number }[];
  note?: string;
  requestId: string;
}) {
  return apiFetch("/api/inventory/bulk-export", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getWarehouseReadiness(
  warehouseId: string,
): Promise<WarehouseReadiness | null> {
  const readiness = await apiFetch<WarehouseReadiness | null>(
    `/api/readiness/warehouses/${warehouseId}`,
  );
  if (readiness) return readiness;

  await apiFetch(`/api/readiness/warehouses/${warehouseId}/recalculate`, { method: "POST" });
  return apiFetch<WarehouseReadiness | null>(`/api/readiness/warehouses/${warehouseId}`);
}

export async function getDevices(warehouseId: string): Promise<VirtualDevice[]> {
  return apiFetch<VirtualDevice[]>(`/api/simulator/warehouses/${warehouseId}/devices`);
}

export async function getTimeline(warehouseId: string): Promise<SensorTimelineEvent[]> {
  return apiFetch<SensorTimelineEvent[]>(
    `/api/simulator/warehouses/${warehouseId}/timeline?limit=8`,
  );
}

export async function getOpenIncidents(warehouseId: string): Promise<IncidentSummary[]> {
  return apiFetch<IncidentSummary[]>(`/api/incidents/warehouses/${warehouseId}?state=OPEN`);
}

// ===== Sự cố (đầy đủ, không chỉ OPEN) =====
export interface IncidentDetail extends IncidentSummary {
  description: string | null;
  evidence: { deviceCode: string; eventType: string; value: number; occurredAt: string }[];
}

export function getIncidents(warehouseId: string, state?: string): Promise<IncidentSummary[]> {
  const q = state ? `?state=${state}` : "";
  return apiFetch<IncidentSummary[]>(`/api/incidents/warehouses/${warehouseId}${q}`);
}
export const acknowledgeIncident = (id: string) =>
  apiFetch(`/api/incidents/${id}/acknowledge`, { method: "POST" });
export const resolveIncident = (id: string, note?: string) =>
  apiFetch(`/api/incidents/${id}/resolve`, { method: "POST", body: JSON.stringify({ note }) });

// ===== Mượn-trả =====
export interface LoanRecord {
  id: string;
  quantity: number;
  returnedOk: number;
  returnedDamaged: number;
  lost: number;
  status: string;
  borrowedAt: string;
  batch: { batchCode: string; item: { name: string; sku: string } };
}
export function getOpenLoans(warehouseId: string): Promise<LoanRecord[]> {
  return apiFetch<LoanRecord[]>(`/api/loans/warehouses/${warehouseId}/open`);
}
export const borrowInventoryBatch = (body: {
  batchId: string;
  quantity: number;
  missionId?: string;
  requestId: string;
}) =>
  apiFetch("/api/loans", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const returnLoan = (
  id: string,
  body: {
    returnedOk: number;
    returnedDamaged: number;
    lost: number;
    requestId?: string;
  },
) =>
  apiFetch(`/api/loans/${id}/return`, {
    method: "POST",
    body: JSON.stringify({
      ok: body.returnedOk,
      damaged: body.returnedDamaged,
      lost: body.lost,
      requestId: body.requestId,
    }),
  });

// ===== Hậu kiểm (audit) =====
export interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actor?: { fullName: string; email: string } | null;
}
export function getAuditLogs(entity?: string): Promise<AuditLog[]> {
  const q = entity ? `?entity=${entity}` : "";
  return apiFetch<AuditLog[]>(`/api/audit${q}`);
}

// ===== Kiểm kê (reconcile) =====
export const reconcileBatch = (body: {
  batchId: string;
  countedQty: number;
  applyOverride: boolean;
  note?: string;
  requestId?: string;
}) => apiFetch("/api/inventory/reconcile", { method: "POST", body: JSON.stringify(body) });

// ---- Mượn vật tư giữa hai xã ----

export interface InterCommuneLoan {
  id: string;
  direction: "OUTGOING" | "INCOMING";
  status:
    | "REQUESTED"
    | "REJECTED"
    | "APPROVED"
    | "ACTIVE"
    | "PARTIALLY_RETURNED"
    | "RETURNED"
    | "CANCELLED";
  peerCommuneName: string;
  itemSku: string;
  itemName: string;
  unit: string;
  quantity: number;
  returnedQuantity: number;
  recordedManually: boolean;
  note: string | null;
  rejectReason: string | null;
  requestedAt: string;
}

export function getInterCommuneLoans(): Promise<InterCommuneLoan[]> {
  return apiFetch<InterCommuneLoan[]>("/api/loans/inter-commune");
}

export const requestInterCommuneLoan = (body: {
  peerCommuneName: string;
  itemSku: string;
  itemName: string;
  unit: string;
  quantity: number;
  note?: string;
}) => apiFetch("/api/loans/inter-commune/request", { method: "POST", body: JSON.stringify(body) });

export const recordManualInterCommuneLoan = (body: {
  direction: "OUTGOING" | "INCOMING";
  peerCommuneName: string;
  /** Một trong hai: mã vật tư (giao diện dùng) hoặc mã lô cụ thể. */
  itemSku?: string;
  batchId?: string;
  quantity: number;
  note?: string;
}) => apiFetch("/api/loans/inter-commune/manual", { method: "POST", body: JSON.stringify(body) });

/** Tên các xã lân cận đã khai trong sổ đăng ký. */
export const getPeerCommunes = () => apiFetch<string[]>("/api/loans/inter-commune/peers");

export interface AvailableItem {
  itemSku: string;
  itemName: string;
  unit: string;
  available: number;
  batchId: string;
}

/** Vật tư đang có trong kho, để chọn theo TÊN thay vì phải chép mã lô. */
export const getAvailableItemsForLoan = () =>
  apiFetch<AvailableItem[]>("/api/loans/inter-commune/available-items");

export const advanceInterCommuneLoan = (
  id: string,
  body: { to: string; batchId?: string; quantity?: number; reason?: string },
) =>
  apiFetch(`/api/loans/inter-commune/${id}/advance`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export interface LoanStockMark {
  itemSku: string;
  itemName: string;
  unit: string;
  lentOut: number;
  borrowedIn: number;
  peers: string[];
}

export function getLoanStockMarks(): Promise<LoanStockMark[]> {
  return apiFetch<LoanStockMark[]>("/api/loans/inter-commune/stock-marks");
}

export interface CommuneStockShare {
  warehouseId: string;
  warehouseName: string;
  kind: "CENTRAL" | "HAMLET";
  quantity: number;
}

export interface CommuneStockRow {
  itemSku: string;
  itemName: string;
  unit: string;
  total: number;
  atCentral: number;
  atHamlets: number;
  byWarehouse: CommuneStockShare[];
}

export interface WarehouseStockItem {
  itemSku: string;
  itemName: string;
  unit: string;
  quantity: number;
  /** Câu quy đổi cho hàng đếm theo chai: "100 chai (8 lốc lẻ 4) · 500 lít". */
  conversion?: string;
}

export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  kind: "CENTRAL" | "HAMLET";
  totalUnits: number;
  itemCount: number;
  items: WarehouseStockItem[];
}

export interface CommuneStock {
  /** Gom theo mã vật tư — trả lời "mặt hàng này cả xã còn bao nhiêu". */
  byItem: CommuneStockRow[];
  /** Gom theo kho — trả lời "thôn này đang có những gì". */
  byWarehouse: WarehouseStock[];
}

/** Tồn kho toàn xã: kho tổng cộng với hàng đang nằm ở các kho thôn. */
export function getCommuneStock(warehouseId: string): Promise<CommuneStock> {
  return apiFetch<CommuneStock>(`/api/inventory/warehouses/${warehouseId}/commune-stock`);
}

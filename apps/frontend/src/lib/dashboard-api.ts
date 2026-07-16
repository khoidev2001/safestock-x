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
  name: string;
  isBlocked: boolean;
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

export interface WarehouseReadiness {
  id: string;
  warehouseId: string;
  targetType: string;
  targetId: string;
  score: number;
  zone: "READY" | "ATTENTION" | "DEGRADED" | "CRITICAL";
  computedAt: string;
  components: ReadinessComponent[];
  recommendations: ReadinessRecommendation[];
}

export interface InventoryBatch {
  id: string;
  code: string;
  quantity: number;
  condition: string;
  circulation: string;
  expiryDate: string | null;
  item: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    category: { name: string };
  };
  shelf: {
    id: string;
    code: string;
    name: string;
    zone: { id: string; name: string; code: string };
  };
}

export interface VirtualDevice {
  id: string;
  code: string;
  type: string;
  currentValue: number | null;
  unit: string | null;
  updatedAt: string;
}

export interface SensorTimelineEvent {
  id: string;
  eventType: string;
  value: number;
  unit: string | null;
  createdAt: string;
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
}

export async function getFirstWarehouse(): Promise<WarehouseSummary> {
  return apiFetch<WarehouseSummary>("/api/simulator/first-warehouse");
}

export async function getWarehouseTree(warehouseId: string): Promise<WarehouseTree> {
  return apiFetch<WarehouseTree>(`/api/inventory/warehouses/${warehouseId}/tree`);
}

export async function getInventoryBatches(warehouseId: string): Promise<InventoryBatch[]> {
  return apiFetch<InventoryBatch[]>(`/api/inventory/warehouses/${warehouseId}/batches`);
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
export const returnLoan = (
  id: string,
  body: { returnedOk: number; returnedDamaged: number; lost: number },
) => apiFetch(`/api/loans/${id}/return`, { method: "POST", body: JSON.stringify(body) });

// ===== Hậu kiểm (audit) =====
export interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
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
}) => apiFetch("/api/inventory/reconcile", { method: "POST", body: JSON.stringify(body) });

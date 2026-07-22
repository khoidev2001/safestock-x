// Wrapper các endpoint backend dùng trong app desktop. Kiểu dữ liệu tối giản
// (chỉ field cần render), không phụ thuộc @prisma/client để tránh kéo backend types.
import { apiFetch } from "./api";

export interface Warehouse {
  id: string;
  name: string;
}

export interface VirtualDevice {
  id: string;
  code: string;
  type: string;
  currentValue: number | null;
  unit: string | null;
  warehouseId: string;
}

export interface Scenario {
  key: string;
  name: string;
  description: string;
}

export interface ReadinessComponent {
  key: string;
  value: number;
  reasons: string[];
}

export interface ReadinessScore {
  score: number;
  zone?: string;
  // Kết luận vận hành từ assessOperationalReadiness (READY | NEEDS_ACTION | NOT_DISPATCHABLE).
  operationalStatus?: string;
  components?: ReadinessComponent[];
  [key: string]: unknown;
}

export interface Incident {
  id: string;
  kind: string;
  severity: string;
  confidence: number;
  title: string;
  state: string;
  detectedAt: string;
  // LLM diễn giải (tiếng Việt) — backend tự sinh khi sự cố mới bật; list() trả sẵn nếu có.
  explanation?: string | null;
}

export function firstWarehouse() {
  return apiFetch<Warehouse | null>("/api/simulator/first-warehouse");
}

export function listDevices(warehouseId: string) {
  return apiFetch<VirtualDevice[]>(`/api/simulator/warehouses/${warehouseId}/devices`);
}

export function listScenarios() {
  return apiFetch<Scenario[]>("/api/simulator/scenarios");
}

export interface EmitBody {
  warehouseId: string;
  deviceCode: string;
  eventType: string;
  value: number;
}

export function emitEvent(body: EmitBody) {
  return apiFetch("/api/simulator/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getReadiness(warehouseId: string) {
  return apiFetch<ReadinessScore | null>(`/api/readiness/warehouses/${warehouseId}`);
}

export function recalcReadiness(warehouseId: string) {
  return apiFetch(`/api/readiness/warehouses/${warehouseId}/recalculate`, { method: "POST" });
}

export function listIncidents(warehouseId: string) {
  return apiFetch<Incident[]>(`/api/incidents/warehouses/${warehouseId}`);
}

// Runner (kịch bản).
export interface Run {
  id: string;
  status?: string;
}

export function createRun(scenarioKey: string, warehouseId: string, speed: number) {
  return apiFetch<Run>("/api/simulator/runs", {
    method: "POST",
    body: JSON.stringify({ scenarioKey, warehouseId, speed }),
  });
}

export function playRun(id: string) {
  return apiFetch(`/api/simulator/runs/${id}/play`, { method: "POST" });
}

export function resetRun(id: string) {
  return apiFetch(`/api/simulator/runs/${id}/reset`, { method: "POST" });
}

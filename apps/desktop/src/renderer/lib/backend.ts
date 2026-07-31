import { apiFetch } from "./api";
import type { SimulatorAlarmPolicy } from "./simulator-queue";

export interface Warehouse {
  id: string;
  name: string;
}

export interface VirtualDevice {
  id: string;
  code: string;
  type: string;
  currentValue: number | null;
  currentAt: string | null;
  unit: string | null;
  warehouseId: string;
}

export interface ReadinessComponent {
  key: string;
  value: number;
  reasons: string[];
}

export interface ReadinessScore {
  score: number;
  zone?: string;
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
  explanation?: string | null;
}

export interface ConfirmedSnapshotBody {
  warehouseId: string;
  idempotencyKey: string;
  observedAt: string;
  readings: { deviceCode: string; value: number }[];
}

export interface SnapshotResponse {
  accepted: boolean;
  duplicate: boolean;
  submission: {
    id: string;
    idempotencyKey: string;
    observedAt: string;
    receivedAt: string;
    policyVersion: string;
  };
  incidents: { id: string; title: string }[];
}

export interface AlarmAcknowledgementBody {
  warehouseId: string;
  /** Lô số liệu do chính máy này gửi. */
  submissionKey?: string;
  /** Sự cố nhận qua realtime — nguồn phần cứng không đi kèm lô của máy này. */
  incidentIds?: string[];
  acknowledgementKey: string;
  acknowledgedAt: string;
}

export function firstWarehouse() {
  return apiFetch<Warehouse | null>("/api/simulator/first-warehouse");
}

export function listDevices(warehouseId: string) {
  return apiFetch<VirtualDevice[]>(`/api/simulator/warehouses/${warehouseId}/devices`);
}

export function getAlarmPolicy(warehouseId: string) {
  return apiFetch<SimulatorAlarmPolicy>(`/api/simulator/warehouses/${warehouseId}/alarm-policy`);
}

export function submitSnapshot(body: ConfirmedSnapshotBody) {
  return apiFetch<SnapshotResponse>("/api/simulator/snapshots", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function acknowledgeAlarm(body: AlarmAcknowledgementBody) {
  return apiFetch<{ pending: boolean; acknowledgedIncidentIds: string[] }>(
    "/api/simulator/alarm-acks",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function getReadiness(warehouseId: string) {
  return apiFetch<ReadinessScore | null>(`/api/readiness/warehouses/${warehouseId}`);
}

export function listIncidents(warehouseId: string) {
  return apiFetch<Incident[]>(`/api/incidents/warehouses/${warehouseId}`);
}

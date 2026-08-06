import { apiFetch } from "./api";
import type {
  CoordinationAnalysis,
  FieldUpdateIntent,
  WhatIfSimulationResult,
} from "@safestock/shared-types";

export type MissionStatus =
  | "DRAFT"
  | "PENDING_RESCUE"
  | "RESCUE_CONFIRMED"
  | "PENDING_WAREHOUSE"
  | "READY"
  | "COMPLETED"
  | "REJECTED"
  | "DEFERRED"
  | "CANCELLED";

export interface MissionRequirement {
  sku: string;
  itemName: string;
  required: number;
  allocated: number;
  shortage: number;
  unit: string;
  allocations:
    | {
        batchId: string;
        qty: number;
        warehouseId?: string;
        warehouseName?: string;
      }[]
    | null;
  neighborSuggestion: { name: string; distanceKm: number; available: number }[] | null;
}

export interface MissionWarehousePreparation {
  id: string;
  missionId: string;
  warehouseId: string;
  preparedByUserId: string | null;
  preparedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MissionWarehouseRequest {
  id: string;
  missionId: string;
  warehouseId: string;
  sku: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  preparedQuantity: number;
  status: "PENDING" | "ACCEPTED" | "PREPARED" | "PICKED_UP";
  warehouseNote: string | null;
  /** Rỗng nghĩa là chưa ai ký nhận — khác hẳn với ký nhận 0. */
  pickedUpQuantity: number | null;
  pickupNote: string | null;
  pickedUpAt: string | null;
  adminNote: string | null;
  acceptedAt: string | null;
  preparedAt: string | null;
  createdAt: string;
  updatedAt: string;
  warehouse?: { id: string; name: string };
}

export type DeliveryOutcome = "DELIVERED" | "PARTIAL" | "FAILED";

export type MissionReadinessStatus = "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";

export interface MissionReadinessAssessment {
  status: MissionReadinessStatus;
  fulfillment: number;
  warehouseOperationalStatus: MissionReadinessStatus | null;
  items: {
    sku: string;
    itemName: string;
    required: number;
    allocated: number;
    shortage: number;
    fulfillment: number;
    status: MissionReadinessStatus;
  }[];
  blockers: { sku: string; itemName: string; reasons: string[] }[];
  recommendedActions: string[];
}

export interface Mission {
  id: string;
  createdAt: string;
  warehouseId: string;
  incidentType: string;
  affectedPeople: number;
  durationHours: number;
  location?: string | null;
  hamletId?: string | null;
  hamletName?: string | null;
  status: MissionStatus;
  fulfillment: number;
  // Mô tả thô của trưởng thôn (mobile) khi mission là "hộp thư" báo cáo — web tự điền + phân tích.
  reportText?: string | null;
  incidentLat: number | null;
  incidentLng: number | null;
  actionPlan: ActionPlan | null;
  readinessAssessment: MissionReadinessAssessment | null;
  requirements: MissionRequirement[];
  warehousePreparations?: MissionWarehousePreparation[];
  warehouseRequests?: MissionWarehouseRequest[];
  rejectionReason?: string | null;
  adminNote?: string | null;
  deliveryOutcome?: DeliveryOutcome | null;
  deliveryNote?: string | null;
  completedAt?: string | null;
}

export interface ActionPlan {
  severityLevel: number;
  severityReason: string[];
  confidence: number;
  fulfillment: number;
  allocations: {
    sku: string;
    itemName: string;
    unit: string;
    required: number;
    allocated: number;
    shortage: number;
    fromWarehouses: string[];
  }[];
  warehouses: DispatchRoute[];
  forecasts: { label: string; probability: number }[];
  narrative: {
    objectives: string[];
    phases: { window: string; actions: string[] }[];
    warnings: string[];
    followUpQuestions: string[];
  };
  generatedBy: "ai" | "template";
}

export interface CoordinationAnalysisSnapshot {
  id: string;
  missionId: string;
  kind: "BASELINE" | "WHAT_IF";
  fingerprint: string;
  computedAt: string;
  expiresAt?: string | null;
  result: CoordinationAnalysis;
  modelVersion: string;
  ruleVersion: string;
  geoRegistryVersion?: string | null;
  routingGraphVersion?: string | null;
  weatherSnapshotVersion?: string | null;
  input?: {
    simulation?: {
      delta: WhatIfSimulationResult["delta"];
      expiresAt: string;
    };
  };
}

export interface AnalyzeMissionResult {
  snapshot: CoordinationAnalysisSnapshot;
  analysis: CoordinationAnalysis;
  extractionSource: "AI_SERVICE" | "BACKEND_FALLBACK";
}

export interface SimulateMissionResult {
  snapshot: CoordinationAnalysisSnapshot;
  simulation: WhatIfSimulationResult;
  analysis: CoordinationAnalysis;
}

export interface MissionFieldUpdate {
  id: string;
  missionId: string;
  requestId: string;
  inputMode: "TEXT" | "VOICE_TRANSCRIPT";
  confirmedText: string;
  clientCapturedAt: string | null;
  createdAt: string;
  structuredIntent: FieldUpdateIntent | null;
  intentProvenance: {
    source?: "AI_SERVICE" | "BACKEND_FALLBACK";
    extractedAt?: string;
    preliminarySimulation?: {
      status: "CREATED" | "NOT_APPLICABLE" | "BASELINE_MISSING" | "FAILED";
      snapshotId?: string;
      expiresAt?: string | null;
      unresolvedAssumptionCount?: number;
    };
  } | null;
  actor?: { id: string; fullName: string; role: string };
}

export interface DispatchRoute {
  id: string;
  name: string;
  kind: "CENTRAL" | "HAMLET";
  distanceKm: number | null;
  etaMinutes: number | null;
  lat: number;
  lng: number;
  routeStatus: "ROUTED" | "ENGINE_UNAVAILABLE" | "ROUTE_NOT_FOUND" | "TIMEOUT";
  routeGeometry: { type: "LineString"; coordinates: [number, number][] } | null;
  contributions: { sku: string; itemName: string; quantity: number; unit: string }[];
  engine: "local-osrm";
  graphVersion: string | null;
}

export interface ClusterWarehouse {
  id: string;
  name: string;
  kind: "CENTRAL" | "HAMLET";
  lat: number;
  lng: number;
}

export interface AppNotification {
  id: string;
  recipientRole: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  missionId: string | null;
  fieldUpdateId?: string | null;
  createdAt: string;
}

export interface GenerateInput {
  warehouseId: string;
  incident: {
    incidentType: string;
    location?: string;
    affectedPeople: number;
    durationHours: number;
    children?: number;
    elderly?: number;
    medicalSupportCases?: number;
  };
  incidentLat?: number;
  incidentLng?: number;
  /**
   * Lời kể gốc, gửi kèm để backend lưu làm nguồn cho bản tham mưu.
   *
   * `incident` ở trên đã là kết quả parse nên backend không parse lại; trường này
   * chỉ để giữ nguyên văn câu chữ đã sinh ra các con số đó.
   */
  description?: string;
}

export const generatePlan = (input: GenerateInput) =>
  apiFetch<Mission>("/api/missions/generate-plan", {
    method: "POST",
    body: JSON.stringify(input),
  });

/** Tình huống đã parse để phân tích báo cáo (khớp ParsedIncident, gửi kèm khi có sẵn). */
export interface PlanFromReportInput {
  incident?: {
    incidentType: string;
    location?: string;
    affectedPeople: number;
    durationHours: number;
    children?: number;
    elderly?: number;
    medicalSupportCases?: number;
  };
  description?: string;
  incidentLat?: number;
  incidentLng?: number;
}

/**
 * Admin phân tích BÁO CÁO của trưởng thôn ngay trên mission đó (không tạo mission mới).
 * Trả về mission đã cập nhật (kèm requirements + readiness) để hiển thị phương án.
 */
export const planFromReport = (id: string, input: PlanFromReportInput) =>
  apiFetch<Mission>(`/api/missions/${id}/plan-from-report`, {
    method: "POST",
    body: JSON.stringify(input),
  });

/** Tình huống do AI trích xuất từ mô tả bằng lời (khớp form nhập tay). */
export interface ParsedIncident {
  incidentType: string;
  location?: string | null;
  affectedPeople: number;
  durationHours: number;
  children: number;
  elderly: number;
  medicalSupportCases: number;
}

/** Gửi mô tả bằng lời → AI trích xuất tình huống có cấu trúc (người xác nhận trước khi lập phương án). */
export const parseIncident = (description: string) =>
  apiFetch<ParsedIncident>("/api/missions/parse", {
    method: "POST",
    body: JSON.stringify({ description }),
  });

/**
 * Ghi âm (WAV 16kHz base64) → PhoWhisper local nhận dạng thành text tiếng Việt.
 * Người dùng đọc lại & sửa trước khi bấm phân tích — AI chỉ hỗ trợ nhập, không tự quyết.
 */
export const transcribeAudio = (audioBase64: string, mimeType = "audio/wav") =>
  apiFetch<{ text: string }>("/api/missions/transcribe", {
    method: "POST",
    body: JSON.stringify({ audioBase64, mimeType }),
  });

export const getMission = (id: string) => apiFetch<Mission>(`/api/missions/${id}`);

export const analyzeMission = (id: string, input: { requestId: string; description?: string }) =>
  apiFetch<AnalyzeMissionResult>(`/api/missions/${id}/analyses`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getLatestCoordinationAnalysis = (id: string) =>
  apiFetch<CoordinationAnalysisSnapshot | null>(`/api/missions/${id}/analyses/latest`);

export const getSimulation = (missionId: string, simulationId: string) =>
  apiFetch<CoordinationAnalysisSnapshot>(`/api/missions/${missionId}/simulations/${simulationId}`);

export const listFieldUpdates = (id: string) =>
  apiFetch<MissionFieldUpdate[]>(`/api/missions/${id}/field-updates`);

export const simulateMission = (
  id: string,
  input: { requestId: string; baselineSnapshotId: string; assumptionText: string },
) =>
  apiFetch<SimulateMissionResult>(`/api/missions/${id}/simulations`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const listMissions = (statuses?: MissionStatus[]) =>
  apiFetch<Mission[]>(`/api/missions${statuses?.length ? `?status=${statuses.join(",")}` : ""}`);

export const getClusterWarehouses = (warehouseId: string) =>
  apiFetch<ClusterWarehouse[]>(`/api/missions/${warehouseId}/warehouses`);

export const generateActionPlan = (id: string) =>
  apiFetch<ActionPlan>(`/api/missions/${id}/action-plan`, { method: "POST" });

// ADMIN phát hành trực tiếp tới kho; lực lượng hiện trường chỉ đọc phương án.
export const approveMission = (id: string) =>
  apiFetch<Mission>(`/api/missions/${id}/approve`, { method: "POST" });
export const prepareMission = (id: string) =>
  apiFetch<Mission>(`/api/missions/${id}/prepare`, { method: "POST" });
export const listWarehouseRequests = () =>
  apiFetch<MissionWarehouseRequest[]>("/api/missions/warehouse-requests/own");
export const acceptWarehouseRequest = (requestId: string, note?: string) =>
  apiFetch<MissionWarehouseRequest>(`/api/missions/warehouse-requests/${requestId}/accept`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
export const reportWarehouseRequestDiscrepancy = (requestId: string, note: string) =>
  apiFetch<MissionWarehouseRequest>(`/api/missions/warehouse-requests/${requestId}/discrepancy`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
export const prepareWarehouseRequest = (requestId: string) =>
  apiFetch<MissionWarehouseRequest>(`/api/missions/warehouse-requests/${requestId}/prepare`, {
    method: "POST",
  });
/** Người đi lấy ký nhận: cầm đi bao nhiêu, thiếu thì vì sao. */
export const confirmWarehousePickup = (
  requestId: string,
  input: { receivedQuantity: number; note?: string },
) =>
  apiFetch<MissionWarehouseRequest>(`/api/missions/warehouse-requests/${requestId}/pickup`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const reviewWarehouseRequest = (
  requestId: string,
  input: { requestedQuantity: number; adminNote?: string },
) =>
  apiFetch<MissionWarehouseRequest>(`/api/missions/warehouse-requests/${requestId}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const cancelMission = (id: string, note?: string) =>
  apiFetch<Mission>(`/api/missions/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });

// Thông báo
export const getNotifications = (unread = false) =>
  apiFetch<AppNotification[]>(`/api/notifications${unread ? "?unread=true" : ""}`);
export const markAllRead = () =>
  apiFetch<{ count: number }>("/api/notifications/read-all", { method: "POST" });

import { apiFetch, apiFetchBlob } from "./api";

export type MissionStatus =
  | "DRAFT"
  | "APPROVED"
  | "IN_PROGRESS"
  | "PENDING_RESCUE"
  | "RESCUE_CONFIRMED"
  | "PENDING_WAREHOUSE"
  | "READY"
  | "COMPLETED"
  | "REJECTED"
  | "DEFERRED"
  | "CANCELLED";

export type ReportProcessingState = "SUBMITTED" | "ANALYZING" | "ANALYZED" | "ANALYSIS_FAILED";

export interface ReportAudioMetadata {
  present: boolean;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
}

export interface MissionRequirement {
  sku: string;
  itemName: string;
  required: number;
  allocated: number;
  shortage: number;
  unit: string;
  allocations: {
    batchId: string;
    qty: number;
    warehouseId?: string;
    warehouseName?: string;
  }[] | null;
  neighborSuggestion: { name: string; distanceKm: number; available: number }[] | null;
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
  incidentType: string;
  affectedPeople: number;
  durationHours: number;
  children?: number;
  elderly?: number;
  medicalSupportCases?: number;
  status: MissionStatus;
  fulfillment: number;
  /** Trạng thái xử lý riêng của báo cáo trưởng thôn; null/absent với nhiệm vụ thường. */
  processingState?: ReportProcessingState | null;
  reportText?: string | null;
  audio?: ReportAudioMetadata | null;
  incidentLat: number | null;
  incidentLng: number | null;
  locationText?: string | null;
  actionPlan: ActionPlan | null;
  readinessAssessment: MissionReadinessAssessment | null;
  requirements: MissionRequirement[];
  rejectionReason?: string | null;
  adminNote?: string | null;
  deliveryOutcome?: DeliveryOutcome | null;
  deliveryNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string | null;
  completedAt?: string | null;
  warehouse?: { id: string; name: string };
  warehouseRequests?: WarehouseMissionRequest[];
}

export interface OperatorReportDetail extends Omit<
  Mission,
  "reportText" | "processingState" | "audio" | "requirements"
> {
  reportText: string;
  location: string | null;
  affectedPeople: number;
  durationHours: number;
  priority: string;
  severityLevel: number | null;
  processingState: ReportProcessingState;
  audio: ReportAudioMetadata;
  warehouseLogisticsEstimates: {
    label: "WAREHOUSE_LOGISTICS";
    warehouseName: string;
    distanceKm: number;
    etaMinutes: number;
    source: "google" | "haversine";
    calculatedAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  adminNote: string | null;
  deliveryOutcome: DeliveryOutcome | null;
  deliveryNote: string | null;
  requirements: {
    sku: string;
    itemName: string;
    required: number;
    allocated: number;
    shortage: number;
    unit: string;
    allocations?: MissionRequirement["allocations"];
  }[];
  sourceHamlet: { warehouseId: string; name: string };
  warehouseRequests: WarehouseMissionRequest[];
}

export type MissionViewResource = Mission | OperatorReportDetail;

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
  warehouses: {
    name: string;
    distanceKm: number;
    etaMinutes: number;
    lat: number;
    lng: number;
    /** Google road-route or straight-line fallback provenance, when persisted. */
    source?: "google" | "haversine" | null;
    calculatedAt?: string | null;
  }[];
  forecasts: { label: string; probability: number }[];
  narrative: {
    objectives: string[];
    phases: { window: string; actions: string[] }[];
    warnings: string[];
    followUpQuestions: string[];
  };
  generatedBy: "ai" | "template";
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
  createdAt: string;
}

export interface GenerateInput {
  warehouseId: string;
  incident: {
    incidentType: string;
    affectedPeople: number;
    durationHours: number;
    children?: number;
    elderly?: number;
    medicalSupportCases?: number;
  };
  incidentLat?: number;
  incidentLng?: number;
}

export const generatePlan = (input: GenerateInput) =>
  apiFetch<Mission>("/api/missions/generate-plan", {
    method: "POST",
    body: JSON.stringify(input),
  });

/** Tình huống do AI trích xuất từ mô tả bằng lời (khớp form nhập tay). */
export interface ParsedIncident {
  incidentType: string;
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

/** Chi tiết báo cáo gốc dành cho operator, không dùng route Mission generic. */
export const getOperatorReport = (id: string) =>
  apiFetch<OperatorReportDetail>(`/api/missions/reports/${encodeURIComponent(id)}`);

/** Phân tích tại chỗ báo cáo gốc, giữ nguyên Mission ID. */
export const analyzeOperatorReport = (id: string) =>
  apiFetch<OperatorReportDetail>(`/api/missions/reports/${encodeURIComponent(id)}/analyze`, {
    method: "POST",
  });

/** Tải WAV riêng tư qua phiên đăng nhập hiện tại; không trả public URL. */
export const getOperatorReportAudio = (id: string) =>
  apiFetchBlob(`/api/missions/reports/${encodeURIComponent(id)}/audio`);

export interface ApproveOperatorReportInput {
  location?: string;
  adminNote?: string;
  requests: { warehouseId: string; sku: string; quantity: number }[];
}

export const approveOperatorReport = (id: string, input: ApproveOperatorReportInput) =>
  apiFetch<OperatorReportDetail>(`/api/missions/reports/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const listMissions = (statuses?: MissionStatus[]) =>
  apiFetch<Mission[]>(`/api/missions${statuses?.length ? `?status=${statuses.join(",")}` : ""}`);

export const getClusterWarehouses = (warehouseId: string) =>
  apiFetch<ClusterWarehouse[]>(`/api/missions/${warehouseId}/warehouses`);

export const generateActionPlan = (id: string) =>
  apiFetch<ActionPlan>(`/api/missions/${id}/action-plan`, { method: "POST" });

// Workflow liên role
export const dispatchMission = (id: string) =>
  apiFetch<Mission>(`/api/missions/${id}/dispatch`, { method: "POST" });
export interface WarehouseMissionRequest {
  id: string;
  missionId: string;
  warehouseId: string;
  sku: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  preparedQuantity: number;
  status: "PENDING" | "ACCEPTED" | "PREPARED";
  warehouseNote: string | null;
  adminNote: string | null;
  warehouse: { name: string };
  mission: { id: string; status: MissionStatus; incidentType: string; location: string | null; reportText: string | null; warehouse: { name: string } };
}

export const listWarehouseRequests = () =>
  apiFetch<WarehouseMissionRequest[]>("/api/missions/warehouse-requests");
export const acceptWarehouseRequest = (id: string, note?: string) =>
  apiFetch<WarehouseMissionRequest>(`/api/missions/warehouse-requests/${id}/accept`, { method: "POST", body: JSON.stringify({ note }) });
export const prepareWarehouseRequest = (id: string, note?: string) =>
  apiFetch<WarehouseMissionRequest>(`/api/missions/warehouse-requests/${id}/prepare`, { method: "POST", body: JSON.stringify({ note }) });
export const reportWarehouseDiscrepancy = (id: string, note: string) =>
  apiFetch<WarehouseMissionRequest>(`/api/missions/warehouse-requests/${id}/discrepancy`, { method: "POST", body: JSON.stringify({ note }) });
export const reviewWarehouseRequest = (id: string, input: { requestedQuantity: number; adminNote?: string }) =>
  apiFetch<WarehouseMissionRequest>(`/api/missions/warehouse-requests/${id}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  });

// Admin xử lý đơn từ chối của đội cứu hộ
export const deferMission = (id: string, note?: string) =>
  apiFetch<Mission>(`/api/missions/${id}/defer`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
export const resendMission = (id: string, note?: string) =>
  apiFetch<Mission>(`/api/missions/${id}/resend`, {
    method: "POST",
    body: JSON.stringify({ note }),
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

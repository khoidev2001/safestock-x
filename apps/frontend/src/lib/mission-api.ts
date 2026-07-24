import { apiFetch } from "./api";

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
  allocations: { batchId: string; qty: number; warehouseName?: string }[] | null;
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
  status: MissionStatus;
  fulfillment: number;
  incidentLat: number | null;
  incidentLng: number | null;
  actionPlan: ActionPlan | null;
  readinessAssessment: MissionReadinessAssessment | null;
  requirements: MissionRequirement[];
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
  warehouses: { name: string; distanceKm: number; etaMinutes: number; lat: number; lng: number }[];
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

export const listMissions = (statuses?: MissionStatus[]) =>
  apiFetch<Mission[]>(`/api/missions${statuses?.length ? `?status=${statuses.join(",")}` : ""}`);

export const getClusterWarehouses = (warehouseId: string) =>
  apiFetch<ClusterWarehouse[]>(`/api/missions/${warehouseId}/warehouses`);

export const generateActionPlan = (id: string) =>
  apiFetch<ActionPlan>(`/api/missions/${id}/action-plan`, { method: "POST" });

// Workflow liên role
export const dispatchMission = (id: string) =>
  apiFetch<Mission>(`/api/missions/${id}/dispatch`, { method: "POST" });
export const confirmMission = (id: string) =>
  apiFetch<Mission>(`/api/missions/${id}/confirm`, { method: "POST" });
export const prepareMission = (id: string) =>
  apiFetch<Mission>(`/api/missions/${id}/prepare`, { method: "POST" });

// RESCUE xác nhận kết quả giao hiện trường (READY → COMPLETED)
export const completeMission = (id: string, outcome: DeliveryOutcome, note?: string) =>
  apiFetch<Mission>(`/api/missions/${id}/complete`, {
    method: "POST",
    body: JSON.stringify({ outcome, note }),
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

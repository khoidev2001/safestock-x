import { API_BASE } from "./config";

const API_PATH = {
  login: "/api/auth/login",
  notifications: "/api/notifications",
  transcribeReport: "/api/missions/transcribe",
  submitReport: "/api/missions/report",
  ownReports: "/api/missions/reports/own",
  mission: "/api/missions",
} as const;

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  unitName?: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
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

export type KnownReportProcessingState =
  | "SUBMITTED"
  | "ANALYZING"
  | "ANALYZED"
  | "ANALYSIS_FAILED";

export type ReportProcessingState = KnownReportProcessingState | (string & {});

export interface ReportAudioMetadata {
  present: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
}

export interface ReportLogisticsEstimate {
  label: "WAREHOUSE_LOGISTICS";
  etaMinutes: number;
  distanceKm: number;
  source: "google" | "haversine";
  calculatedAt: string;
  warehouseName: string;
}

export interface OwnReportSummary {
  id: string;
  description: string;
  incidentType: string | null;
  affectedPeople: number | null;
  location: string | null;
  incidentLat: number | null;
  incidentLng: number | null;
  priority: string | null;
  severityLevel: number | null;
  processingState: ReportProcessingState | null;
  status: string;
  audio: ReportAudioMetadata;
  warehouseLogisticsEstimates: ReportLogisticsEstimate[];
  createdAt: string;
  updatedAt: string | null;
}

export interface OwnReportDetail extends OwnReportSummary {
  adminNote: string | null;
  rejectionReason: string | null;
  deliveryOutcome: DeliveryOutcome | string | null;
  deliveryNote: string | null;
  approvedAt: string | null;
  completedAt: string | null;
}

export interface OwnReportsPage {
  items: OwnReportSummary[];
  nextCursor: string | null;
}

export interface SubmitReportInput {
  description: string;
  location?: string;
  incidentLat?: number;
  incidentLng?: number;
  audioBase64?: string;
  mimeType?: string;
}

type JsonRecord = Record<string, unknown>;

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
const endpoint = (path: string) => `${API_BASE}${path}`;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  if (typeof value.message === "string" && value.message.trim()) return value.message;
  if (Array.isArray(value.message)) {
    const messages = value.message.filter((message): message is string => typeof message === "string");
    if (messages.length > 0) return messages.join(". ");
  }
  return fallback;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const data: unknown = await response.json().catch(() => null);
  return new Error(errorMessage(data, fallback));
}

async function readJson(response: Response, fallback: string): Promise<unknown> {
  if (!response.ok) throw await responseError(response, fallback);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("Phản hồi từ máy chủ không hợp lệ");
  }
}

function requiredString(record: JsonRecord, key: string, field: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Dữ liệu báo cáo thiếu ${field}`);
  return value;
}

function optionalString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseAudio(record: JsonRecord): ReportAudioMetadata {
  const audio = record.audio;
  if (!isRecord(audio) || typeof audio.present !== "boolean") {
    throw new Error("Dữ liệu audio báo cáo không hợp lệ");
  }
  return {
    present: audio.present,
    mimeType: optionalString(audio, "mimeType"),
    sizeBytes: optionalNumber(audio, "sizeBytes"),
    durationSeconds: optionalNumber(audio, "durationSeconds"),
  };
}

function parseEtaEntry(value: unknown): ReportLogisticsEstimate | null {
  if (!isRecord(value)) return null;
  const etaMinutes = optionalNumber(value, "etaMinutes");
  const distanceKm = optionalNumber(value, "distanceKm");
  const source = optionalString(value, "source");
  const calculatedAt = optionalString(value, "calculatedAt");
  const warehouseName = optionalString(value, "warehouseName");
  if (
    value.label !== "WAREHOUSE_LOGISTICS" ||
    etaMinutes == null ||
    etaMinutes < 0 ||
    distanceKm == null ||
    distanceKm < 0 ||
    (source !== "google" && source !== "haversine") ||
    calculatedAt == null ||
    warehouseName == null
  ) return null;
  return {
    label: "WAREHOUSE_LOGISTICS",
    etaMinutes,
    distanceKm,
    source,
    calculatedAt,
    warehouseName,
  };
}

function parseLogisticsEstimates(record: JsonRecord): ReportLogisticsEstimate[] {
  if (!Array.isArray(record.warehouseLogisticsEstimates)) return [];
  return record.warehouseLogisticsEstimates
    .map(parseEtaEntry)
    .filter((value): value is ReportLogisticsEstimate => value !== null);
}

function parseOwnReportSummary(value: unknown): OwnReportSummary {
  if (!isRecord(value)) throw new Error("Dữ liệu báo cáo không hợp lệ");
  return {
    id: requiredString(value, "id", "mã báo cáo"),
    description: requiredString(value, "reportText", "mô tả gốc"),
    incidentType: optionalString(value, "incidentType"),
    affectedPeople: optionalNumber(value, "affectedPeople"),
    location: optionalString(value, "location"),
    incidentLat: optionalNumber(value, "incidentLat"),
    incidentLng: optionalNumber(value, "incidentLng"),
    priority: optionalString(value, "priority"),
    severityLevel: optionalNumber(value, "severityLevel"),
    processingState: optionalString(value, "processingState"),
    status: requiredString(value, "status", "trạng thái vận hành"),
    audio: parseAudio(value),
    warehouseLogisticsEstimates: parseLogisticsEstimates(value),
    createdAt: requiredString(value, "createdAt", "thời gian tạo"),
    updatedAt: optionalString(value, "updatedAt"),
  };
}

function parseOwnReportDetail(value: unknown): OwnReportDetail {
  if (!isRecord(value)) throw new Error("Dữ liệu chi tiết báo cáo không hợp lệ");
  return {
    ...parseOwnReportSummary(value),
    adminNote: optionalString(value, "adminNote"),
    rejectionReason: optionalString(value, "rejectionReason"),
    deliveryOutcome: optionalString(value, "deliveryOutcome"),
    deliveryNote: optionalString(value, "deliveryNote"),
    approvedAt: optionalString(value, "approvedAt"),
    completedAt: optionalString(value, "completedAt"),
  };
}

/** Đăng nhập → nhận token + hồ sơ. API vẫn nhận trường `email` để tương thích backend. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(endpoint(API_PATH.login), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await readJson(response, "Đăng nhập thất bại");
  if (!isRecord(data) || typeof data.accessToken !== "string" || !isRecord(data.user)) {
    throw new Error("Phản hồi đăng nhập không hợp lệ");
  }
  const user = data.user;
  if (typeof user.id !== "string" || typeof user.email !== "string" || typeof user.role !== "string") {
    throw new Error("Hồ sơ đăng nhập không hợp lệ");
  }
  return {
    accessToken: data.accessToken,
    refreshToken: typeof data.refreshToken === "string" ? data.refreshToken : "",
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: typeof user.fullName === "string" ? user.fullName : undefined,
      warehouseId: typeof user.warehouseId === "string" ? user.warehouseId : null,
      warehouseName: typeof user.warehouseName === "string" ? user.warehouseName : null,
      unitName: typeof user.unitName === "string" ? user.unitName : null,
    },
  };
}

/** Danh sách thông báo của role hiện tại (mới nhất trước). */
export async function fetchNotifications(token: string): Promise<Notification[]> {
  const response = await fetch(endpoint(API_PATH.notifications), { headers: authHeader(token) });
  const data = await readJson(response, "Không tải được danh sách thông báo");
  if (!Array.isArray(data)) throw new Error("Danh sách thông báo không hợp lệ");
  return data as Notification[];
}

/** Giọng nói (WAV 16kHz base64) → text tiếng Việt bằng PhoWhisper local. */
export async function transcribe(
  token: string,
  audioBase64: string,
  mimeType = "audio/wav",
): Promise<{ text: string }> {
  const response = await fetch(endpoint(API_PATH.transcribeReport), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64, mimeType }),
  });
  const data = await readJson(response, "Nhận dạng giọng nói chưa sẵn sàng");
  if (!isRecord(data) || typeof data.text !== "string") {
    throw new Error("Kết quả nhận dạng không hợp lệ");
  }
  return { text: data.text };
}

/** Trưởng thôn gửi báo cáo, kèm bản WAV gốc khi có. Trả Mission ID đã được tạo. */
export async function submitReport(
  token: string,
  input: SubmitReportInput,
): Promise<{ missionId: string }> {
  const response = await fetch(endpoint(API_PATH.submitReport), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson(response, "Không gửi được báo cáo");
  if (!isRecord(data) || typeof data.missionId !== "string" || !data.missionId) {
    throw new Error("Máy chủ chưa trả về mã báo cáo");
  }
  return { missionId: data.missionId };
}

/** Lịch sử báo cáo của chính tài khoản, phân trang bằng cursor mờ. */
export async function fetchOwnReports(
  token: string,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<OwnReportsPage> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  params.set("limit", String(options.limit ?? 20));
  const response = await fetch(`${endpoint(API_PATH.ownReports)}?${params.toString()}`, {
    headers: authHeader(token),
  });
  const data = await readJson(response, "Không tải được lịch sử báo cáo");
  if (!isRecord(data) || !Array.isArray(data.items)) {
    throw new Error("Trang lịch sử báo cáo không hợp lệ");
  }
  const nextCursor = data.nextCursor;
  if (nextCursor !== null && nextCursor !== undefined && typeof nextCursor !== "string") {
    throw new Error("Cursor lịch sử báo cáo không hợp lệ");
  }
  return {
    items: data.items.map(parseOwnReportSummary),
    nextCursor: typeof nextCursor === "string" && nextCursor ? nextCursor : null,
  };
}

/** Chi tiết một báo cáo thuộc chính tài khoản hiện tại. */
export async function fetchOwnReport(token: string, id: string): Promise<OwnReportDetail> {
  const response = await fetch(`${endpoint(API_PATH.ownReports)}/${encodeURIComponent(id)}`, {
    headers: authHeader(token),
  });
  return parseOwnReportDetail(await readJson(response, "Không tải được chi tiết báo cáo"));
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
  warehouse?: { id: string; name: string } | null;
  warehouseRequests?: MissionWarehouseRequest[];
}

export interface MissionWarehouseRequest {
  id: string;
  warehouseId: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  preparedQuantity: number;
  status: "PENDING" | "ACCEPTED" | "PREPARED";
  warehouse: { name: string };
}

export type DeliveryOutcome = "DELIVERED" | "PARTIAL" | "FAILED";

/** Chi tiết phương án chỉ đọc cho RESCUE. */
export async function fetchMission(token: string, id: string): Promise<MissionDetail> {
  const response = await fetch(`${endpoint(API_PATH.mission)}/${encodeURIComponent(id)}`, {
    headers: authHeader(token),
  });
  return (await readJson(response, "Không tải được chi tiết nhiệm vụ")) as MissionDetail;
}

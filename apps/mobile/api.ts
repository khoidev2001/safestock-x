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
  /**
   * Số hiệu nhiệm vụ, máy chủ chép lại lúc gửi.
   *
   * `missionId` là cuid — đúng cho máy nhưng không đọc qua điện thoại được, mà
   * người trực thì gọi nhau bằng "nhiệm vụ số 127". Có thể trống với thông báo
   * không gắn nhiệm vụ (sự cố kho, readiness) và với bản ghi cũ trước khi máy chủ
   * bắt đầu chép số hiệu.
   */
  missionNo?: number | null;
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

export type OperationalStatus = "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";

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

export async function refreshSession(refreshToken: string): Promise<LoginResult> {
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

/**
 * Đăng xuất phía máy chủ: thu hồi toàn bộ refresh token của người dùng (tokenVersion++)
 * để phiên cũ không refresh lại được. Best-effort — App vẫn xoá phiên cục bộ dù mất mạng.
 */
export async function logout(token: string): Promise<void> {
  const res = await request(apiUrl("/api/auth/logout"), {
    method: "POST",
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Đăng xuất phía máy chủ thất bại");
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
    /** Bỏ trống được khi có `audioBase64` — báo cáo chỉ bằng giọng nói. */
    description?: string;
    incidentLat?: number;
    incidentLng?: number;
    requestId?: string;
    /** Bản ghi âm gửi kèm (base64 thuần). Máy chủ tự nhận diện định dạng. */
    audioBase64?: string;
    audioMimeType?: string;
    audioDurationMs?: number;
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

export type OwnReportStatus =
  "DRAFT" | "PENDING_WAREHOUSE" | "READY" | "CANCELLED" | "APPROVED" | "IN_PROGRESS" | "COMPLETED";

export interface OwnReportSummary {
  id: string;
  reportText: string | null;
  status: OwnReportStatus | string;
  incidentType: string;
  affectedPeople: number;
  location: string | null;
  createdAt: string;
  warehouse: { id: string; name: string } | null;
  requirements: MissionRequirement[];
}

export interface OwnReportDetail extends OwnReportSummary {
  incidentLat: number | null;
  incidentLng: number | null;
  priority: string | null;
  fulfillment: number;
  explanation: string | null;
  fieldUpdates: Array<{
    id: string;
    confirmedText: string;
    inputMode: "TEXT" | "VOICE_TRANSCRIPT";
    createdAt: string;
  }>;
}

/** Báo cáo text do chính trưởng thôn đã gửi, không kèm audio/media thô. */
export async function fetchOwnReports(
  token: string,
  cursor?: string,
  limit = 20,
): Promise<{ items: OwnReportSummary[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  const res = await request(apiUrl(`/api/missions/reports/own?${params.toString()}`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Không tải được lịch sử báo cáo");
  return res.json();
}

/** Chi tiết một báo cáo text thuộc chính tài khoản hiện tại. */
export async function fetchOwnReport(token: string, id: string): Promise<OwnReportDetail> {
  const res = await request(apiUrl(`/api/missions/reports/own/${encodeURIComponent(id)}`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Không tải được chi tiết báo cáo");
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
  /** Số hiệu người trực gọi nhau — xem `missionNo` ở máy chủ, không bao giờ cấp lại. */
  missionNo?: number | null;
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
  /** Tên thôn đã xác minh lúc cơ quan điều phối lập phương án. */
  hamletName?: string | null;
  /** Lời kể gốc của trưởng thôn — người đi hiện trường đọc để hiểu tình hình. */
  reportText?: string | null;
  /** Toạ độ điểm gặp nạn; phương án đã phát hành thì luôn có. */
  incidentLat?: number | null;
  incidentLng?: number | null;
  requirements: MissionRequirement[];
  warehouseRequests?: WarehouseMaterialRequest[];
  /**
   * Có vật tư tái sử dụng nào đang nằm ngoài kho không.
   *
   * `false` là KHÔNG CẦN TRẢ — nhiệm vụ chỉ phát đồ tiêu hao, phát xong là xong.
   * Để trống là máy chủ cũ chưa trả cờ này; lúc đó phải hỏi như cũ chứ không được
   * tự kết luận là không cần trả.
   */
  hasReturnableSupplies?: boolean;
  /** Ảnh bằng chứng đã gửi kèm lúc báo hoàn thành — chỉ phần mô tả, không có bytes. */
  deliveryPhotos?: MissionDeliveryPhoto[];
}

/** Một ảnh bằng chứng đã lưu; bytes lấy riêng qua đường ảnh khi cần xem. */
export interface MissionDeliveryPhoto {
  id: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

/**
 * Một kho có góp hàng cho phương án, kèm tuyến kho → điểm nạn.
 *
 * Khớp `WarehouseEta` của backend (`GET /api/missions/:id/warehouse-routes`).
 * Route đó CHỈ ĐỌC và chỉ cần `mission:view`, nên lực lượng hiện trường gọi được
 * mà không đụng tới bước phân tích của cơ quan điều phối.
 */
export interface MissionWarehouseRoute {
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
}

/**
 * Tuyến từ các kho có cấp hàng tới điểm gặp nạn.
 *
 * Trả mảng rỗng (không lỗi) khi nhiệm vụ chưa có điểm nạn hoặc chưa phân bổ được
 * gì — màn hình vẫn phải hiện được phần còn lại.
 */
export async function fetchMissionWarehouseRoutes(
  token: string,
  missionId: string,
): Promise<MissionWarehouseRoute[]> {
  const res = await request(
    apiUrl(`/api/missions/${encodeURIComponent(missionId)}/warehouse-routes`),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được tuyến tới điểm gặp nạn");
  return res.json();
}

export type DeliveryOutcome = "DELIVERED" | "PARTIAL" | "FAILED";

export interface WarehouseMaterialRequest {
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
  warehouse?: { id: string; name: string };
}

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Sửa hồ sơ của chính mình. Hiện chỉ dùng cho số điện thoại.
 *
 * `null` là xoá số. Gửi `null` chứ không gửi chuỗi rỗng: máy chủ phân biệt "bỏ
 * trống" với "không đụng tới", còn chuỗi rỗng rơi vào luật kiểm định dạng và bị
 * từ chối.
 */
export function updateOwnPhone(token: string, phone: string | null): Promise<AuthUser> {
  return patchAuthorized(token, "/api/auth/me", { phone });
}

/** Chi tiết 1 nhiệm vụ (loại, số người, vật tư cần/cấp/thiếu, trạng thái). */
export async function fetchMission(token: string, id: string): Promise<MissionDetail> {
  const res = await request(apiUrl(`/api/missions/${id}`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Không tải được chi tiết nhiệm vụ");
  return res.json();
}

/**
 * Danh sách lệnh của đơn vị.
 *
 * Trước đây chỉ vào được nhiệm vụ bằng cách bấm vào một thông báo, nên thông báo
 * trôi đi là mất luôn đường vào. Lực lượng hiện trường phải có chỗ để hỏi "tôi
 * đang có lệnh nào?".
 */
export async function fetchMissions(token: string): Promise<MissionDetail[]> {
  const res = await request(apiUrl("/api/missions"), { headers: authHeader(token) });
  if (!res.ok) throw await apiFailure(res, "Không tải được danh sách nhiệm vụ");
  return res.json();
}

/**
 * Báo kết quả giao; giao thất bại thì máy chủ tự hoàn vật tư về kho.
 *
 * `note` và `photos` đều tuỳ chọn: người vừa giao xong có thể chẳng còn gì để kể
 * thêm, và chỗ có sóng để gửi ảnh không phải lúc nào cũng có. Ảnh gửi dạng base64
 * thuần, máy chủ tự nhận diện định dạng từ byte đầu tệp.
 */
export async function completeMission(
  token: string,
  id: string,
  outcome: DeliveryOutcome,
  note?: string,
  photos?: { dataBase64: string }[],
): Promise<unknown> {
  return postAuthorized(token, `/api/missions/${id}/complete`, {
    outcome,
    note,
    photos: photos && photos.length > 0 ? photos : undefined,
  });
}

/**
 * KHO xác nhận đã nhận lại vật tư — bước CUỐI, đóng hẳn nhiệm vụ.
 *
 * Giao xong chưa phải là xong: phao cứu sinh, đèn pin, loa cầm tay là hàng tái
 * sử dụng, phải quay về kho rồi mới khép sổ được. Người ký là người ĐẾM LẠI hàng
 * khi nó về tới nơi, nên máy chủ chỉ nhận tài khoản kho có tham gia nhiệm vụ.
 */
export function markSuppliesReturned(
  token: string,
  missionId: string,
  /**
   * Số đã nhận lại của từng dòng. Bỏ trống nghĩa là "về đủ hết" — đường một nút
   * bấm; có danh sách là kho đếm từng dòng và nhiệm vụ chỉ khép khi không còn
   * dòng nào thiếu.
   */
  items?: { sku: string; returnedQuantity: number }[],
): Promise<MissionDetail & { outstandingReturns?: ReturnableSupply[] }> {
  return postAuthorized(
    token,
    `/api/missions/${missionId}/supplies-returned`,
    items ? { items } : {},
  );
}

/** Một dòng vật tư tái sử dụng kho phải đếm lại khi đội mang đồ về. */
export interface ReturnableSupply {
  sku: string;
  itemName: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  /** Số đội đã ký nhận mang đi — trần của số có thể trả về. */
  handedOverQuantity: number;
  /** `null` = kho chưa đếm dòng này, khác hẳn "đã đếm và về 0". */
  returnedQuantity: number | null;
  outstandingQuantity: number;
}

/** Danh sách vật tư phải thu hồi của nhiệm vụ, theo phạm vi kho đang đăng nhập. */
export async function fetchReturnableSupplies(
  token: string,
  missionId: string,
): Promise<ReturnableSupply[]> {
  const res = await request(apiUrl(`/api/missions/${missionId}/returnable-supplies`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tải được danh sách vật tư phải thu hồi");
  const data: { items?: ReturnableSupply[] } = await res.json();
  return data.items ?? [];
}

/**
 * Bytes một ảnh bằng chứng đã gửi, trả về data URI để gắn thẳng vào `<Image>`.
 *
 * Không đưa đường API vào `uri` được: đường ảnh đòi Bearer token, mà `<Image>`
 * của bản web dựng ra thẻ `<img>` — thẻ đó không gửi header nào, nên sẽ nhận 401
 * và hiện ảnh vỡ. Tải bằng `fetch` rồi đổi sang data URI thì cùng một đoạn mã
 * chạy được cả trên web lẫn trên máy thật.
 *
 * Hạn chờ rộng hơn mặc định: ảnh hiện trường nặng vài trăm KB, còn người xem lại
 * báo cáo thường đang ở đúng chỗ sóng yếu đã chụp nó.
 */
export async function fetchMissionDeliveryPhoto(
  token: string,
  missionId: string,
  photoId: string,
): Promise<string> {
  const res = await request(
    apiUrl(`/api/missions/${missionId}/delivery-photos/${photoId}`),
    { headers: authHeader(token) },
    30_000,
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được ảnh bằng chứng");
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được ảnh bằng chứng"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function fetchWarehouseMaterialRequests(
  token: string,
): Promise<WarehouseMaterialRequest[]> {
  const res = await request(apiUrl("/api/missions/warehouse-requests/own"), {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Không tải được yêu cầu chuẩn bị vật tư");
  return res.json();
}

export async function acceptWarehouseMaterialRequest(
  token: string,
  requestId: string,
  note?: string,
): Promise<WarehouseMaterialRequest> {
  return mutateWarehouseMaterialRequest(token, requestId, "accept", { note });
}

export async function prepareWarehouseMaterialRequest(
  token: string,
  requestId: string,
): Promise<WarehouseMaterialRequest> {
  return mutateWarehouseMaterialRequest(token, requestId, "prepare");
}

export async function reportWarehouseMaterialDiscrepancy(
  token: string,
  requestId: string,
  note: string,
): Promise<WarehouseMaterialRequest> {
  return mutateWarehouseMaterialRequest(token, requestId, "discrepancy", { note });
}

/**
 * Người đi lấy ký nhận: cầm đi bao nhiêu, thiếu thì vì sao.
 *
 * Đây là màn hình của ĐỘI HIỆN TRƯỜNG, và họ làm việc trên điện thoại chứ không
 * ngồi máy tính. Có ở web mà thiếu ở app là có cho người không dùng tới.
 */
export async function confirmWarehousePickup(
  token: string,
  requestId: string,
  receivedQuantity: number,
  note?: string,
): Promise<WarehouseMaterialRequest> {
  return mutateWarehouseMaterialRequest(token, requestId, "pickup", { receivedQuantity, note });
}

async function mutateWarehouseMaterialRequest(
  token: string,
  requestId: string,
  action: "accept" | "prepare" | "discrepancy" | "pickup",
  body?: Record<string, unknown>,
): Promise<WarehouseMaterialRequest> {
  const res = await request(
    apiUrl(`/api/missions/warehouse-requests/${encodeURIComponent(requestId)}/${action}`),
    {
      method: "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Không cập nhật được yêu cầu vật tư");
  }
  return res.json();
}

export async function fetchFirstWarehouse(token: string): Promise<WarehouseSummary> {
  const res = await request(apiUrl("/api/simulator/first-warehouse"), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không xác định được kho phụ trách");
  return res.json();
}

export async function fetchWarehouses(token: string): Promise<WarehouseSummary[]> {
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
    const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await request(
      apiUrl(`/api/inventory/warehouses/${encodeURIComponent(warehouseId)}/batches-page${query}`),
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
  const res = await request(apiUrl(`/api/insights/warehouses/${encodeURIComponent(warehouseId)}`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tải được dự báo vận hành");
  return res.json();
}

export async function fetchDailyBriefing(
  token: string,
  warehouseId: string,
): Promise<DailyBriefing> {
  const res = await request(
    apiUrl(`/api/insights/warehouses/${encodeURIComponent(warehouseId)}/daily-briefing`),
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
    apiUrl(`/api/inventory/warehouses/${encodeURIComponent(warehouseId)}/transfer-destinations`),
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

export async function fetchStockReport(token: string, id: string): Promise<StockReport> {
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
  return postAuthorized(token, `/api/reports/${encodeURIComponent(id)}/approve`, {});
}

export function rejectStockReport(token: string, id: string, note: string) {
  return postAuthorized(token, `/api/reports/${encodeURIComponent(id)}/reject`, { note });
}

export async function fetchOpenLoans(token: string, warehouseId: string): Promise<LoanRecord[]> {
  const res = await request(
    apiUrl(`/api/loans/warehouses/${encodeURIComponent(warehouseId)}/open`),
    { headers: authHeader(token) },
  );
  if (!res.ok) throw await apiFailure(res, "Không tải được phiếu mượn");
  return res.json();
}

export async function fetchInventoryCatalog(token: string): Promise<InventoryCatalogItem[]> {
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
  return postAuthorized(token, `/api/loans/${encodeURIComponent(loanId)}/return`, input);
}

function apiUrl(path: string): string {
  return `${requireApiBase()}${path}`;
}

async function request(input: string, init?: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Không kết nối được ungphonhanh.life. Kiểm tra Internet hoặc mạng LAN nội bộ.",
      );
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
  const message = Array.isArray(data.message) ? data.message.join(". ") : data.message;
  return new ApiError(message ?? fallback, response.status);
}

async function patchAuthorized<T = unknown>(
  token: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await request(apiUrl(path), {
    method: "PATCH",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await apiFailure(response, "Chưa lưu được thay đổi");
  return response.json();
}

async function postAuthorized<T = unknown>(token: string, path: string, body: unknown): Promise<T> {
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

export interface BatchQrLabel {
  dataUrl: string;
  payload: string;
  itemName: string;
  batchCode: string;
}

/**
 * Ảnh mã QR của một lô, sinh ở máy chủ.
 *
 * Không sinh ngay trên điện thoại vì mọi thư viện vẽ QR cho React Native đều cần
 * `react-native-svg` — một phụ thuộc NATIVE, thêm vào là phải dựng lại APK rồi
 * cài lại cho từng máy. Kho thôn đang dùng bản đã cài sẵn, nên để máy chủ sinh
 * là cả mạng lưới có ngay mà không ai phải cài gì.
 */
export async function fetchBatchQr(token: string, batchId: string): Promise<BatchQrLabel> {
  const res = await request(apiUrl(`/api/inventory/batches/${encodeURIComponent(batchId)}/qr`), {
    headers: authHeader(token),
  });
  if (!res.ok) throw await apiFailure(res, "Không tạo được mã QR cho lô này");
  return (await res.json()) as BatchQrLabel;
}

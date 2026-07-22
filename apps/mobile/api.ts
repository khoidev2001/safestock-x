import { API_BASE } from "./config";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  fullName?: string;
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

/** Đăng nhập → nhận token + hồ sơ. Ném lỗi có message tiếng Việt từ backend. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
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

/** Danh sách thông báo của role hiện tại (mới nhất trước). */
export async function fetchNotifications(token: string): Promise<Notification[]> {
  const res = await fetch(`${API_BASE}/api/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Không tải được danh sách thông báo");
  return res.json();
}

export interface MissionRequirement {
  id: string;
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
  rejectionReason?: string | null;
  requirements: MissionRequirement[];
}

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Chi tiết 1 nhiệm vụ (loại, số người, vật tư cần/cấp/thiếu, trạng thái). */
export async function fetchMission(token: string, id: string): Promise<MissionDetail> {
  const res = await fetch(`${API_BASE}/api/missions/${id}`, { headers: authHeader(token) });
  if (!res.ok) throw new Error("Không tải được chi tiết nhiệm vụ");
  return res.json();
}

/** Chấp nhận nhiệm vụ (PENDING_RESCUE → PENDING_WAREHOUSE). */
export async function confirmMission(token: string, id: string): Promise<MissionDetail> {
  const res = await fetch(`${API_BASE}/api/missions/${id}/confirm`, {
    method: "POST",
    headers: authHeader(token),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Không chấp nhận được nhiệm vụ");
  }
  return res.json();
}

/** Từ chối nhiệm vụ kèm lý do (PENDING_RESCUE → REJECTED, báo admin). */
export async function rejectMission(token: string, id: string, reason: string): Promise<MissionDetail> {
  const res = await fetch(`${API_BASE}/api/missions/${id}/reject`, {
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

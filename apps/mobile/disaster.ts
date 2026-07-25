/**
 * Suy diễn thông tin "nắm bắt nhanh" cho đội cứu hộ từ dữ liệu thật của backend.
 * Không gọi API — chỉ map/tô màu để làm nổi bật 3 thứ quan trọng nhất:
 * loại thiên tai · mức nguy hiểm · số người gặp nạn.
 */

export interface DisasterMeta {
  icon: string;
  label: string;
  accent: string;
}

/** Loại thiên tai → biểu tượng + tên tiếng Việt + màu nhận diện. */
const DISASTER: Record<string, DisasterMeta> = {
  FLOOD: { icon: "🌊", label: "Lũ lụt", accent: "#38bdf8" },
  STORM: { icon: "🌀", label: "Bão", accent: "#818cf8" },
  LANDSLIDE: { icon: "⛰️", label: "Sạt lở", accent: "#f97316" },
  FIRE: { icon: "🔥", label: "Cháy", accent: "#ef4444" },
  ISOLATION: { icon: "🚧", label: "Cô lập", accent: "#eab308" },
  OTHER: { icon: "⚠️", label: "Sự cố", accent: "#94a3b8" },
};

/** Trả về meta của loại thiên tai; nếu lạ thì giữ nguyên tên nhận được. */
export function disasterOf(type: string): DisasterMeta {
  const known = DISASTER[type?.toUpperCase?.() ?? ""];
  if (known) return known;
  return { icon: "⚠️", label: type || "Sự cố", accent: "#94a3b8" };
}

export type DangerLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface DangerMeta {
  level: DangerLevel;
  label: string;
  /** Màu chữ badge (đủ sáng trên nền tối). */
  color: string;
  /** Nền badge (mờ). */
  bg: string;
  /** Màu viền/sọc bên trái card. */
  stripe: string;
  /** true khi CRITICAL/HIGH — dùng để nhấn thêm nếu cần. */
  dangerous: boolean;
}

/**
 * Chấm mức nguy hiểm từ loại thiên tai + số người gặp nạn.
 * Thang này là tín hiệu trực quan cho đội cứu hộ, không phải kết luận của backend.
 */
export function assessDanger(type: string, people: number): DangerMeta {
  const typeScore: Record<string, number> = {
    FIRE: 3,
    LANDSLIDE: 3,
    FLOOD: 2,
    STORM: 2,
    ISOLATION: 1,
    OTHER: 1,
  };
  const t = typeScore[type?.toUpperCase?.() ?? ""] ?? 1;
  const p = people >= 100 ? 3 : people >= 50 ? 2 : people >= 20 ? 1 : 0;
  const score = t + p;

  if (score >= 5) return DANGER.CRITICAL;
  if (score === 4) return DANGER.HIGH;
  if (score === 3) return DANGER.MEDIUM;
  return DANGER.LOW;
}

const DANGER: Record<DangerLevel, DangerMeta> = {
  CRITICAL: {
    level: "CRITICAL",
    label: "KHẨN CẤP",
    color: "#f87171",
    bg: "rgba(239,68,68,0.16)",
    stripe: "#ef4444",
    dangerous: true,
  },
  HIGH: {
    level: "HIGH",
    label: "NGUY HIỂM",
    color: "#fb923c",
    bg: "rgba(249,115,22,0.16)",
    stripe: "#f97316",
    dangerous: true,
  },
  MEDIUM: {
    level: "MEDIUM",
    label: "CẢNH BÁO",
    color: "#fbbf24",
    bg: "rgba(245,158,11,0.16)",
    stripe: "#f59e0b",
    dangerous: false,
  },
  LOW: {
    level: "LOW",
    label: "THEO DÕI",
    color: "#4ade80",
    bg: "rgba(34,197,94,0.16)",
    stripe: "#22c55e",
    dangerous: false,
  },
};

/** Biểu tượng cho thông báo KHÔNG gắn nhiệm vụ (card rút gọn). */
export function kindIcon(kind: string): string {
  const map: Record<string, string> = {
    INCIDENT_DETECTED: "⚠️",
    READINESS_DEGRADED: "📉",
    WAREHOUSE_READY: "📦",
    MISSION_COMPLETED: "✅",
    MISSION_CANCELLED: "🚫",
    INTER_WAREHOUSE_REQUEST: "🔁",
  };
  return map[kind] ?? "🔔";
}

/**
 * Rút loại thiên tai + số người từ body thông báo nhiệm vụ.
 * Backend luôn tạo body dạng: `${incidentType} — ${affectedPeople} người. ...`
 * Trả về null nếu không khớp (để card lùi về kiểu hiển thị thường).
 */
export function parseMissionSummary(body: string): { type?: string; people: number } | null {
  if (!body) return null;
  const peopleMatch = body.match(/(\d+)\s*người/);
  if (!peopleMatch) return null;
  const people = Number(peopleMatch[1]);
  if (!Number.isFinite(people)) return null;
  // Token đứng trước dấu "—" là loại thiên tai (enum hoặc nhãn).
  const token = body.split("—")[0]?.trim();
  return { type: token || undefined, people };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** HH:mm · dd/MM — cho card danh sách. Giờ do backend cấp (createdAt). */
export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** HH:mm · dd/MM/yyyy — cho màn chi tiết (đầy đủ năm). */
export function formatLongTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(
    d.getMonth() + 1,
  )}/${d.getFullYear()}`;
}

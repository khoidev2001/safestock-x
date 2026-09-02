/**
 * Bản nháp khai tình huống, giữ lại khi rời tab rồi quay lại.
 *
 * Trước đây form chỉ sống trong state của component: bấm "Phân tích bằng AI" xong
 * mà chưa lập bản tham mưu, chuyển sang tab Nhiệm vụ rồi mở lại nhiệm vụ đó là
 * mọi số liệu vừa phân tích biến mất — người dùng phải kể lại từ đầu. Backend chỉ
 * lưu khi đã có bản tham mưu, nên chặng giữa phải do máy người dùng giữ.
 *
 * Phần thuần ở đây (khoá, dựng, đọc) tách khỏi localStorage để test được mà không
 * cần trình duyệt; phần chạm bộ nhớ trình duyệt nằm cuối file và luôn bọc try/catch
 * vì chế độ riêng tư có thể ném ngay khi đọc.
 */

export interface MissionDraft {
  description: string;
  incidentType: string;
  location: string;
  affectedPeople: number;
  durationHours: number;
  children: number;
  elderly: number;
  medicalSupportCases: number;
  incidentLat: number | null;
  incidentLng: number | null;
  /** Lời kể đã được phân tích, để biết có nên bật lại nút phân tích hay không. */
  analyzedDescription: string | null;
  savedAt: string;
}

const PREFIX = "safestock.mission-draft.v1";

/** Nhiệm vụ chưa có id (đang khai vụ mới) dùng chung một khoá. */
export function draftKey(missionId: string | null | undefined): string {
  return `${PREFIX}.${missionId?.trim() || "new"}`;
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

/** Đọc bản nháp từ chuỗi JSON đã lưu. Hỏng hoặc sai kiểu → null, không ném. */
export function parseDraft(raw: string | null): MissionDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const d = parsed as Record<string, unknown>;
  // Thiếu cả mô tả lẫn địa điểm thì không còn gì đáng khôi phục.
  if (!str(d.description).trim() && !str(d.location).trim() && num(d.affectedPeople) === 0) {
    return null;
  }
  const lat = typeof d.incidentLat === "number" ? d.incidentLat : null;
  const lng = typeof d.incidentLng === "number" ? d.incidentLng : null;
  return {
    description: str(d.description),
    incidentType: str(d.incidentType, "FLOOD"),
    location: str(d.location),
    affectedPeople: num(d.affectedPeople),
    durationHours: num(d.durationHours, 24),
    children: num(d.children),
    elderly: num(d.elderly),
    medicalSupportCases: num(d.medicalSupportCases),
    // Toạ độ phải đủ cặp mới dùng được; lẻ một nửa là dữ liệu hỏng.
    incidentLat: lat != null && lng != null ? lat : null,
    incidentLng: lat != null && lng != null ? lng : null,
    analyzedDescription: typeof d.analyzedDescription === "string" ? d.analyzedDescription : null,
    savedAt: str(d.savedAt),
  };
}

/** Có gì đáng lưu không — form còn nguyên mặc định thì đừng ghi rác. */
export function isDraftWorthKeeping(draft: Omit<MissionDraft, "savedAt">): boolean {
  return Boolean(
    draft.description.trim() ||
    draft.location.trim() ||
    draft.incidentLat != null ||
    draft.analyzedDescription,
  );
}

// ---- phần chạm localStorage ----

export function readDraft(missionId: string | null | undefined): MissionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDraft(window.localStorage.getItem(draftKey(missionId)));
  } catch {
    return null;
  }
}

export function writeDraft(
  missionId: string | null | undefined,
  draft: Omit<MissionDraft, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!isDraftWorthKeeping(draft)) {
      window.localStorage.removeItem(draftKey(missionId));
      return;
    }
    window.localStorage.setItem(
      draftKey(missionId),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Chế độ riêng tư hoặc hết dung lượng: mất bản nháp thì tiếc, nhưng làm sập
    // màn hình điều phối giữa lúc đang gấp thì tệ hơn nhiều.
  }
}

export function clearDraft(missionId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(missionId));
  } catch {
    /* như trên */
  }
}

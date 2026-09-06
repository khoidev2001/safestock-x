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

/**
 * Số bản nháp tối đa được phép nằm lại trong máy.
 *
 * Mỗi nhiệm vụ mở ra là một khoá riêng, mà khoá chỉ bị xoá khi lập được bản tham
 * mưu. Mở mười nhiệm vụ để xem rồi thoát ra là mười bản nháp nằm lại vĩnh viễn —
 * sau vài tuần trực điều phối thì localStorage đầy rác, và tới lúc chật chỗ thì
 * chính bản nháp ĐANG GÕ là bản ghi không xuống được.
 *
 * Năm là đủ cho việc thật: người điều phối nhảy qua lại giữa vài vụ đang chạy,
 * chứ không quay lại bản nháp của vụ tuần trước.
 */
export const MAX_DRAFTS = 5;

/** Quá hạn này thì bản nháp là rác: sự việc đã xong từ lâu. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Nhiệm vụ chưa có id (đang khai vụ mới) dùng chung một khoá. */
export function draftKey(missionId: string | null | undefined): string {
  return `${PREFIX}.${missionId?.trim() || "new"}`;
}

export interface DraftEntry {
  key: string;
  /** Chuỗi ISO như đã ghi; hỏng hoặc thiếu thì coi như cũ nhất. */
  savedAt: string;
}

/** Mốc thời gian để so sánh. Không đọc được → 0, tức xếp vào nhóm cũ nhất. */
function savedAtMs(entry: DraftEntry): number {
  const ms = Date.parse(entry.savedAt);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Những khoá phải dọn: quá hạn, hoặc thừa ra ngoài hạn mức.
 *
 * Tách thuần khỏi localStorage để test được cả phần khó dựng nhất — mốc thời gian
 * và thứ tự — mà không cần trình duyệt.
 *
 * `keepKey` là bản nháp của màn hình đang mở: nó phải sống sót kể cả khi là bản
 * cũ nhất, vì dọn đúng thứ người dùng đang gõ dở là lỗi tệ hơn hẳn việc giữ thừa.
 */
export function draftsToEvict(
  entries: DraftEntry[],
  nowMs: number,
  keepKey?: string | null,
): string[] {
  const candidates = entries.filter((entry) => entry.key !== keepKey);
  const expired = candidates.filter((entry) => nowMs - savedAtMs(entry) > DRAFT_TTL_MS);
  const expiredKeys = new Set(expired.map((entry) => entry.key));

  // Còn lại sắp mới → cũ; phần tràn khỏi hạn mức bị cắt từ đuôi. Bản `keepKey`
  // vẫn tính vào hạn mức dù không bị cắt, nếu không mở một nhiệm vụ là được phép
  // giữ thêm một bản nữa mãi mãi.
  const keptCount = entries.some((entry) => entry.key === keepKey) ? 1 : 0;
  const overflow = candidates
    .filter((entry) => !expiredKeys.has(entry.key))
    .sort((a, b) => savedAtMs(b) - savedAtMs(a))
    .slice(Math.max(MAX_DRAFTS - keptCount, 0))
    .map((entry) => entry.key);

  return [...expiredKeys, ...overflow];
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

/** Mọi bản nháp đang nằm trong máy, kèm mốc ghi để biết cái nào đáng dọn. */
function listDraftEntries(): DraftEntry[] {
  const entries: DraftEntry[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(`${PREFIX}.`)) continue;
    let savedAt = "";
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "");
      if (parsed && typeof parsed === "object" && typeof parsed.savedAt === "string") {
        savedAt = parsed.savedAt;
      }
    } catch {
      // Bản ghi hỏng: để savedAt rỗng cho nó xếp vào nhóm cũ nhất và bị dọn sớm.
    }
    entries.push({ key, savedAt });
  }
  return entries;
}

/**
 * Dọn bản nháp quá hạn và phần tràn khỏi hạn mức.
 *
 * Gọi một lần mỗi lần mở màn hình khai báo là đủ: rác sinh ra theo lượt mở nhiệm
 * vụ, nên dọn theo đúng nhịp đó thì số bản nháp không bao giờ vượt hạn mức quá
 * một. Quét trong mỗi lần GÕ PHÍM thì mới là lãng phí thật.
 *
 * Trả về số khoá đã xoá, để chỗ gọi biết có đáng thử ghi lại hay không.
 */
export function pruneDrafts(keepMissionId?: string | null): number {
  if (typeof window === "undefined") return 0;
  try {
    const doomed = draftsToEvict(listDraftEntries(), Date.now(), draftKey(keepMissionId));
    for (const key of doomed) window.localStorage.removeItem(key);
    return doomed.length;
  } catch {
    return 0;
  }
}

export function writeDraft(
  missionId: string | null | undefined,
  draft: Omit<MissionDraft, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  const key = draftKey(missionId);
  try {
    if (!isDraftWorthKeeping(draft)) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload = JSON.stringify({ ...draft, savedAt: new Date().toISOString() });
    try {
      window.localStorage.setItem(key, payload);
    } catch {
      // Hết dung lượng — thường do chính đống nháp cũ. Dọn rồi thử đúng một lần
      // nữa: lần hai mà vẫn chật thì chỗ chật không phải của mình, bỏ qua.
      if (pruneDrafts(missionId) > 0) window.localStorage.setItem(key, payload);
    }
  } catch {
    // Chế độ riêng tư hoặc vẫn hết dung lượng: mất bản nháp thì tiếc, nhưng làm
    // sập màn hình điều phối giữa lúc đang gấp thì tệ hơn nhiều.
  }
}

/**
 * Chuyển bản nháp sang khoá của nhiệm vụ vừa được tạo.
 *
 * Khai một sự việc mới thì bản nháp nằm ở khoá "new". Bấm phân tích xong, hệ thống
 * tạo nhiệm vụ thật rồi ĐIỀU HƯỚNG sang trang riêng của nó — trang đó đọc bản nháp
 * theo id nhiệm vụ, không thấy gì, nên form dựng lại từ giá trị mặc định và mọi số
 * liệu vừa phân tích biến mất khỏi màn hình. Dời khoá ngay lúc chuyển trang thì lời
 * kể, số liệu và cả cờ "lời kể này đã phân tích rồi" đi theo sang trang mới.
 */
export function moveDraft(
  fromMissionId: string | null | undefined,
  toMissionId: string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  if (draftKey(fromMissionId) === draftKey(toMissionId)) return;
  try {
    const raw = window.localStorage.getItem(draftKey(fromMissionId));
    if (raw === null) return;
    window.localStorage.setItem(draftKey(toMissionId), raw);
    window.localStorage.removeItem(draftKey(fromMissionId));
  } catch {
    /* như writeDraft: mất bản nháp còn hơn làm sập màn hình điều phối */
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

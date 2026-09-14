/**
 * Tự lưu chi tiết nhiệm vụ xuống máy để xem được khi mất mạng — phần quyết định.
 *
 * VÌ SAO CẦN: danh sách nhiệm vụ đã có bản lưu, nhưng chi tiết thì chỉ được lưu
 * khi người dùng TỰ MỞ nhiệm vụ đó lúc còn sóng. Đội cứu hộ vào vùng lũ, sóng mất,
 * bấm vào một nhiệm vụ chưa từng mở — màn hình trống trơn, đúng lúc cần đọc địa
 * điểm và danh sách vật tư nhất.
 *
 * Nên sau mỗi lần tải danh sách, app tải ngầm chi tiết từng nhiệm vụ và lưu lại.
 * Phần dưới đây chỉ quyết định TẢI CÁI NÀO, tách riêng để khoá bằng test.
 */

/** Bản lưu cũ hơn mức này thì tải lại dù danh sách không đổi. */
export const PREFETCH_MAX_AGE_MS = 30 * 60 * 1000;

/** Số nhiệm vụ tải ngầm tối đa trong một lượt. */
export const PREFETCH_BATCH_LIMIT = 40;

/** Số nhiệm vụ giữ bản lưu tối đa; vượt thì bỏ những cái đã rời danh sách. */
export const PREFETCH_INDEX_CAP = 60;

export interface PrefetchIndexEntry {
  /** Dấu vân tay của dòng danh sách lúc tải chi tiết. */
  fingerprint: string;
  /** Mốc lưu, tính bằng mili giây. */
  storedAt: number;
}

export type PrefetchIndex = Record<string, PrefetchIndexEntry>;

/**
 * Dấu vân tay của MỘT dòng danh sách nhiệm vụ.
 *
 * VÌ SAO KHÔNG DÙNG `updatedAt`: API không trả trường đó. Nhưng mỗi dòng danh sách
 * đã chứa gần đủ dữ liệu của chi tiết — trạng thái, nhu cầu vật tư, phiếu từng
 * kho — nên hễ chi tiết đổi thì dòng danh sách cũng đổi theo. So vân tay là biết
 * cần tải lại mà không phải gọi thêm lần nào.
 *
 * Xếp khoá trước khi băm: cùng dữ liệu nhưng máy chủ trả khoá theo thứ tự khác thì
 * vẫn phải ra cùng một vân tay, không thì tải lại vô ích mỗi 15 giây.
 */
export function missionFingerprint(item: unknown): string {
  const text = stableStringify(item);
  // FNV-1a 32 bit: đủ để phân biệt "có đổi hay không", không dùng cho bảo mật.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

/**
 * Chọn nhiệm vụ cần tải chi tiết trong lượt này, giữ đúng thứ tự danh sách.
 *
 * Tải khi: chưa có bản lưu, vân tay đổi, hoặc bản lưu đã cũ. Danh sách tự làm mới
 * mỗi 15 giây — không có điều kiện này thì mỗi 15 giây app tải lại toàn bộ.
 */
export function planMissionPrefetch(
  missions: { id: string }[],
  fingerprints: Map<string, string>,
  index: PrefetchIndex,
  now: number,
  options: { maxAgeMs?: number; limit?: number } = {},
): string[] {
  const maxAgeMs = options.maxAgeMs ?? PREFETCH_MAX_AGE_MS;
  const limit = options.limit ?? PREFETCH_BATCH_LIMIT;
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const mission of missions) {
    if (picked.length >= limit) break;
    if (seen.has(mission.id)) continue;
    seen.add(mission.id);
    const entry = index[mission.id];
    const fingerprint = fingerprints.get(mission.id);
    const stale =
      !entry ||
      entry.fingerprint !== fingerprint ||
      !Number.isFinite(entry.storedAt) ||
      now - entry.storedAt >= maxAgeMs;
    if (stale) picked.push(mission.id);
  }
  return picked;
}

/**
 * Bỏ bản lưu của nhiệm vụ đã rời danh sách — chỉ khi vượt trần.
 *
 * KHÔNG xoá ngay khi rời danh sách: danh sách chỉ tải trang đầu, nhiệm vụ cũ hơn
 * nằm ở trang sau vẫn có thể là thứ người dùng vừa mở. Xoá vội là mất đúng bản
 * lưu người ta sắp cần. Chỉ dọn khi số bản lưu vượt trần, và dọn cái cũ nhất trước.
 */
export function pruneMissionIndex(
  index: PrefetchIndex,
  keepIds: string[],
  cap = PREFETCH_INDEX_CAP,
): { index: PrefetchIndex; removedIds: string[] } {
  const ids = Object.keys(index);
  if (ids.length <= cap) return { index, removedIds: [] };
  const keep = new Set(keepIds);
  const removable = ids
    .filter((id) => !keep.has(id))
    .sort((left, right) => index[left].storedAt - index[right].storedAt);
  const removedIds = removable.slice(0, ids.length - cap);
  const next: PrefetchIndex = { ...index };
  for (const id of removedIds) delete next[id];
  return { index: next, removedIds };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

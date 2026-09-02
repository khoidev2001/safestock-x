/**
 * So khớp tên thôn do AI đọc ra với danh mục thôn đã xác minh.
 *
 * Bộ parse trả về `location` là một chuỗi tự do — có khi kèm chữ "thôn", có khi
 * dính thêm chữ phía sau, có khi là tên xã lân cận không nằm trong danh mục.
 * Chuỗi không khớp thôn nào thì backend không có toạ độ để tính tuyến, nên phải
 * chặn ngay tại form thay vì để người dùng bấm lập phương án rồi mới báo lỗi.
 *
 * Quy tắc chuẩn hoá giữ y hệt `apps/backend/src/admin/hamlet-normalization.ts`:
 * lệch nhau thì web báo hợp lệ trong khi backend từ chối, hoặc ngược lại.
 */

export interface HamletOption {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  lat: number | null;
  lng: number | null;
  verified: boolean;
}

export function normalizeHamletName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Thôn "hợp lệ trên bản đồ": đã xác minh VÀ có đủ cặp toạ độ.
 *
 * Thiếu toạ độ thì chọn xong vẫn không lập được phương án — đưa vào danh sách
 * chọn chỉ để người dùng chọn phải rồi mới biết là không dùng được.
 */
export function selectableHamlets(hamlets: HamletOption[]): HamletOption[] {
  return hamlets
    .filter((h) => h.verified && h.lat != null && h.lng != null)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

/** Tìm thôn theo tên/bí danh. Không khớp → null (KHÔNG đoán gần đúng). */
export function findHamlet(hamlets: HamletOption[], raw: string | null | undefined) {
  const needle = normalizeHamletName(raw ?? "");
  if (!needle) return null;
  // Bỏ tiền tố "thon " nếu người nói kèm danh từ chung.
  const bare = needle.replace(/^thon\s+/, "");
  return (
    hamlets.find((h) => {
      const names = [h.normalizedName || normalizeHamletName(h.name), ...h.aliases];
      return names.some((n) => n === needle || n === bare);
    }) ?? null
  );
}

export type LocationStatus = "EMPTY" | "VALID" | "INVALID";

/**
 * Trạng thái ô địa điểm: trống, khớp một thôn hợp lệ, hay có chữ nhưng không khớp.
 * "INVALID" là trường hợp đáng cảnh báo — báo cáo có nhắc một nơi nào đó mà danh
 * mục không có, im lặng bỏ qua là mất thông tin của người báo.
 */
export function locationStatus(
  hamlets: HamletOption[],
  raw: string | null | undefined,
): LocationStatus {
  if (!normalizeHamletName(raw ?? "")) return "EMPTY";
  return findHamlet(hamlets, raw) ? "VALID" : "INVALID";
}

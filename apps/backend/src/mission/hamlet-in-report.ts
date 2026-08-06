import { normalizeHamletName } from "../admin/hamlet-normalization";

export interface HamletNameCandidate {
  id: string;
  name: string;
  aliases: string[];
}

/**
 * Dò tên thôn CÓ THẬT ngay trong lời kể, thay vì đoán bằng quy tắc chữ nghĩa.
 *
 * Lớp bóc tách ở AI service tìm địa điểm bằng cách bắt cụm đứng sau chữ "thôn".
 * Cách đó bỏ sót đúng kiểu câu người ta nói ra miệng:
 *
 *     "lũ lụt ở tân bình, cô lập 120 người"
 *
 * Không ai bắt buộc phải nói chữ "thôn", và người trong xã thì gần như không bao
 * giờ nói. Bỏ sót ở đây không phải mất một trường dữ liệu — nó CHẶN đứng cả
 * phương án, vì backend bắt buộc phải có địa điểm đã xác minh.
 *
 * Đối chiếu thẳng với danh mục thôn ADMIN đã xác minh nên không có chuyện đoán
 * sai: chỉ nhận đúng những tên có thật trong xã đó.
 *
 * So khớp theo RANH GIỚI TỪ, không phải chứa chuỗi. "tan phu" nằm gọn bên trong
 * "tan phuoc"; so kiểu chứa chuỗi thì một lời kể về Tân Phước sẽ bị nhận thành
 * Tân Phú — điều phối nhầm sang một thôn khác hẳn, mà không ai thấy gì bất thường.
 */
export function findHamletInReport(
  report: string,
  hamlets: HamletNameCandidate[],
): HamletNameCandidate | null {
  const folded = normalizeHamletName(report);
  if (!folded) return null;

  const matched = hamlets.filter((hamlet) =>
    namePhrases(hamlet).some((phrase) => containsWholePhrase(folded, phrase)),
  );

  // Nhắc tới hai thôn trở lên thì KHÔNG tự chọn. Đoán bừa ở đây là gửi hàng cứu
  // trợ tới nhầm chỗ; để ADMIN chỉ định vẫn nhanh hơn là điều phối lại.
  if (matched.length !== 1) return null;
  return matched[0];
}

/** Tên chính cùng mọi bí danh, đã chuẩn hoá, bỏ trùng và bỏ rỗng. */
function namePhrases(hamlet: HamletNameCandidate): string[] {
  const all = [hamlet.name, ...(hamlet.aliases ?? [])].map(normalizeHamletName).filter(Boolean);
  return [...new Set(all)];
}

function containsWholePhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  // Chuỗi đã chuẩn hoá chỉ còn a-z, 0-9 và dấu cách, nên ranh giới từ là đủ chắc.
  const pattern = new RegExp(`(?:^| )${escapeRegExp(phrase)}(?: |$)`);
  return pattern.test(haystack);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

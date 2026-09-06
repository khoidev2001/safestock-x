import { IncidentType } from "@safestock/shared-types";
import { normalizeHamletName } from "../admin/hamlet-normalization";
import { findHamletInReport, HamletNameCandidate } from "./hamlet-in-report";

/**
 * Ba dữ kiện đọc thẳng từ lời kể của trưởng thôn, KHÔNG cần AI.
 *
 * Báo cáo gửi từ điện thoại chỉ có một đoạn chữ. Nhiệm vụ sinh ra từ nó là chỗ
 * trống — loại `OTHER`, 0 người — cho tới khi ADMIN mở lên phân tích. Nhưng thẻ
 * thông báo thì hiện NGAY lúc đó, nên nếu chỉ đọc bản ghi nhiệm vụ thì thẻ báo
 * cháy và thẻ báo ngập trông y hệt nhau: cùng một dấu cảnh báo, không số người,
 * không tên thôn. Người trực phải mở từng cái ra mới biết cái nào gấp hơn.
 *
 * Ở đây không đoán và không suy diễn: chỉ nhận những gì chính người báo đã viết
 * ra. Không thấy thì trả null, và thẻ hiện kiểu chung — thà thiếu một nhãn còn
 * hơn dán nhãn "Cháy" lên một vụ ngập.
 *
 * Đây KHÔNG phải bộ phân tích tình huống. Nó không ghi gì vào nhiệm vụ, không
 * thay bước ADMIN bấm "Phân tích bằng AI"; nó chỉ quyết định thẻ thông báo hiện
 * biểu tượng nào và in đậm con số nào.
 */
export interface ReportSignal {
  incidentType: string | null;
  affectedPeople: number | null;
  locationName: string | null;
}

/**
 * Từ khoá nhận loại thiên tai, xếp theo thứ tự xét.
 *
 * Thứ tự có ý nghĩa: một câu nhắc cả "cháy" lẫn "mưa" thì cháy là việc phải làm
 * trước. Cô lập xếp cuối vì nó thường là HẬU QUẢ của lũ hay sạt lở — "ngập nên
 * bị cô lập" phải vào nhóm lũ lụt, còn "cô lập" đứng một mình mới là nhóm riêng.
 *
 * Hai danh sách, vì bỏ dấu tiếng Việt làm nhiều từ đổi nghĩa:
 *
 *   `withDiacritics`    — so trên câu GIỮ NGUYÊN DẤU. Dành cho những từ mà bỏ dấu là đụng
 *                một từ thường gặp: "bão" ↔ "báo" (báo cáo), "cháy" ↔ "chảy"
 *                (nước chảy), "giông" ↔ "giống", "lũ" ↔ "lu". Câu "xin báo cáo
 *                tình hình sáng nay" từng bị nhận thành một cơn bão đúng vì chỗ này.
 *   `withoutDiacritics` — so trên câu đã bỏ dấu, cho những cụm không đụng ai. Đây cũng là
 *                đường bắt được lời kể gõ không dấu, kiểu "chay nha", "toc mai".
 */
const INCIDENT_SIGNS: ReadonlyArray<{
  type: IncidentType;
  withDiacritics: readonly string[];
  withoutDiacritics: readonly string[];
}> = [
  {
    type: IncidentType.FIRE,
    withDiacritics: ["cháy"],
    withoutDiacritics: ["hoa hoan", "boc chay", "chay nha", "chay rung"],
  },
  {
    type: IncidentType.LANDSLIDE,
    withDiacritics: [],
    withoutDiacritics: ["sat lo", "lo dat", "sut lun", "truot dat"],
  },
  {
    type: IncidentType.FLOOD,
    withDiacritics: ["lũ"],
    withoutDiacritics: ["ngap", "lut", "trieu cuong", "nuoc dang", "nuoc len", "mua lon"],
  },
  {
    type: IncidentType.STORM,
    withDiacritics: ["bão", "giông"],
    withoutDiacritics: ["loc xoay", "gio giat", "toc mai"],
  },
  {
    type: IncidentType.ISOLATION,
    withDiacritics: [],
    withoutDiacritics: ["co lap", "chia cat", "mac ket", "khong ra duoc"],
  },
];

/**
 * Số người trong lời kể: con số đứng NGAY TRƯỚC "người", "nhân khẩu" hoặc "hộ".
 *
 * Buộc phải đứng ngay trước danh từ chứ không bắt số đầu tiên gặp được: "ngập 2
 * mét, 260 người bị ảnh hưởng" mà lấy số đầu thì thẻ báo có 2 người gặp nạn.
 *
 * "55 trẻ em" cố ý KHÔNG tính: đó là một phần của tổng số người, không phải tổng.
 */
const AFFECTED_PEOPLE = /(\d[\d.,]*)\s*(người|nguoi|nhân khẩu|nhan khau|hộ dân|ho dan)/iu;

export function readReportSignal(
  reportText: string,
  hamlets: HamletNameCandidate[] = [],
): ReportSignal {
  const text = reportText?.trim() ?? "";
  if (!text) return { incidentType: null, affectedPeople: null, locationName: null };
  return {
    incidentType: readIncidentType(text),
    affectedPeople: readAffectedPeople(text),
    locationName: findHamletInReport(text, hamlets)?.name ?? null,
  };
}

function readIncidentType(text: string): string | null {
  const keptDiacritics = splitWords(text);
  const strippedDiacritics = normalizeHamletName(text);
  for (const { type, withDiacritics, withoutDiacritics } of INCIDENT_SIGNS) {
    const found =
      withDiacritics.some((keyword) => containsWholePhrase(keptDiacritics, splitWords(keyword))) ||
      withoutDiacritics.some((keyword) => containsWholePhrase(strippedDiacritics, normalizeHamletName(keyword)));
    if (found) return type;
  }
  return null;
}

/** Giữ nguyên dấu, chỉ hạ chữ thường và biến mọi thứ không phải chữ/số thành khoảng trắng. */
function splitWords(value: string): string {
  return value
    .toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function readAffectedPeople(text: string): number | null {
  const matched = AFFECTED_PEOPLE.exec(text);
  if (!matched) return null;
  // Dấu chấm và phẩy trong tiếng Việt là dấu phân nhóm hàng nghìn ("1.200 người"),
  // không phải dấu thập phân — bỏ hết rồi mới đọc số.
  const parsed = Number.parseInt(matched[1].replace(/[.,]/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * So theo RANH GIỚI TỪ, không phải chứa chuỗi.
 *
 * "lu" nằm gọn trong "luon", "lua", "lung tung"; so kiểu chứa chuỗi thì một câu
 * nhắc "lúa" thành ra báo lũ. Cùng lý do với `hamlet-in-report`.
 */
function containsWholePhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  const pattern = new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`);
  return pattern.test(haystack);
}

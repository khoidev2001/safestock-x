/**
 * Bỏ dấu tiếng Việt, để tìm kiếm không bắt người dùng gõ đúng dấu.
 *
 * VÌ SAO CẦN: ô tìm trong kho so khớp chuỗi thô, nên gõ "nuoc" không ra "Nước
 * uống đóng chai" — danh sách hiện "Không tìm thấy lô phù hợp" y như khi kho hết
 * hàng thật. Người trực đang đứng giữa kho lúc lũ về sẽ tin là hết, chứ không
 * ngồi đoán rằng mình thiếu dấu. Gõ có dấu trên điện thoại lại chậm gấp mấy lần.
 *
 * KHÔNG dùng `String.prototype.normalize`: Hermes — máy chạy JavaScript của bản
 * dựng Android — không đảm bảo có hàm này, mà thiếu thì nó ném lỗi ngay giữa lúc
 * người dùng đang gõ. Bảng tra dưới đây tự lo được, không phụ thuộc gì.
 *
 * Chữ "đ" phải khai riêng: nó KHÔNG phải "d" kèm dấu mà là một chữ cái khác
 * trong bảng chữ cái, nên mọi cách bóc dấu tự động đều bỏ sót nó.
 */

/** Mỗi dòng: chữ không dấu, rồi mọi biến thể có dấu của nó. */
const ACCENT_GROUPS: Record<string, string> = {
  a: "àáạảãâầấậẩẫăằắặẳẵ",
  e: "èéẹẻẽêềếệểễ",
  i: "ìíịỉĩ",
  o: "òóọỏõôồốộổỗơờớợởỡ",
  u: "ùúụủũưừứựửữ",
  y: "ỳýỵỷỹ",
  d: "đ",
};

/** Dựng sẵn một lần lúc nạp mô-đun, thay vì duyệt bảng trên mỗi ký tự. */
const PLAIN_BY_ACCENTED = new Map<string, string>();
for (const [plain, accented] of Object.entries(ACCENT_GROUPS)) {
  for (const character of accented) PLAIN_BY_ACCENTED.set(character, plain);
}

/**
 * Đưa chuỗi về dạng so khớp được: chữ thường, không dấu.
 *
 * Hạ chữ thường TRƯỚC khi tra bảng, để bảng chỉ phải khai biến thể chữ thường —
 * khai cả chữ hoa là gấp đôi số dòng và gấp đôi chỗ để sót.
 */
export function foldVietnamese(text: string): string {
  let folded = "";
  for (const character of text.toLocaleLowerCase("vi")) {
    folded += PLAIN_BY_ACCENTED.get(character) ?? character;
  }
  return folded;
}

/**
 * Bỏ dấu tiếng Việt để so khớp khi tìm kiếm.
 *
 * Không ai gõ dấu khi đang vội, và bàn phím trên máy trực nhiều khi còn chưa cài
 * bộ gõ tiếng Việt. Gõ "nguyen van a" phải ra "Nguyễn Văn A", "nuoc uong" phải
 * ra "Nước uống" — nếu không thì ô tìm kiếm chỉ dùng được bởi người đã biết
 * chính xác mình đang tìm gì.
 *
 * Dùng chung cho mọi ô tìm kiếm để hai màn hình không hiểu cùng một từ khoá theo
 * hai cách khác nhau.
 */
export function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("vi")
    .trim();
}

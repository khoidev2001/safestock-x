/**
 * Chuẩn hoá tên đăng nhập: cắt khoảng trắng và đưa về chữ thường.
 *
 * Trước đây tra cứu thẳng chuỗi người dùng gửi lên. Hậu quả là **mọi biến thể chỉ
 * khác nhau chỗ không nhìn thấy đều trả về "Email hoặc mật khẩu sai"**, và trên
 * màn hình thì ô tên đăng nhập trông y hệt lúc đúng:
 *
 *   "staff "   ← dán kèm một dấu cách
 *   " staff"
 *   "Staff"    ← trình duyệt/bàn phím tự viết hoa chữ đầu
 *
 * Người dùng đọc thông báo rồi đi kiểm tra mật khẩu — sai chỗ hoàn toàn. Tệ hơn:
 * đủ năm lần như vậy là bộ chống dò khoá tài khoản mười lăm phút, và từ đó gõ
 * đúng cũng không vào được nữa.
 *
 * Tên đăng nhập giờ là username trần (`staff`, `longchau`, `admin`) chứ không còn
 * hậu tố tên miền, và toàn bộ tài khoản trong hệ thống đều lưu chữ thường — đã kiểm
 * cả 21 tài khoản. Nên chuẩn hoá ở đây không mất tài khoản nào.
 */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

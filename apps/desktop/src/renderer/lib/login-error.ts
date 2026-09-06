/**
 * Biến lỗi đăng nhập thành câu chỉ đúng chỗ phải sửa.
 *
 * Backend chỉ trả đúng một câu "Email hoặc mật khẩu sai" cho mọi kiểu sai — đúng
 * về bảo mật (không tiết lộ email nào có thật), nhưng ở máy vận hành thì nó bỏ
 * người dùng đứng trước một màn hình mà mọi thứ TRÔNG như đã đúng.
 *
 * Hai thứ hay sai mà nhìn không ra:
 *
 * 1. **Khoảng trắng thừa trong mật khẩu.** Email được cắt khoảng trắng trước khi
 *    gửi, mật khẩu thì không — và đúng như vậy, vì khoảng trắng có thể là một
 *    phần thật của mật khẩu. Nhưng mật khẩu ở đây dán từ tài liệu bàn giao, nên
 *    một dấu cách đi kèm là chuyện thường. Trên màn hình nó chỉ là thêm một chấm
 *    tròn, không ai đếm.
 *
 * 2. **Gõ nhầm địa chỉ máy chủ.** Nhập `ungphonhanh.life` khi đang ở LAN thì app
 *    gọi ra Internet, gặp Cloudflare, và nhận về đúng một mã lỗi — không nói gì
 *    về chuyện nó đã đi nhầm đường.
 */
export function describeLoginError(error: Error, host: string, password: string): string {
  const baseMessage = error.message;

  // Sai 5 lần là backend khoá 15 phút, và trong 15 phút đó MẬT KHẨU ĐÚNG CŨNG BỊ
  // TỪ CHỐI. Đây là chỗ duy nhất mà thử lại ngay là việc chắc chắn vô ích, nên
  // phải nói thẳng — mọi gợi ý khác lúc này đều dẫn người dùng đi sai hướng.
  if ((error as { status?: number }).status === 429) {
    return (
      "Đã sai quá 5 lần nên tài khoản bị khoá tạm 15 phút. " +
      "Trong lúc này gõ đúng mật khẩu cũng không vào được — hãy chờ rồi thử lại."
    );
  }

  const hints: string[] = [];

  if (password !== password.trim()) {
    hints.push(
      "Mật khẩu đang có khoảng trắng ở đầu hoặc cuối — xoá ô mật khẩu rồi gõ lại bằng tay.",
    );
  }

  const hostname = host.trim().toLowerCase();
  if (hostname.includes("ungphonhanh.life")) {
    hints.push("Đang gọi ra Internet. Khi máy chủ chạy ngay trên máy này, điền localhost:3100.");
  }

  // Luôn nói rõ đã gọi vào đâu: cùng một câu "sai mật khẩu" có thể đến từ một máy
  // chủ hoàn toàn khác với máy người dùng đang nghĩ tới.
  return [baseMessage, ...hints, `(đã gọi tới ${host.trim() || "localhost:3100"})`].join(" ");
}

"""Cấu hình chung cho các adapter Ollama."""
import os

# Bao lâu Ollama giữ model trong VRAM sau lần gọi cuối. "-1" = không bao giờ tự
# đẩy ra.
#
# Trước đây để "30m". Nghỉ quá nửa tiếng là model rơi khỏi VRAM, lần gọi kế tiếp
# phải nạp lại hơn 15 giây — vượt thời gian chờ của backend nên trợ lý trả lỗi và
# bản tin rơi về bản mẫu. Người dùng thấy hệ thống "bỗng dưng ngu đi", trong khi
# thực ra chỉ là model chưa vào bộ nhớ.
#
# Giá trị này đi trong TỪNG request và đè lên biến môi trường OLLAMA_KEEP_ALIVE
# của server, nên đặt ở server là không ăn — phải đặt ở đây.
#
# Đổi lại: model chiếm VRAM thường trực (qwen3.5:4b ~3.2GB + nomic-embed-text
# ~0.3GB). Máy nào cần VRAM cho việc khác thì đặt OLLAMA_KEEP_ALIVE=30m.
#
# Phải gửi -1 dạng SỐ. Ollama đọc keep_alive kiểu chuỗi như một khoảng thời gian
# ("30m", "1h"), nên chuỗi "-1" là cú pháp sai và cả request trả 400 — mọi lệnh gọi
# sinh văn bản lẫn embedding đều hỏng. Chuỗi chỉ giữ lại cho dạng "30m".
def _parse_keep_alive(raw: str) -> "int | str":
    text = raw.strip()
    try:
        return int(text)
    except ValueError:
        return text


KEEP_ALIVE = _parse_keep_alive(os.getenv("OLLAMA_KEEP_ALIVE", "-1"))

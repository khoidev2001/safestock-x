/**
 * Mã định danh cho một lượt gọi AI, để nhật ký hai đầu ghép được với nhau.
 *
 * `crypto.randomUUID` chỉ có ở ngữ cảnh bảo mật (https hoặc localhost); bản dựng
 * chạy qua IP nội bộ trong lúc diễn tập thì không có nó, nên phải có đường lùi —
 * mã trùng nhau chỉ làm nhật ký khó tra, còn ném lỗi ở đây là chặn luôn cú bấm.
 */
export function requestId(prefix = "analysis"): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

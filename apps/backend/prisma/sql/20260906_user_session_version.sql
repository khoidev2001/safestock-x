-- Tách hiệu lực của access token khỏi vòng xoay refresh token.
--
-- Trước đây "User"."tokenVersion" vừa là số thứ tự refresh token (xoay mỗi lượt
-- gia hạn phiên) vừa là thứ để kiểm tra access token. Hệ quả: mở thêm một tab là
-- tab đang mở bị đăng xuất. "sessionVersion" chỉ tăng khi phiên THẬT SỰ bị thu
-- hồi (đăng nhập mới, đăng xuất, đổi mật khẩu, đổi quyền).
--
-- Bổ sung thuần tuý, chạy được trước khi triển khai mã mới.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

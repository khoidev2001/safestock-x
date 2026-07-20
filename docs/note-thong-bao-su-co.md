# Ghi chú phiên làm việc: Thông báo sự cố (mobile + email) — 2026-07-16

> Trạng thái: mới thảo luận/chốt hướng, **chưa lập plan chi tiết, chưa code**. Nối tiếp từ [plan-bo-sung-kich-ban-iot.md](plan-bo-sung-kich-ban-iot.md) (kịch bản fire/power_outage — cũng chưa code).

## Quyết định đã chốt

**Kênh cảnh báo khi có sự cố (kể cả sự cố hiện có: SUSPECTED_LOSS/SENSOR_FAULT/BAD_STORAGE, và sau này FIRE_RISK/POWER_OUTAGE):**
- **User thường (RESCUE/WAREHOUSE)** — chỉ dùng app mobile → nhận **popup đẩy (push notification)** trên điện thoại.
- **ADMIN** — nhận qua **email**, tự cấu hình email cá nhân. Dùng **SMTP tự cấu hình** (Nodemailer + Gmail app-password hoặc SMTP nội bộ), không dùng dịch vụ ngoài (Resend/SendGrid) — đúng tinh thần "production = free/local" của dự án.

**Phạm vi app mobile (đã làm rõ, không đổi so với PRD §3.6, chỉ xác nhận lại):**
1. Quản lý kho hằng ngày (không thiên tai): xem tồn+Readiness, quét QR xuất/nhập/chuyển/kiểm tra/báo hỏng, kiểm kê nhanh theo kệ (WAREHOUSE), mượn–hoàn (RESCUE)
2. Nhận + xác nhận thông báo khi thiên tai: hiển thị `Notification` (đã có model), xác nhận qua API đã có sẵn — `POST /missions/:id/confirm` (RESCUE), `/prepare` (WAREHOUSE)
- **Chatbot hỏi-đáp kho** — chỉ desktop/ADMIN, **không** đưa lên mobile (đã xác nhận, khớp PRD — chatbot vốn đã xếp Polish, không nằm trong đặc tả mobile F0-F4 nào)
- Không thêm chức năng mới ngoài F0-F4 đã có trong `apps/mobile/ROADMAP.md`, trừ 1 đề xuất cân nhắc: màn "đang chờ đồng bộ" (pending sync queue) cho lớp offline 2 — **chưa quyết, chỉ nêu ý**.

## Việc cần làm (chưa lập plan chi tiết — làm tiếp buổi sau)

1. **Mobile scaffold tối thiểu** (`apps/mobile/` hiện chỉ có `package.json`/`README.md`/`ROADMAP.md`, chưa 1 dòng code):
   - Expo Router + TypeScript, login (SecureStore token)
   - `expo-notifications` xin quyền + lấy Expo Push Token, đăng ký token lên backend sau login
2. **Backend — lưu push token:** model mới `DeviceToken` (userId, expoPushToken, platform) — 1 user có thể nhiều máy
3. **Backend — endpoint** `POST /notifications/register-device`
4. **`NotificationService.create()` mở rộng:**
   - `recipientRole` RESCUE/WAREHOUSE → gọi Expo Push API (`https://exp.host/--/api/v2/push/send`, free, không cần key)
   - `recipientRole` ADMIN → gọi SMTP (Nodemailer) gửi mail tới `User.email` (cần biến môi trường `SMTP_HOST/PORT/USER/PASS`)
5. **Nối `IncidentService.scanWarehouse()` → `NotificationService.create()`** — hiện TẤT CẢ incident kind (kể cả 3 loại cũ) đều CHƯA bắn thông báo nào, đây là gap chung, không riêng fire/power (xem thêm bước 5 trong `plan-bo-sung-kich-ban-iot.md`)

## Ràng buộc cần nhớ khi lập plan chi tiết

- Push Expo cần build EAS hoặc chạy Expo Go trên máy thật/emulator — **không demo được trên trình duyệt**.
- Đây là phạm vi lớn hơn nhiều so với plan fire/power hiện tại — nên tách plan riêng, không gộp chung.
- Theo quy ước dự án: mọi lần lập plan phải có file `.md` thật trong repo (không chỉ dùng plan-mode scratch file).

## Việc liên quan đã có sẵn, tái dùng được (không viết lại)

- `NotificationService`/`NotificationGateway` (Socket.IO room `role:<ROLE>`) — dùng cho web, giữ nguyên, không đổi.
- `NotificationBell` frontend — mẫu tham khảo khi làm màn hình cảnh báo mobile.
- Mission workflow API (`confirm`/`prepare`) — dùng lại nguyên trạng cho mobile, không sửa backend.

## Tính năng hiện có (tổng hợp nhanh, để đối chiếu khi code)

AI chỉ chạm 3 điểm: `/parse` (tình huống→JSON), `/explain` (giải thích sự cố), `/action-plan` (viết mục tiêu/giai đoạn/cảnh báo/câu hỏi). Mọi số liệu nghiệp vụ (Readiness, phát hiện sự cố, phân bổ vật tư, workflow, tồn kho) đều rule engine/backend thuần, có test, AI không tự bịa số. Chi tiết đầy đủ: xem lịch sử chat phiên này hoặc hỏi lại Claude.

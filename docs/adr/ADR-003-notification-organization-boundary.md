# ADR-003: Notification scope by organization and role

Ngày: 28/07/2026  
Trạng thái: Accepted

## Bối cảnh

Thông báo trước đây chỉ được lọc theo role. Hai ADMIN ở hai tổ chức có thể cùng vào room
WebSocket role-level hoặc thử ID notification của nhau. Field update retry cũng có thể tạo
nhiều thông báo ADMIN.

## Quyết định

1. Notification.organizationId là tenant boundary. REST list/read/read-all luôn lấy
   organization từ actor đã xác thực và dùng điều kiện exact organizationId + recipientRole.
   ID ngoài scope trả 404, không xác nhận record tồn tại.
2. WebSocket room là notification:organizationId:role; client không tự chọn room.
3. Mọi notification mới phải có organization rõ ràng hoặc suy được từ mission/warehouse.
   Record legacy không có organization không được list/push cho tới khi backfill.
4. fieldUpdateId unique (nullable) làm idempotency key cho một alert evidence. Retry/race
   đọc notification thắng cuộc; không tạo bản trùng.

## Hệ quả

- Đã backfill record legacy từ warehouse/mission; script dừng lỗi nếu còn record không chứng
  minh được organization (trừ fallback an toàn khi database chỉ có đúng một organization).
- Notification không còn là kênh broadcast role-global. Mọi transaction tạo notification phải
  truyền organizationId trong cùng transaction khi đã biết scope.
- Có focused REST/WebSocket/field-retry tests. Browser multi-tenant acceptance vẫn là gate
  riêng.

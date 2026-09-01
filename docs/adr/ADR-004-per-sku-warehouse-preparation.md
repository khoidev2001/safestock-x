# ADR-004: Chuẩn bị mission theo từng SKU với CAS chống race

## Trạng thái

Accepted

## Ngày

2026-07-29

## Bối cảnh

`MissionWarehousePreparation` chỉ trả lời một kho đã hoàn tất toàn bộ phần việc
hay chưa. Nó không cho người vận hành:

- tiếp nhận từng vật tư;
- báo một SKU thiếu/sai để ADMIN xem lại;
- theo dõi tiến độ nhiều SKU trong cùng kho;
- chứng minh SKU nào đã thực sự xuất.

Thiết kế từ PR #13 có `MissionWarehouseRequest`, nhưng thao tác ADMIN review đọc
status rồi update theo `id`. Nếu kho hoàn tất xuất giữa hai bước, update cũ có thể
đưa `PREPARED` về `PENDING`, tạo khả năng xuất lặp.

Lực lượng hiện trường cũng đã được chốt là actor chỉ đọc phương án và gửi cập nhật
đã xác nhận. Ứng dụng không phân công đội/cá nhân và không yêu cầu lực lượng này
xác nhận/từ chối/hoàn tất workflow.

## Quyết định

1. Giữ `MissionWarehousePreparation` làm summary tương thích theo kho.
2. Phương án mới khi ADMIN phát hành được materialize thành
   `MissionWarehouseRequest`, unique theo `missionId + warehouseId + sku`.
3. Mỗi request có ba trạng thái: `PENDING`, `ACCEPTED`, `PREPARED`.
4. Kho được gán mới có thể tiếp nhận, báo chênh lệch và xuất request của mình.
5. Prepare dùng `preparationClaimToken`:
   - conditional claim từ `ACCEPTED`;
   - ledger bulk export;
   - finalize `PREPARED`;
   - cập nhật summary kho và mission;
   tất cả trong một transaction.
6. ADMIN review chỉ được giảm số lượng chưa xuất. Conditional update bắt buộc
   đồng thời khớp status chưa `PREPARED`, `preparationClaimToken = null` và
   `updatedAt` đã đọc. Stale review thất bại, không reset trạng thái.
7. Mission chỉ chuyển `READY` sau khi không còn request nào chưa `PREPARED`.
8. Huỷ mission bị chặn ngay khi có bất kỳ request `PREPARED`, kể cả summary kho
   chưa hoàn tất.
9. Mission legacy không có request tiếp tục dùng prepare theo kho; mission mới có
   request từ chối endpoint legacy để tránh double-export.

## Phương án đã cân nhắc

### Chỉ mở rộng JSON trong `MissionWarehousePreparation`

- Ưu điểm: không thêm bảng.
- Loại bỏ: không có unique/index/CAS theo SKU; audit và truy vấn tiến độ khó.

### Dùng nguyên implementation PR #13

- Ưu điểm: có nhiều UI và endpoint sẵn.
- Loại bỏ: review update theo `id` sau stale read có race với prepare; PR còn kéo
  theo auth/audio/location changes không thuộc quyết định này.

### Bỏ summary kho, chỉ giữ request

- Ưu điểm: model gọn hơn về lâu dài.
- Hoãn: dữ liệu và code local đã dùng summary kho cho mission đa kho; xóa ngay cần
  migration/backfill lớn và làm tăng rủi ro bàn giao.

## Hệ quả

- Web và APK WAREHOUSE có cùng workflow theo SKU.
- ADMIN thấy ghi chú chênh lệch và duyệt lại trước khi kho xuất.
- Retry/nhấn hai lần không tạo ledger export thứ hai.
- Database phải áp dụng
  `apps/backend/prisma/sql/20260729_mission_warehouse_requests.sql` trước khi
  deploy code mới.
- Acceptance vẫn phải chạy trên database clone và thiết bị thật; automated tests
  chỉ chứng minh invariant ở source.

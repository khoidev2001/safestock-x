# ADR-002: Tách kho nội xã khỏi điểm liên hệ UBND xã lân cận

## Trạng thái

Accepted

## Ngày

2026-07-28

## Bối cảnh

Ứng phó nhanh cần:

- đặt kho trung tâm Đồng Xuân tại UBND xã;
- đặt kho thôn tại Nhà văn hóa/nhà sinh hoạt cộng đồng đúng thôn;
- khi nguồn nội xã vẫn thiếu, hiển thị UBND xã lân cận và số điện thoại để con người
  tự liên hệ.

Hệ thống Đồng Xuân không có quyền đọc tồn kho của xã khác. Vì vậy, nếu lưu UBND lân
cận như một kho vận hành hoặc gắn số lượng giả, AI có thể cộng nhầm vào fulfillment
và tạo một cam kết không có bằng chứng.

Google Maps chỉ xác minh được 5/17 vị trí Nhà văn hóa thôn. Mười hai điểm còn lại có
kết quả thiếu, mơ hồ hoặc trùng tên sai khu vực.

## Quyết định

1. Kho trung tâm seed tại `UBND Xã Đồng Xuân`, tọa độ
   `13.3782428, 109.1042590`.
2. Chỉ năm kho thôn Kỳ Đu, Phước Huệ, Tân Bình, Phú Sơn và Triêm Đức được seed tọa
   độ. Mười hai kho còn lại giữ `lat/lng = null`; ADMIN ghim thủ công sau khi xác
   minh thực địa.
3. `Hamlet` (điểm cứu hộ/tập kết) và `Warehouse` (điểm lấy vật tư) vẫn là hai entity
   riêng. Không tự sao chép tọa độ Nhà văn hóa sang điểm cứu hộ của thôn.
4. Sáu UBND lân cận là `PublicCommuneContact`/external reference metadata. Contract
   bắt buộc có `availability = UNKNOWN`, điểm tham chiếu đã xác minh và số điện thoại
   công khai nếu đã có.
5. External reference không trở thành `Organization`, `Warehouse` vận hành, batch,
   fulfillment hoặc giao dịch ngoài xã. `NeighborWarehouse.summary` tiếp tục rỗng.
6. Tọa độ đã xác minh nằm trong registry code dùng chung cho seed và API. Số công
   khai đã được chủ dự án xác minh có fallback trong code; biến môi trường chỉ dùng
   để ghi đè cấu hình.

## Phương án đã cân nhắc

### Suy tọa độ từ tâm thôn hoặc kết quả gần giống

- Ưu điểm: đủ marker ngay.
- Loại bỏ: tạo khoảng cách/ETA sai và có thể điều phối tới địa điểm khác xã.

### Tạo kho/tồn mẫu cho xã lân cận

- Ưu điểm: UI có thể tính tỷ lệ đáp ứng liên xã.
- Loại bỏ: dữ liệu không thuộc tenant Đồng Xuân và chưa được xã kia xác nhận.

### Thêm cột tọa độ vào `NeighborWarehouse` ngay

- Ưu điểm: truy vấn DB trực tiếp cho bản đồ.
- Hoãn: model này đang mang semantics tồn kho legacy. V1 dùng contract external
  reference tách biệt; migration chỉ thực hiện khi API gợi ý liên xã chính thức được
  thiết kế, để không biến metadata thành nguồn cấp phát.

## Hệ quả

- Seed môi trường mới có đúng vị trí kho trung tâm và 5 kho thôn đã xác minh.
- UI ADMIN liệt kê 12 kho thôn chờ ghim và không gọi chúng là “gần nhất”.
- Trang `/contacts` hiển thị UBND, link Maps, điện thoại và nhãn
  “Chưa xác minh tồn kho” cho xã lân cận.
- AI/mission chỉ được dùng external reference sau khi toàn bộ nguồn nội xã đủ điều
  kiện vẫn thiếu, và không được cộng điểm đó vào fulfillment.
- Database đang chạy không tự thay đổi; cập nhật dữ liệu hiện hữu phải qua UI ADMIN
  hoặc script/migration một lần được review, không reseed production.

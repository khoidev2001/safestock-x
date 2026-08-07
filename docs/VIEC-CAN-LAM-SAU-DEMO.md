# Việc cần làm sau buổi chạy thử — 2026-08-06

Ghi từ nhận xét trực tiếp khi xem demo. Đánh dấu `[x]` khi xong và đã kiểm chứng.

## Nhóm A — sửa nhanh, chạm ít mã

- [x] **A1. Vị trí thông báo đẩy**: chuyển từ góc phải TRÊN xuống góc phải **DƯỚI**.
- [x] **A2. Chiều cao khối thông báo**: kéo dài xuống, đang ngắn quá.
- [x] **A3. Badge trên tab**: đổi thành **hình tròn** (đang không tròn).
- [x] **A4. Navbar mobile**: đổi chữ "Cảnh báo" thành **"Thông báo"** — kiểm ra
      nhãn ĐÃ đúng sẵn trong `apps/mobile/App.tsx`, không phải sửa gì.
- [x] **A5. Chiều cao hộp nhiệm vụ**: buộc theo chiều cao cửa sổ thay vì 380px cứng.

## Nhóm B — sửa giao diện, cần đọc lại bố cục

- [x] **B1. Kho nào đã chuẩn bị**: đang chỉ hiện `1/5`, không nói kho nào. Phải hiện
      từng kho: **xanh lá = xong**, **cam = chưa xong**.
- [x] **B2. Tồn kho toàn xã — đổi cách liệt kê**: hiện đang gom theo VẬT TƯ. Phải
      gom **theo THÔN**: mỗi thôn một khối, bên trong liệt kê thôn đó có gì.
- [x] **B3. Tồn kho toàn xã — sửa giao diện** (ngoài việc đổi cách gom ở B2).
- [x] **B4. Navbar mobile**: thêm màu sắc và ảnh cho các biểu tượng.
- [x] **B5. Trang Tổng quan — sắp lại thứ tự**, quan trọng lên đầu:
      1. Nhiệm vụ (theo độ ưu tiên)
      2. Sự cố
      3. Cảnh báo
      4. Kiểm kê
      5. Dự báo
      6. Kho nào mượn / trả kho nào

      CHƯA CÓ KHỐI DỰ BÁO trên trang này — dự báo mưa hiện chỉ nằm ở tab Theo dõi.
      Đưa sang cần một khối tóm tắt mới, chưa làm.

## Nhóm C — có phần nghiệp vụ

- [x] **C1. Ghi tay mượn trả — sửa form**:
      - Xã bên kia: đổi ô gõ tay thành **dropdown** các xã lân cận.
      - Vật tư: nhập **TÊN vật tư**, không phải mã lô.
      - Kiểm lại toàn bộ luồng sau khi sửa.
- [x] **C2. Tab Mượn trả — nút gửi yêu cầu mượn**: một nút mở form gồm tên vật phẩm,
      số lượng, **dropdown xã lân cận**, ghi chú. Bấm gửi → xã được chọn nhận
      **thông báo đẩy kiểu Zalo** có sẵn hai nút **Từ chối** / **Chấp nhận**.
      Từ đó trở đi dùng luồng đã có.
- [x] **C3. Đội hiện trường xác nhận lấy hàng, thiếu gì ghi lại** — mới làm ở màn
      hình web (tab Nhiệm vụ), **chưa có ở app đội hiện trường**.

## Nhóm D — đụng cơ sở dữ liệu

- [ ] **D1. Đơn vị nước**: đang ghi trần là "chai". Phải thêm **loại chai** (5 lít,
      10 lít…) và **quy đổi** — 12 chai = 1 lốc. Việc này sửa cả lược đồ dữ liệu,
      không chỉ giao diện.

---

## Thứ tự đề nghị

Nhóm A trước (nhanh, thấy ngay), rồi B, rồi C, cuối cùng D.

D1 để sau cùng vì nó đụng lược đồ dữ liệu: đổi đơn vị đo là đổi cách mọi con số
tồn kho được hiểu, nên phải làm lúc không còn việc gì khác chen ngang, và phải
tính đường chuyển dữ liệu cũ sang.

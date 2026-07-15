# Q&A — Phase A2 (phân quyền + kiểm soát)

> RBAC 3 role, phân quyền hạt mịn, nhật ký hậu kiểm 5W. Đây là mảng giám khảo quản lý nhà nước hỏi sâu (chống gian lận, an toàn dữ liệu công).

---

### H: Chống gian lận/thất thoát vật tư thế nào? Có ai duyệt khi xuất kho lớn không?
**Đ:** Kho cấp xã **thường chỉ 1 người phụ trách** — bắt duyệt 2 bước là bất khả thi (không có "người thứ 2"). Thay vào đó chúng em dùng **hậu kiểm** (kiểm soát sau), gồm 3 lớp:
1. **Phân quyền chặt** — chỉ người có quyền mới làm được thao tác nhạy cảm.
2. **Nhật ký 5W bắt buộc lý do** — mỗi thao tác ghi ai/gì/trên gì/khi nào/**vì sao**, không xóa được.
3. **ADMIN (cấp trên) tra soát** — xem lại toàn bộ nhật ký, phát hiện bất thường.

Đây phù hợp quy mô xã và **không cản cứu hộ khẩn cấp** (khác duyệt-trước làm chậm lúc cần nhanh). Duyệt 2 bước là hướng phát triển cho kho tỉnh nhiều tầng.

### H: Có mấy loại người dùng, ai làm được gì?
**Đ:** 3 vai trò:
- **WAREHOUSE** (phụ trách kho): toàn quyền vận hành — nhập/xuất, kiểm kê, sửa tay, cho mượn, duyệt phương án.
- **RESCUE** (đội cứu hộ): xem phương án, mượn-hoàn, yêu cầu vật tư. Không đụng quản trị kho.
- **ADMIN** (quản trị): quản lý người dùng, xem toàn bộ nhật ký, hậu kiểm.

### H: Phân quyền làm cứng trong code hay linh hoạt?
**Đ:** Dùng **phân quyền hạt mịn** (15 quyền như `inventory:export`, `inventory:adjust`, `audit:view`...) — hệ thống kiểm QUYỀN chứ không kiểm vai trò trực tiếp. Muốn đổi "ai làm được gì" chỉ sửa bảng ánh xạ vai trò→quyền, không sửa code từng chỗ. Đây là chuẩn công nghiệp (RBAC), dễ mở rộng. Bản nâng cao (chỉnh quyền động qua giao diện) là hướng phát triển.

### H: Làm sao chứng minh phân quyền thực sự chặn, không phải chỉ ẩn nút?
**Đ:** Phân quyền kiểm **ở backend**, không phải chỉ ẩn nút ở giao diện (ẩn nút không phải kiểm soát quyền). Đã kiểm thử đầu-cuối:
- WAREHOUSE gọi xuất kho → 201 (cho phép)
- RESCUE gọi xuất kho → **403 (từ chối)**
- ADMIN xem nhật ký → 200
- WAREHOUSE xem nhật ký → **403 (từ chối)**

Kèm 6 kiểm thử tự động cho ma trận quyền.

### H: Ai sửa được số lượng kho bằng tay? Có nguy cơ sửa khống không?
**Đ:** Chỉ WAREHOUSE/ADMIN, và **bắt buộc nhập lý do** — thiếu lý do hệ thống từ chối. Mọi lần sửa ghi nhật ký số trước/sau/người/lý do. Thao tác ghi đè lớn thêm bước xác nhận kép (chống bấm nhầm). Kiểm kê định kỳ là nguồn sự thật cao nhất để đối chiếu. Sửa khống sẽ để lại dấu vết truy được.

### H: Dữ liệu là dữ liệu công, bảo vệ thế nào?
**Đ:** Mỗi xã chạy trên **máy chủ độc lập của mình**, dữ liệu không tự động ra ngoài. Khi dùng AI local (Ollama), dữ liệu không rời cơ quan. Sao lưu định kỳ lên đám mây (khi có internet, giữ 3 bản gần nhất) để chống mất máy chủ. Mọi truy cập qua xác thực JWT + phân quyền.

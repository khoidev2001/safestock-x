# Q&A — Phase A (nền tảng + auth + inventory)

> Backend NestJS + Prisma + PostgreSQL + Redis. Auth JWT, quản lý kho, giao dịch nhập/xuất/chuyển.

---

### H: Vì sao chọn NestJS + Prisma mà không phải công nghệ khác?
**Đ:** Cùng hệ TypeScript với web (Next.js) và mobile (React Native) → **chia sẻ được type nghiệp vụ** (`@safestock/shared-types`) giữa 3 app, tránh lệch dữ liệu. NestJS có sẵn kiến trúc module/service/controller rõ ràng, WebSocket, hàng đợi — hợp hệ event-driven. Prisma cho type-safe query + migration an toàn.

### H: Bảo mật mật khẩu thế nào?
**Đ:** Hash bằng **bcrypt** (không mã hóa ngược được), không bao giờ lưu plain text, không ghi vào log. Token dùng JWT: access token sống 15 phút, refresh token 7 ngày. Secret đọc từ biến môi trường, không hard-code trong mã nguồn.

### H: Làm sao chống xuất kho quá số lượng tồn?
**Đ:** Mọi giao dịch chạy trong **database transaction** với kiểm tra điều kiện: nếu số xuất > tồn hiện tại → từ chối, rollback toàn bộ. Đã kiểm thử: xuất 9999 khi kho có 86 → hệ thống chặn "Không đủ tồn". Đây là ràng buộc ở tầng database, không phải chỉ ở giao diện.

### H: Nếu 2 người cùng xuất 1 lô cùng lúc thì có bị âm kho không?
**Đ:** Không. Chúng em dùng **cập nhật nguyên tử có điều kiện** (`quantity >= x` ngay trong câu lệnh database) — database tự tuần tự hóa 2 yêu cầu, request nào chạy sau mà không đủ tồn sẽ bị từ chối. (Chi tiết triển khai đầy đủ ở lát xuất-lô Bp0.)

### H: Có ghi lại được ai làm gì với kho không?
**Đ:** Có — **nhật ký kiểm toán (audit log) bất biến**. Mỗi giao dịch nhạy cảm ghi: ai thực hiện, thao tác gì, trên vật tư nào, lúc nào, số lượng trước/sau, lý do. Ví dụ xuất 10 áo phao → log ghi `{before: 96, after: 86, quantity: 10}`. Không sửa/xóa được. Phục vụ tra soát chống thất thoát.

### H: Dữ liệu tổ chức thế nào?
**Đ:** Phân cấp thực tế của kho: Kho → Khu vực → Kệ → Danh mục vật tư → Lô. Mỗi lô có hạn dùng, vị trí, tình trạng. Quét QR ra SKU → tra được lô + vị trí + trạng thái ngay. Thao tác xuất 1 vật tư qua QR tối đa 3 bước.

### H: Kiểm thử thế nào, hay chỉ chạy tay?
**Đ:** Có **kiểm thử tự động** (Jest) cho logic nghiệp vụ quan trọng + kiểm thử đầu-cuối qua API thật. Ví dụ đã verify: login → lấy token → gọi API có bảo vệ → xuất kho → số lượng giảm đúng → audit ghi đúng. Không phải "chạy được là xong".

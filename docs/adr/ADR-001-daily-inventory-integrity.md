# ADR-001: Toàn vẹn nghiệp vụ kho hằng ngày

- Trạng thái: Accepted
- Ngày: 2026-07-27
- Phạm vi: inventory, loan, receiving, audit, web và mobile

## Bối cảnh

Các API nhập, xuất, điều chuyển, điều chỉnh, kiểm kê và mượn-trả đã tồn tại nhưng
chưa cùng dùng một định nghĩa tồn khả dụng. Retry từ web/mobile có thể gửi lại
mutation, còn giao dịch loan và inventory có thể cùng tác động một lô. Hàng trả
hỏng cũng cần được giữ tách biệt để không trở lại tồn sẵn sàng.

## Quyết định

1. `ItemBatch.quantity` tiếp tục biểu diễn tồn vật lý của lô. Tồn khả dụng để xuất
   hoặc mượn bằng tồn vật lý trừ tổng loan chưa hoàn.
2. Mutation loan lấy table lock phối hợp với inventory và advisory lock theo
   `batchId`. Mutation tồn dùng conditional update/CAS; bên thua race trả `409`.
3. Hàng hoàn tốt trở lại lô nguồn. Hàng hoàn hỏng được tách thành lô con
   `NEEDS_CHECK`; hàng mất làm giảm tồn vật lý bằng CAS và không thể làm tồn âm.
4. Mutation kho và mượn-trả nhận `requestId`. Receipt được ghi trong
   `AuditLog` cùng transaction với mutation; retry cùng actor, operation và
   request ID phát lại response đã commit.
5. Tiếp nhận hàng hỗ trợ vật tư có sẵn hoặc tạo SKU/danh mục mới, chọn kệ, lô,
   hạn dùng và in nhãn QR. QR chỉ chứa SKU/mã lô, không chứa token hay dữ liệu
   cá nhân.
6. Catalog, chuẩn hóa embedding, inventory, loan và audit đều bị giới hạn theo
   organization; tài khoản WAREHOUSE tiếp tục bị giới hạn mutation theo kho được
   gán.
7. Offline mobile chỉ đọc cache. Mọi mutation kho fail-closed khi mất kết nối và
   dùng request ID ổn định trong một lần người dùng thử lại.

## Hệ quả

- Retry và request đồng thời không được phép trừ tồn hai lần hoặc ghi đè snapshot
  mới hơn.
- Readiness chỉ được tính lại sau commit; lỗi tính lại không biến giao dịch đã
  commit thành thất bại giả.
- `MUTATION_RECEIPT` là bản ghi kỹ thuật, tách với audit nghiệp vụ 5W.
- Không cần migration Prisma cho lát cắt này. Nếu sau này một database phục vụ
  nhiều organization và cần giữ audit của user đã xóa, `AuditLog` phải được bổ
  sung `organizationId` bất biến bằng migration riêng.
- Browser acceptance và kiểm thử trên Galaxy S23 Ultra vẫn là release gate, không
  được suy ra chỉ từ unit test hoặc production build.

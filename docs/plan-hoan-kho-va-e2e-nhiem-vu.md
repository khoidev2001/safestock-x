# Kế hoạch: Hoàn kho khi giao thất bại + Test E2E luồng nhiệm vụ

> Bối cảnh: review kỹ luồng thực tế phát hiện 2 thiếu sót sau khi vá 4 gap ở
> [plan-hoan-thien-luong-nhiem-vu-cuu-ho.md](./plan-hoan-thien-luong-nhiem-vu-cuu-ho.md):
> (1) giao PARTIAL/FAILED không hoàn lại tồn kho đã xuất → số liệu sai;
> (2) chưa có test E2E chạy hết luồng liên role qua HTTP + DB thật.

## Phần 1 — Hoàn kho khi giao không trọn (gap nghiệp vụ)

### Vấn đề
- Bước `prepare` (kho) gọi `inventory.bulkExport` → **trừ tồn kho thật** theo `allocations` (batchId + qty) của từng requirement.
- `completeByRescue` hiện chỉ ghi `deliveryOutcome` + đổi `COMPLETED`, **không nhập lại** phần hàng quay về kho.
- Hệ quả: FAILED (mang về 100%) / PARTIAL (mang về một phần) → tồn kho **thiếu ảo vĩnh viễn**.

### Đề xuất xử lý (đã cân nhắc thực tế hiện trường)
| Outcome | Hành động tồn kho | Lý do |
|---|---|---|
| **DELIVERED** (giao đủ) | Không đụng kho | Hàng đã giao hết đúng phương án |
| **FAILED** (không giao được) | **Tự động nhập lại 100%** phần đã xuất về đúng batch cũ | Rõ ràng, không cần đội nhập số ngoài hiện trường |
| **PARTIAL** (giao một phần) | **KHÔNG tự hoàn** — gắn cảnh báo WAREHOUSE "cần đối soát nhập lại phần chưa giao" | Không biết số thật; bắt đội nhập chi tiết từng SKU giữa vùng lũ là bất khả thi → để kho đối soát khi nhận hàng về |

Triết lý: **đúng số liệu + khả thi vận hành**. FAILED an toàn để tự động (toàn bộ hoặc không).
PARTIAL cần con người đối soát — hệ thống nhắc, không đoán số.

### Thay đổi kỹ thuật
1. **`inventory.service.ts`**: thêm `bulkImportInTx(tx, userId, items, note)` (đối xứng `decrementInTx` → dùng `incrementInTx`) + wrapper `bulkImport(userId, items, note)` tự mở transaction. Cho phép mission.service nhập lại nhiều batch atomic.
2. **`mission.service.ts` — `completeByRescue`**: đổi chữ ký nhận thêm `userId` (actor = RESCUE bấm xác nhận). Bọc **update mission + hoàn kho trong CÙNG một `prisma.$transaction`** để tránh double-hoàn khi retry:
   - FAILED → gom `items` từ `requirements.allocations` (tái dùng helper chung với `prepare`), gọi `bulkImportInTx` với note `"Hoàn kho: nhiệm vụ <id> giao thất bại"`.
   - Update status COMPLETED + outcome + note + completedAt **trong cùng tx**.
   - Notification tạo **sau khi commit** (FAILED: "đã hoàn kho tự động"; PARTIAL: "cần đối soát nhập lại"; DELIVERED: như cũ).
3. **`mission.controller.ts`**: `complete` truyền `req.user.userId` xuống service.
4. Refactor helper `collectMissionBatches(requirements)` dùng chung cho `prepare` và `complete` (hiện `prepare` lặp inline ở dòng ~360).

## Phần 2 — Test E2E thật qua HTTP + DB

### Hạ tầng
- devDeps mới: `@nestjs/testing`, `supertest`, `@types/supertest`.
- `apps/backend/test/jest-e2e.config.js`: `testRegex: '\\.e2e-spec\\.ts$'`, cùng `moduleNameMapper` shared-types, `rootDir: '.'`.
- Script `test:e2e` trong `package.json`.
- Bootstrap app trong `beforeAll` giống `main.ts`: `setGlobalPrefix("api")` + `ValidationPipe({ whitelist, transform })`. Dùng **Postgres dev đang chạy** (seed data sẵn có). Đọc/ghi qua PrismaService inject từ app để đo tồn kho.

### `test/mission-workflow.e2e-spec.ts` — các kịch bản
1. **Happy path liên role**: login admin/rescue/warehouse → admin `generate-plan` (truyền `incident` object, KHÔNG cần AI) → `dispatch` (kiểm noti RESCUE) → rescue `confirm` → warehouse `prepare` (**assert tồn kho giảm**) → rescue `complete` DELIVERED (**assert tồn kho giữ nguyên**, status COMPLETED, có completedAt).
2. **Hoàn kho FAILED**: tới READY → `complete` FAILED → **assert tồn kho về đúng mức trước `prepare`** + noti WAREHOUSE báo hoàn kho.
3. **Guard trạng thái cuối**: `complete` lần 2 → 400; rescue `confirm` khi đã PENDING_WAREHOUSE → 400.
4. **RBAC**: rescue gọi `dispatch` → 403; warehouse gọi `complete` → 403.

### Ràng buộc / rủi ro
- E2E phụ thuộc **seed**: warehouse phải `dispatchable` (đủ vật tư thiết yếu eligible). Chọn `incident` quy mô vừa để `fulfillment` đủ gửi. Chạy `pnpm seed` trước khi test.
- Không teardown data nghiệp vụ: test kiểm **delta tồn kho của chính nó** (so trước/sau) nên mission rác không ảnh hưởng. Chấp nhận cho demo/thi.
- `action-plan` (cần AI, có fallback) **không** đưa vào E2E workflow — không thuộc chuỗi bắt buộc.

## Thứ tự thực hiện
1. `bulkImportInTx` + `bulkImport` (inventory) — có unit test riêng.
2. Refactor `collectMissionBatches` + sửa `completeByRescue` (transaction + hoàn kho) + controller truyền userId.
3. Cập nhật `mission-api.ts`/mobile `api.ts` nếu đổi payload (không đổi — vẫn outcome+note).
4. Hạ tầng E2E + viết `mission-workflow.e2e-spec.ts`.
5. Chạy: unit (`jest`) + `test:e2e` + backend build + FE/mobile tsc. Báo cáo số thật.

## Định nghĩa hoàn thành
- FAILED tự hoàn kho đúng, PARTIAL có cảnh báo đối soát, DELIVERED giữ nguyên — tất cả atomic, retry-safe.
- E2E xanh: happy path + hoàn kho + guard + RBAC.
- Không hồi quy: toàn bộ unit test cũ vẫn pass.

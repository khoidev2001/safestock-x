# Kế hoạch P0 — Mission prepare atomic và chống xuất kho trùng

_Lập ngày: 2026-07-23 · Hoàn tất: 2026-07-23_

## Trạng thái hoàn tất

- [x] Atomic prepare, idempotent retry/concurrency và warehouse scope đã triển khai; không có schema/migration.
- [x] Focused Jest: **34/34**; toàn bộ backend Jest: **215/215**.
- [x] PostgreSQL E2E: **8/8** tại `apps/backend/test/mission-prepare-atomic.e2e-spec.ts`.
- [x] Backend build và `git diff --check` pass.
- [x] Fixture E2E `missions/requirements/batches`: **0/0/0 → 0/0/0**; không chạy seed/reset.

## Bối cảnh trước triển khai

`MissionService.prepareByWarehouse()` từng đọc mission và kiểm tra state, gọi `InventoryService.bulkExport()` trong một transaction riêng, rồi cập nhật mission sang `READY` bằng câu lệnh khác. Nếu xuất kho thành công nhưng update mission lỗi, tồn có thể bị trừ trong khi mission còn `PENDING_WAREHOUSE`; retry có thể xuất lần hai. Hai request đồng thời cũng có thể cùng đọc state cũ và cùng trừ kho.

Controller trước đó chỉ truyền `userId`, chưa truyền `req.user.warehouseId`, nên luồng prepare chưa áp dụng scope kho giống các endpoint inventory.

## Kết quả mong muốn

- Trừ toàn bộ lô đã cấp và chuyển mission `PENDING_WAREHOUSE → READY` trong cùng một Prisma transaction.
- Bất kỳ lỗi nào trong transaction đều rollback cả tồn kho, audit transaction và trạng thái mission.
- Double-click/retry/concurrent request không trừ kho hoặc tạo audit xuất kho lần hai.
- User kho chỉ được prepare các batch thuộc scope kho trong JWT; sai scope trả `403` và không thay đổi dữ liệu.
- Recalc readiness và notification chạy sau commit, không giữ database lock lâu và không làm rollback nghiệp vụ đã commit.

## Ngoài phạm vi

- Không sửa P0 transfer, report approve, WebSocket auth hoặc simulator.
- Không đổi schema/migration nếu giải pháp conditional update đủ bảo đảm.
- Không thêm idempotency key công khai vào API trong giai đoạn này.
- Không đưa notification outbox vào cùng phạm vi; chỉ ngăn notification lặp từ retry prepare.

## Quyết định thiết kế

1. Thêm `InventoryService.bulkExportInTx(tx, ...)` đối xứng với `bulkImportInTx()`. Hàm nhận transaction có sẵn, kiểm tra scope, dùng `decrementInTx()` và không tự recalc readiness.
2. Giữ `bulkExport()` hiện tại làm wrapper mở transaction riêng cho các caller khác; tránh phá contract public.
3. `prepareByWarehouse(id, userId, scopeWarehouseId)` mở một `$transaction`, đọc mission + requirements và kiểm tra scope trước khi thay đổi.
4. Dùng `mission.updateMany({ where: { id, status: PENDING_WAREHOUSE }, data: { status: READY } })` làm conditional claim **trước** khi xuất kho. PostgreSQL khóa/re-check điều kiện nên chỉ một request thắng; request sau thấy `READY` và trả kết quả idempotent mà không xuất lại.
5. Nếu mission ở state khác `READY`, giữ lỗi state machine hiện có. `READY` chỉ được coi là idempotent success cho endpoint prepare.
6. Chỉ request thắng transaction mới recalc readiness và tạo notification. Retry idempotent không phát notification lần hai.

## Dependency graph

```text
Transaction-safe inventory helper
  → scope helper dùng được với PrismaService/TransactionClient
  → atomic prepare + conditional claim
  → unit tests
  → Postgres E2E rollback/concurrency/scope
  → regression + review
```

## Task 1 — Tách bulk export dùng transaction có sẵn ✅

**Mô tả:** Thêm helper xuất nhiều batch trong `Prisma.TransactionClient`; wrapper hiện tại tái sử dụng helper và giữ hành vi/API cũ.

**Acceptance criteria:**

- [x] Một batch thiếu tồn làm helper ném lỗi và caller transaction rollback toàn bộ.
- [x] Mỗi batch thành công tạo `inventoryTransaction` + `auditLog` đúng `TransactionSource.BULK`.
- [x] Helper không tự recalc readiness trước commit.

**Verification:**

- [x] Jest tập trung bao phủ bulk export nhiều batch, batch thiếu tồn và danh sách rỗng.
- [x] Backend build pass với `Prisma.TransactionClient`.

**Dependencies:** Không có.

**Files thực hiện:**

- `apps/backend/src/inventory/inventory.service.ts`
- `apps/backend/src/inventory/__tests__/bulk-export.spec.ts` (mới)

**Phạm vi:** Nhỏ–trung bình.

## Task 2 — Đưa scope check vào transaction path ✅

**Mô tả:** Cho `assertBatchInScope()` nhận client tối thiểu có `itemBatch.findUnique`, dùng được với cả `PrismaService` và `Prisma.TransactionClient`.

**Acceptance criteria:**

- [x] Batch ngoài `scopeWarehouseId` trả `403` trước khi trừ tồn.
- [x] `scopeWarehouseId=null` giữ quyền toàn xã như hiện tại.
- [x] Các caller inventory cũ không đổi hành vi.

**Verification:**

- [x] Unit test scope hiện có pass.
- [x] Contract helper dùng được với transaction client; focused suite pass.

**Dependencies:** Task 1.

**Files thực hiện:**

- `apps/backend/src/inventory/warehouse-scope.ts`
- `apps/backend/src/inventory/__tests__/warehouse-scope.spec.ts`

**Phạm vi:** Nhỏ.

## Task 3 — Refactor prepare thành một transaction idempotent ✅

**Mô tả:** Truyền scope từ controller; trong service, claim state có điều kiện, xuất kho bằng `bulkExportInTx()` và trả mission `READY` trong cùng transaction.

**Acceptance criteria:**

- [x] Rollback không để kho đã trừ khi mission còn `PENDING_WAREHOUSE`.
- [x] Hai request đồng thời chỉ một request tạo giao dịch xuất; cả hai nhận mission `READY` theo contract idempotent.
- [x] Retry sau thành công không trừ thêm tồn, không tạo audit/notification mới.

**Verification:**

- [x] Unit test service bao phủ state không hợp lệ, `READY` idempotent và hậu xử lý chỉ chạy ở request thắng.
- [x] Controller test xác nhận truyền `req.user.warehouseId`.

**Dependencies:** Task 1–2.

**Files thực hiện:**

- `apps/backend/src/mission/mission.controller.ts`
- `apps/backend/src/mission/mission.service.ts`
- `apps/backend/src/mission/__tests__/mission-prepare-atomic.spec.ts` (mới)

**Phạm vi:** Trung bình.

## Checkpoint — Atomic path ✅

- [x] Focused Jest **34/34**.
- [x] Backend build pass.
- [x] Diff xác nhận stock mutation và state claim dùng cùng một `tx`.

## Task 4 — Postgres E2E cho rollback, concurrency và IDOR ✅

**Mô tả:** Thêm E2E thật để chứng minh transaction semantics mà mock không thể bảo đảm.

**Acceptance criteria:**

- [x] **Rollback:** batch cuối thiếu tồn làm prepare fail; batch trước, audit và mission giữ nguyên.
- [x] **Concurrency/double-click:** hai request prepare và retry chỉ giảm tồn, ghi audit và notify một lần.
- [x] **Scope:** token kho A prepare mission/batch ngoài scope trả `403`; tồn và state không đổi.

**Verification:**

- [x] PostgreSQL E2E `mission-prepare-atomic.e2e-spec.ts`: **8/8**.
- [x] Fixture tự tạo và cleanup: `missions/requirements/batches` **0/0/0 → 0/0/0**; không seed/reset.

**Dependencies:** Task 3.

**Files thực hiện:**

- `apps/backend/test/mission-prepare-atomic.e2e-spec.ts`

**Phạm vi:** Trung bình.

## Task 5 — Regression và review an toàn ✅

**Mô tả:** Chạy quality gates và tự review các failure mode sau khi code xong.

**Acceptance criteria:**

- [x] Mission happy path, hoàn kho FAILED/PARTIAL và state machine không regression.
- [x] Inventory không âm khi request concurrent; audit before/after phản ánh giá trị đã commit.
- [x] Notification/recalc lỗi sau commit không làm client hiểu nhầm stock transaction đã rollback.

**Verification:**

- [x] Focused mission/inventory Jest: **34/34**.
- [x] Toàn bộ backend Jest: **215/215**; backend build và `git diff --check` pass.
- [x] Review idempotency, duplicate request, rollback, scope/IDOR, notification partial failure và readiness degrade hoàn tất.

**Dependencies:** Task 4.

**Files thực hiện:** Các file ở Task 1–4; cập nhật plan/checklist sau khi đủ bằng chứng.

**Phạm vi:** Nhỏ.

## Test matrix tối thiểu

| Ca | State ban đầu | Kỳ vọng |
|---|---|---|
| Prepare bình thường | `PENDING_WAREHOUSE` | `READY`, mỗi batch trừ đúng allocated, audit đầy đủ |
| Batch thứ hai thiếu tồn | `PENDING_WAREHOUSE` | Lỗi; batch thứ nhất rollback, mission giữ nguyên |
| Hai request song song | `PENDING_WAREHOUSE` | Chỉ một lần xuất; kết quả cuối `READY` |
| Retry sau success | `READY` | Trả idempotent; không xuất/audit/notify lại |
| Sai scope kho | `PENDING_WAREHOUSE` | `403`; không thay đổi dữ liệu |
| Không có allocation | `PENDING_WAREHOUSE` | Chuyển `READY` không tạo giao dịch rác, nếu workflow cho phép |
| Recalc readiness lỗi | Transaction đã commit | API/response theo policy rõ ràng; stock/state không bị đảo |

## Rủi ro và giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Chỉ gộp transaction nhưng guard vẫn ở ngoài, nên vẫn double-export | Cao | Conditional `updateMany` claim trong transaction trước export |
| Scope check ngoài transaction tạo TOCTOU | Cao | Chạy scope check bằng cùng `tx` |
| Retry tạo notification trùng | Trung bình | Chỉ notify khi conditional claim thành công |
| Notification lỗi sau commit làm client retry | Trung bình | Xử lý hậu commit theo best-effort/log rõ; retry idempotent |
| E2E làm bẩn seed | Trung bình | Fixture riêng + cleanup/restore trong `finally`, không reseed |
| Transaction giữ lock lâu do readiness/notification | Trung bình | Đưa recalc và notification ra sau commit |

## Rollback triển khai

- Revert riêng refactor prepare và helper `bulkExportInTx`; không có migration/schema để rollback.
- Nếu E2E concurrency không ổn định, dừng release và giữ P0 chưa hoàn tất; không hạ tiêu chí test hoặc bỏ conditional claim.

## Definition of Done ✅

- [x] Atomic rollback, concurrency, retry và scope có test PostgreSQL thật.
- [x] `prepareByWarehouse()` dùng `bulkExportInTx()` trong transaction do mission sở hữu.
- [x] Không âm tồn, không double-export, không để mission `PENDING_WAREHOUSE` sau transaction xuất đã commit.
- [x] Backend test/build sạch; review security/degrade/idempotency không còn blocker.
- [x] Checklist P0-4 được tick sau khi có đủ bằng chứng trên.

## Câu hỏi chưa giải quyết

Không có; plan chọn semantics retry idempotent trả mission `READY`.

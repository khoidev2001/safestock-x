# Kế hoạch P0-3 - Transfer tách lô, atomic và đúng scope

**Trạng thái:** Hoàn tất
**Ngày:** 2026-07-23 · **Hoàn tất:** 2026-07-24
**Nhánh:** `feat/operational-readiness-seed-map`

## Bằng chứng hoàn tất

- Focused unit `transfer-atomic.spec.ts`: **14/14**; focused PostgreSQL E2E `inventory-transfer-atomic.e2e-spec.ts`: **13/13** sau chỉnh sửa bảo mật cuối.
- Toàn bộ backend Jest: **229/229**; backend build và `git diff --check` pass.
- Không đổi route, DTO hoặc Prisma schema; không chạy seed/reset.
- Review scope/IDOR, race/CAS, rollback, audit lineage và readiness hậu commit không còn blocker trong phạm vi P0-3.

## Contract mở đầu

### Kết quả cần đạt

- `POST /api/inventory/transfer` chuyển đúng `quantity`, không còn ghi số lượng một kiểu nhưng di chuyển cả lô.
- Partial transfer giữ lô nguồn với số lượng còn lại và tạo một lô đích mới.
- Full transfer giữ nguyên batch ID và chỉ đổi vị trí.
- Nguồn, đích, ledger và audit cùng một Prisma transaction; request concurrent không làm âm tồn, double-ledger hoặc lost update.
- Cả batch nguồn và shelf đích phải nằm trong warehouse scope lấy từ JWT.

### Ràng buộc

- Giữ route, DTO, permission và response tối thiểu `{ batch, transaction }` hiện tại.
- Không đổi Prisma schema, không migration, không seed/reset dữ liệu.
- `scopeWarehouseId=null` vẫn bị giới hạn theo organization và xã của actor; user có scope chỉ được chuyển khi cả nguồn và đích thuộc đúng kho đó.
- Readiness chỉ chạy sau commit, dedupe kho nguồn/đích và degrade best-effort.
- Chỉ dùng mô hình hành chính tỉnh + xã; không đưa mô hình cũ vào code/test/docs.

### Ngoài phạm vi

- UI điều chuyển kho.
- Atomic borrow/return chạy đồng thời với transfer; batch đã có loan mở sẽ bị từ chối trong P0-3.
- Report approve, WebSocket auth, simulator isolation, schema lineage hoặc idempotency key mới.
- Bắt buộc `note`; field này tiếp tục optional để không phá contract.

### Tiêu chí nghiệm thu quan sát được

- Partial `10 -> 4`: source còn `6` ở shelf cũ; đúng một child `4` ở shelf đích; tổng vẫn `10`.
- Full `10 -> 10`: batch cũ giữ ID, chuyển shelf, không tạo child.
- Vượt tồn/cùng shelf/stale CAS không tạo batch, transaction hoặc audit rác.
- Source hoặc destination ngoài scope trả `403`, dữ liệu không đổi.
- Batch có loan chưa hoàn trả trả `409`, không split/move hoặc ghi ledger.
- Hai transfer concurrent chỉ ghi các mutation thực sự hợp lệ; không âm tồn, double-ledger hoặc writer sau ghi đè writer trước.
- Audit có actor, source/destination batch+shelf+warehouse, quantity, before/after, note và transaction source.
- PostgreSQL E2E tự tạo/cleanup fixture `0 -> 0`; không seed/reset.

## Nguyên nhân hiện tại

- Controller không truyền `req.user.warehouseId` vào `InventoryService.transfer()`.
- Service chỉ kiểm shelf đích tồn tại, không authorize source/destination.
- `quantity` chỉ được ghi vào ledger/audit; code luôn cập nhật `shelfId` của toàn batch.
- Update batch không có điều kiện theo shelf/số lượng nên request concurrent có thể lost update và ghi ledger vượt tồn.
- Transfer không recalc readiness và audit thiếu vị trí nguồn cùng before/after.

## Thiết kế

```text
JWT warehouse scope
  -> InventoryController.transfer(..., scopeWarehouseId)
  -> InventoryService.transfer()
  -> Prisma transaction
       1. đọc actor organization, source batch + loan + warehouse và destination shelf + warehouse
       2. kiểm warehouse/organization/xã scope, loan mở, quantity và same-shelf
       3a. full: CAS move theo id + sourceShelfId + exact quantity
       3b. partial: CAS decrement theo id + sourceShelfId + quantity >= requested
                    tạo child batch collision-safe ở shelf đích
       4. tạo InventoryTransaction cho batch thực sự được chuyển
       5. tạo AuditLog chứa lineage và before/after
  -> commit
  -> recalc readiness các warehouse liên quan, best-effort
```

### Partial transfer

- Tách logic transaction vào `inventory-transfer.ts` để không tiếp tục phình `inventory.service.ts` đã vượt 200 dòng.
- Child clone các scalar nghiệp vụ: `itemId`, `status`, `condition`, `circulation`, `expiryDate`, `inspectedAt`.
- Không clone transaction, count hoặc loan history.
- Child code: `${sourceBatchCode}-T-${randomUUID()}`; unique `(itemId, batchCode)` không cần schema mới.
- `InventoryTransaction.batchId` trỏ child/moved batch; audit `entityId` giữ source batch và metadata chứa cả hai ID.

### Full transfer

- CAS `updateMany` yêu cầu `id`, `sourceShelfId` và `quantity` vẫn đúng snapshot.
- Request thua race trả `409 Conflict` yêu cầu tải lại; không tạo ledger/audit.

### Scope và lỗi

- Query source và destination nằm trong cùng transaction.
- Dùng `assertWarehouseInScope()` cho cả hai owner warehouse.
- Actor chỉ được transfer giữa các warehouse cùng `organizationId` và `communeId`; scope null không phải bypass toàn database.
- `404`: actor toàn xã gọi source batch hoặc destination shelf không tồn tại.
- `403`: source/destination ngoài scope; scoped user gọi ID không tồn tại cũng trả `403` để không làm lộ resource.
- `400`: quantity không nguyên/dương, vượt snapshot hoặc same-shelf.
- `409`: CAS thất bại vì batch đã đổi shelf/quantity sau snapshot, hoặc batch còn loan chưa hoàn trả.

### Audit và readiness

- Audit metadata: `sourceBatchId`, `destinationBatchId`, `fromShelfId`, `toShelfId`, `fromWarehouseId`, `toWarehouseId`, `quantity`, `before`, `after`, `source`, `note`, `split`.
- `before/after` mô tả trạng thái vật tư ở cả vị trí nguồn và đích, không suy từ snapshot trước lock sau khi mutation đã xảy ra.
- Sau commit, recalc danh sách warehouse ID đã dedupe. Lỗi readiness chỉ log warning, không đảo transfer đã commit.

## File dự kiến

### Tạo mới

- `apps/backend/src/inventory/inventory-transfer.ts`
- `apps/backend/src/inventory/__tests__/transfer-atomic.spec.ts`
- `apps/backend/test/inventory-transfer-atomic.e2e-spec.ts`

### Chỉnh sửa

- `apps/backend/src/inventory/inventory.controller.ts`
- `apps/backend/src/inventory/inventory.service.ts`
- `apps/backend/src/inventory/warehouse-scope.ts` nếu cần helper shelf scope dùng lại.
- `docs/checklist-cong-viec-con-lai.md` sau khi đủ bằng chứng.
- File kế hoạch này để sync trạng thái và evidence.

### Không đổi

- `apps/backend/src/inventory/dto.ts`
- `apps/backend/prisma/schema.prisma`
- Public route/permission và các module loan/report/simulator.

## Các bước triển khai

### Task 1 - Khóa contract bằng test

- [x] Test controller truyền `warehouseId` từ JWT.
- [x] Unit test partial/full, over-quantity, same-shelf, source/destination IDOR, stale CAS, audit và readiness hậu commit.
- [x] E2E fixture riêng, cleanup transactionally, không dùng batch seed.

### Task 2 - Implement helper transaction

- [x] Đọc source/destination và kiểm scope trong cùng `tx`.
- [x] Enforce organization/xã của actor ngay cả khi warehouse scope null.
- [x] Từ chối batch có loan chưa hoàn trả.
- [x] Thêm validation service-layer cho quantity và same-shelf.
- [x] Implement CAS full move và partial decrement + child create.
- [x] Ghi một ledger và một audit cho mỗi transfer thành công.
- [x] Map CAS failure thành lỗi scope/quantity/conflict đúng nguyên nhân.

### Task 3 - Tích hợp controller/service/readiness

- [x] Controller forward `req.user.warehouseId`.
- [x] `InventoryService.transfer()` giữ public wrapper và response contract.
- [x] Recalc dedupe kho nguồn/đích sau commit; lỗi không làm response fail.

### Task 4 - PostgreSQL E2E và regression

- [x] Partial/full transfer trên PostgreSQL thật.
- [x] Source/destination IDOR trả `403` và zero mutation.
- [x] Concurrent partial `6/10`: một success, một failure; tổng quantity giữ nguyên.
- [x] Concurrent full đến hai shelf: một winner, không double-ledger.
- [x] FK/ledger failure rollback source, child và audit.
- [x] Fixture count trước/sau cleanup `0 -> 0`.

## Ma trận test

| Case | Kỳ vọng |
|---|---|
| Partial | Source giảm đúng; child đúng scalar/shelf/quantity; tổng bảo toàn |
| Full | Giữ batch ID; chỉ đổi shelf |
| Over quantity | `400`; zero mutation |
| Same shelf | `400`; zero ledger/audit |
| Source ngoài scope | `403`; zero mutation |
| Destination ngoài scope | `403`; zero mutation |
| Organization/xã khác | `403` kể cả scope null; zero mutation |
| Loan mở | `409`; zero mutation |
| Stale CAS | `409`; zero ledger/audit |
| Concurrent partial/full | Không âm tồn, lost update hoặc double-ledger |
| Audit | Đủ actor, lineage, vị trí, quantity, before/after, note/source |
| Readiness | Chỉ sau commit; dedupe; lỗi best-effort |
| Rollback | Lỗi ledger/audit rollback mọi mutation |

## Lệnh kiểm chứng

```powershell
pnpm --filter @safestock/backend test -- --runInBand transfer-atomic.spec.ts
pnpm --filter @safestock/backend test:e2e -- inventory-transfer-atomic.e2e-spec.ts
pnpm --filter @safestock/backend test -- --runInBand
pnpm --filter @safestock/backend build
git diff --check
```

## Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Hai request cùng đọc một snapshot | Conditional mutation theo shelf + quantity; loser không ghi ledger |
| Child `batchCode` trùng | UUID trong code; P2002 làm transaction rollback |
| Scope check bị TOCTOU | Query/check/mutation cùng transaction; CAS khóa source shelf snapshot |
| Readiness một kho stale | Capture warehouse trước mutation, recalc dedupe sau commit |
| Audit sai before/after | Derive từ kết quả mutation và trạng thái transaction, không từ request |
| Loan đang mở | Reject transfer; concurrency borrow-vs-transfer tiếp tục thuộc P0 loan |

Rollback code bằng revert các file của P0-3; không có migration hoặc data transform phải hoàn tác. E2E chỉ xóa fixture có prefix/note riêng.

## Definition of Done ✅

- [x] Tất cả tiêu chí nghiệm thu có unit/E2E evidence.
- [x] Focused test, full backend Jest, PostgreSQL E2E và backend build pass.
- [x] Security review không còn IDOR/race/audit integrity finding trong scope.
- [x] Code review xác nhận không breaking route/DTO/schema và không regression import/export/mission.
- [x] `git diff --check` pass; không seed/reset.
- [x] Checklist chỉ tick sau khi toàn bộ gate trên hoàn tất.

## Câu hỏi chưa giải quyết

- Không có câu hỏi chặn triển khai.
- Residual ngoài scope: request borrow mới chạy concurrent đúng lúc transfer vẫn chưa được bảo đảm cho tới khi P0 loan atomic hoàn tất.
- E2E dùng actor/item/kệ nguồn từ dataset test hiện hành, nhưng tự tạo kho peer/cross-org, batch, loan, ledger và audit rồi cleanup.

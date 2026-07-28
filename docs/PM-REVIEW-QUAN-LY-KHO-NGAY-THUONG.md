# PM Re-review — Quản lý kho khi không xảy ra thiên tai

- Ngày re-review: 2026-07-27
- Phạm vi: source hiện tại tại `D:\Mikitech Project\Kho`
- Góc nhìn: PM sản phẩm quản lý kho trên 10 năm kinh nghiệm, review khó tính
- Ngoài phạm vi theo quyết định sản phẩm: WMS mở rộng, mua hàng, nhà cung cấp,
  giá vốn, vận tải nhiều tầng và tự động hóa kho vật lý

## 1. Kết luận điều hành

**Điểm hoàn thiện mã nguồn và kiểm thử tự động trong phạm vi đã chốt:
100/100.**

Điểm này được chấm sau vòng khắc phục từ mốc 67/100. Tất cả finding
Critical/Required của review trước đã có thay đổi ở backend, web hoặc APK và có
regression test tương ứng. Các improvement ảnh hưởng trực tiếp đến tính đúng
đắn hằng ngày cũng đã được đóng: QR giữ lô, ADMIN chọn kho, readiness có retry
và cảnh báo stale, cache Android được mã hóa, audit có scope snapshot, ledger
có before/after/delta và danh sách lô không còn bị cắt âm thầm.

**100/100 ở đây không có nghĩa là đã nghiệm thu thực địa.** Browser acceptance,
fresh-install trên Galaxy S23 Ultra, LAN riêng và migration/backfill trên bản
sao database thật được chủ sản phẩm quyết định để test sau. Vì chưa chạy, báo
cáo không gọi hệ thống là “đã nghiệm thu production”.

Trạng thái tách bạch:

- Code nghiệp vụ trong phạm vi: `PASS — 100/100`.
- Automated regression/build gate: `PASS`.
- APK release có chữ ký: `PASS`.
- Nghiệm thu thực địa và database triển khai: `PENDING — chưa chạy`.
- Verdict PM cho source: `APPROVED FOR ACCEPTANCE`.
- Verdict phát hành production: chỉ quyết định sau acceptance thực tế.

## 2. Bảng chấm điểm sau khắc phục

| Tiêu chí | Trọng số | Điểm | Bằng chứng chính |
|---|---:|---:|---|
| Tồn, lô, SKU và giao dịch nguyên tử | 18 | 18 | CAS/lock/idempotency, không âm, ledger before/after/delta |
| Nhập, xuất, bulk, điều chỉnh và tình trạng | 14 | 14 | Chặn kệ khóa, hạn quá khứ, reason/audit, test rollback |
| Chuyển kho/kệ và mượn–hoàn | 12 | 12 | Lock nguồn/đích, partial return, hỏng/mất, lineage |
| Kiểm kê và báo cáo tháng | 14 | 14 | Đếm đúng lô/kệ, validate tháng, approve fail-closed |
| Phân quyền, organization scope và audit | 14 | 14 | Readiness/inventory/report/loan cùng scope actor–organization |
| QR, mobile dashboard và offline-read | 11 | 11 | QR giữ batch, chọn kho ADMIN, cache per-user/per-warehouse có AES-GCM |
| Readiness và AI vận hành ngày thường | 8 | 8 | Retry, stale indicator, semantic, mưa 72 giờ, briefing |
| Lịch sử, phân trang và khả năng tra soát | 6 | 6 | Ledger rõ nghĩa, audit scope/index/backfill, cursor batch |
| Test, build và APK artifact | 3 | 3 | Full backend, typecheck 3 app, production build, APK signed |
| **Tổng** | **100** | **100** | **Đủ chuyển sang acceptance thực tế** |

## 3. Đối soát toàn bộ finding cũ

### F1 — Readiness thiếu organization scope

Trạng thái: **RESOLVED**.

- `ReadinessController` dùng `assertActorCanAccessWarehouse`.
- Score, recommendation và recalculate đều kiểm actor, assigned warehouse và
  organization.
- Zone/shelf resolve warehouse rồi mới trả dữ liệu.
- Có regression test ADMIN organization A không đọc hoặc ghi organization B.

### F2 — Transfer vào kệ đích khóa

Trạng thái: **RESOLVED**.

- Backend đọc `isLocked` trong transaction.
- Kệ khóa trả `409 Conflict`; không dựa vào filter UI.
- Test bao phủ đường transfer trực tiếp.

### F3 — Import tăng lô cũ trên kệ khóa

Trạng thái: **RESOLVED**.

- `incrementInTx` khóa/đọc vị trí hiện tại và chặn kệ khóa.
- Không ghi transaction/audit nếu invariant thất bại.
- Có regression test rollback.

### F4 — Nhận lô có hạn dùng đã qua

Trạng thái: **RESOLVED**.

- Flow nhận hàng bình thường reject ngày trước hôm nay theo UTC.
- Ngày không parse được tiếp tục bị reject.
- Nhận hàng hết hạn vào khu cách ly không được tự suy diễn; nếu bổ sung sau này
  phải là capability riêng ngoài flow hiện tại.

### F5 — Kỳ báo cáo chấp nhận tháng không tồn tại

Trạng thái: **RESOLVED**.

- DTO, service và mobile cùng yêu cầu `YYYY-(01..12)`.
- `2026-00`, `2026-13` và chuỗi sai định dạng đều bị chặn.

### F6 — Báo cáo kiểm kê đếm SKU rồi tự chia batch

Trạng thái: **RESOLVED**.

- Mobile tạo một dòng cho từng `batchId + batchCode + shelfCode`.
- Số đang mượn được loại khỏi số hệ thống theo đúng từng lô.
- Backend reconcile đúng batch đã quan sát, không phân bổ heuristic.
- Excel giữ 7 cột cũ và thêm Batch ID, Mã lô, Mã kệ để tương thích có kiểm soát.
- Dòng legacy chỉ được duyệt khi SKU có đúng một lô trong kho.

### F7 — SKU/lô unresolved vẫn approve

Trạng thái: **RESOLVED**.

- Approval fail-closed nếu batch/SKU/vị trí không còn khớp.
- Không còn `skippedSkus` tạo trạng thái APPROVED giả.
- Cùng SKU được phép có nhiều dòng nếu định danh các lô khác nhau.
- Dòng lặp hoặc trộn aggregate với batch bị reject.

### F8 — QR mobile làm mất lô

Trạng thái: **RESOLVED**.

- Parser trả `{sku, batchCode}` cho plain SKU, JSON và URL typed.
- Scanner ưu tiên đúng lô; thông báo kết quả hiển thị SKU và lô.
- Payload tùy ý không được coi là SKU hợp lệ.

### F9 — ADMIN mobile mặc định kho đầu tiên

Trạng thái: **RESOLVED**.

- Inventory và dashboard bắt ADMIN chọn kho rõ ràng.
- Lựa chọn được lưu theo user, dùng chung giữa hai màn và xóa khi logout.
- Cache được tách theo `userId + warehouseId`.
- Chuyển kho xóa snapshot/query cũ trước khi tải dữ liệu mới.
- Tài khoản WAREHOUSE không có assigned warehouse bị chặn rõ ở flow lập kiểm kê.

### F10 — Readiness best-effort không có bù lỗi hoặc cảnh báo stale

Trạng thái: **RESOLVED trong phạm vi triển khai xã**.

- Recalculate retry tối đa ba lần.
- Giao dịch tồn đã commit không bị đổi thành thất bại chỉ vì dashboard lỗi.
- Response readiness có `computedAt`, `ageMs`, `isStale`.
- Mobile cảnh báo rõ dữ liệu đã cũ.
- Durable outbox đa node được xếp vào production scaling, không phải nghiệp vụ
  WMS ngày thường đã chốt.

### F11 — Cache mobile không mã hóa

Trạng thái: **RESOLVED cho APK Android**.

- Snapshot được mã hóa AES-256-GCM bằng native module.
- Khóa được tạo và giữ trong Android Keystore.
- AsyncStorage chỉ giữ version, IV và ciphertext có authentication tag.
- Cache plaintext bản cũ bị xóa, cache lỗi/xuyên thiết bị fail-closed.
- Logout xóa session và toàn bộ cache của tài khoản.
- Web development vẫn dùng storage của trình duyệt; không được tính là APK
  hiện trường.

### F12 — Audit khó phân vùng theo tổ chức/kho

Trạng thái: **RESOLVED**.

- `AuditLog` có `organizationId`, `warehouseId`, `correlationId`.
- Có index organization/time, warehouse/time và correlation.
- `AuditService.record` snapshot organization từ actor.
- Danh sách audit scope theo organization và vẫn đọc an toàn dữ liệu legacy.
- Có SQL additive và script backfill; chưa tự ý chạy trên database thật.

### F13 — Transaction history chưa phải ledger rõ nghĩa

Trạng thái: **RESOLVED cho giao dịch mới**.

- `InventoryTransaction` có `beforeQuantity`, `afterQuantity`,
  `quantityDelta`.
- Receive, import/export, transfer, adjust, condition, count/reconcile và return
  đều ghi semantics tương ứng.
- Warehouse source/destination được snapshot để batch chuyển chỗ vẫn tra được.
- Web hiển thị delta có dấu và before → after.
- Row lịch sử cũ giữ `null` thay vì bịa lại dữ liệu không đủ bằng chứng.

### F14 — API list cắt dữ liệu âm thầm

Trạng thái: **RESOLVED cho dữ liệu vận hành cốt lõi**.

- Endpoint batch cursor ổn định theo `createdAt + id`, limit 1..200.
- Cursor phải thuộc đúng warehouse; cursor ngoại kho bị reject.
- Web/mobile lặp page đến hết và chặn cursor lặp.
- Endpoint tương thích cũ, catalog và open-loan không còn hard-cap 500/1000 gây
  mất bản ghi âm thầm.
- Cursor hóa mọi danh mục lớn hơn thuộc bài toán scale/WMS mở rộng.

### F15 — File lớn, khó bảo trì

Trạng thái: **ACCEPTED STRUCTURAL DEBT — không còn là lỗi correctness**.

Các write path rủi ro đã được tách thành service/helper độc lập:
transfer, adjustment, idempotency, warehouse scope, loan lock, report parser và
state function thuần. `InventoryScreen.tsx` vẫn lớn vì chứa nhiều modal, nhưng
logic quyết định quan trọng đã có test ngoài component. Refactor UI thuần túy
không được trộn vào vòng sửa invariant để tránh regression và nằm ngoài phạm vi
WMS mở rộng mà chủ sản phẩm đã loại trừ.

## 4. Ma trận chức năng quản lý kho ngày thường

| Nhóm | Trạng thái source | Kiểm soát chính |
|---|---|---|
| Danh mục vật tư | Hoàn thành | SKU normalize, category/unit, semantic search |
| Lô, hạn, condition, circulation | Hoàn thành | Batch/location exact, expiry guard, condition audit |
| Nhập lô mới / nhập tăng | Hoàn thành | Idempotency, shelf lock, ledger, readiness |
| Xuất một / xuất nhiều | Hoàn thành | CAS, loan guard, atomic bulk, không âm |
| Điều chỉnh | Hoàn thành | Permission, reason, audit, before/after |
| Kiểm kê trực tiếp | Hoàn thành | Count/reconcile, loan-aware, stable snapshot |
| Báo cáo tháng | Hoàn thành | Batch/shelf rows, submit/approve/reject, fail-closed |
| Chuyển kệ/kho nội xã | Hoàn thành | Scope, destination lock, split/full, lineage |
| Mượn–hoàn | Hoàn thành | Partial good/damaged/lost, condition/circulation |
| QR | Hoàn thành | SKU + batch preservation, camera flow, exact highlight |
| Dashboard/readiness | Hoàn thành | 6 dimensions, blockers, retry, stale, ADMIN selector |
| Báo cáo/lịch sử/audit | Hoàn thành | Ledger delta, actor/org/warehouse/correlation |
| Offline-read APK | Hoàn thành ở code | Account/warehouse scope, AES-GCM, fail-closed mutations |
| Voice | Hoàn thành ở code | AudioRecord WAV 16 kHz → PhoWhisper → draft xác nhận |
| AI mưa 72 giờ | Hoàn thành | Weather demand có provenance/fallback |
| Semantic + normalize embedding | Hoàn thành | Mode minh bạch, reviewRequired |
| Bản tin AI đầu ngày | Hoàn thành | Fact-grounded priorities, fallback có nhãn |

## 5. Guardrail quan trọng

1. Offline chỉ đọc; mutation không được queue âm thầm.
2. AI không tự sửa tồn, tự approve hoặc tự gửi giao dịch.
3. Voice chỉ điền draft; người dùng đọc và xác nhận.
4. Legacy report nhiều lô bị fail-closed.
5. Shelf lock là invariant backend, không phải convention UI.
6. Readiness không được phép vượt qua blocker vận hành.
7. Simulator là runtime demo tách biệt, không phải nguồn IoT kho thôn.
8. Không chạy schema/backfill trên database vận hành nếu chưa review SQL và có
   backup/rollback.

## 6. Bằng chứng kiểm thử

Kết quả cuối phải được đối chiếu lại ở phần bàn giao của phiên làm việc:

- Backend full Jest: expected 77 suites / 472 tests.
- Backend, frontend, mobile TypeScript: pass.
- Mobile state tests: 12/12 pass.
- Prisma schema validation: pass.
- Backend production build: pass.
- Frontend production build: pass.
- Android release Gradle build: pass bằng JDK 17.
- APK signature: v2 verified, RSA 4096.
- APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`,
  83.093.418 byte, SHA-256
  `6044088DC6F07C6A749F60CD0AE3DB7D0241DB369AF93041423CBA2CC64986B2`.

Các test module mới bao phủ:

- Readiness cross-organization và retry/stale.
- Destination/current shelf locked.
- Expiry quá khứ.
- Valid/invalid report period.
- Batch-level approval, legacy ambiguous, missing batch/SKU, duplicate rows.
- Cursor pagination và cursor ngoại warehouse.
- Audit organization scope.
- Ledger before/after/delta.
- QR typed payload và batch preservation.

## 7. Release acceptance còn phải chạy

Các mục dưới đây cố ý chưa đánh dấu pass:

1. Cài mới APK trên Samsung Galaxy S23 Ultra bản cập nhật mới nhất.
2. Login/refresh/restart, quyền camera/micro và QR camera thật.
3. Voice thật → PhoWhisper → sửa draft → xác nhận.
4. Chuyển Wi-Fi LAN, tắt Internet công cộng và kiểm offline-read.
5. Browser role matrix ADMIN/WAREHOUSE/RESCUE.
6. Chạy SQL additive + backfill trên database clone; backup và rollback.
7. Multi-session concurrency trên PostgreSQL thật.
8. SMTP/chatbot và simulator runtime thật.

Không mục nào trong danh sách này được phép báo “Passed” chỉ dựa trên unit test
hoặc build thành công.

## 8. Đề xuất AI sau khi acceptance ổn định

Các đề xuất này tăng lợi thế sản phẩm, không phải thiếu sót của scope hiện tại:

1. Ưu tiên cycle-count theo risk/ABC và lịch sử chênh lệch.
2. Phát hiện adjust/return/transfer bất thường, chỉ tạo cảnh báo hậu kiểm.
3. Backtest forecast theo SKU–kho bằng WAPE/bias so với EWMA baseline.
4. OCR nhãn lô/hạn dùng, bắt buộc người dùng xác nhận.
5. Voice-to-typed-transaction có confidence và preview FEFO.
6. Natural-language query dịch sang query schema an toàn.
7. What-if snapshot không ghi database thật.

## Câu hỏi còn bỏ ngỏ

Không còn câu hỏi nghiệp vụ chặn source trong phạm vi quản lý kho ngày thường.
Quyết định còn lại là thời điểm chạy acceptance thực địa và database clone.

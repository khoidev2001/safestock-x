# Implementation Plan: Hoàn thiện phạm vi PRD

## Overview

Triển khai theo lát cắt dọc và dependency graph. P09/offline routing là gate hiện tại; contract inventory ổn định trước khi nhân sang QR/mobile; AI embedding triển khai sau khi scope và dữ liệu nguồn đã khóa.

## Architecture Decisions

- Backend là nguồn quyền và số liệu duy nhất; web/mobile không tự tính tồn hoặc fulfillment.
- Offline mobile chỉ đọc cache gần nhất; mutation fail-closed khi mất LAN.
- QR chứa payload versioned tối thiểu, không chứa token hoặc dữ liệu nhạy cảm.
- Open-Meteo đi qua backend/AI adapter có timeout/cache/provenance; không gọi trực tiếp từ client.
- Embedding partition theo organization/warehouse và không dùng model output để tự mutation.

## Dependency Graph

```text
P09 OSRM + marker + route snapshot
  -> APK REPORTER/RESCUE + LAN/offline-read
    -> Web inventory/loan contract hoàn chỉnh
      -> Mobile dashboard/readiness + QR/inventory
        -> Incident/readiness/permission workflow
          -> AI weather/semantic/brief/normalization
            -> hardening + full acceptance
```

## Task List

### Phase 0: Đóng P09

- [x] P09.1: Dựng OSRM local runtime, graph manifest/checksum và health/preflight.
- [x] P09.2: Persist route snapshot/provenance và fail rõ khi engine down/NoRoute.
- [x] P09.3: ADMIN cấu hình/xác minh marker thôn và kho trực tiếp trên map.
- [x] P09.4: Internet-off + multi-warehouse + F5/relogin acceptance.

### Phase 1: APK Android REPORTER/RESCUE

- [x] M1.1: Release env/profile, package ID và APK build configuration.
- [x] M1.2: SecureStore session hydrate/logout/refresh, không hard-code credential.
- [x] M1.3: Cache read-only inbox/mission và trạng thái online/offline/stale.
- [ ] M1.4: REPORTER và RESCUE flow có retry/error/reference đầy đủ.
- [ ] M1.5: Cài và chạy LAN acceptance trên Galaxy S23 Ultra.

### Phase 2: Web inventory và loan

- [x] W2.1: Khóa toàn vẹn tồn khả dụng giữa export/bulk/adjust/transfer và loan.
- [x] W2.2: Thêm idempotency key cho mọi mutation kho và mượn-trả.
- [x] W2.3: Thêm contract tạo danh mục/lô nhận hàng mới, hạn dùng, kệ và QR label.
- [x] W2.4: Inventory web nhập/xuất/bulk/transfer/adjust/reconcile/condition với error state.
- [x] W2.5: Borrow web và partial return tốt/hỏng/mất, bảo toàn phần hàng hỏng.
- [x] W2.6: Scope organization/kho cho inventory, loan, catalog và audit.
- [x] W2.7: Sửa quyền/lỗi báo cáo tháng và lịch sử báo cáo của kho gửi.
- [ ] W2.8: Browser/API acceptance cho workflow kho ngày thường.

#### Acceptance Phase 2

- Không mutation nào được làm `quantity - outstandingLoan < 0`; return hỏng tách riêng
  số lượng cần kiểm tra và return mất không thể làm âm tồn.
- Retry cùng `requestId` trả cùng kết quả và không ghi tồn/audit lần hai.
- ADMIN/WAREHOUSE tạo được SKU/lô mới, chọn kệ, hạn dùng và in QR; web/mobile đều
  thao tác đầy đủ trên lô đã tạo mà không dùng seed/API script.
- API lỗi 401/403/409/5xx hiển thị thành lỗi có nút thử lại, không thành empty/success.
- ADMIN không đọc hoặc sửa dữ liệu organization khác; WAREHOUSE không thoát kho được gán.
- Báo cáo đã gửi xem lại được đúng người/kho; duyệt/từ chối vẫn atomic và idempotent.

#### Verification Phase 2

- Focused Jest: inventory, loan, report, audit và scope/concurrency.
- Frontend/mobile typecheck cùng state/contract tests.
- Production build frontend/backend sau khi các lát cắt đã xanh.
- Browser acceptance ở 320/768/1024/1440 và APK Galaxy S23 Ultra là gate cuối;
  nếu Chrome DevTools hoặc thiết bị chưa có thì giữ trạng thái `Not run`, không tick hoàn tất.

### Phase 3: Incident, readiness và permission

- [ ] W3.1: Incident detail/evidence/timeline.
- [ ] W3.2: Assign/ack/resolve theo permission riêng.
- [ ] W3.3: Readiness blocker theo tình huống và stale/unknown.
- [ ] W3.4: Recalc/realtime theo kho dưới hai giây.
- [ ] W3.5: Role-aware navigation/route guard và error states toàn màn lõi.

### Phase 4: Mobile dashboard, readiness, QR và nghiệp vụ kho

- [x] M4.1: Mobile home/readiness/alerts với cache và stale timestamp.
- [x] M4.2: QR payload v1 + scanner + nhập SKU/lô thủ công.
- [x] M4.3: Mobile nhập/xuất/chuyển/adjust/reconcile.
- [x] M4.4: Mobile borrow/return và báo hỏng/mất.
- [ ] M4.5: Permission, confirmation và audit reference trên mọi mutation.

### Phase 5: AI bắt buộc

- [x] A5.1: Forecast nhu cầu kết hợp mưa Open-Meteo 72 giờ.
- [x] A5.2: Semantic search vật tư bằng embedding local, scoped.
- [x] A5.3: Bản tin AI đầu ngày có số liệu/provenance và fallback template.
- [x] A5.4: Chuẩn hóa nhập liệu bằng embedding, chỉ gợi ý để người dùng duyệt.
- [ ] A5.5: Redaction, prompt-injection và output validation test.

### Phase 6: Hardening và release

- [ ] R6.1: Scope REST/WebSocket/AI snapshot và notification partition.
- [ ] R6.2: Auth/session, CORS/headers/upload limits và dependency audit.
- [ ] R6.3: Prisma migrations, backup/restore, reboot và LAN recovery.
- [ ] R6.4: CI + browser/mobile E2E.
- [ ] R6.5: Full judged flow chạy hai lần; slide/video/docs khớp source.

## Checkpoints

- Sau P09: route local/offline và continuity có bằng chứng thật.
- Sau M1: APK cài được, restart giữ phiên, mất LAN không false success.
- Sau W2/W3: web workflow thường ngày và sự cố chạy không cần API script.
- Sau M4: nghiệp vụ kho/QR chạy trên thiết bị thật.
- Sau A5: AI không bịa số, có scope/provenance/fallback.
- Sau R6: clean-checkout và pilot acceptance đạt Definition of Done.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope quá lớn làm vỡ demo path | Cao | Một lát cắt/test/checkpoint mỗi lần; không mở phase sau khi gate trước chưa đạt |
| Dirty worktree có thay đổi người dùng | Cao | Không reset/checkout/format rộng; diff theo file trước mọi edit |
| Retry hoặc race làm lệch sổ tồn | Cao | DB transaction + advisory/idempotency receipt + test đồng thời trước UI |
| Catalog/lô mới phá contract seed cũ | Cao | API additive; giữ endpoint cũ, tạo contract mới và backfill không reset |
| Android dependency/native build lỗi | Cao | Dùng version tương thích Expo SDK 52 từ bundled modules; build profile sớm |
| Offline mutation gây lệch tồn | Cao | Offline-read only, disable mutation khi không có LAN |
| Embedding hoặc weather lộ chéo tenant | Cao | Backend partition, provenance và boundary tests trước UI |

## Open Questions

- Không có quyết định sản phẩm nào đang chặn phase P09. Các lựa chọn QR schema/model embedding sẽ được đề xuất cùng test đỏ ở đúng phase.

## Warehouse Daily Operations Completion — 2026-07-27

Phạm vi được duyệt: hoàn thiện nghiệp vụ kho ngày thường; loại trừ WMS mở rộng
(nhà cung cấp, đơn mua, giá vốn/nguồn vốn, lịch bảo trì, người mượn/hạn trả,
phiếu giấy/PDF và CRUD cấu trúc kho/danh mục).

- [x] Ràng buộc idempotency key với fingerprint payload; chặn phát lại sai dữ liệu.
- [x] Reset vòng đời form web sau mỗi lần mở; adjust/reconcile mặc định theo tồn lô.
- [x] Serialize condition/adjust/reconcile/transfer/export trên cùng batch.
- [x] Chặn nộp báo cáo liên tổ chức và audit submit/reject.
- [x] Bắt buộc xem chi tiết từng dòng trước khi duyệt; từ chối phải có lý do.
- [x] Lịch sử giao dịch hiển thị cho người vận hành kho.
- [x] Kiểm kê có loading/error/empty/mutation error và requestId an toàn.
- [x] Web/mobile chọn kho và kệ đích trong cùng xã khi điều chuyển.
- [x] APK có báo cáo kiểm kê tháng: tổng hợp SKU để tham chiếu, bắt buộc nhập
  số đếm thực tế, gửi, xem chi tiết, duyệt/từ chối theo quyền.
- [x] Ledger lưu snapshot kho và hai đầu điều chuyển; nhật ký không trôi theo
  vị trí hiện tại của batch, có backfill dữ liệu cũ.
- [x] Chuyển liên kho khóa quyền tại kho nguồn nhưng cho phép kho đích cùng
  organization/commune; không mở quyền đọc tồn kho đích.
- [x] Serialize theo kho-kỳ và chặn báo cáo PENDING/APPROVED trùng kỳ; cho phép
  nộp lại sau REJECTED.
- [ ] Browser acceptance ở các breakpoint và device/LAN acceptance trên Galaxy S23 Ultra.
- [ ] Full production security/recovery/CI gate thuộc Phase 6, không được suy diễn là đã nghiệm thu.

## PM 100/100 Remediation — 2026-07-27

Mục tiêu của đợt này là đóng toàn bộ lỗi có bằng chứng trong
`docs/PM-REVIEW-QUAN-LY-KHO-NGAY-THUONG.md` ở mức source code và kiểm thử tự động.
Điểm nghiệm thu release thực tế vẫn được tách riêng; không suy diễn browser, Galaxy S23 Ultra,
LAN hoặc database thật là đã đạt khi các gate đó chưa chạy.

### Slice A — Authorization

- [x] Readiness phải kiểm tra actor và organization cho mọi warehouse/zone/shelf target.
- [x] Regression test ADMIN không có `warehouseId` không thể đọc hoặc recalc kho organization khác.

### Slice B — Inventory invariants and validation

- [x] Chặn transfer/import/receive vào shelf đã khóa ở backend, không phụ thuộc bộ lọc UI.
- [x] Chặn nhận lô đã hết hạn; cho phép ngày hiện tại theo quy tắc ngày UTC nhất quán.
- [x] Chặn kỳ báo cáo có tháng ngoài `01..12`.

### Slice C — Batch-accurate stocktake

- [x] Contract báo cáo hỗ trợ định danh `batchId` cùng batch/shelf metadata theo hướng additive.
- [x] Mobile gửi số đếm theo từng lô, không phân bổ heuristic theo SKU.
- [x] Duyệt phải fail-closed khi thiếu SKU/lô hoặc một SKU cũ có nhiều lô không xác định.
- [x] QR scanner giữ cả SKU và batch code để chọn đúng lô.

### Slice D — Operational UX

- [x] ADMIN trên mobile chọn được kho trong organization; không mặc định âm thầm kho đầu tiên.
- [x] Mọi mutation hiển thị warehouse/batch/shelf context và lỗi có thể hành động.

### Slice E — Hardening

- [x] Rà ledger/audit theo khả năng truy vết organization/warehouse và delta tồn.
- [x] Rà list endpoint có hard cap; bổ sung pagination tương thích ngược nơi cần thiết.
- [x] Readiness recalc failure có dấu vết và cơ chế retry/stale rõ ràng.
- [x] Cache APK Android mã hóa AES-GCM bằng khóa Android Keystore; legacy plaintext fail-closed.

### Final gates

- [x] Focused tests xanh sau từng slice.
- [x] Backend/frontend/mobile typecheck xanh.
- [x] Full backend test và production builds xanh.
- [x] Review correctness/readability/architecture/security/performance không còn Critical/Required.
- [x] Cập nhật báo cáo PM theo bằng chứng; các gate thực địa chưa chạy ghi `Not run`.

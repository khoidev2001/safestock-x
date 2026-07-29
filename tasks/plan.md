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

### Phase 1: APK Android REPORTER/Lực lượng hiện trường

- [x] M1.1: Release env/profile, package ID và APK build configuration.
- [x] M1.2: SecureStore session hydrate/logout/refresh, không hard-code credential.
- [x] M1.3: Cache read-only inbox/mission và trạng thái online/offline/stale.
- [ ] M1.4: REPORTER và Lực lượng hiện trường (`RESCUE`) có retry/error/reference đầy đủ.
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
- [ ] W3.2: Acknowledge/resolve theo permission riêng; không phân công lực lượng cứu hộ.
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

---

# Implementation Plan: AI tham mưu điều phối — 2026-07-28

## Mục tiêu

Triển khai ba lát cắt đã chốt trong PRD:

1. AI biến báo cáo text/voice tự nhiên thành bản phân tích tình huống có provenance,
   dữ kiện thiếu/mâu thuẫn, nhu cầu, kho-tuyến, dự báo và giải thích cho ADMIN.
2. ADMIN dùng AI What-if để mô phỏng giả định trên snapshot tách biệt và xem delta,
   không sửa mission/tồn/incident/marker thật.
3. Lực lượng hiện trường (`RESCUE`) gửi cập nhật text/voice đã xem, sửa và xác nhận;
   cập nhật trở thành evidence và có thể kích hoạt một What-if sơ bộ cho ADMIN.

Phạm vi loại trừ giữ nguyên: ảnh/video, phân công đội/cá nhân, GPS liên tục, AI tự
duyệt/dispatch, AI tự liên hệ xã khác và kiểm tra tồn kho xã khác.

## Quyết định kiến trúc

- Backend là orchestrator và nguồn số liệu duy nhất. AI service chỉ trích xuất,
  phân loại giả định/intent, chọn câu hỏi và diễn giải dữ liệu backend đã tính.
- Không mở tool mutation cho AI. Tool allowlist chỉ gồm đọc snapshot và mô phỏng.
- Tạo `MissionAnalysisSnapshot` bất biến cho `BASELINE` và `WHAT_IF`; snapshot lưu
  input/provenance/result/model-rule version, baseline fingerprint và `computedAt`.
- Tạo `MissionFieldUpdate` riêng cho evidence hiện trường. Không dùng
  `IncidentEvidence` vì model hiện tại chỉ phù hợp sự kiện cảm biến dạng số.
- What-if dùng whitelist assumption. Địa điểm/tuyến/kho không resolve được phải trả
  `unresolvedAssumptions`, không để LLM tự tạo ID hoặc tọa độ.
- Registry nguồn V1 đã được khóa tại
  `docs/DANH-MUC-THAM-CHIEU-TUYEN-AI-WHAT-IF.md`; runtime phải lưu version, nguồn,
  ngày xác minh và trạng thái `REFERENCE_ONLY/HYPOTHETICAL/REPORTED/VERIFIED`.
- Google Maps chỉ xác minh tên/điểm tham chiếu, không xác minh trạng thái rủi ro.
  Exact canonical/alias mới được auto-resolve; fuzzy chỉ tạo candidate cho ADMIN.
- V1 không mô phỏng đóng một cạnh đường tùy ý. Chỉ loại một route/kho hiện hữu đã
  được backend xác định. Cầu/điểm chỉ tác động khi route geometry giao buffer; tên
  đường chỉ tác động khi route snapshot/graph có road ref tương ứng. Không có topology
  thay thế thì báo chưa có tuyến thay thế đã xác minh, không tự vẽ đường vòng.
- Gợi ý liên xã dùng contract mới `ExternalContactSuggestion` với availability
  `UNKNOWN`. Giữ field cũ theo hướng deprecated trong giai đoạn chuyển tiếp; không
  đọc tồn kho ngoài xã.
- Mỗi POST mới có `requestId`/fingerprint để retry idempotent. Error dùng mã có cấu
  trúc như `VALIDATION_ERROR`, `UNRESOLVED_ASSUMPTION`, `STALE_BASELINE`,
  `AI_UNAVAILABLE` và `FORBIDDEN`.

## Dependency graph

```text
AI-0 contract + role label
  ├── AI-1 persistence/API foundation
  │     ├── AI-2 natural-language analysis
  │     │      └── AI-3 What-if
  │     └── AI-4 field-update API
  │            └── AI-4 mobile assistant
  └──────────────────────────────┐
                                 v
                     AI-5 adaptive loop/realtime
                                 v
                     AI-6 hardening/live acceptance
```

## Phase AI-0: Khóa contract và ranh giới an toàn

### Task AI-0.1: Chuẩn hóa tên Lực lượng hiện trường

**Description:** Giữ enum `RESCUE` để tương thích nhưng tập trung role label vào một
nguồn dùng chung và thay toàn bộ nhãn người dùng “đội cứu hộ/RESCUE” bằng
“Lực lượng hiện trường”.

**Acceptance criteria:**

- [ ] Web/APK hiển thị “Lực lượng hiện trường”; API/JWT vẫn dùng `RESCUE`.
- [ ] Không có control/API phân công đội hoặc cá nhân trong mission cứu hộ.
- [ ] Test role/navigation cũ vẫn xanh.

**Verification:**

- [ ] Focused shared/frontend/mobile role tests.
- [ ] `rg` không còn nhãn người dùng “đội cứu hộ” trong màn mission/login.

**Dependencies:** None.

**Files likely touched:** `packages/shared-types/src/index.ts`,
`apps/frontend/src/components/dashboard/admin-users-view.tsx`, `apps/mobile/App.tsx`,
`apps/mobile/__tests__/mobile-state.test.ts`.

**Estimated scope:** M.

### Task AI-0.2: Định nghĩa contract điều phối dùng chung

**Description:** Khóa các discriminated union cho fact provenance, analysis status,
assumption, delta, field-update intent và external-contact suggestion trước khi viết
service hoặc UI.

**Acceptance criteria:**

- [ ] Fact phân biệt `REPORTED`, `VERIFIED`, `AI_INFERENCE`, `MISSING`.
- [ ] What-if assumption chỉ nhận loại được whitelist; giá trị chưa resolve có nhánh
  riêng, không dùng `null` mơ hồ.
- [ ] Contract additive; `Mission` và Action Plan hiện có vẫn đọc được.

**Verification:**

- [ ] Type contract tests và golden JSON fixture từ tình huống Phước Lộc.
- [ ] Fixture chứng minh “nguy cơ cô lập” không biến thành “đã mắc kẹt”.

**Dependencies:** AI-0.1 chỉ để thống nhất tên.

**Files likely touched:** `packages/shared-types/src/coordination.ts`,
`packages/shared-types/src/index.ts`, `packages/shared-types/src/__tests__/coordination.spec.ts`,
`apps/ai-service/tests/fixtures/phuoc-loc-analysis.json`.

**Estimated scope:** M.

### Task AI-0.3: Đóng gói geo-reference registry V1

**Description:** Chuyển danh mục đã tra Google Maps thành registry runtime có version,
map-match với route snapshot/graph, chuyển kho xã sang vị trí UBND xã và chỉ seed vị
trí Nhà văn hóa của kho thôn đã xác minh trước khi cho AI-3 nhận diện tên cầu/đường.

**Acceptance criteria:**

- [x] Tài liệu nguồn có canonical name, alias, loại, tọa độ/anchor, nguồn, ngày xác
  minh và danh sách `UNRESOLVED/AMBIGUOUS`.
- [ ] Runtime registry có schema validate; AI không được tự thêm ID, alias, tọa độ
  hoặc trạng thái rủi ro.
- [ ] `Cầu La Hai`, `Cầu Đá Chát`, `Cầu Tam Giang`, `Cầu Sông Cái Phú Yên`,
  ĐT641/TL642/QL19C/ĐT644/ĐT647 resolve đúng; tên mơ hồ fail closed.
- [ ] Route snapshot có road refs/geometry cần thiết để kiểm tra giao điểm; không có
  topology thì trả trạng thái có cấu trúc, không sinh detour.
- [x] Kho trung tâm đổi cả location và tọa độ sang UBND Xã Đồng Xuân
  `13.3782428, 109.1042590`; không tiếp tục dùng giả định 68 Trần Phú.
- [x] Sáu external contact/reference dùng đúng UBND Xuân Thọ, Tuy An Bắc, Tuy An Tây,
  Xuân Lãnh, Phú Mỡ, Xuân Phước; availability luôn `UNKNOWN`.
- [x] Năm kho thôn Kỳ Đu, Phước Huệ, Tân Bình, Phú Sơn và Triêm Đức dùng đúng tọa
  độ Nhà văn hóa/nhà sinh hoạt cộng đồng đã xác minh; 12 kho còn lại giữ null.

**Verification:**

- [ ] Registry schema/duplicate alias/normalization tests.
- [ ] Golden resolver cases cho exact, alias, ambiguous, unknown và wrong-region.
- [x] Regression test vị trí UBND/kho thôn và null cho điểm chưa xác minh.
- [ ] Regression test route intersection/no-intersection.

**Dependencies:** None cho tài liệu nguồn; AI-0.2 cho contract runtime.

**Files likely touched:** `packages/shared-types/src/coordination.ts`,
`apps/backend/src/geo/verified-geo-reference.ts`,
`apps/backend/src/geo/__tests__/verified-geo-reference.spec.ts`,
`apps/backend/prisma/seed.ts`.

**Estimated scope:** M.

#### Checkpoint AI-0

- [ ] Contract được review trước migration/API.
- [ ] Không có field cho ảnh/video, GPS liên tục, assignee hoặc tồn kho ngoài xã.
- [ ] Geo-reference registry validate, map-match được route dùng trong kịch bản và
  không còn chênh lệch tọa độ seed kho trung tâm.
- [ ] Existing shared-types build pass.

## Phase AI-1: Persistence, permission và API resource

### Task AI-1.1: Thêm snapshot và field-update model

**Description:** Thêm hai model bất biến `MissionAnalysisSnapshot` và
`MissionFieldUpdate`, index theo mission/time, actor/provenance và idempotency key.

**Acceptance criteria:**

- [ ] Snapshot phân biệt `BASELINE`/`WHAT_IF`, liên kết baseline và có fingerprint.
- [ ] Field update lưu raw confirmed text, input mode, structured intent, actor và time.
- [ ] Migration additive, không đổi/xóa dữ liệu Mission hiện có.

**Verification:**

- [ ] `prisma validate` và migration SQL review không có drop ngoài dự kiến.
- [ ] Focused repository test cho unique request/fingerprint và organization scope.

**Dependencies:** AI-0.2.

**Files likely touched:** `apps/backend/prisma/schema.prisma`,
`apps/backend/prisma/migrations/<timestamp>_coordination_ai/migration.sql`,
`apps/backend/src/mission/__tests__/coordination-schema.spec.ts`.

**Estimated scope:** M, rủi ro cao do migration.

### Task AI-1.2: Thêm permission và endpoint additive

**Description:** Thêm permission hạt mịn và resource endpoint cho analyses,
simulations và field updates mà không thay endpoint mission hiện hữu.

**Contract dự kiến:**

```text
POST /api/missions/:id/analyses
GET  /api/missions/:id/analyses/latest
POST /api/missions/:id/simulations
GET  /api/missions/:id/simulations/:simulationId
POST /api/missions/:id/field-updates
GET  /api/missions/:id/field-updates
```

**Acceptance criteria:**

- [ ] ADMIN có `MISSION_ANALYZE`/`MISSION_SIMULATE`; `RESCUE` có
  `FIELD_UPDATE_SUBMIT`; quyền xem evidence scope đúng actor/organization.
- [ ] DTO giới hạn độ dài, enum, requestId và từ chối field thừa/nguy hiểm.
- [ ] Mọi error trả mã máy đọc được và không lộ nội bộ.

**Verification:**

- [ ] RBAC unit tests và controller/DTO contract tests.
- [ ] Cross-organization/warehouse IDOR tests trả 403/404 đúng policy.

**Dependencies:** AI-1.1.

**Files likely touched:** `packages/shared-types/src/index.ts`,
`apps/backend/src/mission/dto.ts`, `apps/backend/src/mission/mission.controller.ts`,
`apps/backend/src/mission/__tests__/coordination-api.spec.ts`.

**Estimated scope:** M.

#### Checkpoint AI-1

- [ ] Migration chạy trên database clone và rollback drill được ghi nhận.
- [ ] API contract tồn tại nhưng chưa cho AI/service ghi mutation nghiệp vụ.
- [ ] Backend focused RBAC/schema tests pass.

## Phase AI-2: Bản phân tích ngôn ngữ tự nhiên cho ADMIN

### Task AI-2.1: Trích xuất fact và provenance trong AI service

**Description:** Thêm schema/prompt nghiêm ngặt để trả fact, source span, qualifier,
missing/conflict và câu hỏi ưu tiên; không trả tồn kho, kho, tuyến hoặc số dự báo.

**Acceptance criteria:**

- [ ] Output Pydantic `extra=forbid`, validate range và source span.
- [ ] Câu “có nguy cơ cô lập” chỉ tạo inference/risk, không tạo fact mắc kẹt.
- [ ] Không đủ số hộ thì đèn pin/nhu cầu theo hộ giữ trạng thái chưa tính.

**Verification:**

- [ ] Pytest golden cases: Phước Lộc, địa danh mơ hồ, số người mâu thuẫn,
  prompt injection và AI unavailable fallback.
- [ ] Ollama/Gemini output đều qua cùng schema.

**Dependencies:** AI-0.2.

**Files likely touched:** `apps/ai-service/schemas.py`, `apps/ai-service/main.py`,
`apps/ai-service/tests/test_situation_analysis.py`,
`apps/ai-service/tests/fixtures/phuoc-loc-analysis.json`.

**Estimated scope:** M.

### Task AI-2.2: Tách bộ tính snapshot không mutation

**Description:** Tái sử dụng `computeRequirements`, allocation/readiness, OSRM,
weather 72 giờ và external-contact metadata trong một service thuần đọc. Đây là lõi
dùng chung cho baseline và What-if.

**Acceptance criteria:**

- [ ] Cùng input snapshot/fingerprint sinh cùng output.
- [ ] Không gọi create/update/delete cho Mission, Inventory, Incident hoặc Hamlet.
- [ ] Route failure/unknown weather giữ trạng thái unknown, không fallback thành số 0.

**Verification:**

- [ ] Focused unit tests spy toàn bộ Prisma mutation và chứng minh không được gọi.
- [ ] Regression tests cho multi-warehouse, unavailable route và weather missing.

**Dependencies:** AI-1.1.

**Files likely touched:** `apps/backend/src/mission/coordination-snapshot.service.ts`,
`apps/backend/src/mission/mission.module.ts`,
`apps/backend/src/mission/__tests__/coordination-snapshot.spec.ts`,
`apps/backend/src/insights/weather.ts`.

**Estimated scope:** M.

### Task AI-2.3: Compose và lưu bản phân tích baseline

**Description:** Backend validate output AI, resolve marker đã xác minh, gọi snapshot
service, tính confidence có provenance và lưu snapshot bất biến; AI chỉ diễn giải.

**Acceptance criteria:**

- [ ] Bản phân tích có đủ 10 phần theo PRD mục 4.8.
- [ ] Mọi số truy được về fact/tool/version; unsupported number bị reject/fallback.
- [ ] AI lỗi vẫn trả facts đã nhập + bản tính deterministic/template, không mất report.

**Verification:**

- [ ] Service tests cho success, AI malformed, stale weather, unresolved hamlet.
- [ ] Contract test snapshot lưu đúng model/rule/OSRM/weather provenance.

**Dependencies:** AI-1.2, AI-2.1, AI-2.2.

**Files likely touched:** `apps/backend/src/mission/coordination-analysis.service.ts`,
`apps/backend/src/ai/ai-client.service.ts`,
`apps/backend/src/mission/mission.controller.ts`,
`apps/backend/src/mission/__tests__/coordination-analysis.spec.ts`.

**Estimated scope:** M.

### Task AI-2.4: Hiển thị bản tham mưu trên web ADMIN

**Description:** Thêm panel riêng trong Mission view cho provenance badge, missing/
conflict, requirement basis, kho-tuyến, forecast, câu hỏi ưu tiên và trạng thái lỗi.

**Acceptance criteria:**

- [ ] ADMIN nhìn thấy rõ báo cáo/xác minh/suy luận/chưa xác minh.
- [ ] Loading/empty/AI unavailable/route unknown không bị biến thành success.
- [ ] Không có nút AI tự duyệt; approve/dispatch hiện hữu vẫn là action riêng của ADMIN.

**Verification:**

- [ ] Component/state tests cho đủ bốn provenance state và error state.
- [ ] Manual responsive check 320/768/1024/1440 khi tới browser gate.

**Dependencies:** AI-2.3.

**Files likely touched:** `apps/frontend/src/lib/mission-api.ts`,
`apps/frontend/src/components/mission/coordination-analysis-panel.tsx`,
`apps/frontend/src/components/mission/mission-view.tsx`,
`apps/frontend/src/lib/__tests__/coordination-analysis-state.test.ts`.

**Estimated scope:** M.

### Task AI-2.5: Khóa contract liên xã

**Description:** Thay contract `available` gây hiểu nhầm bằng
`ExternalContactSuggestion` chỉ chứa metadata đã ghim, tuyến/ETA, số công khai và
availability `UNKNOWN`; field cũ được đọc tương thích trong giai đoạn chuyển tiếp.

**Acceptance criteria:**

- [ ] Chỉ sinh suggestion khi toàn bộ nguồn nội xã đủ điều kiện vẫn thiếu.
- [ ] Không query batch/readiness/fulfillment ngoài tenant.
- [ ] UI luôn ghi “đề xuất liên hệ, chưa xác nhận có hàng”.

**Verification:**

- [ ] Boundary tests chứng minh external metadata không vào allocation.
- [ ] API/UI contract tests khi có số, không có số và route unavailable.

**Dependencies:** AI-2.2.

**Files likely touched:** `apps/backend/src/mission/mission.service.ts`,
`apps/backend/src/mission/__tests__/external-commune-boundary.spec.ts`,
`apps/frontend/src/lib/mission-api.ts`,
`apps/frontend/src/components/mission/action-plan-view.tsx`.

**Estimated scope:** M.

#### Checkpoint AI-2

- [ ] Câu mẫu trong file Word tạo bản phân tích đúng, không có claim vô căn cứ.
- [ ] ADMIN xem được baseline qua UI thật.
- [ ] Không có mutation tồn/mission do AI analysis.

## Phase AI-3: AI What-if cho ADMIN

### Task AI-3.1: Parse giả định tự nhiên theo whitelist

**Description:** AI chỉ chuyển câu What-if thành danh sách assumption typed; backend
resolve ID/giới hạn và trả phần chưa hiểu.

**Acceptance criteria:**

- [ ] V1 hỗ trợ: số người, thời lượng, nhóm dễ tổn thương, mức dự phòng, loại một kho
  hoặc một route hiện hữu, và kịch bản mưa dựa trên dữ liệu weather đã có.
- [ ] “Cầu X bị ngập” không khớp route/điểm đã xác minh phải trả unresolved.
- [ ] Prompt không thể yêu cầu AI dispatch, sửa tồn hoặc bỏ qua permission.

**Verification:**

- [ ] Pytest/contract test cho valid, ambiguous, unsupported và injection cases.

**Dependencies:** AI-0.2, AI-0.3, AI-2.1.

**Files likely touched:** `apps/ai-service/schemas.py`, `apps/ai-service/main.py`,
`apps/ai-service/tests/test_what_if_parser.py`.

**Estimated scope:** S-M.

### Task AI-3.2: Chạy và lưu simulation read-only

**Description:** Áp assumption lên bản clone của baseline, gọi snapshot service, tính
delta và lưu `WHAT_IF` snapshot; không có endpoint apply trực tiếp trong V1.

**Acceptance criteria:**

- [ ] Response có assumptions, unresolved, baseline fingerprint, delta và expiry.
- [ ] Baseline đổi thì trả `STALE_BASELINE`; retry requestId không tạo bản trùng.
- [ ] Mission/status/tồn/incident/marker không đổi trước và sau simulation.
- [ ] Bridge/điểm đã resolve chỉ loại route option có geometry giao buffer; road ref
  chỉ loại route option mang ref tương ứng.
- [ ] Không còn route option hợp lệ thì báo không có tuyến thay thế đã xác minh;
  không tự bịa detour/ETA.

**Verification:**

- [ ] Integration test so sánh database before/after.
- [ ] Concurrency/idempotency test hai request giống nhau và baseline bị thay đổi.

**Dependencies:** AI-2.2, AI-2.3, AI-3.1.

**Files likely touched:** `apps/backend/src/mission/what-if.service.ts`,
`apps/backend/src/mission/mission.controller.ts`,
`apps/backend/src/mission/dto.ts`,
`apps/backend/src/mission/__tests__/what-if.spec.ts`.

**Estimated scope:** M.

### Task AI-3.3: Màn What-if và so sánh delta

**Description:** Thêm textbox tự nhiên, assumption chips, unresolved warnings và bảng
baseline-vs-simulation trên web ADMIN.

**Acceptance criteria:**

- [ ] Hiển thị thay đổi nhu cầu, fulfillment, kho, dự phòng, route/ETA và liên xã.
- [ ] Kết quả luôn có nhãn `MÔ PHỎNG`; không có nút áp thẳng vào mission.
- [ ] ADMIN có thể sửa câu và chạy lại; lỗi/stale có hành động rõ.

**Verification:**

- [ ] Frontend state/component tests.
- [ ] Manual flow với câu “150 người, giữ 30% dự phòng, loại kho X”.

**Dependencies:** AI-3.2, AI-2.4.

**Files likely touched:** `apps/frontend/src/lib/mission-api.ts`,
`apps/frontend/src/components/mission/what-if-panel.tsx`,
`apps/frontend/src/components/mission/mission-view.tsx`,
`apps/frontend/src/lib/__tests__/what-if-state.test.ts`.

**Estimated scope:** M.

#### Checkpoint AI-3

- [ ] What-if chạy lặp lại và không làm thay đổi operational tables.
- [ ] Unsupported route/địa danh fail closed.
- [ ] ADMIN nhìn thấy delta và tự quyết định workflow thật.

## Phase AI-4: Trợ lý hiện trường

### Task AI-4.1: Field-update API và evidence timeline

**Description:** Implement resource field update, idempotency, RBAC và timeline theo
mission; update chỉ là evidence, không thay mission status hoặc route.

**Acceptance criteria:**

- [ ] Chỉ `RESCUE` đúng organization được submit; ADMIN và actor phù hợp được xem.
- [ ] Text phải là nội dung người dùng đã xác nhận; requestId retry không ghi trùng.
- [ ] Update không mutate tồn, route, mission status hoặc tạo assignee.

**Verification:**

- [ ] API/RBAC/idempotency tests và audit actor/time/source.

**Dependencies:** AI-1.1, AI-1.2.

**Files likely touched:** `apps/backend/src/mission/field-update.service.ts`,
`apps/backend/src/mission/mission.controller.ts`,
`apps/backend/src/mission/dto.ts`,
`apps/backend/src/mission/__tests__/field-update.spec.ts`.

**Estimated scope:** M.

### Task AI-4.2: APK Trợ lý hiện trường text/voice

**Description:** Tái sử dụng AudioRecord/PhoWhisper để điền text, cho sửa/xác nhận và
gửi field update từ MissionDetail; mất LAN không queue mutation.

**Acceptance criteria:**

- [ ] Hỗ trợ intent: đã đến, không tiếp cận, đường/cầu nguy hiểm, số người đổi, nhóm
  cần hỗ trợ, cần thêm vật tư, đã nhận/đã giao, không thể tiếp tục, ổn định.
- [ ] Voice chỉ prefill; nút gửi chỉ hoạt động sau màn xem/sửa/xác nhận.
- [ ] Mất LAN giữ draft trên form, báo lỗi rõ và không success giả.

**Verification:**

- [ ] Mobile state tests, typecheck và native audio regression.
- [ ] Device permission/cancel/retry test tại gate Galaxy S23 Ultra.

**Dependencies:** AI-4.1 và pipeline transcribe hiện có.

**Files likely touched:** `apps/mobile/api.ts`,
`apps/mobile/FieldAssistant.tsx`, `apps/mobile/MissionDetail.tsx`,
`apps/mobile/__tests__/mobile-state.test.ts`.

**Estimated scope:** M.

### Task AI-4.3: Trích xuất intent và tạo simulation sơ bộ

**Description:** Sau khi evidence đã persist, AI trích xuất intent typed. Nếu intent
ảnh hưởng fact/route/kho thì backend tạo What-if sơ bộ và thông báo ADMIN; failure AI
không làm mất evidence.

**Acceptance criteria:**

- [ ] Raw confirmed text luôn được lưu trước; structured intent có provenance/fallback.
- [ ] Provisional simulation không đổi route/mission thật.
- [ ] ADMIN thấy update, intent, uncertainty và link tới delta.

**Verification:**

- [ ] Test AI malformed/unavailable vẫn giữ field update.
- [ ] Test field update “cầu không qua được” unresolved thì yêu cầu ADMIN xác minh,
  không tự khóa tuyến.

**Dependencies:** AI-3.2, AI-4.1.

**Files likely touched:** `apps/backend/src/mission/field-update.service.ts`,
`apps/backend/src/ai/ai-client.service.ts`,
`apps/backend/src/notification/notification.service.ts`,
`apps/backend/src/mission/__tests__/field-update-analysis.spec.ts`.

**Estimated scope:** M.

#### Checkpoint AI-4

- [ ] Voice → text → sửa → xác nhận → evidence chạy qua APK.
- [ ] ADMIN nhận update và What-if sơ bộ nhưng là người quyết định replan.
- [ ] Không ảnh/video, GPS liên tục hoặc assignment xuất hiện trong APK/API.

## Phase AI-5: Vòng điều phối thích ứng và realtime

### Task AI-5.1: Hiển thị update/delta trong timeline ADMIN

**Description:** Nối field-update notification/deep-link vào Mission view và thêm
timeline “điều gì thay đổi — ảnh hưởng gì — cần ADMIN làm gì”.

**Acceptance criteria:**

- [ ] Reload/relogin vẫn mở đúng mission/update/simulation.
- [ ] Notification partition theo organization/role; không broadcast chéo tenant.
- [ ] ADMIN có thể bỏ qua hoặc dùng dữ kiện để tạo draft mới bằng workflow hiện hữu;
  không có auto-approve.

**Verification:**

- [ ] Backend/frontend notification/deep-link tests.
- [ ] Browser refresh/tab/relogin acceptance tại checkpoint.

**Dependencies:** AI-2.4, AI-3.3, AI-4.3.

**Files likely touched:** `apps/frontend/src/components/mission/mission-view.tsx`,
`apps/frontend/src/components/mission/field-update-timeline.tsx`,
`apps/frontend/src/components/mission/notification-bell.tsx`,
`apps/frontend/src/lib/mission-api.ts`.

**Estimated scope:** M.

### Task AI-5.2: Fallback và observability

**Description:** Ghi latency/model/fallback/error code cho từng bước AI mà không log
raw audio hoặc dữ liệu nhạy cảm; bảo đảm partial failure có UX rõ.

**Acceptance criteria:**

- [ ] AI unavailable không làm mất report/evidence hoặc tạo success giả.
- [ ] Có metric/log cho extract, compose, simulation và field intent; có correlation ID.
- [ ] Không log audio base64, token, số điện thoại hoặc raw PII ngoài policy.

**Verification:**

- [ ] Focused failure-injection tests và log redaction tests.

**Dependencies:** AI-2.3, AI-3.2, AI-4.3.

**Files likely touched:** `apps/backend/src/ai/ai-client.service.ts`,
`apps/backend/src/mission/coordination-analysis.service.ts`,
`apps/backend/src/mission/what-if.service.ts`,
`apps/backend/src/mission/__tests__/coordination-fallback.spec.ts`.

**Estimated scope:** M.

#### Checkpoint AI-5

- [ ] Luồng REPORTER → ADMIN analysis/What-if → WAREHOUSE → Lực lượng hiện trường
  update → ADMIN delta → complete chạy qua các phiên độc lập.
- [ ] F5/relogin/restart không mất evidence hoặc simulation.
- [ ] AI failure degrade an toàn.

## Phase AI-6: Hardening và nghiệm thu

### Task AI-6.1: Security/correctness gate tự động

**Description:** Khóa prompt injection, number fabrication, cross-tenant leakage,
idempotency/concurrency và tool allowlist bằng test.

**Acceptance criteria:**

- [ ] AI không thể gọi mutation hoặc thay đổi backend-computed number.
- [ ] Unsupported number/source/ID bị reject hoặc gắn unknown.
- [ ] Scope analyses/simulations/field updates đúng organization/actor.

**Verification:**

- [ ] AI pytest focused.
- [ ] Backend unit/integration/concurrency focused.
- [ ] Shared/frontend/mobile typecheck và component/state tests.

**Dependencies:** AI-0 đến AI-5.

**Files likely touched:** các test suite AI/mission/mobile/frontend liên quan; không
gộp refactor không liên quan.

**Estimated scope:** Chia thành nhiều task S theo suite khi triển khai.

### Task AI-6.2: Browser, Galaxy S23 Ultra và private-LAN acceptance

**Description:** Chạy kịch bản thi từ clean start, không curl/SQL/copy ID, có Internet
và private LAN khi Internet public tắt.

**Acceptance criteria:**

- [ ] Galaxy S23 Ultra hoàn thành voice field update, restart/relogin và lỗi LAN.
- [ ] ADMIN chạy baseline + What-if; field update sinh evidence/delta; ADMIN quyết định.
- [ ] Kịch bản chạy lặp lại hai lần với audit/timeline cuối và không dùng feature bị loại.

**Verification:**

- [ ] Biên bản lưu Android/One UI/APK checksum, service/model/graph version.
- [ ] Browser console/network không có lỗi chặn; video/ảnh bằng chứng theo runbook.

**Dependencies:** AI-6.1 và các device/browser gate cũ.

**Files likely touched:** `docs/HUONG-DAN-TEST.md`,
`docs/bao-cao-danh-gia-san-sang-du-thi.md`, bằng chứng nghiệm thu được Git policy cho phép.

**Estimated scope:** M, phụ thuộc môi trường thật.

#### Final checkpoint AI coordination

- [ ] PRD checklist 4.8/4.9, 5.5, 5.8 và Definition of Done có bằng chứng để tick.
- [ ] Không còn claim “đã làm” nếu browser/device/LAN chưa chạy.
- [ ] Demo trung tâm thể hiện AI hiểu ngôn ngữ, mô phỏng What-if và thích ứng từ
  cập nhật Lực lượng hiện trường; con người vẫn phê duyệt.

## Thứ tự commit đề xuất

1. `docs: define AI coordination contracts and implementation phases`
2. `feat: centralize field-force role labels`
3. `feat: add immutable coordination snapshot models`
4. `feat: add provenance-aware situation analysis`
5. `feat: render coordination analysis for admin`
6. `feat: add read-only what-if simulations`
7. `feat: add field assistant evidence flow`
8. `feat: connect field updates to provisional replanning`
9. `test: harden AI coordination boundaries`
10. `docs: record live AI coordination acceptance`

## Cơ hội song song hóa

- Sau AI-0.2: AI extractor tests và Prisma model có thể làm song song.
- Sau AI-1.2: web analysis UI có thể dựng bằng fixture trong khi backend composer làm.
- Sau AI-4.1: mobile field editor và backend intent parser có thể làm song song.
- Migration, shared contract, snapshot engine và endpoint semantics phải làm tuần tự;
  không để hai nhánh cùng sửa `schema.prisma`, `mission.controller.ts` hoặc contract.

## Rủi ro riêng và giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| LLM nâng suy luận thành sự thật | Cao | Provenance union, golden fixture, backend validation, template fallback |
| What-if vô tình mutation | Cao | Pure snapshot service, DB before/after test, không có apply endpoint V1 |
| Route closure không có topology | Cao | Registry có version + map-match; chỉ lọc route option giao điểm/ref; không có detour thì fail closed |
| Vị trí kho seed sai cơ sở công cộng | Cao | 7 điểm cấp xã dùng đúng UBND; kho thôn dùng đúng Nhà văn hóa; chỉ seed 5 điểm verified, 12 điểm còn lại giữ null |
| Schema JSON trôi giữa Python/TS | Cao | Contract fixture chung và runtime validation ở backend boundary |
| Field voice gửi sai | Cao | PhoWhisper chỉ prefill; bắt buộc sửa/xác nhận |
| Broadcast chéo tenant | Cao | Server-derived scope/room và IDOR tests |
| External contact bị hiểu là có hàng | Cao | Availability `UNKNOWN`, thông báo bắt buộc, không query external batch |
| Demo chậm khi model cold | Trung bình | Warm-up có ghi nhận, timeout/fallback template và loading rõ |

## Câu hỏi còn bỏ ngỏ

Không còn quyết định sản phẩm chặn AI-3 về danh mục tên. Danh mục V1 đã được tra
Google Maps và khóa tại `docs/DANH-MUC-THAM-CHIEU-TUYEN-AI-WHAT-IF.md`.

Việc còn lại là implementation đã có tiêu chí rõ: đóng registry runtime, map-match
route snapshot/graph, chuyển kho Đồng Xuân sang UBND, thêm sáu UBND external metadata,
seed năm Nhà văn hóa đã xác minh và giữ 12 kho thôn chưa xác minh ở `null`. Các tên
cầu/đường chưa xác định tiếp tục ở trạng thái `UNRESOLVED/AMBIGUOUS`. Không cần
người dùng chốt thêm dữ liệu ở bước này.

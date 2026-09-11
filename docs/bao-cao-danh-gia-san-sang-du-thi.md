# Báo cáo đánh giá hiện trạng và mức sẵn sàng — Ứng phó nhanh

Ngày đánh giá: **2026-07-29**. Phạm vi được đối chiếu với [PRD](PRD.md); các
bước nghiệm thu trên thiết bị và private LAN được quản lý tại
[Competition rehearsal](COMPETITION-REHEARSAL.md).

## 1. Kết luận điều hành

Ứng dụng là nền tảng điều phối ứng phó cấp xã gồm quản lý kho thường ngày,
readiness, tiếp nhận báo cáo hiện trường, lập Mission-to-Kit, phân bổ nhiều kho,
bản đồ/tuyến local, AI hỗ trợ có provenance, mobile Android bốn vai trò và
Digital Twin desktop. Backend vẫn là nguồn sự thật cho quyền hạn, tồn kho, nhu
cầu, phân bổ, tuyến, fulfillment và mọi mutation; AI không tự duyệt, tự dispatch
hoặc ghi nghiệp vụ.

Source hiện có độ hoàn thiện cao và nhiều kiểm soát đúng, nhưng **chưa đủ bằng
chứng để gọi 100/100 source hoặc release candidate**. Audit hiện tại xác nhận ba
nhóm blocker cao: ranh giới tenant ở báo cáo, race khi hai SKU cuối được prepare
đồng thời, và cấu hình/runtime có thể làm lộ secret hoặc dịch vụ. Ngoài ra còn
blocker cần chứng minh trên clean checkout, device và private LAN.

| Lớp đánh giá | Kết luận hiện tại |
| --- | --- |
| Chức năng trong source | **Gần hoàn thiện, chưa đạt 100%**: các lát cắt chính tồn tại, nhưng còn finding High/Medium dưới đây. |
| Automated test đã chạy trong phiên audit | **Một phần Pass**: 6 suite backend/73 test và 9 shared-contract test Pass. Không suy diễn thành toàn bộ CI Pass. |
| Browser/device/private-LAN rehearsal | **Chưa nghiệm thu trong phiên này**; cần hai lượt có evidence trên artifact cụ thể. |
| Public Internet production | **No-go** cho tới khi đóng secret/binding, firewall, backup-restore, migration, clean-checkout và hardening vận hành. |

### 1.1 Cập nhật sau khi vá blocker (2026-07-29)

Toàn bộ 6 blocker High và 3 Medium chi phí thấp (M1/M4/M5) đã được **vá trong
source và có test/bằng chứng** trong chính phiên này:

- **H1** — `resolveReportWarehouseId` nay nhận `actorUserId` và bắt buộc kho scope,
  kho chỉ định và kho mặc định đều cùng `organizationId` của người báo cáo; kèm
  suite regression cross-tenant mới
  ([mission-report-warehouse-scope.spec.ts](../apps/backend/src/mission/__tests__/mission-report-warehouse-scope.spec.ts)).
- **H2** — `MissionWarehouseRequestService.prepare` giữ `pg_advisory_xact_lock`
  trên `missionId` trước khi đếm remaining, buộc finalize per-SKU chạy tuần tự;
  test khẳng định lock chạy trước count.
- **H3** — env validation từ chối danh sách placeholder secret công khai
  (`change_me_*`, `placeholder`, …) không phân biệt hoa/thường.
- **H4** — `main.ts` bind theo `resolveBindAddress` đã validate (mặc định loopback,
  chỉ ra LAN khi cố ý đặt `BIND_ADDRESS=0.0.0.0`); giá trị rác bị chặn lúc boot.
- **H5** — desktop bỏ credential ADMIN hard-coded, chuyển sang ô nhập
  email/mật khẩu (prefill tùy chọn qua `RENDERER_VITE_*`, rỗng khi đóng gói).
- **H6** — CI build `@safestock/shared-types` và `@safestock/scenario-definitions`
  ngay sau install, trước mọi consumer.
- **M1** — `/action-plan` và `/explain` (ghi mission) chuyển từ `MISSION_VIEW`
  sang `MISSION_ANALYZE`. **M4** — schema Python bắt buộc `confidence` cho
  `AI_INFERENCE`, khớp `InferredCoordinationFact`. **M5** — `ai-dev.mjs` mặc định
  bind `127.0.0.1`.

Bổ sung trong phiên: các Medium còn lại và toàn bộ Low đã được **vá hoặc chốt
thiết kế**:

- **M2** — Đăng xuất nay thu hồi phiên phía máy chủ: mobile (`api.ts logout()` +
  `App.tsx`) và desktop (`logoutServer()`) đều gọi `POST /api/auth/logout`
  (`tokenVersion++`) trước khi xóa phiên cục bộ, best-effort khi mất mạng.
- **M3** — `AiClientService` thêm timeout `AbortController` (mặc định 15s, chỉnh
  qua `AI_SERVICE_TIMEOUT_MS`) và cache có chặn kích thước (`MAX_CACHE_ENTRIES`
  200, loại khóa cũ nhất) → không treo request, không rò rỉ bộ nhớ.
- **M6** — Reset simulator được ghi rõ phạm vi (chỉ đưa con trỏ về IDLE, KHÔNG
  hoàn tác sensor/tồn kho đã sinh) trong code lẫn thông báo UI desktop.
- **L1** — Cờ "Cần xử lý" cho vai trò RESCUE bị gỡ (RESCUE chỉ đọc, chỉ có
  `MISSION_VIEW` và `MISSION_FIELD_UPDATE`), khớp state machine hiện tại; test cập nhật.
- **L2** — Desktop dời `setAuthed(true)` xuống sau khi bootstrap xong và thu hồi
  phiên nếu bootstrap hỏng → không kẹt trạng thái "đăng nhập một nửa".
- **L3** — Bật `sandbox: true` cho Electron `BrowserWindow` (preload không dùng
  Node API), thêm `contextIsolation: true` tường minh.
- **L5** — Gỡ khối prompt `_SITUATION_ANALYSIS_SYSTEM` mojibake bị khai báo trùng
  (bản ASCII giữ nguyên, không còn dead declaration).
- **L6** — `.env.example` đổi Redis host port `56380 → 16379` (tránh dải excluded
  TCP của Windows từng làm backend treo lúc start).
- **L4** — Giữ nguyên phòng thủ prompt cho `/explain` (chốt thiết kế: guard số học
  cứng dễ false-positive khi model reformat số hợp lệ; backend đã có template
  fallback khi AI lỗi).

Tài liệu đã được đồng bộ: PRD 11.1 (dòng mobile không còn "sau khi scaffold"),
COMPETITION-REHEARSAL (RESCUE ở chế độ chỉ đọc; thứ tự build bổ sung
`shared-types`/`scenario-definitions` trước consumer và dùng `jest --runInBand`).

Kết quả kiểm chứng sau vá (cùng phiên): **backend 94 suite / 557 test Pass**,
**AI pytest 74 Pass**, **shared coordination contract 9 Pass**, **frontend
mission-inbox 5 + map-marker-state 2 Pass**, **mobile state 13 Pass**, backend +
frontend + desktop build sạch, backend + desktop lint sạch. **M7** đóng một phần:
root `package.json` nay pin `"packageManager": "pnpm@10.32.1"` khớp CI; việc xóa
`package-lock.json` stale là thao tác phá hủy nên hoãn chờ duyệt. **M8** (tách
`mission.service.ts`) hoãn có chủ đích vì là refactor lớn rủi ro regression trước
bản thi. Mọi rehearsal device/LAN/clean-checkout/backup-restore vẫn **chưa** nghiệm
thu — xem §6–§7.

## 2. Ứng dụng thực sự làm gì

### 2.1 Backend và nghiệp vụ kho

- NestJS + Prisma/PostgreSQL quản lý tổ chức, kho, SKU/lô, nhập/xuất/điều chuyển,
  FEFO, kiểm kê, mượn-trả, damaged/lost, readiness và audit ledger.
- JWT access/refresh có rotation bằng `tokenVersion`, CAS khi refresh, revoke khi
  gọi logout, login rate limit, RBAC và warehouse/organization scope.
- Inventory/loan có transaction, row/advisory lock, CAS và mutation idempotency;
  hàng hỏng khi trả được tách thành lô `NEEDS_CHECK`, không nhập lại như hàng tốt.

### 2.2 Mission, realtime và điều phối

- REPORTER gửi báo cáo; ADMIN phân tích/lập phương án/duyệt; WAREHOUSE tiếp nhận và
  prepare theo từng SKU; RESCUE đọc mission và gửi field evidence đã tự xác nhận.
- Mỗi SKU có request riêng, allocation theo lô, claim token và export ledger trong
  cùng transaction. Socket.IO phân phòng theo tổ chức/role/kho và kiểm tra phiên.
- What-if dùng baseline immutable và chỉ ghi analysis snapshot; không mutation
  mission, inventory hoặc route vận hành.

### 2.3 Web, mobile và desktop

- Web Next.js có access token trong RAM, refresh cookie HttpOnly, React Query,
  navigation theo permission, inbox/deep-link, map Leaflet và local tile/OSRM.
- Mobile Expo/Android dùng SecureStore native, cache đọc bằng AsyncStorage,
  fail-closed khi mất LAN, QR/voice/field update và thao tác kho theo role. Không
  có offline mutation queue.
- Electron desktop mô phỏng cảm biến/kịch bản deterministic và hiển thị realtime.
  Đây là Digital Twin demo, không phải bằng chứng kết nối IoT vật lý.

### 2.4 AI service và shared contracts

- FastAPI cung cấp parse, situation analysis, field intent, explain, action plan,
  assistant RAG, semantic rank, briefing selection và PhoWhisper transcription.
- RAG theo evidence ID, có guard prompt injection, fallback deterministic và kiểm
  soát số ở các đường assistant/action-plan. Backend ghép AI extraction với dữ
  liệu vận hành đã kiểm chứng rồi lưu snapshot có provenance/version.
- TypeScript và Python vẫn duy trì hai bản contract, nên cần contract gate chéo và
  hiện còn một bất nhất đã xác nhận.

## 3. Điểm mạnh đã kiểm chứng trong source

1. **Auth web đúng hướng**: refresh token nằm trong cookie HttpOnly; access token
   chỉ ở memory; refresh rotation dùng CAS; logout backend tăng `tokenVersion`.
2. **RBAC hiện hành khớp vai trò**: REPORTER chỉ submit/xem báo cáo của mình;
   RESCUE xem mission và gửi field update; WAREHOUSE fulfillment; ADMIN phân tích,
   mô phỏng và duyệt.
3. **Inventory/loan có bảo vệ đồng thời**: scope tổ chức/kho, lock, idempotency,
   CAS và ledger cùng transaction; các kết luận cũ rằng loan thiếu các bảo vệ này
   không còn đúng với working tree hiện tại.
4. **Readiness có authorization theo actor và kho**, không chỉ dựa vào raw ID.
5. **Per-SKU prepare chống xuất trùng cùng request** bằng claim token và transaction;
   retry request đã `PREPARED` không export lần hai.
6. **AI boundary rõ**: AI chỉ trích xuất/xếp hạng/diễn giải; requirement,
   allocation, readiness, route và mutation do backend quyết định.
7. **Field assistant ưu tiên evidence**: nội dung đã được người dùng xem/sửa/xác
   nhận được commit trước AI enrichment; lỗi AI không làm mất evidence; không lưu
   raw audio, ảnh/video hoặc GPS liên tục.
8. **What-if cô lập**: baseline và simulation snapshot tách biệt, assumption có
   whitelist, reference không resolve được giữ `UNRESOLVED` thay vì đoán.
9. **Bản đồ offline trung thực**: mission dùng tile local; chỉ vẽ route khi có
   route geometry, không dùng đường thẳng giả như đường bộ.
10. **Liên xã được giữ đúng ranh giới**: chỉ là contact/reference có trạng thái
    availability `UNKNOWN`, không được tính vào tồn kho hoặc fulfillment.

## 4. Findings đã xác nhận và xếp hạng

### 4.1 High

#### H1. REPORTER có thể chọn kho thuộc tổ chức khác khi JWT không gắn kho

Route báo cáo truyền `dto.warehouseId` vào resolver chỉ với `warehouseId` trong
JWT. Nếu scope đó rỗng, resolver chấp nhận raw ID; `createReportDraft` chỉ kiểm tra
kho tồn tại, không so `organizationId` của reporter với kho. Một reporter có thể
tạo draft/notification trong tenant khác.

**Ảnh hưởng:** cross-organization write/IDOR, vi phạm tenant boundary.

**Cần đóng:** resolver phải nhận actor ID và gọi organization-scope assertion;
thêm regression test reporter-org-A → warehouse-org-B bị `403`, kể cả retry cùng
`requestId`.

**Đã đóng (2026-07-29):** `resolveReportWarehouseId` nay nhận `actorUserId` và bắt
buộc kho scope — cả kho chỉ định lẫn kho mặc định đều phải cùng `organizationId`
với người báo cáo, ngược lại trả `403`. Có suite regression cross-tenant mới
([mission-report-warehouse-scope.spec.ts](../apps/backend/src/mission/__tests__/mission-report-warehouse-scope.spec.ts))
xác nhận reporter-org-A → warehouse-org-B bị chặn kể cả khi retry cùng `requestId`.

**Bằng chứng source:**
[`mission.controller.ts:74-91`](../apps/backend/src/mission/mission.controller.ts#L74-L91),
[`mission.service.ts:233`](../apps/backend/src/mission/mission.service.ts#L233),
[`mission.service.ts:318`](../apps/backend/src/mission/mission.service.ts#L318).

#### H2. Hai SKU cuối prepare đồng thời có thể để mission kẹt `PENDING_WAREHOUSE`

Mỗi transaction finalize request của mình rồi đếm request chưa `PREPARED`. Không
có lock trên Mission trước phép đếm. Với PostgreSQL `READ COMMITTED`, hai
transaction cuối có thể không thấy thay đổi chưa commit của nhau, cùng đếm còn
một request, cùng commit export nhưng không transaction nào chuyển mission sang
`READY`.

**Ảnh hưởng:** tồn kho đã xuất và mọi SKU đã prepared nhưng workflow không tiến,
notification READY không phát.

**Cần đóng:** serialize finalization bằng `SELECT ... FOR UPDATE` trên Mission
(giống đường prepare legacy), hoặc một cơ chế finalize có invariant tương đương;
thêm PostgreSQL concurrency test thật cho hai request cuối.

**Đã đóng (2026-07-29):** `MissionWarehouseRequestService.prepare` nay giữ
`pg_advisory_xact_lock` trên `missionId` trước khi đếm request remaining, buộc phần
finalize per-SKU chạy tuần tự nên hai transaction cuối không thể cùng bỏ sót
chuyển `READY`; test khẳng định lock được lấy trước phép đếm.

**Bằng chứng source:**
[`mission-warehouse-request.service.ts:262-333`](../apps/backend/src/mission/mission-warehouse-request.service.ts#L262-L333).

#### H3. Operational secret mẫu dễ đoán nhưng vẫn qua validation

`.env.example` dùng `change_me_access` và `change_me_refresh`; validator hiện chỉ
kiểm tra dài tối thiểu 16 ký tự và hai secret khác nhau. Người vận hành copy file
mẫu có thể khởi động bằng signing key công khai.

**Ảnh hưởng:** có thể forge JWT nếu cấu hình mẫu được dùng nguyên trạng.

**Cần đóng:** placeholder phải không thể khởi động operational/production; dùng
marker rõ ràng và validator denylist/entropy policy, đồng thời tài liệu bắt buộc
generate secret.

**Đã đóng (2026-07-29):** env validation nay từ chối danh sách placeholder secret
công khai (`change_me_*`, `placeholder`, …) không phân biệt hoa/thường, nên cấu
hình mẫu không thể khởi động; tài liệu hướng dẫn generate secret thật.

**Bằng chứng source:** [`.env.example:15-16`](../.env.example#L15-L16),
[`env.validation.ts:9-36`](../apps/backend/src/config/env.validation.ts#L9-L36).

#### H4. Binding của backend không tuân theo guard `BIND_ADDRESS`

Demo validator yêu cầu `BIND_ADDRESS=127.0.0.1`, nhưng bootstrap gọi
`app.listen(port)` mà không truyền host. Guard vì vậy không chứng minh backend chỉ
listen loopback. Ngược lại, `.env.example` và Docker Compose mặc định
`BIND_ADDRESS=0.0.0.0`, có thể publish PostgreSQL/Redis ra mọi interface.

**Ảnh hưởng:** sai giả định isolation của demo và nguy cơ lộ data services trên
LAN/public interface.

**Cần đóng:** backend listen theo host đã validate; mặc định data services về
loopback; chỉ mở API trên private interface được chỉ định; thêm startup/port-scan
smoke test.

**Đã đóng (2026-07-29):** `main.ts` nay bind theo `resolveBindAddress` đã validate
— mặc định loopback, chỉ mở ra LAN khi cố ý đặt `BIND_ADDRESS=0.0.0.0`, và giá trị
rác bị chặn ngay lúc boot. *Còn lại (ngoài phạm vi code):* port-scan/firewall smoke
trên môi trường thật vẫn cần chạy tay theo checklist.

**Bằng chứng source:** [`main.ts:33-36`](../apps/backend/src/main.ts#L33-L36),
[`env.validation.ts:81-88`](../apps/backend/src/config/env.validation.ts#L81-L88),
[`.env.example:2-14`](../.env.example#L2-L14),
[`docker-compose.yml:10-25`](../infrastructure/docker-compose.yml#L10-L25).

#### H5. Desktop gửi credential ADMIN hard-coded tới host do người dùng nhập

Renderer chứa `admin` / `admin123@`, cho nhập host tùy ý và tự gửi credential qua
URL được chuẩn hóa thành HTTP nếu thiếu scheme. Endpoint nhầm hoặc độc hại có thể
thu credential seed; HTTP LAN cũng không bảo vệ credential khỏi nghe lén.

**Ảnh hưởng:** lộ tài khoản quản trị demo và khuyến khích tái sử dụng credential
công khai.

**Cần đóng:** không nhúng password; dùng credential nhập lúc chạy hoặc scoped
simulator token/account; allowlist endpoint/demo stack; ưu tiên HTTPS/tunnel an
toàn và rotate mọi seed credential trước release.

**Đã đóng (2026-07-29):** desktop bỏ credential ADMIN hard-coded, chuyển sang ô nhập
email/mật khẩu lúc chạy (prefill tùy chọn qua `RENDERER_VITE_*`, rỗng khi đóng
gói) nên không còn `admin`/`admin123@` nhúng trong renderer. *Còn lại (ngoài phạm
vi code):* rotate seed credential và ưu tiên HTTPS/tunnel là bước vận hành trước
release.

**Bằng chứng source:**
[`App.tsx:46-50`](../apps/desktop/src/renderer/App.tsx#L46-L50),
[`App.tsx:93-104`](../apps/desktop/src/renderer/App.tsx#L93-L104),
[`App.tsx:277-293`](../apps/desktop/src/renderer/App.tsx#L277-L293).

#### H6. Clean-checkout CI chưa chứng minh build order của workspace package

`@safestock/shared-types` và `@safestock/scenario-definitions` publish entry từ
`dist`, trong khi `dist` không được commit. CI chạy backend test/build trước bước
build rõ ràng cho shared types và không có bước build scenario definitions.
Working tree cục bộ có thể che lỗi bằng artifact cũ.

**Ảnh hưởng:** checkout sạch có thể fail hoặc dùng artifact không tương ứng source;
claim “CI đã đóng” chưa có đủ evidence.

**Cần đóng:** thêm build topo rõ ràng trước consumer hoặc cấu hình package source
đúng với workspace toolchain; chạy CI từ checkout sạch không có `dist` và lưu log.

**Đã đóng (2026-07-29):** `competition-quality.yml` nay build
`@safestock/shared-types` và `@safestock/scenario-definitions` ngay sau `install`,
trước mọi consumer (backend/frontend build). Workflow đã commit/push và **CI remote
chạy xanh toàn bộ trên checkout sạch** — run `30462985652` (SHA `ad20964`), cả hai
job `Node, web, mobile and desktop` và `AI service contracts` đều `success`. Đây là
evidence clean-checkout thật (không có `dist`/`@prisma/client` generated sẵn) mà H6
yêu cầu.

Vòng lặp clean-checkout này lần lượt phơi bày và vá **3 lỗi mà preflight local về
cấu trúc không bắt được** (local đã có sẵn pnpm, `apps/backend/.env`, và Prisma
client generated):

1. **`setup-node` không thấy pnpm** — bước `cache: pnpm` gọi `pnpm store path`
   trước khi corepack cài pnpm → chuyển bước corepack lên trước `setup-node`
   (commit `e1a469b`).
2. **`prisma validate` thiếu `DATABASE_URL`** — CI không có `apps/backend/.env`
   (gitignored) → thêm placeholder scope theo step (commit `4b174dc`).
3. **`@prisma/client` là stub** — repo không có `postinstall` hook nên các enum
   sinh từ schema (`MissionStatus`, `LoanStatus`, `UserRole`, `NotificationKind`,
   `TransactionSource`) và thành viên namespace `Prisma` (`InputJsonValue`,
   `DbNull`, `PrismaClientKnownRequestError`) không tồn tại → ~20 test suite backend
   fail compile ("Test suite failed to run"). Thêm bước `prisma generate` tường minh
   sau install (commit `ad20964`).

**Bằng chứng source:**
[`competition-quality.yml:35-52`](../.github/workflows/competition-quality.yml#L35-L52),
[`packages/shared-types/package.json:5-10`](../packages/shared-types/package.json#L5-L10),
[`packages/scenario-definitions/package.json:5-10`](../packages/scenario-definitions/package.json#L5-L10).

### 4.2 Medium

#### M1. Mutation narrative dùng quyền chỉ-đọc `MISSION_VIEW`

`POST :id/action-plan` ghi `mission.actionPlan`; `POST :id/explain` ghi
`mission.explanation`, nhưng cả hai chỉ yêu cầu `MISSION_VIEW`. RESCUE và WAREHOUSE
có quyền này nên có thể ghi đè narrative dù vai trò không được lập phương án.

**Cần đóng:** dùng `MISSION_ANALYZE`/quyền mutation riêng và thêm permission tests.

**Đã đóng (2026-07-29):** `POST :id/action-plan` và `POST :id/explain` nay yêu cầu
`MISSION_ANALYZE` (chỉ ADMIN có), không còn `MISSION_VIEW`; RESCUE/WAREHOUSE mất khả
năng ghi đè narrative. Có test permission khẳng định phân quyền mới.

**Bằng chứng source:**
[`mission.controller.ts:332-350`](../apps/backend/src/mission/mission.controller.ts#L332-L350).

#### M2. Mobile và desktop logout chỉ xóa local token

Web gọi backend logout, nhưng mobile chỉ xóa SecureStore/cache và desktop chỉ xóa
biến memory. Refresh token đã cấp vẫn hợp lệ cho tới rotation, login khác hoặc hết
hạn.

**Cần đóng:** gọi `/api/auth/logout` trước khi xóa local state; nếu mất LAN, ghi rõ
logout cục bộ chưa revoke và revoke ở lần kết nối sau hoặc có chính sách phù hợp.

**Đã đóng (2026-07-29):** mobile thêm `logout(token)` gọi `POST /api/auth/logout`
(Bearer, timeout 10s) trước `clearStoredSession`/`clearOfflineCache`; desktop thêm
`logoutServer()` gọi cùng endpoint trước khi xóa memory session. Cả hai best-effort:
mất LAN vẫn xóa phiên cục bộ, revoke phía server bỏ qua lỗi mạng.

**Bằng chứng source:** [`App.tsx:118-123`](../apps/mobile/App.tsx#L118-L123),
[`desktop App.tsx:243-254`](../apps/desktop/src/renderer/App.tsx#L243-L254).

#### M3. AI client thiếu timeout và cache có thể tăng vô hạn

Mọi `fetch` tới FastAPI không có `AbortSignal`; parse/action-plan dùng `Map` không
TTL/size cap. AI service treo có thể giữ request backend, input duy nhất lặp lại có
thể làm tăng memory.

**Cần đóng:** timeout theo operation, retry có giới hạn khi an toàn, LRU/TTL và
metric hit/eviction.

**Đã đóng (2026-07-29):** `post()` thêm `AbortController` với timeout cấu hình qua
`AI_SERVICE_TIMEOUT_MS` (mặc định 15s), `clearTimeout` trong `finally`; cache parse
và action-plan qua `cacheSet` chặn ở `MAX_CACHE_ENTRIES=200` (evict FIFO oldest).
Retry có giới hạn và metric hit/eviction đầy đủ vẫn để lại như cải tiến sau.

**Bằng chứng source:**
[`ai-client.service.ts:15-18`](../apps/backend/src/ai/ai-client.service.ts#L15-L18),
[`ai-client.service.ts:118-129`](../apps/backend/src/ai/ai-client.service.ts#L118-L129).

#### M4. Contract Python cho phép inference thiếu `confidence`

Pydantic khai báo `confidence` optional và validator `AI_INFERENCE` không bắt buộc
trường này, trong khi TypeScript `InferredCoordinationFact` và runtime validator
đòi xác suất 0..1. Payload hợp lệ ở FastAPI có thể bị backend từ chối.

**Cần đóng:** bắt buộc confidence cho `AI_INFERENCE` ở Python và thêm golden
cross-language negative/positive tests.

**Đã đóng (2026-07-29):** `model_validator` của `SituationExtractedFact` nay raise
`ValueError` khi `AI_INFERENCE` thiếu `confidence`, khớp `InferredCoordinationFact`
(TS) đòi xác suất 0..1 — payload không còn hợp lệ ở FastAPI rồi bị backend từ chối.
*Còn lại (cải tiến sau):* bộ golden cross-language đầy đủ.

**Bằng chứng source:** [`schemas.py:77-105`](../apps/ai-service/schemas.py#L77-L105),
[`coordination.ts:84-91`](../packages/shared-types/src/coordination.ts#L84-L91).

#### M5. FastAPI không có service authentication

Các route FastAPI không xác thực caller. Windows launcher bind loopback, nhưng
`scripts/ai-dev.mjs` lại bind `0.0.0.0`. Nếu dùng lệnh dev trên LAN, endpoint LLM
và transcription đắt tiền bị mở cho mọi client tới được cổng.

**Cần đóng:** mặc định loopback, chỉ mở private interface có chủ đích; thêm
service token/mTLS hoặc reverse proxy auth trước mọi non-loopback deployment.

**Đã đóng (2026-07-29):** `ai-dev.mjs` nay mặc định bind `127.0.0.1`, chỉ phơi LAN
khi cố ý đặt `AI_SERVICE_HOST=0.0.0.0` — dev launcher không còn tự mở `0.0.0.0`.
*Còn lại (ngoài phạm vi code):* service token/mTLS hoặc reverse-proxy auth vẫn cần
cho mọi triển khai non-loopback.

**Bằng chứng source:**
[`ai-dev.mjs:26-28`](../scripts/ai-dev.mjs#L26-L28),
[`run-ai-service.ps1:29`](../infrastructure/windows/run-ai-service.ps1#L29).

#### M6. Reset simulator không hoàn tác tác động đã sinh

Reset chỉ đưa run về `IDLE` và `cursorMs=0`; sensor event, incident, device value,
readiness hoặc inventory side effect đã phát vẫn còn. UI báo “Đã reset kịch bản”
dễ khiến rehearsal tưởng dữ liệu về baseline.

**Cần đóng:** đổi nhãn thành reset con trỏ, hoặc triển khai reset demo có scope và
transaction rõ; không dùng nó thay DB snapshot/restore.

**Đã đóng (2026-07-29):** chọn phương án ghi rõ phạm vi thay vì partial-rollback rủi
ro (tác động trải nhiều bảng, chỉ `sensorEvent` gắn `runId`, loadcell/incident thì
không → rollback từng phần dễ desync). `reset()` thêm doc-comment nêu chỉ đưa con
trỏ về `IDLE`/`cursorMs=0`; UI desktop đổi log thành “Đã reset con trỏ kịch bản (dữ
liệu đã sinh vẫn giữ). Tạo run mới nếu cần dữ liệu sạch.”

**Bằng chứng source:**
[`runner.service.ts:200-213`](../apps/backend/src/simulation/runner.service.ts#L200-L213),
[`desktop App.tsx:232-240`](../apps/desktop/src/renderer/App.tsx#L232-L240).

#### M7. Package manager và lockfile chưa thống nhất

Repo dùng pnpm nhưng chưa khóa `packageManager` tại root; policy
`onlyBuiltDependencies` không đồng nhất; `package-lock.json` stale mô tả Expo khác
với app thực. Nhiều TypeScript version cũng làm tăng sai khác local/CI.

**Cần đóng:** chọn pnpm là nguồn duy nhất, pin version, bỏ hoặc regenerate npm
lock theo quyết định có chủ đích, hợp nhất build policy và ghi rõ ngoại lệ Expo.

**Đã đóng (2026-07-29):** thêm `"packageManager": "pnpm@10.32.1"` tại root
`package.json` để local khớp đúng version corepack mà CI đang pin — loại sai khác
local/CI do pnpm khác version. `package-lock.json` stale (npm `lockfileVersion: 3`
khai báo `expo ^57.0.7` không còn tồn tại ở root, không được CI/scripts tham chiếu)
đã được gỡ khỏi repo sau khi người dùng phê duyệt — pnpm (`pnpm-lock.yaml`) là
nguồn khóa dependency duy nhất.

#### M8. `mission.service.ts` quá lớn và còn đường workflow legacy song song

Service khoảng 1.700 dòng chứa nhiều trách nhiệm và cả prepare theo mission lẫn
prepare per-SKU. Hai đường cùng tồn tại làm tăng khả năng invariant/authorization
khác nhau và khó review concurrency.

**Cần đóng:** xác định API canonical, deprecate đường legacy, tách orchestration,
queries, transitions và persistence theo boundary có test.

**Quyết định (2026-07-29):** hoãn có chủ đích. Đây là refactor kiến trúc lớn, rủi ro
regression cao ngay trước bản thi; tách service phải kèm bộ test concurrency/authorization
mới để không đổi hành vi. Không thực hiện trong phiên fix end-to-end này; giữ nguyên
đường canonical hiện hành (đã có test prepare/report atomic phủ) và ghi nợ kỹ thuật.

### 4.3 Low

#### L1. Inbox vẫn đánh dấu action cho RESCUE theo transition legacy

`missionNeedsAction` coi `PENDING_RESCUE`/`READY` là action của RESCUE, trong khi
luồng hiện hành chỉ cho RESCUE gửi evidence và không confirm/complete transition.
Đây chủ yếu là sai sorting/attention label, không phải bypass backend.

**Đã đóng (2026-07-29):** nhánh RESCUE của `missionNeedsAction` trả `false`; test
`mission-inbox-state` cập nhật theo.

#### L2. Desktop có thể vào trạng thái authenticated một phần

Renderer set `authed=true` ngay sau login, trước khi tải warehouse/device/scenario.
Bootstrap sau đó fail vẫn để UI ở trạng thái đăng nhập dở dang.

**Đã đóng (2026-07-29):** `setAuthed(true)` dời xuống sau khi bootstrap thành
công; nhánh catch gọi `logout()` + reset state để không kẹt nửa vời.

#### L3. Electron tắt sandbox

Context isolation đang bật và chưa expose preload API đáng kể, nhưng
`sandbox=false` làm giảm defense-in-depth. Cần bật lại nếu dependency/runtime cho
phép, đặc biệt trước khi renderer nhận nội dung ngoài kiểm soát.

**Đã đóng (2026-07-29):** đặt `sandbox: true` + `contextIsolation: true`; preload
không dùng Node API nên bật sandbox không phá chức năng (typecheck/build sạch).

#### L4. `/explain` dựa chủ yếu vào prompt để không thêm số

Assistant và action-plan có numeric validation rõ hơn; explain chưa có hậu kiểm
unsupported number tương đương. Input hiện do backend dựng nên giảm rủi ro, nhưng
output vẫn nên được validate trước khi ghi mission.

**Chốt thiết kế (2026-07-29):** giữ phòng thủ ở mức prompt. Guard số học cứng dễ
false-positive khi model reformat số hợp lệ (`90%`, `1.000`); backend đã có
template fallback khi AI lỗi nên rủi ro thực tế thấp.

#### L5. AI service có khai báo prompt mojibake bị khai báo lại

Khai báo sau đang ghi đè nên chưa thấy lỗi runtime, nhưng dead declaration/encoding
làm review khó và có thể tái xuất hiện khi refactor.

**Đã đóng (2026-07-29):** gỡ khối `_SITUATION_ANALYSIS_SYSTEM` mojibake bị trùng;
chỉ còn bản ASCII duy nhất (pytest 74 Pass).

#### L6. Redis host port 56380 không bền trên Windows

Port trong `.env.example` có thể rơi vào excluded TCP range thay đổi theo máy;
đã có trường hợp backend treo startup tại môi trường Windows. Chọn port local ổn
định đã kiểm tra (ví dụ 16379) và preflight port trước khi start.

**Đã đóng (2026-07-29):** `.env.example` đổi Redis host port sang `16379` kèm chú
thích về dải excluded TCP của Windows (profile demo giữ port riêng đã pin).

## 5. Mức hoàn thiện theo subsystem

| Subsystem | Đánh giá | Gate còn mở |
| --- | --- | --- |
| Backend core/inventory/loan/readiness | Cao (H3/H4/H6 đã đóng) | Rerun full unit/E2E và migration/restore trên clean environment. |
| Mission/concurrency | Khá cao (H1/H2/M1 đã đóng) | Test PostgreSQL concurrency và tenant regression trên môi trường thật. |
| Web | Gần hoàn thiện source (L1 đã đóng) | Browser acceptance đủ role, cookie/session, map và error state. |
| Mobile Android | Feature source/APK path có (M2 đã đóng) | Fresh install S23 Ultra, LAN-offline/recovery, permission/voice/QR evidence. |
| AI service | Boundary tốt (M3/M4/M5/L5 đã đóng; L4 chốt prompt-level) | Full pytest từ đúng cwd, live-model/RAG calibration khi model/corpus đổi. |
| Desktop simulator | Đã kiểm chứng realtime + SMTP trực tiếp (H5/M2/M6/L2/L3 đã đóng; slider + kịch bản → sensor_event/incident realtime trên demo 3110; incident mới → email thật gửi qua Resend, đã hoàn nguyên invariant tắt mail) | Package portable artifact, firewall/port scan, backup-restore. |
| Infrastructure/shared packages | Có compose/OSRM/CI (H3/H4/H6/L6 đã đóng) | M7/M8 refactor; firewall/port scan, backup-restore, reboot và clean-checkout evidence. |

## 6. Trạng thái kiểm chứng trong phiên audit

### Passed

- Backend focused Jest: **6 suites, 73 tests**.
  - environment validation;
  - auth session rotation;
  - permission matrix;
  - per-SKU warehouse request;
  - report hardening;
  - What-if service.
- Shared coordination contract: **9 tests**.

- Focused AI pytest chạy từ đúng `apps/ai-service`: **7 tests Pass**
  (`test_situation_analysis.py`, `test_field_update_intent.py`).

- **Kiểm chứng trực tiếp bằng ứng dụng thật (BrowserOS + Electron, backend demo
  `SAFESTOCK_RUNTIME=demo` cổng 3110 — không đụng stack vận hành 3110):**
  - **Desktop simulator (Electron `apps/desktop`, chạy từ bản build `out/` thật):**
    đăng nhập admin tới host `127.0.0.1:3110`, WebSocket báo *“Realtime đang chạy”*,
    mở kho “Kho xã Đồng Xuân”. **Luồng 1 — chỉnh tay:** kéo slider
    *Cảm biến nhiệt độ A* lên 46°C → nhật ký realtime nhận `temp_A = 46°C
    (TEMP_READING)`, điểm sẵn sàng tụt 94→89, cảnh báo *“Điều kiện bảo quản không
    đạt”* kèm giải thích AI *“nhiệt độ đạt 39.9°C, vượt ngưỡng an toàn 35°C”*.
    **Luồng 2 — kịch bản:** chạy *“Nhiệt tăng dần (cảnh báo sớm)”* (`heat_drift`)
    x10 → realtime tuôn `temp_B` 28→30→31.5→33→34°C và bật cảnh báo dự đoán sớm
    *“Dự đoán temp_B sẽ vượt ngưỡng — Nghiêm trọng, độ tin cậy 80%”*. Ảnh:
    `DESK-02-dashboard`, `DESK-03-after-temp`, `DESK-05-scenario-settled`.
  - **Mobile Expo Web (REPORTER, phạm vi xã):** trưởng thôn gửi báo cáo commune-scope
    *“Thôn Long Châu: mưa lớn gây ngập cục bộ, 15 hộ dân vùng trũng cần nước sạch và
    áo phao”* → `POST /api/missions/report` HTTP 201; ADMIN thấy Mission DRAFT +
    Notification `INCIDENT_REPORTED` (cross-role verified). Diacritics byte-perfect.
  - **Offline / backend-down:** cắt mọi `/api/**` giữa phiên (không reload) rồi điều
    hướng client-side → app degrade gracefully (*“Kết nối dữ liệu đang gián đoạn.
    Vui lòng thử lại sau ít phút”* + nút thử lại), không crash, không văng login;
    bản đồ offline cụm Đồng Xuân vẫn render khi không có backend.

### Failed

- Lần chạy focused pytest đầu tiên từ repository root dừng ở collection với
  `ModuleNotFoundError: No module named 'main'`. Đây là lỗi working directory của
  lệnh audit; sau khi chạy lại từ đúng thư mục, 7 test mục tiêu đã Pass.

### Not run / chưa có bằng chứng mới trong phiên này

- Full backend unit/E2E, full frontend/mobile/desktop build, production audit,
  Prisma migration on clean database và toàn bộ GitHub Actions từ checkout sạch.
- Full AI pytest, live Ollama/PhoWhisper/GPU evaluation.
- Samsung Galaxy S23 Ultra fresh install, APK signer/SHA, private-LAN with public
  Internet off, complete four-role UI flow, LAN-loss recovery.
- Desktop → realtime alert → **SMTP đã kiểm chứng trong phiên**: slider + kịch bản
  → `sensor_event`/`incident` realtime, và một lượt bật mail tạm trên runtime demo đã
  gửi **email thật** tới hộp thư quản trị (log `AlertMailService`:
  `Đã gửi email cảnh báo "Điều kiện bảo quản không đạt" tới 1 người nhận`, dùng
  fallback `ALERT_EMAIL_TO`; AI service tắt nên nội dung là bản rule-based — đúng cơ
  chế fail-safe). Sau kiểm chứng đã **hoàn nguyên** `.env.demo` về invariant
  `ALERT_EMAIL_ENABLED=false` (guard demo cấm bật mail) và xoá script/khoá tạm.
- Còn thiếu: đóng gói portable artifact, firewall/port scan, backup-restore,
  reboot/autostart và pilot.

## 7. Phán quyết readiness

Sau khi vá blocker (§1.1):

- **Source:** H1–H6 và M1/M4/M5 đã đóng bằng code + test trong phiên. Toàn bộ
  automated gate được chạy lại trong phiên **Pass** (backend 557, AI 74, shared 9;
  build/typecheck/lint sạch). Đây là điều kiện cần cho nhãn chất lượng cao, nhưng
  **vẫn chưa phải bằng chứng “100/100” tuyệt đối**: cần một lượt CI đầy đủ từ
  **clean checkout** (không dựa vào `dist/` đã build cục bộ), full E2E và
  migration-restore trên môi trường sạch. Còn M2/M3/M6/M7/M8 (không phải blocker
  thi) vẫn mở.
- **Competition rehearsal:** vẫn **no-go cho tới khi có bằng chứng thiết bị/LAN**.
  Source gate nay sạch, nhưng bảng ký trong runbook cần **hai lượt Pass trên cùng
  commit/artifact**: fresh install APK (Galaxy S23 Ultra, signer/SHA), luồng bốn
  vai trò, private-LAN với Internet tắt, khôi phục khi mất LAN. Mắt xích
  **desktop→realtime→SMTP đã được kiểm chứng lẻ trong phiên** (email cảnh báo thật
  gửi thành công), nhưng vẫn cần chạy lại trong một lượt rehearsal đủ trên thiết bị
  thật để tính vào bảng ký. Các evidence còn lại chưa có trong phiên này.
- **Public production:** **no-go**; cần thêm firewall/port-scan, backup-restore,
  observability, reboot/autostart và pilot thực tế.

**Đánh giá khách quan “đã tốt nhất để đem đi thi chưa”:** về **chất lượng source
và automated gate**, ứng dụng nay ở trạng thái tốt — mọi blocker đã biết được vá
và test lại xanh. Nhưng “sẵn sàng thi” của một hệ thống điều phối realtime **không
kết luận được chỉ từ source**: phần quyết định điểm là **rehearsal có bằng chứng
trên thiết bị thật + private LAN** và **một lượt CI clean-checkout**. Hai việc này
chưa làm, nên trạng thái đúng nhất là: *sẵn sàng về mã nguồn, chưa sẵn sàng đã được
nghiệm thu* — cần chạy đúng runbook rehearsal trước ngày thi để chốt go/no-go.

## 8. Đề xuất quản trị tài liệu

Inventory audit xác định **61 tài liệu Markdown do dự án quản lý** (theo phạm vi
root/apps/docs/infrastructure/plans/tasks; loại dependency, venv, cache, `.expo`,
local agent/memory). Số dòng là số động và phải đo lại sau mỗi lần sửa/merge, nên
không dùng làm acceptance metric. Quy tắc: chỉ PRD là product scope/status;
report này là assessment; rehearsal là runbook/evidence. README chỉ là gateway.

### KEEP — 43 file

Giữ nguyên vai trò lâu dài, nhưng sửa mâu thuẫn nội dung khi cần:

1. `AGENTS.md`;
2. `README.md`;
3. `THIRD_PARTY_NOTICES.md`;
4. `apps/ai-service/README.md`;
5. `apps/frontend/README.md`;
6. `apps/mobile/README.md`;
7. `docs/PRD.md`;
8. `docs/bao-cao-danh-gia-san-sang-du-thi.md`;
9. `docs/COMPETITION-REHEARSAL.md`;
10. `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md`;
11. `docs/HUONG-DAN-TEST.md`;
12. `docs/SEED-DATASET.md`;
13. `docs/CONTRIBUTING.md`;
14. `docs/BAN-MO-TA-Y-TUONG.md`;
15. `docs/DANH-MUC-THAM-CHIEU-TUYEN-AI-WHAT-IF.md`;
16. `docs/DANH-MUC-VI-TRI-KHO-XA-VA-KHO-THON.md`;
17. `infrastructure/osrm/data/README.md`;
18. `docs/adr/ADR-001-daily-inventory-integrity.md`;
19. `docs/adr/ADR-002-verified-warehouse-and-external-reference-boundary.md`;
20. `docs/adr/ADR-003-notification-organization-boundary.md`;
21. `docs/adr/ADR-004-per-sku-warehouse-preparation.md`;
22. `docs/knowledge/README.md`;
23. `docs/knowledge/an-toan-luong-thuc-va-dinh-duong.md`;
24. `docs/knowledge/dinh-muc-cuu-tro.md`;
25. `docs/knowledge/noi-o-khan-cap-va-bao-ve.md`;
26. `docs/knowledge/phan-loai-uu-tien-nan-nhan.md`;
27. `docs/knowledge/quy-trinh-ung-pho-bao-lu.md`;
28. `docs/knowledge/so-cuu-co-ban.md`;
29. `docs/knowledge/tieu-chuan-sphere.md`;
30. `docs/knowledge/ve-sinh-nuoc-va-phong-benh.md`;
31. `docs/qa/README.md`;
32. `docs/qa/ollama-qwen-evaluation.md`;
33. `docs/qa/ollama-qwen35-4b-evaluation.md`;
34. `docs/qa/phase-a-nen-tang.md`;
35. `docs/qa/phase-a2-rbac.md`;
36. `docs/qa/phase-b-simulator.md`;
37. `docs/qa/phase-bp-nhap-xuat-da-nguon.md`;
38. `docs/qa/phase-c-readiness.md`;
39. `docs/qa/phase-d-mission.md`;
40. `docs/qa/phase-e-incident.md`;
41. `docs/qa/phase-g-bp5-chatbot-backup.md`;
42. `docs/qa/phase-m-normal-mode.md`;
43. `docs/qa/tong-quan.md`.

Các file `docs/qa/` được giữ như evidence/Q&A lịch sử, có nhãn
non-authoritative; chúng không được dùng để ghi đè status hiện tại.

### MERGE — 6 file

Trích nội dung bền vững vào PRD/report/runbook/ADR tương ứng, sau đó mới đề xuất
xóa source file ở một thay đổi riêng:

1. `docs/AI-COORDINATION-IMPLEMENTATION.md` → report + PRD/ADR AI boundary.
2. `docs/BAN-GIAO-CHENH-LECH-SO-VOI-GITHUB.md` → runbook release/migration và
   cảnh báo bảo toàn working tree.
3. `docs/PM-REVIEW-QUAN-LY-KHO-NGAY-THUONG.md` → PRD acceptance criteria + report.
4. `tasks/spec.md` → PRD scope/boundaries.
5. `tasks/plan.md` → PRD open gates + rehearsal sequence.
6. `tasks/todo.md` → PRD/rehearsal checklist chưa đóng.

### DELETE sau khi merge và có phê duyệt — 10 file

Đây là planning/journal lịch sử của cùng một readiness week; trạng thái đã stale
và đang cạnh tranh với PRD/report/runbook:

1. `plans/260726-1857-competition-readiness-week/plan.md`;
2. `plans/260726-1857-competition-readiness-week/phase-01-start.md`;
3. `plans/260726-1857-competition-readiness-week/phase-02-tenant-isolation-and-data-safety.md`;
4. `plans/260726-1857-competition-readiness-week/phase-03-deterministic-quality-gates.md`;
5. `plans/260726-1857-competition-readiness-week/phase-04-mission-inbox-and-demo-workflow.md`;
6. `plans/260726-1857-competition-readiness-week/phase-05-demo-resilience-and-judge-experience.md`;
7. `plans/260726-1857-competition-readiness-week/phase-06-release-freeze-rehearsal-and-submission.md`;
8. `plans/260726-1857-competition-readiness-week/phase-07-android-apk-and-lan-offline-foundation.md`;
9. `plans/260726-1857-competition-readiness-week/phase-08-surrounding-communes-metadata-and-map.md`;
10. `plans/260726-1857-competition-readiness-week/phase-09-ai-multi-warehouse-dispatch-map-routing.md`.

### ARCHIVE hoặc DELETE sau khi merge và có phê duyệt — 2 file

Hai file sau có giá trị truy vết lịch sử nhưng không phải tài liệu vận hành. Nếu
repo không có chính sách archive, đề xuất DELETE sau khi trích evidence duy nhất:

- `plans/260726-1857-competition-readiness-week/reports/pm-260726-phase-09-dispatch-slice.md`;
- `plans/journals/260726-phase-09-dispatch-foundation.md`.

> **Chưa xóa hoặc merge vật lý file nào trong audit này.** Tổng số ở các nhóm có
> chồng bước có chủ đích: 6 file MERGE sẽ trở thành ứng viên delete sau khi nội
> dung được hấp thụ; 10 + 2 planning file là ứng viên cleanup. Mọi bulk cleanup
> cần phê duyệt exact path trước.

## 9. Thứ tự xử lý đề xuất

1. Vá H1 và thêm tenant regression test.
2. Serialize final per-SKU preparation, thêm PostgreSQL race test H2.
3. Đóng H3–H5: secret, bind/network và desktop credential/session.
4. Sửa build graph H6 và chứng minh clean-checkout CI.
5. Đóng M1–M7, chạy lại focused/full gates đúng working directory.
6. Sửa PRD/runbook: bỏ claim 100/100, bỏ bước RESCUE “xác nhận/bàn giao”, thống
   nhất source gate build order.
7. Chạy hai rehearsal có evidence; chỉ sau đó ký Go.
8. Trình duyệt exact documentation diff; chỉ merge/delete tài liệu sau phê duyệt.

## 10. Câu hỏi còn bỏ ngỏ

- Chọn **archive** hay **delete** cho hai report/journal lịch sử ở mục 8?
- Desktop simulator sẽ dùng scoped service token, tài khoản simulator riêng hay
  form nhập credential lúc chạy?
- Deployment thi sẽ bind backend vào IP private-LAN cụ thể hay đi qua reverse
  proxy/tunnel HTTPS?

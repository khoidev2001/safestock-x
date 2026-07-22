# Báo cáo audit toàn dự án - 2026-07-21

## 1. Mục đích và phạm vi

Tài liệu này là bản đánh giá độc lập, khó tính và bám theo trạng thái source tại
ngày 2026-07-21. Đây là **audit snapshot**, không thay thế PRD, roadmap hoặc tài
liệu kiến trúc chính thức.

Phạm vi đã kiểm tra:

- Toàn bộ 46 file Markdown/MDX trong repository.
- Backend NestJS, Prisma schema, seed, các rule engine và test hiện có.
- AI service FastAPI, Pydantic schema, Gemini/Ollama provider.
- Frontend Next.js, API client, auth state, dashboard và các workflow theo role.
- Mobile placeholder, shared packages, Docker Compose và Windows autostart.
- Build, test, coverage, Prisma validation và dependency audit.

Audit được thực hiện trên worktree đang có thay đổi chưa commit. Không file source
nào được sửa hoặc hoàn tác trong quá trình review.

## 2. Kết luận điều hành

Dự án có lõi kỹ thuật thật và ý tưởng sản phẩm tốt, đặc biệt ở Readiness,
Mission-to-Kit, rule engine và cách giới hạn vai trò của LLM. Tuy nhiên, dự án
**chưa phải MVP hoàn chỉnh theo chính PRD**.

Nếu chỉ đếm endpoint và component, dự án có thể trông như đã hoàn thành khoảng
70-75%. Nếu chấm theo khả năng cán bộ thực sự vận hành và chạy đúng kịch bản demo
5-7 phút trong PRD, mức hoàn thành thực tế chỉ khoảng **45-55%**.

Đánh giá trạng thái:

| Thành phần | Trạng thái thực tế |
|---|---|
| Backend rule/algorithm | Có nhiều phần thật, demo được theo lát cắt riêng |
| Backend nghiệp vụ dữ liệu | Còn lỗi scope, concurrency và atomicity nghiêm trọng |
| Frontend web | Presentation-ready một phần, chưa workflow-ready |
| AI service | Dùng được với Gemini/Ollama, thiếu hardening và automated test |
| Mobile | Chưa triển khai |
| Offline/deployment | Có thiết kế và script nền, chưa acceptance-test đầy đủ |
| Toàn bộ MVP theo PRD | Chưa hoàn thành |
| Production Internet | Chưa an toàn để mở trực tiếp |

## 3. Các blocker nghiêm trọng

### CRITICAL-01 - Simulator có thể làm sai tồn kho thật

Simulator mutation chỉ yêu cầu JWT, không yêu cầu permission riêng hoặc warehouse
scope. Một user đã đăng nhập có thể gửi sensor event cho thiết bị/kho tùy ý.
Loadcell event sau đó gọi inventory import/export bằng danh tính admin đầu tiên.

Evidence:

- `apps/backend/src/simulation/simulation.controller.ts:24`
- `apps/backend/src/simulation/simulation.controller.ts:43`
- `apps/backend/src/simulation/simulation.controller.ts:54`
- `apps/backend/src/simulation/simulation.service.ts:94`
- `apps/backend/src/simulation/simulation.service.ts:181`

Tác động:

- RESCUE có thể tăng/giảm tồn của kho khác.
- Audit ghi sai người thực hiện.
- Readiness và phương án điều phối bị tính trên dữ liệu bị giả mạo.

Yêu cầu sửa:

- Production-disable simulator mutations hoặc tách simulator database/tenant.
- Thêm permission riêng và scope kho.
- Không dùng admin thật làm system actor.
- Không cho client-driven simulator signal tự động thay đổi tồn production.

### CRITICAL-02 - Transfer không thực sự chuyển theo số lượng

API nhận `quantity`, nhưng service đổi `shelfId` của toàn bộ batch. Giá trị
`quantity` chỉ được ghi vào transaction và audit.

Evidence:

- `apps/backend/src/inventory/inventory.controller.ts:47`
- `apps/backend/src/inventory/inventory.service.ts:137`
- `apps/backend/src/inventory/inventory.service.ts:144`

Request chuyển 1 đơn vị có thể di chuyển toàn bộ batch 1.000 đơn vị sang kệ hoặc
kho khác. Source và destination warehouse cũng chưa được authorize đầy đủ.

Contract phải được chốt thành một trong hai hướng:

1. Chỉ chuyển toàn batch và loại bỏ `quantity`.
2. Chuyển một phần bằng cách transactionally tách batch mới.

### CRITICAL-03 - Workflow đa role không tồn tại end-to-end trên web

`missionId` chỉ nằm trong React local state của phiên ADMIN. Backend không có
mission inbox/list theo role/trạng thái. Notification hiển thị text nhưng không
mở mission.

Evidence:

- `apps/frontend/src/components/mission/mission-view.tsx:49`
- `apps/backend/src/mission/mission.controller.ts:42`
- `apps/frontend/src/components/mission/notification-bell.tsx:78`
- `apps/frontend/ROADMAP.md:43`

Kết quả thực tế:

- ADMIN tạo và dispatch mission.
- RESCUE đăng nhập phiên khác thấy "Chưa có nhiệm vụ".
- WAREHOUSE cũng không có inbox để chuẩn bị mission.
- Luồng chỉ chạy nếu giữ state cũ hoặc thao tác bằng API/script.

FE-K không nên được coi là hoàn thành cho tới khi có inbox, deep-link và browser
E2E qua ba tài khoản thật.

### CRITICAL-04 - Web trả vật tư sai API contract

Frontend gửi:

```json
{ "returnedOk": 1, "returnedDamaged": 0, "lost": 0 }
```

Backend yêu cầu:

```json
{ "ok": 1, "damaged": 0, "lost": 0 }
```

Evidence:

- `apps/frontend/src/lib/dashboard-api.ts:200`
- `apps/backend/src/loan/dto.ts:16`
- `apps/frontend/src/components/dashboard/loan-view.tsx:57`

Mọi submission trả vật tư từ web sẽ fail validation. UI không hiển thị lỗi mutation
nên người vận hành chỉ thấy thao tác không hoàn tất.

### CRITICAL-05 - Kịch bản demo chính trong PRD chưa chạy được

PRD yêu cầu chuỗi:

```text
Simulator slider
  -> Readiness đổi dưới 2 giây
  -> Cảnh báo mobile
  -> Mobile QR xuất kho
```

Thực tế:

- Next.js Simulator chỉ đọc dữ liệu.
- Readiness query không polling hoặc subscribe WebSocket.
- Chỉ timeline polling mỗi 10 giây.
- Mobile không có source app.
- `sim.html` tải Socket.IO từ CDN và dùng credential demo hard-code.

Evidence:

- `apps/frontend/src/components/dashboard/simulator-panel.tsx:23`
- `apps/frontend/src/app/page.tsx:116`
- `apps/frontend/src/app/page.tsx:134`
- `apps/backend/public/sim.html:7`
- `apps/backend/public/sim.html:59`
- `apps/mobile/package.json:5`
- `docs/PRD.md:334`

Kịch bản hiện tại phải thay bằng terminal/raw simulator và bỏ bước Mobile. Như vậy
không còn đúng demo được mô tả trong PRD.

## 4. Correctness và data integrity

### HIGH-01 - Loan có race condition

Borrow đọc tổng đang mượn rồi mới tạo record, không row lock/CAS. Hai request đồng
thời có thể cùng thấy đủ hàng và cho mượn vượt tồn.

Return cũng đọc counter cũ, ghi absolute totals và trừ `lost` riêng. Hai request
đồng thời có thể trừ stock nhiều lần trong khi loan record chỉ phản ánh một lần.

Evidence:

- `apps/backend/src/loan/loan.service.ts:27`
- `apps/backend/src/loan/loan.service.ts:39`
- `apps/backend/src/loan/loan.service.ts:47`
- `apps/backend/src/loan/loan.service.ts:89`
- `apps/backend/src/loan/loan.service.ts:108`
- `apps/backend/src/loan/loan.service.ts:121`

### HIGH-02 - Mượn một phần khóa toàn bộ batch khỏi Mission

Borrow đánh dấu cả batch là `ON_LOAN`. Batch eligibility loại mọi batch không còn
`IN_STOCK`, dù `quantity - onLoanQuantity` vẫn dương.

Ví dụ batch có 100, mượn 1: hệ thống tính còn 99 nhưng vẫn đánh dấu toàn batch
không eligible.

Evidence:

- `apps/backend/src/loan/loan.service.ts:50`
- `apps/backend/src/mission/batch-eligibility.ts:22`
- `apps/backend/src/mission/batch-eligibility.ts:24`
- `apps/backend/src/mission/mission.service.ts:420`

### HIGH-03 - Loan scope và tình trạng hàng hỏng chưa đúng

Controller không truyền warehouse scope cho borrow/return. Damage chỉ tác động tới
condition khi không còn loan mở. Một partial return bị hỏng có thể bị bỏ qua, và
lần hoàn sạch cuối đặt batch về `USED`.

Evidence:

- `apps/backend/src/loan/loan.controller.ts:21`
- `apps/backend/src/loan/loan.controller.ts:26`
- `apps/backend/src/loan/loan.service.ts:170`

### HIGH-04 - Mission fulfillment không atomic, không idempotent và không scoped

Inventory export hoàn tất trước khi mission chuyển `READY`. Nếu bước update hoặc
notification fail, stock đã thay đổi nhưng mission vẫn chưa hoàn thành. Retry có
thể xuất lần hai.

Bulk export cũng không nhận warehouse scope, nên một WAREHOUSE có thể chuẩn bị
allocation thuộc kho khác.

Evidence:

- `apps/backend/src/mission/mission.service.ts:196`
- `apps/backend/src/mission/mission.service.ts:211`
- `apps/backend/src/mission/mission.service.ts:215`

Giải pháp cần reservation/per-warehouse assignment, CAS state transition,
idempotency key và một transaction bao trùm stock + mission state.

### HIGH-05 - Incident mutation dùng quyền xem Readiness

Toàn bộ incident controller chỉ yêu cầu `READINESS_VIEW`. RESCUE có quyền này nên
có thể scan, acknowledge, assign hoặc resolve incident tùy ý, kể cả incident kho
khác. Readiness lại bỏ qua incident đã resolve, nên user có thể làm mất safety
blocker.

Evidence:

- `apps/backend/src/incident/incident.controller.ts:15`
- `apps/backend/src/incident/incident.controller.ts:25`
- `apps/backend/src/incident/incident.controller.ts:50`
- `apps/backend/src/incident/incident.controller.ts:60`
- `packages/shared-types/src/index.ts:112`

Cần tách `incident:view`, `incident:scan`, `incident:manage` và áp resource scope.

### HIGH-06 - Readiness v2.2 chưa đầy đủ theo PRD

Điểm mạnh hiện có:

- Sáu chiều readiness.
- Operational status và blocker.
- Batch eligibility cho mission.
- Recommendation và reference score.

Khoảng trống:

- Blocker warehouse chưa bao phủ đầy đủ vật tư bắt buộc hỏng/hết hạn.
- Stale sensor/data chưa trở thành blocker như PRD mô tả.
- Batch score được tính nhưng không lưu đủ bốn cấp truy vết.
- Loan/return không trigger readiness recalculation.
- Recalc sau inventory có thể fail rồi bị nuốt, không có durable retry/outbox.

Evidence:

- `docs/PRD.md:108`
- `docs/PRD.md:124`
- `docs/PRD.md:126`
- `apps/backend/src/readiness/operational-readiness.ts:60`
- `apps/backend/src/readiness/readiness.service.ts:304`
- `apps/backend/src/loan/loan.service.ts:12`

### MEDIUM-01 - Inventory audit không tuyến tính khi concurrency

Export dùng conditional decrement tốt, nhưng before/after trong audit được tính từ
snapshot cũ. Hai export đồng thời có thể tạo audit cùng ghi 100 -> 90 trong khi tồn
thật lần lượt là 90 và 80.

Evidence:

- `apps/backend/src/inventory/inventory.service.ts:202`
- `apps/backend/src/inventory/inventory.service.ts:205`
- `apps/backend/src/inventory/inventory.service.ts:223`

### MEDIUM-02 - Audit 5W chưa đạt 100%

Import/export note vẫn optional. Nhiều service ghi thẳng AuditLog thay vì qua
AuditService, nên rule lý do bắt buộc không được áp nhất quán.

Evidence:

- `apps/backend/src/inventory/dto.ts:23`
- `apps/backend/src/inventory/inventory.service.ts:279`
- `apps/backend/src/rbac/audit.service.ts:23`

### MEDIUM-03 - Duyệt báo cáo tháng có thể áp dụng dở hoặc chạy hai lần

Mỗi row được reconcile trong transaction riêng, report chỉ chuyển `APPROVED` sau
khi hoàn tất toàn bộ vòng lặp. Failure giữa chừng làm inventory đã đổi nhưng report
vẫn `PENDING`. Hai admin approve đồng thời cũng có thể cùng chạy.

Ngoài ra mỗi SKU chỉ chọn batch đầu tiên, sai khi một SKU có nhiều batch.

Evidence:

- `apps/backend/src/report/report.service.ts:65`
- `apps/backend/src/report/report.service.ts:75`
- `apps/backend/src/report/report.service.ts:92`

## 5. Security và hardening

### HIGH-SEC-01 - WebSocket không xác thực

Gateway dùng wildcard CORS, không validate JWT handshake và cho client tự chọn
`role`/`warehouseId` để join room.

Evidence:

- `apps/backend/src/notification/notification.gateway.ts:14`
- `apps/backend/src/notification/notification.gateway.ts:27`
- `apps/backend/src/simulation/simulation.gateway.ts:13`
- `apps/backend/src/simulation/simulation.gateway.ts:26`

Anonymous client có thể join `role:ADMIN` hoặc bất kỳ `wh:*` room nào.

### HIGH-SEC-02 - Warehouse scope thiếu trên nhiều read path

Scoped WAREHOUSE có thể truyền ID tùy ý vào inventory tree/batches, readiness,
assistant snapshot và một số mission/loan path. SKU scan trả cả batch và vị trí
trên nhiều kho.

Evidence:

- `apps/backend/src/inventory/inventory.controller.ts:20`
- `apps/backend/src/inventory/inventory.controller.ts:25`
- `apps/backend/src/inventory/inventory.controller.ts:30`
- `apps/backend/src/readiness/readiness.controller.ts:15`
- `apps/backend/src/assistant/assistant.controller.ts:23`

Scope cần được đưa thành authorization context/repository predicate dùng chung,
không bổ sung thủ công từng controller.

### HIGH-SEC-03 - Upload Excel không giới hạn và dependency đang có CVE

`FileInterceptor` không cấu hình file size, MIME, field count hoặc file count.
ExcelJS đọc toàn bộ buffer vào memory và không giới hạn số row/zip expansion.

Evidence:

- `apps/backend/src/report/report.controller.ts:35`
- `apps/backend/src/report/excel.parser.ts:25`
- `pnpm-lock.yaml:2790`

`pnpm audit --prod` báo các Multer DoS high severity có thể chạm trực tiếp qua
report upload.

### HIGH-SEC-04 - PostgreSQL và Redis được publish ra mọi interface

Compose publish 5432/6379 trên host. Redis không có authentication; Postgres có
fallback password biết trước.

Evidence:

- `infrastructure/docker-compose.yml:7`
- `infrastructure/docker-compose.yml:8`
- `infrastructure/docker-compose.yml:10`
- `infrastructure/docker-compose.yml:20`
- `infrastructure/docker-compose.yml:24`

Cần bind loopback/private network, bỏ fallback credential và thêm firewall/ACL.

### MEDIUM-SEC-01 - Token được lưu trong localStorage

Frontend persist cả access và refresh token trong Zustand localStorage. XSS có thể
lấy refresh credential dài hạn.

Evidence:

- `apps/frontend/src/lib/auth-store.ts:22`
- `apps/frontend/src/lib/auth-store.ts:34`
- `apps/frontend/src/lib/auth-store.ts:38`

Nên dùng HttpOnly/Secure/SameSite refresh cookie và access token memory-only.

### MEDIUM-SEC-02 - Auth chưa có rate limit và session revocation

Login không throttle. Refresh token là JWT self-contained 7 ngày, không có session
record, rotation, reuse detection hoặc token version. Đổi mật khẩu/role/warehouse
không revoke refresh token đã phát hành.

Evidence:

- `apps/backend/src/auth/auth.controller.ts:11`
- `apps/backend/src/auth/auth.service.ts:25`
- `apps/backend/src/auth/auth.service.ts:46`

### MEDIUM-SEC-03 - HTTP hardening chưa có

- `app.enableCors()` không allowlist origin.
- Không thấy Helmet/CSP/HSTS/X-Frame-Options cấu hình.
- API không có global rate limit.

Evidence:

- `apps/backend/src/main.ts:7`
- `apps/frontend/next.config.ts:3`

### MEDIUM-SEC-04 - AI service chỉ dựa vào network placement

Các endpoint AI không có service authentication, rate/concurrency limit. Backend
fetch không có abort timeout. Nếu port 8000 được mở trên LAN, client bất kỳ có thể
tiêu thụ GPU hoặc Gemini quota.

Evidence:

- `apps/ai-service/main.py:119`
- `apps/ai-service/main.py:195`
- `apps/ai-service/main.py:202`
- `apps/ai-service/main.py:210`
- `apps/backend/src/ai/ai-client.service.ts:62`

## 6. Frontend và UX vận hành

### 6.1. Các workflow chính còn thiếu

- Inventory web chỉ đọc; chưa có import/export/transfer/bulk/adjust/QR.
- Loan chưa có borrow/create UI; return đang sai contract.
- Mission chưa có inbox/list, deep-link notification hoặc completed flow.
- Simulator Next.js chưa có slider, scenario selector, speed, play/pause/reset.
- Incident thiếu evidence timeline, assign và AI explanation đầy đủ.
- Voice mission chưa có.
- So sánh readiness trước/sau mission chưa có.
- PDF readiness/action plan/audit và phiếu giấy khẩn cấp chưa có.

Evidence chính:

- `apps/frontend/src/components/dashboard/inventory-table.tsx:20`
- `apps/frontend/src/components/dashboard/simulator-panel.tsx:23`
- `apps/frontend/src/components/mission/mission-view.tsx:49`
- `apps/frontend/src/components/dashboard/incident-view.tsx:30`
- `apps/frontend/ROADMAP.md:29`
- `apps/frontend/ROADMAP.md:37`
- `apps/frontend/ROADMAP.md:58`
- `apps/frontend/ROADMAP.md:65`

### 6.2. Navigation không phản ánh permission

Chỉ menu Tài khoản được admin-gate. RESCUE/WAREHOUSE vẫn thấy Map, Report,
Stocktake, Audit và Simulator dù nhiều endpoint phía sau không cho phép.

Evidence:

- `apps/frontend/src/components/dashboard/dashboard-shell.tsx:47`
- `apps/frontend/src/components/dashboard/dashboard-shell.tsx:64`
- `apps/frontend/src/components/dashboard/dashboard-shell.tsx:80`

Ví dụ:

- RESCUE thấy report upload dù không có `REPORT_SUBMIT`.
- WAREHOUSE report list gọi endpoint chỉ `REPORT_APPROVE`.
- Non-admin Map gọi `/api/admin/warehouses`.
- Audit hiện cho role không có `AUDIT_VIEW`.

### 6.3. API failure bị hiển thị thành trạng thái an toàn

Nhiều component dùng `data ?? []` mà không xử lý `isError`, dẫn tới:

- Batches lỗi -> số lô thấp bằng 0.
- Incident lỗi -> "Không có sự cố".
- Readiness thiếu -> "Không có vướng mắc".
- Recommendation lỗi -> "Ổn định".
- Report/Loan/Audit/Map lỗi -> empty state.

Evidence:

- `apps/frontend/src/components/dashboard/operations-summary.tsx:13`
- `apps/frontend/src/components/dashboard/operations-summary.tsx:24`
- `apps/frontend/src/components/dashboard/incident-view.tsx:43`
- `apps/frontend/src/components/dashboard/loan-view.tsx:16`
- `apps/frontend/src/components/dashboard/report-view.tsx:106`

Trong hệ thống hỗ trợ quyết định cứu hộ, `unknown` không được biến thành `safe`.

### 6.4. Accessibility và responsive

Điểm tốt:

- Có skip navigation.
- Có focus styles cơ bản.
- Layout có responsive breakpoints.

Khoảng trống:

- Notification popover thiếu dialog/menu semantics, Escape và focus management.
- Admin map placement thiên về mouse interaction.
- Loan return giữ ba cột trên màn hình hẹp.

Evidence:

- `apps/frontend/src/components/dashboard/dashboard-shell.tsx:89`
- `apps/frontend/src/components/mission/notification-bell.tsx:67`
- `apps/frontend/src/components/dashboard/loan-view.tsx:92`

## 7. Mobile và deliverables

Mobile F0-F4 chưa được triển khai. `mobile:dev` in thông báo chưa scaffold rồi exit
code 0, tạo quality gate xanh giả.

Chưa có:

- Expo Router/app source.
- Login và SecureStore.
- Dashboard hiện trường.
- QR/camera và nhập SKU tay.
- Offline-read cache.
- Mission/notification realtime.
- Bàn giao, báo hỏng/mất và approve mobile.
- APK/AAB.

Evidence:

- `apps/mobile/package.json:5`
- `apps/mobile/package.json:7`
- `apps/mobile/ROADMAP.md:13`

Các artifact deliverable khác không thấy trong repository:

- APK/AAB.
- Video demo.
- Slide/poster.
- PDF/docx báo cáo cuối.

## 8. AI service

### Điểm làm tốt

- Gemini/Ollama chung interface.
- Structured output được validate bằng Pydantic.
- Action Plan cấm model tự thêm số ngoài context.
- Backend/rule engine giữ quyền tính số; LLM chủ yếu parse và diễn đạt.
- Có fallback template khi Action Plan AI lỗi.

Evidence:

- `apps/ai-service/providers/base.py:11`
- `apps/ai-service/main.py:119`
- `apps/ai-service/main.py:210`
- `apps/ai-service/main.py:259`

### Chưa hoàn chỉnh

- Claude provider vẫn `NotImplementedError`.
- Chưa có `explain-incident` riêng.
- Không có automated test/pytest suite.
- Không có service authentication, concurrency limit hoặc rate limit.
- Backend AI cache không có TTL/size bound.
- Backend fetch không có timeout/AbortSignal.

Evidence:

- `apps/ai-service/providers/factory.py:22`
- `apps/ai-service/ROADMAP.md:45`
- `apps/ai-service/ROADMAP.md:50`
- `apps/backend/src/ai/ai-client.service.ts:15`

### Hiệu năng thực tế

Benchmark Qwen 3.5 4B hiện ghi nhận:

- Warm request thông thường khoảng 6-7 giây.
- Action Plan khoảng 19-50 giây.
- Cold request đã quan sát khoảng 62 giây.

Evidence:

- `docs/qa/ollama-qwen35-4b-evaluation.md:40`
- `docs/qa/ollama-qwen35-4b-evaluation.md:41`
- `docs/qa/ollama-qwen35-4b-evaluation.md:42`

NFR tạo phương án dưới 10 giây chỉ có thể đạt ổn định với cache/prewarm hoặc khi
không tính phần Action Plan dài.

## 9. Deployment, backup và offline

### 9.1. Backup mới có cơ chế upload, chưa có bảo đảm phục hồi

Điểm có:

- BullMQ schedule.
- `pg_dump` và upload Supabase Storage.
- Giữ ba file gần nhất.

Khoảng trống:

- Job không cấu hình `attempts/backoff` dù comment nói sẽ retry.
- Dump được buffer toàn bộ trong process, tối đa 256 MiB.
- Không có checksum, encryption procedure hoặc restore command.
- Không có restore drill và RPO/RTO được kiểm chứng.

Evidence:

- `apps/backend/src/backup/backup.service.ts:29`
- `apps/backend/src/backup/backup.service.ts:40`
- `apps/backend/src/backup/backup.processor.ts:55`

### 9.2. Autostart chưa khép kín

Windows Scheduled Tasks chỉ start Backend và Frontend. Docker/Postgres/Redis, AI
Service, Ollama và tunnel không được quản lý trong cùng acceptance flow.

Evidence:

- `infrastructure/windows/install-autostart-tasks.ps1:23`
- `infrastructure/windows/run-backend.ps1:25`
- `infrastructure/windows/run-frontend.ps1:31`

### 9.3. Offline GIS chưa reproducible từ fresh checkout

Offline tiles bị gitignore và phải download riêng, nhưng production setup chưa đảm
bảo bước này chạy trên máy mới.

Evidence:

- `.gitignore:23`
- `apps/frontend/scripts/download-tiles.mjs:21`
- `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md:170`

### 9.4. Database deployment không có migration history

Repository dùng `prisma db push`; không có `prisma/migrations`. Điều này vi phạm
coding standards, không review được schema evolution và không có rollback history.

Evidence:

- `apps/backend/package.json:10`
- `package.json:24`
- `skills/CODING-STANDARDS.md:282`

## 10. Ma trận mức hoàn thành chức năng

| Capability | Backend | Web | Mobile | Verdict |
|---|---|---|---|---|
| Auth access/refresh | Có | Có | Không | Chạy được, chưa production-hardened |
| RBAC permission map | Có | Ẩn/hiện chưa đúng | Không | Partial |
| Warehouse scope | Partial | Phụ thuộc backend | Không | Chưa đạt |
| Inventory read | Có | Có | Không | Dùng được |
| Import/export/bulk | Có API | Chưa có UI | Không | Backend-only |
| Transfer | Có nhưng sai contract | Không | Không | Broken |
| Adjust/reconcile | Có | Reconcile có, adjust thiếu | Không | Partial |
| Loan borrow/return | Partial | Return broken, borrow thiếu | Không | Không dùng được end-to-end |
| Readiness formulas/status | Khá mạnh | Có | Không | Strong partial |
| Mission calculation/FEFO | Có | Có cho ADMIN | Không | Backend tốt, workflow thiếu |
| Natural-language mission | Có parse API | Không có user path/voice | Không | Partial |
| Action Plan | Có | Có | Không | Dùng được, có thể chậm |
| Multi-role mission | Có endpoints | Không có inbox/deep-link | Không | Chưa hoàn thành |
| Simulator engine | Có | Legacy control + Next read-only | Không | Partial/unsafe |
| Realtime | Có Socket.IO | Client có | Không | Chưa xác thực |
| Incident detection | Có | List/ack/resolve cơ bản | Không | Partial |
| Incident evidence/explain | Có nền | Chưa có detail đầy đủ | Không | Partial |
| Geo/cluster allocation | Có | Có map | Không | Seed chưa đủ để demo nearest |
| Insights/assistant | Có | Có | Không | Basic usable, ít integration test |
| Monthly report | Có | Có UI nhưng role mismatch | Không | Partial/broken |
| Backup | Có mechanism | Không áp dụng | Không | Chưa verify restore |
| Offline workflow | Thiết kế một phần | Một phần | Không | Chưa acceptance-test |
| Mobile QR/camera/push/APK | Không | Không áp dụng | Không | Absent |

## 11. Roadmap và tài liệu đang overstate

- `README.md:90` mô tả backend gần như hoàn chỉnh dù transfer, scope, loan,
  report và mission fulfillment còn lỗi.
- `README.md:91` tuyên bố Readiness v2.2 hoàn chỉnh hơn implementation thực tế.
- `apps/backend/ROADMAP.md:120` đánh dấu Readiness ✅ dù blocker/recalc còn thiếu.
- `apps/backend/ROADMAP.md:161` đánh dấu Mission ✅ dù partial-loan eligibility sai.
- `apps/backend/ROADMAP.md:244` đánh dấu workflow/notification ✅ dù UI không mở
  được mission giữa các role.
- `apps/frontend/ROADMAP.md:43` đánh dấu cross-role workflow ✅ dựa trên API hoặc
  state cùng phiên, chưa phải UI workflow thật.
- `apps/ai-service/ROADMAP.md:13` đánh dấu provider phase ✅ trong khi Claude vẫn
  chưa triển khai.
- `apps/frontend/README.md:14` vẫn gọi frontend là placeholder dù đã có nhiều view.
- `docs/BUILD-PLAN.md` trộn trạng thái kế hoạch cũ với trạng thái hiện tại.

Nên quy định nguồn sự thật:

1. PRD: mục tiêu và contract sản phẩm.
2. Per-app roadmap: trạng thái execution thực tế.
3. Audit report: snapshot findings theo ngày.
4. Plan/QA cũ: historical evidence, không phải current status.

## 12. Những phần làm tốt

- Ý tưởng Readiness theo trạng thái/blocker phù hợp thực tế hơn điểm 0-100.
- Sáu chiều readiness và recommendation được tách thành rule khá rõ.
- Mission dùng FEFO và fulfillment theo SKU yếu nhất, tránh trung bình đẹp giả.
- LLM không trực tiếp tính stock hoặc tự thực thi hành động nguy hiểm.
- Action Plan validate schema và chặn số ngoài context.
- Geo có Haversine offline và quota fallback.
- Env validation và health check DB/Redis có thật.
- NestJS module organization nhìn chung rõ domain.
- Dataset seed và tài liệu nghiệp vụ chi tiết hơn mặt bằng dự án thi.
- Frontend có responsive foundation, skip-link và focus styles cơ bản.
- Backend/shared/frontend hiện build được.

Đây không phải dự án chỉ có mock UI. Vấn đề chính là các lát cắt chưa được ghép
thành workflow đúng, atomic, scoped và được test end-to-end.

## 13. Quality gates đã chạy

| Gate | Kết quả |
|---|---|
| Backend Jest | 25/25 suites pass |
| Backend tests | 168/168 pass |
| Statement coverage | 69,44% |
| Branch coverage | 60,42% |
| Function coverage | 65,35% |
| Line coverage | 69,38% |
| Shared types build | Pass |
| Scenario definitions build | Pass |
| Backend build | Pass |
| Frontend production build | Pass |
| Prisma schema validate | Pass |
| Backend/DB/Redis health local | HTTP 200 |
| Frontend local | HTTP 200 |
| AI health local | HTTP 200, Ollama provider |
| Frontend lint | Fail - ESLint chưa cấu hình, `next lint` deprecated |
| Frontend automated test | Không có |
| AI automated test | Không có |
| Browser E2E | Không có |
| API/controller integration test | Gần như không có |
| WebSocket auth test | Không có |
| Concurrency test | Không có |
| CI workflow | Không có `.github/workflows` |
| Prisma migrations | Không có |

Dependency audit:

- `pnpm audit`: 24 findings - 9 high, 11 moderate, 4 low.
- `pnpm audit --prod`: 16 findings - 6 high, 9 moderate, 1 low.
- Multer high-severity findings nằm trên report upload path có thể truy cập.

168 test xanh chủ yếu chứng minh formula/rule thuần. Chúng không chứng minh
authorization, concurrency, controller contract hoặc multi-role workflow đúng.

## 14. Điểm đánh giá khó tính

| Hạng mục | Điểm |
|---|---:|
| Ý tưởng và giá trị sản phẩm | 8,5/10 |
| Readiness/rule engine | 7/10 |
| Backend structure | 6,5/10 |
| Đúng nghiệp vụ dữ liệu | 4/10 |
| Frontend trình bày | 6,5/10 |
| Frontend vận hành thực tế | 3,5/10 |
| AI architecture | 6,5/10 |
| Mobile | 0/10 |
| Testing thực chất | 4,5/10 |
| Security | 2,5/10 |
| Deployment/offline | 3,5/10 |
| Độ chính xác tài liệu/roadmap | 4/10 |
| MVP tổng thể theo PRD | **4,5/10** |

## 15. Thứ tự xử lý đề xuất

### P0 - Chặn corruption và privilege bypass

1. Khóa simulator mutation; tách demo/prod mode.
2. Áp warehouse scope cho mọi read/write/AI snapshot.
3. Sửa transfer semantics.
4. Tách permission incident và xác thực WebSocket.
5. Sửa loan concurrency, condition và partial-loan eligibility.
6. Làm mission fulfillment atomic/idempotent theo từng kho.

### P1 - Khép workflow lõi

1. Mission list/inbox theo role và trạng thái.
2. Notification deep-link tới mission/incident.
3. Sửa loan return API contract và bổ sung borrow UI.
4. Hoàn thiện inventory import/export/transfer/adjust UI.
5. Simulator controls trên Next.js và readiness realtime.
6. Sửa report approval transaction/multi-batch.

### P2 - Quality và production hardening

1. Controller/API integration tests.
2. Concurrency tests cho stock, loan, mission và report.
3. Browser E2E cho ba role.
4. ESLint và CI pipeline.
5. Prisma migrations và DB constraints.
6. Auth rate limit, refresh rotation/revocation và security headers.
7. Upgrade dependency, upload limits, Docker network/firewall.
8. Backup retry/checksum/restore drill.

### P3 - Hoàn thiện deliverable

1. Chốt Mobile có bắt buộc hay không.
2. Nếu bắt buộc: triển khai Mobile F0-F4 và build APK.
3. Voice mission, PDF và health overview.
4. Test full offline/reboot/tunnel trên máy thi.
5. Quay video demo, slide, poster và báo cáo cuối.
6. Đồng bộ README/roadmaps theo trạng thái thật.

## 16. Điều kiện để có thể gọi là MVP hoàn thành

- Không còn Critical/High data-integrity hoặc authorization finding.
- ADMIN -> RESCUE -> WAREHOUSE chạy qua ba phiên đăng nhập độc lập.
- Mission fulfillment không double-export và có reservation/scope rõ ràng.
- Simulator không thể sửa production stock trái phép.
- Inventory nhập/xuất/transfer/adjust dùng được từ UI.
- Readiness không hiển thị safe state khi API/data unknown.
- Frontend lint, integration test và browser E2E pass.
- Demo 5-7 phút chạy đúng trên máy thi, offline, không cần CDN.
- Nếu Mobile còn trong PRD: có APK và test thiết bị thật.
- Có migration, backup restore test và production network hardening.

## 17. Câu hỏi chưa giải quyết

1. Mobile APK còn là deliverable bắt buộc hay đã chuyển sang hậu MVP?
2. Simulator chỉ dùng demo hay sẽ tồn tại trong production?
3. Một WAREHOUSE được phép xuất allocation toàn cụm xã hay chỉ phần thuộc kho mình?
4. Demo thi có được dùng `sim.html`/API script hay bắt buộc qua role-facing UI?
5. Deliverable seed là một cụm xã hay hai xã như PRD đang ghi?
6. Offline tiles sẽ được đóng gói/chuyển sang máy production bằng cơ chế nào?


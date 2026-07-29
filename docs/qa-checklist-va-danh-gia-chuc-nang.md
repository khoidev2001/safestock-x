# Đánh giá chức năng & Checklist QA test tay — SafeStock ("Ứng phó nhanh")

> Tài liệu này đánh giá **khách quan** toàn bộ app, liệt kê **mọi chức năng / mọi luồng**, giải
> thích **AI làm gì** theo yêu cầu cuộc thi, kết luận **đã ổn chưa**, và cung cấp một **checklist
> QA test tay** để bạn tự nghiệm thu.
>
> Nguồn: đọc trực tiếp code backend (18 controller), web (16 trang), mobile (6 màn hình), desktop
> (Digital Twin), AI service (11 endpoint FastAPI), RBAC dùng chung, ngày 2026-07-29.
> Nhánh: `feat/complete-normal-warehouse`.

---

## Phần 0 — Kết luận nhanh: "Đã ổn chưa?"

**Về mặt code & cổng kiểm thử tự động: READY (0 blocker).** Toàn bộ pipeline CI cạnh tranh chạy
local đạt: shared build PASS · `pnpm audit --prod` 0 lỗ hổng · lint 0 error · Prisma validate PASS ·
backend **94 suite / 557 test** · backend build · frontend contract + build (17 route) · mobile
13/13 + 2/2 · desktop typecheck + build · OSRM 8/8 · **AI pytest 74/74**. Toàn bộ 6 lỗi High
(H1–H6) và các lỗi Medium trọng yếu đã được vá và tôi đã tự xác minh lại trong source.

**Chưa thể tuyên bố "nghiệm thu xong" vì còn 2 việc chỉ con người/thiết bị thật làm được:**

1. **Diễn tập trên thiết bị thật + LAN nội bộ** (điện thoại chạy APK ↔ backend ↔ web trên cùng
   Wi-Fi, không Internet) — các cổng tự động **không** thay được bước này.
2. **CI trên checkout sạch từ remote** (mọi thứ mới chỉ xanh ở máy bạn; workflow
   `competition-quality.yml` hiện là file **chưa commit** — cần push để CI thật chạy).

→ **Trả lời "đã ổn chưa": Ổn để bước vào diễn tập nghiệm thu; chưa phải đã nghiệm thu xong.**
Checklist ở Phần 4 chính là để đóng nốt 2 việc trên bằng tay.

---

## Phần 1 — Kiến trúc & 4 vai trò (đọc trước khi test)

**5 ứng dụng trong 1 monorepo:**

| App | Công nghệ | Vai trò dùng chính | Cổng dev |
|---|---|---|---|
| `apps/backend` | NestJS + Prisma/PostgreSQL + Redis/BullMQ | Nguồn sự thật, RBAC, workflow | 3100 |
| `apps/frontend` | Next.js 15 + React 19 + Leaflet | ADMIN + WAREHOUSE (desktop web) | 3200 |
| `apps/mobile` | React Native / Expo SDK 52 | REPORTER + WAREHOUSE + RESCUE (APK) | Expo |
| `apps/desktop` | Electron + electron-vite | Digital Twin — giả lập cảm biến IoT | — |
| `apps/ai-service` | FastAPI + Pydantic | Phân tích/So sánh/Trợ lý (tham mưu) | 8000 |

**4 vai trò và ranh giới quyền (nguồn: `packages/shared-types/src/index.ts`):**

- **REPORTER (Trưởng thôn)** — chỉ `INCIDENT_REPORT_SUBMIT`, `INCIDENT_REPORT_VIEW_OWN`,
  `NOTIFICATION_VIEW`. Chỉ dùng **APK**. Báo cáo tình huống + xem lại báo cáo của chính mình. **Không
  có trang web nào** (mọi nav permission đều fail).
- **ADMIN (Chỉ huy xã)** — **mọi quyền**. Lập kế hoạch, phân tích AI, What-if, duyệt/hủy nhiệm vụ,
  quản trị user/kho/thôn, xem audit.
- **WAREHOUSE (Cán bộ kho)** — quản kho + **chuẩn bị/xuất theo phương án** (không lập kế hoạch).
  Có: inventory read/export/import/bulk/adjust/reconcile, `MISSION_FULFILL`, readiness,
  simulation:view, loan, warehouse:manage, notification, report:submit/view.
- **RESCUE (Lực lượng hiện trường)** — **CHỈ ĐỌC** + gửi cập nhật hiện trường đã tự xác nhận. Chỉ
  `MISSION_VIEW`, `MISSION_FIELD_UPDATE`, `NOTIFICATION_VIEW`. Không được tạo/duyệt/xuất/phân tích.

**Bất biến an toàn AI (phải luôn đúng khi test):** AI **không bao giờ** tự tính tồn kho, tự duyệt,
tự điều phối, tự gán người, tự liên hệ xã khác, hay tự tuyên bố có hàng ở kho ngoài. Backend là
nguồn sự thật số học. Mọi đề xuất liên hệ xã lân cận luôn gắn nhãn **"đề xuất liên hệ, chưa xác nhận
có hàng"**.

---

## Phần 2 — Catalog MỌI chức năng & MỌI luồng (giải thích kỹ)

### 2.1 Xác thực & phiên (Auth)

**Endpoint:** `POST /api/auth/login` · `POST /api/auth/refresh` · `POST /api/auth/logout` ·
`GET /api/auth/me` · `PATCH /api/auth/me`.

- **Đăng nhập:** email + mật khẩu → access token (JWT ngắn hạn, ký HS256) + refresh token. Web:
  refresh token là **HttpOnly cookie** (header `X-Session-Transport: web`); access token chỉ nằm
  trong RAM (Zustand, không persist). Mobile/desktop: refresh token cất trong SecureStore.
- **Khôi phục phiên:** web reload → `restoreWebSession()` gọi `/refresh` bằng cookie để dựng lại
  access token. Hết hạn access token giữa chừng → `apiFetch` tự gọi `/refresh` **một lần** rồi thử
  lại request; thất bại → xóa auth, buộc login.
- **Thu hồi token:** mỗi user có `tokenVersion`; đổi mật khẩu/logout tăng version → mọi token cũ
  chết ngay (kiểm ở cả HTTP guard lẫn WebSocket handshake).
- **Đăng xuất:** gọi `POST /api/auth/logout` trước khi xóa local (web/mobile/desktop đều đã sửa để
  gọi server — đóng M2).

### 2.2 Quản lý kho (Inventory) — trái tim nghiệp vụ WAREHOUSE

**Endpoint (`/api/inventory/...`):** tree · batches · batches-page · transactions ·
transfer-destinations · semantic-search · normalize-input · scan · catalog · **batches (tạo)** ·
import · export · transfer · **bulk-export** · adjust · condition · reconcile.

Luồng con:
- **Sơ đồ kho (tree):** zone → shelf → batch, đếm tồn từng mức. Trang `/readiness` render sơ đồ này
  ("Sơ đồ kho" — **schematic, không phải bản đồ địa lý**).
- **Nhập lô mới (receiving):** chọn item có sẵn hoặc tạo item mới → tạo batch + ledger + **mã QR**
  (`safestock://inventory?sku=…&batch=…`), in được.
- **Nhập/Xuất/Điều chuyển/Điều chỉnh/Đổi tình trạng:** mỗi thao tác qua dialog có validation +
  **idempotency `requestId`** (chống double-submit). Điều chuyển chỉ bật khi có `INVENTORY_EXPORT`.
- **Xuất nguyên tử (bulk-export):** xuất nhiều lô trong 1 giao dịch — lỗi 1 lô rollback toàn bộ.
- **Kiểm kê (stocktake `/stocktake`):** nhập số đếm thực tế từng lô → `reconcile` với
  `applyOverride:true`, hiển thị chênh lệch.
- **FEFO & điều kiện lô:** lô hết hạn / hư hỏng / cần kiểm / kệ khóa / đang cho mượn bị loại khỏi
  pool cấp phát (xem 2.5).
- **Tìm kiếm ngữ nghĩa (semantic-search) + chuẩn hóa tên (normalize-input):** xem 2.9 AI.
- **Lịch sử giao dịch:** 100 giao dịch gần nhất.

### 2.3 Cho mượn liên kho (Loan)

**Endpoint:** `GET /api/loans/warehouses/:id/open` · `POST /api/loans` · `POST /api/loans/:id/return`.
Trang `/loan`: danh sách khoản mượn đang mở + ghi nhận trả (ok / hư hỏng / mất; tổng ≤ số còn nợ).

### 2.4 Báo cáo kiểm kê tháng (Monthly Report) — REPORTER/WAREHOUSE gửi, ADMIN duyệt

**Endpoint (`/api/reports/...`):** `POST upload` (.xlsx multipart) · `POST` (JSON snapshot) · `GET`
list · `GET :id` · `POST :id/approve` · `POST :id/reject`.

- Trưởng thôn/kho **upload Excel** (hoặc APK gửi JSON) số đếm tháng → trạng thái **PENDING**. Parser
  `.xlsx` tự viết (unzipper + fast-xml-parser), có chống path-traversal, map cột SKU/tên/SL/đơn
  vị/HSD/tình trạng/batchId/batchCode/shelfCode.
- **Không đụng tồn kho tới khi ADMIN duyệt.** Duyệt = giao dịch nguyên tử, đối soát từng SKU
  (`reconcileInTx`), fail-closed nếu lô mập mờ/thiếu, ghi AuditLog. Từ chối cần lý do ≥3 ký tự.
- Khóa advisory `monthly-stock-report:{warehouseId}:{period}` chống trùng kỳ.
- **Lưu ý test:** base URL là **`reports`** (số nhiều). Client gọi `/api/report/*` sẽ **404**.

### 2.5 Nhiệm vụ / Điều phối (Mission) — xương sống cuộc thi

**Vòng đời thực tế (đang chạy):** `DRAFT → PENDING_WAREHOUSE → READY`, cộng `→ CANCELLED` từ
`DRAFT`/`PENDING_WAREHOUSE`. (Nhánh RESCUE cũ dispatch/confirm/reject/complete là **code legacy
không gắn route** — không dùng trong luồng thi; không cần test.)

**Endpoint chính (`/api/missions/...`):**

| Endpoint | Quyền | Ý nghĩa |
|---|---|---|
| `POST parse` | INCIDENT_REPORT_SUBMIT | AI tách mô tả tự do → sự cố có cấu trúc |
| `POST transcribe` | INCIDENT_REPORT_SUBMIT | Giọng nói (WAV base64) → text tiếng Việt (PhoWhisper) |
| `POST report` | INCIDENT_REPORT_SUBMIT | Trưởng thôn gửi báo cáo hiện trường → tạo DRAFT "hộp thư" |
| `POST generate-plan` | MISSION_CREATE | Tính định mức + cấp phát greedy → DRAFT mới |
| `POST :id/plan-from-report` | MISSION_CREATE | ADMIN phân tích 1 báo cáo tại chỗ (không tạo mission mới) |
| `GET` / `GET :id` | MISSION_VIEW | Danh sách / chi tiết |
| `GET reports/own[/:id]` | INCIDENT_REPORT_VIEW_OWN | Lịch sử báo cáo của chính REPORTER |
| `GET warehouse-requests/own` | MISSION_FULFILL | Việc chuẩn bị theo SKU của kho mình |
| `POST warehouse-requests/:id/accept` | MISSION_FULFILL | Kho nhận 1 yêu cầu SKU |
| `POST warehouse-requests/:id/discrepancy` | MISSION_FULFILL | Kho báo thiếu/sai |
| `POST warehouse-requests/:id/prepare` | MISSION_FULFILL | Kho chuẩn bị + **xuất** 1 SKU (claim-token CAS) |
| `POST warehouse-requests/:id/review` | MISSION_APPROVE | ADMIN duyệt lại (giảm) số lượng |
| `POST :id/analyses` + `GET latest` | MISSION_ANALYZE | Phân tích tham mưu baseline (bất biến) |
| `POST :id/simulations` + `GET :simId` | MISSION_SIMULATE / ANALYZE | **What-if** không ghi đè phương án |
| `GET/POST :id/field-updates` | MISSION_VIEW / FIELD_UPDATE | Cập nhật hiện trường |
| `GET :warehouseId/warehouses` | MISSION_VIEW | Kho trong cụm (để ghim bản đồ) |
| `POST :id/action-plan` | MISSION_ANALYZE | Sinh Kế hoạch hành động 8 mục |
| `POST :id/explain` | MISSION_ANALYZE | Diễn giải tiếng Việt |
| `POST :id/approve` | MISSION_APPROVE | ADMIN phát hành: DRAFT → PENDING_WAREHOUSE |
| `POST :id/cancel` | MISSION_CREATE | Hủy trước khi có kho xuất |
| `POST :id/prepare` | MISSION_FULFILL | Chuẩn bị theo cả-nhiệm-vụ (luồng đơn kho cũ) |

**Mission-to-Kit (cách kit sinh ra):**
1. **Định mức → nhu cầu:** `computeRequirements` mở rộng sự cố theo `MISSION_NORMS` (Sphere: nước 15
   L/người/ngày; áo phao/người; sơ cứu/ca y tế…), **làm tròn lên** (`Math.ceil`).
2. **Cấp phát greedy + FEFO:** chọn kho gần nhất → lô hết hạn sớm trước, không vượt tồn, ghi từng lô
   theo `warehouseId`. Kho ở trạng thái `NOT_DISPATCHABLE` bị loại.
3. **Mức đáp ứng = mắt xích yếu nhất:** `min(allocated/required)` làm tròn %.
4. **Chia việc theo (kho, SKU):** thành các dòng `MissionWarehouseRequest`
   (PENDING→ACCEPTED→PREPARED), duy nhất theo `(missionId, warehouseId, sku)`.

**Đa kho:** một nhiệm vụ có thể huy động nhiều kho; theo dõi tiến độ từng kho
(`MissionWarehousePreparation`), banner "Tiến độ kho: X/Y".

**Claim token (chống ADMIN sửa khi kho đang xuất):** khi kho bấm "chuẩn bị", sinh UUID
`preparationClaimToken`; CAS `updateMany where status=ACCEPTED AND token=null AND mission=PENDING_WAREHOUSE`;
xuất kho + finalize PREPARED **trong cùng 1 transaction** → retry không xuất trùng. Nếu đã có kho
xuất, ADMIN **không hủy được** ("Không thể dừng nhiệm vụ vì đã có kho xuất vật tư…").

**Đồng thời (concurrency):** mọi chuyển trạng thái dùng CAS `updateMany where status=<kỳ vọng>`;
finalize READY theo từng-SKU dùng `pg_advisory_xact_lock('mission-prepare:<missionId>')`; hủy/từ
chối lúc PENDING_WAREHOUSE dùng `SELECT … FOR UPDATE`. (H2 — khóa advisory chạy TRƯỚC khi đếm
remaining — đã xác minh.)

### 2.6 Sự cố cảm biến & cảnh báo (Incident + Alert)

**Endpoint (`/api/incidents/...`):** `POST scan/:warehouseId` · `GET warehouses/:id` · `GET :id/timeline`
· `POST :id/explain` · `POST :id/acknowledge` · `POST :id/assign` · `POST :id/resolve`.

- Digital Twin (desktop) hoặc `POST /api/simulator/events` bơm telemetry → backend **quét, phát
  hiện, khử trùng lặp**, tạo sự cố + thông báo `INCIDENT_DETECTED` cho ADMIN.
- **Email cảnh báo (best-effort):** `AlertMailService` gửi **BCC** cho ADMIN/RESCUE/user kho có
  `notificationEmail`. Chỉ gửi khi `ALERT_EMAIL_ENABLED=true` + đủ SMTP + có người nhận; nếu không
  → **bỏ qua im lặng** (chỉ log warn, không throw). Lỗi gửi được nuốt để không vỡ luồng chính.
- Trạng thái sự cố: DETECTED → ACKNOWLEDGED → ASSIGNED → RESOLVED.

### 2.7 Sẵn sàng & Insight (Readiness + Insights)

**Readiness (`/api/readiness/...`):** warehouse/zone/shelf · recommendations · **recalculate**. Chấm
điểm 6 chiều mức sẵn sàng kho; recalc có debounce 300ms server-side.

**Insights (`/api/insights/warehouses/:id[...]`):** insight tổng hợp · monthly-report (tường thuật)
· daily-briefing (AI). Trang `/insights`: banner thời tiết (Open-Meteo, ngưỡng 100mm/72h), Daily
Briefing, dự báo nhu cầu (EWMA × hệ số), số ngày còn lại (±1σ + chip độ tin cậy), cảnh báo hết hạn
(30 ngày), gợi ý tái cân bằng, tường thuật báo cáo tháng.

### 2.8 Thông báo & Realtime (Notification + Socket.IO)

- **Model Notification:** org + role room, 15 loại `NotificationKind`, khử trùng theo
  `fieldUpdateId`. `GET /api/notifications` (50 mới nhất org+role) · `POST :id/read` · `POST read-all`.
- **2 gateway WebSocket** (namespace `/`), auth qua JWT handshake:
  - `notification` → room **`notification:{org}:{role}`** (theo org+vai trò, **không** theo kho).
  - `sensor_event` → room **`wh:{warehouseId}`** (telemetry cảm biến).
- Không có inbound `@SubscribeMessage` — server chỉ push. Web có **polling dự phòng** khắp nơi (mission
  5s, field-update 10s, coordination 15s, report 8s, incident 10–12s) phòng khi rớt WebSocket.

### 2.9 Quản trị & Audit (Admin)

- **User (`/api/admin/users`):** ADMIN tạo/sửa/xóa user (WAREHOUSE/RESCUE/ADMIN — REPORTER chỉ
  seed/mobile), đặt lại mật khẩu (≥8 ký tự), gán phạm vi kho (trống = toàn xã). Trang `/users` có
  **3 lớp chặn** (auth + permission + ADMIN check).
- **Kho (`/api/admin/warehouses`):** list + cập nhật vị trí (`PATCH :id/location`).
- **Thôn (`/api/admin/hamlets`):** list/tạo/sửa — vị trí đã xác minh dùng cho định vị sự cố.
- **Audit (`/api/audit`):** log bất biến, lọc theo entity (ItemBatch/Mission/Incident/LoanRecord/
  MonthlyStockReport), phân trang, metadata before/after. Trang `/audit` không realtime (refetch tay).
- **Backup (`/api/backup/run`)** và **Health (`/api/health`)**.

### 2.10 Liên hệ xã (Public Contacts) — endpoint CÔNG KHAI

`GET /api/public/commune-contacts` — **không guard, không permission** (cố ý public). Trang
`/contacts` (không cần đăng nhập): 1 xã HOME (Đồng Xuân, `LOCAL_INVENTORY` = "Kho nội xã") + 6 xã
lân cận (`UNKNOWN` = **"Chưa xác minh tồn kho"**). Link `tel:` + Google Maps. Đây là thể hiện UI của
bất biến "đề xuất liên hệ, chưa xác nhận có hàng".

### 2.11 Bản đồ (Map) — offline-first

Trang `/map` (Leaflet): lớp mặc định **`offline`** (`/tiles/{z}/{x}/{y}.png`, pack 5 xã Đồng Xuân,
zoom 10–15) — cố ý local-first, Internet không được tự chuyển lớp. Có lớp streets/hybrid/osm/topo/
satellite khi online. Marker kho trung tâm/kho thôn/thôn đã xác minh/chưa xác minh; ADMIN "dev mode"
kéo-thả ghim tọa độ (thôn bị dời sẽ về trạng thái chưa xác minh). Bản đồ điều phối (`incident-map`)
chỉ dùng tile offline + vẽ tuyến OSRM (tính **server-side**) khi `routeStatus=ROUTED`.

### 2.12 Digital Twin (Desktop) — giả lập cảm biến

Electron app phát telemetry cảm biến (nhiệt độ/độ ẩm/ngập…) theo kịch bản → `POST /api/simulator/events`
hoặc runs (`/runs`, `/runs/:id/play|pause|reset`). Trang web `/simulator` là **viewer chỉ đọc** (thẻ
thiết bị + timeline sự kiện; có empty-state "chưa triển khai IoT") — **không phải** công cụ What-if.

---

## Phần 3 — AI trong app: làm gì, có đúng yêu cầu cuộc thi không?

AI service (FastAPI, 11 endpoint) đóng vai **tham mưu**, không bao giờ ra quyết định vận hành. Mỗi
tính năng đều có **fallback deterministic** khi LLM lỗi (không bao giờ mất dữ liệu / kẹt luồng).

| # | Tính năng AI | Endpoint | Giúp gì | Cơ chế an toàn |
|---|---|---|---|---|
| 1 | **Phân tích tình huống** (bắt buộc) | `/situation-analysis` | Tách báo cáo tự do → facts có **provenance** (REPORTED/AI_INFERENCE/MISSING/VERIFIED), câu hỏi ưu tiên, mâu thuẫn/thiếu dữ liệu | Validate excerpt phải có trong văn bản gốc; AI_INFERENCE phải trỏ fact đã biết; lỗi → trích xuất deterministic |
| 2 | **So sánh phương án (What-if)** (bắt buộc) | `/situation-analysis` + backend `simulations` | ADMIN nêu giả định ngôn ngữ tự nhiên → so delta baseline vs mô phỏng | "Không áp dụng vào phương án thật"; snapshot có fingerprint/ruleVersion; bất biến |
| 3 | **Trợ lý hiện trường** (bắt buộc) | `/field-update-intent` | Phân loại ý định cập nhật (ROUTE_HAZARD, MORE_SUPPLIES_NEEDED…) + confidence | `operationalMutation:false`, `requiresAdminVerification:true`; chỉ text đã xác nhận (không audio/GPS thô) |
| 4 | **Kế hoạch hành động** | `/action-plan` | Sinh IAP 8 mục | Mức độ/dự báo **luôn** do backend chấm theo rule, không để LLM bịa |
| 5 | **Diễn giải** | `/explain` | Giải thích tiếng Việt phương án/sự cố | Read-only |
| 6 | **Trợ lý RAG** | `/assistant` + `/knowledge/search` | Hỏi-đáp kho + tri thức cứu trợ, top-k=3 | **Nguồn do hệ thống render, không tin citation của LLM**; không hit → draft có cấu trúc chặn bịa số kho |
| 7 | **Xếp hạng ngữ nghĩa** | `/semantic/rank` | Tìm kiếm/khớp SKU theo nghĩa | Chỉ trả ID + score, không trả vector, không sửa dữ liệu |
| 8 | **Chọn briefing** | `/briefing/select` | AI chỉ **xếp thứ tự** fact | Backend render nguyên văn; check trùng/thiếu fact id |
| 9 | **Chuẩn hóa tên nhập** | `/parse` + inventory normalize | Gợi ý chuẩn hóa tên vật tư | ADMIN/WAREHOUSE mới được normalize |
| 10 | **Phiên âm giọng nói** | `/transcribe` (PhoWhisper) | WAV → text tiếng Việt để trưởng thôn đọc báo cáo | Chạy server-side; lazy-load torch |
| 11 | **Health** | `/health` | Kiểm tra sống | — |

**Kết luận AI vs cuộc thi:** cả **3 tính năng AI bắt buộc** (phân tích tình huống, What-if, trợ lý
hiện trường) đều có mặt và tuân thủ ranh giới. AI **không** tính tồn kho, **không** tự duyệt/điều
phối/gán người/liên hệ xã khác/tuyên bố hàng kho ngoài — mọi con số do backend quyết. Fallback
deterministic đảm bảo demo **không phụ thuộc mạng/LLM**. Đây là điểm mạnh cạnh tranh rõ rệt.

---

## Phần 4 — CHECKLIST QA TEST TAY (tự nghiệm thu)

> Cách dùng: đánh dấu `[x]` khi PASS, ghi chú khi FAIL. Test theo thứ tự — luồng sau phụ thuộc luồng
> trước. Ký hiệu vai trò: **[R]** REPORTER (APK) · **[A]** ADMIN (web) · **[W]** WAREHOUSE
> (web/APK) · **[F]** RESCUE (APK).

### 4.0 Chuẩn bị môi trường
- [ ] Backend chạy (`pnpm be:dev`), DB + Redis qua Docker (Redis host port **16379**, không 56380 — bị Windows reserve).
- [ ] Seed dữ liệu (`pnpm be:db`) — có sẵn user 4 vai trò, kho, thôn, lô hàng.
- [ ] Web chạy (`pnpm fe:dev`, cổng 3200). AI service chạy (`pnpm ai:dev`, cổng 8000).
- [ ] APK cài trên **điện thoại thật**; desktop Digital Twin mở được.
- [ ] **Quan trọng (nghiệm thu thật):** điện thoại + máy web **cùng Wi-Fi LAN**, và thử **tắt
      Internet** (chỉ còn LAN) để kiểm chứng offline-first (bản đồ, tile, OSRM, fallback AI).

### 4.1 Xác thực & phân quyền
- [ ] [A] Đăng nhập ADMIN → vào `/readiness`, thấy **đủ** nhóm nav (Điều hành / Nghiệp vụ kho / Quản trị).
- [ ] [W] Đăng nhập WAREHOUSE → **không** thấy `/users`, `/audit`. Gõ tay URL `/users` → bị đẩy về trang đầu.
- [ ] [F] Đăng nhập RESCUE (APK) → chỉ thấy nhiệm vụ + thông báo; **không** có nút tạo/duyệt/xuất.
- [ ] [R] Đăng nhập REPORTER (APK) → chỉ có màn báo cáo + lịch sử báo cáo của mình.
- [ ] Reload web khi đang đăng nhập → phiên tự khôi phục (không bắt login lại).
- [ ] Đăng xuất → gọi server (kiểm Network thấy `POST /api/auth/logout`), token cũ dùng lại bị từ chối.
- [ ] Đổi mật khẩu 1 user → token/phiên cũ của user đó **chết ngay** (thử API cũ → 401).

### 4.2 Kho (WAREHOUSE)
- [ ] [W] Nhập lô mới (item cũ) → tồn tăng đúng, có mã QR, **in QR** ra được.
- [ ] [W] Nhập lô mới với **item mới** → catalog có item mới.
- [ ] [W] Xuất 1 lô → tồn giảm; lịch sử giao dịch ghi nhận.
- [ ] [W] **Bulk-export** nhiều lô, cố tình cho 1 lô vượt tồn → **rollback toàn bộ** (không lô nào bị trừ).
- [ ] [W] Điều chuyển sang kho khác → chỉ chọn được đích khi có quyền export.
- [ ] [W] Đổi tình trạng 1 lô sang "hư hỏng"/"cần kiểm" → lô đó **biến mất khỏi pool cấp phát** (kiểm ở 4.4).
- [ ] [W] Kiểm kê `/stocktake`: nhập số đếm lệch → thấy chênh lệch, reconcile áp đúng số mới.
- [ ] [W] Bấm gửi 1 thao tác **2 lần nhanh** (double-click) → chỉ ghi **1** giao dịch (idempotency).
- [ ] [W] Tìm kiếm ngữ nghĩa vật tư (gõ gần đúng/không dấu) → ra kết quả; thấy chế độ EMBEDDING vs keyword-fallback.

### 4.3 Báo cáo kiểm kê tháng
- [ ] [W/R] Upload `.xlsx` kiểm kê 1 kỳ → trạng thái **PENDING**, tồn kho **chưa đổi**.
- [ ] Upload lại cùng kho + cùng kỳ → bị chặn (đã có báo cáo active).
- [ ] [A] Duyệt báo cáo → tồn kho đối soát theo số đếm; AuditLog `REPORT_APPROVE` xuất hiện.
- [ ] [A] Từ chối với lý do <3 ký tự → bị chặn; ≥3 ký tự → OK.

### 4.4 Luồng lõi cuộc thi: Báo cáo → Phân tích AI → Mission-to-Kit → Chuẩn bị → Hiện trường
- [ ] [R] (APK) Nhập **giọng nói** mô tả sự cố → PhoWhisper phiên âm ra text tiếng Việt; sửa được rồi gửi.
      (Không có mic → gõ tay vẫn gửi được.)
- [ ] [R] Gửi báo cáo hiện trường → tạo DRAFT; **[A]** nhận thông báo `INCIDENT_REPORTED`.
- [ ] [A] Mở báo cáo, bấm **"Lập kế hoạch"** (`plan-from-report`) → phân tích tại chỗ (không tạo mission trùng).
- [ ] [A] Xem **Phân tích tình huống**: facts có nhãn provenance (REPORTED/VERIFIED/AI_INFERENCE/MISSING), câu hỏi ưu tiên, mục thiếu dữ liệu/mâu thuẫn.
- [ ] [A] Chạy **What-if**: nhập giả định (vd "thêm 20 người, cầu X sập") → thấy delta baseline↔mô phỏng; có dòng **"không áp dụng vào phương án thật"** + fingerprint/ruleVersion.
- [ ] [A] Sinh **Kế hoạch (generate-plan)**: bảng nhu cầu theo định mức (nước 15L/người/ngày…), cấp phát FEFO theo kho gần nhất, **% đáp ứng = mắt xích yếu nhất**.
- [ ] [A] Kiểm **định vị sự cố**: chỉ ghim được khi thôn đã xác minh có tọa độ, hoặc ADMIN tự ghim; không có điểm sự cố → **không duyệt được**.
- [ ] [A] Sinh **Kế hoạch hành động** (`action-plan`) 8 mục + **Diễn giải** tiếng Việt.
- [ ] [A] **Duyệt & phát hành** (`approve`): DRAFT → PENDING_WAREHOUSE; kho + RESCUE nhận thông báo `MISSION_ASSIGNED`.
- [ ] [A] Thử **hủy** khi chưa kho nào xuất → OK. Sau khi 1 kho đã xuất → **hủy bị chặn** ("đã có kho xuất vật tư").
- [ ] [W] Mở "Việc của kho" (`warehouse-requests/own`) → **accept** 1 SKU → **prepare/"Xác nhận xuất vật tư"** → tồn kho giảm đúng lô đã cấp phát.
- [ ] [W] Bấm prepare **2 lần** / 2 tab song song → chỉ **xuất 1 lần** (claim-token CAS).
- [ ] [W] Báo **thiếu/sai** (`discrepancy`, ≥3 ký tự) → **[A]** thấy thông báo `WAREHOUSE_REQUEST_REVIEW`, **duyệt lại** giảm số lượng (≤ requested).
- [ ] **Đa kho:** nhiệm vụ cần 2+ kho → mỗi kho chỉ thấy phần của mình; banner "Tiến độ kho: X/Y"; **chỉ khi tất cả xong** mission mới READY.
- [ ] [F] (APK, read-only) Xem chi tiết nhiệm vụ; gửi **cập nhật hiện trường** text đã tự xác nhận → **[A]** nhận `FIELD_UPDATE_REPORTED`, thấy nhãn ý định AI + confidence; **phương án thật không đổi**.
- [ ] [A] Deep-link từ chuông thông báo → mở đúng nhiệm vụ + đúng field-update (cuộn tới).

### 4.5 Sự cố cảm biến & cảnh báo
- [ ] (Desktop) Chạy Digital Twin phát telemetry ngập/nhiệt độ cao → **[A]** nhận `INCIDENT_DETECTED`; sự cố hiện ở `/incident`.
- [ ] [A] Trợ lý AI **tự bật** (floating) khi sự cố HIGH/CRITICAL; sinh giải thích.
- [ ] [A] Acknowledge → Assign → Resolve; timeline ghi đủ mốc.
- [ ] (Nếu bật email) Đặt `ALERT_EMAIL_ENABLED=true` + SMTP → nhận email BCC. (Không bật → luồng vẫn chạy, chỉ log warn.)
- [ ] Bơm **cùng** telemetry 2 lần → **không** tạo sự cố trùng (khử trùng lặp).

### 4.6 Realtime & offline
- [ ] Mở 2 phiên (ADMIN + WAREHOUSE): thao tác của bên này → bên kia nhận thông báo realtime (không cần F5).
- [ ] **Ngắt WebSocket** (tắt/mở lại mạng LAN nhẹ) → dữ liệu vẫn cập nhật nhờ polling dự phòng.
- [ ] [W] `/map`: lớp mặc định là **offline**; **tắt Internet** → tile vẫn hiển thị trong pack 5 xã; ra ngoài pack → ô xám (không vỡ).
- [ ] Bản đồ điều phối vẽ **tuyến OSRM** khi `routeStatus=ROUTED` (khoảng cách/ETA hiện ở popup kho).
- [ ] (APK) Bật chế độ offline-read → xem được dữ liệu đã cache; thao tác ghi bị chặn đúng cách.

### 4.7 Insight, trợ lý, liên hệ xã
- [ ] [A/W] `/insights`: banner thời tiết, daily briefing (AI hoặc fallback), dự báo số ngày còn lại + chip độ tin cậy, cảnh báo hết hạn ≤30 ngày, gợi ý tái cân bằng.
- [ ] [A/W] Trợ lý `/assistant`: hỏi tiếng Việt về kho → trả lời có dẫn nguồn hệ thống; hỏi vu vơ → **không bịa số kho**.
- [ ] `/contacts` (**không đăng nhập**): xã HOME nhãn "Kho nội xã"; 6 xã lân cận nhãn **"Chưa xác minh tồn kho"**; link `tel:` + Maps hoạt động.
- [ ] Trong phân tích/kế hoạch có đề xuất xã lân cận → **luôn** kèm "đề xuất liên hệ, chưa xác nhận có hàng"; AI **không** tự tuyên bố xã kia có hàng.

### 4.8 Quản trị & Audit (ADMIN)
- [ ] [A] `/users`: tạo user WAREHOUSE (mật khẩu ≥8), gán phạm vi kho; user mới đăng nhập đúng phạm vi.
- [ ] [A] Đổi mật khẩu / xóa user hoạt động; REPORTER **không** tạo được từ web (chỉ seed/mobile).
- [ ] [A] `/audit`: lọc theo entity, phân trang, xem metadata before/after của các thao tác vừa test.
- [ ] [A] `/map` dev mode: kéo-thả ghim tọa độ kho/thôn; thôn bị dời → **quay về "chưa xác minh"**.

### 4.9 Ranh giới bảo mật (kiểm âm — negative test)
- [ ] Cross-tenant: đăng nhập kho tổ chức A, thử đọc/ghi vào kho tổ chức B (sửa ID trên URL/API) → **404/403**.
- [ ] [F] RESCUE gọi thẳng API xuất kho / duyệt (nếu chặn được request) → **403** (thiếu permission).
- [ ] [R] REPORTER gọi API mission list/inventory → **403**.
- [ ] Gửi field-update kèm audio/ảnh/GPS thô → bị **whitelist loại bỏ** (chỉ nhận text đã xác nhận).
- [ ] Đăng nhập bằng secret placeholder / thiếu env bắt buộc → backend **từ chối khởi động** (đã có denylist).

### 4.10 Cổng kỹ thuật (nếu muốn tự chạy lại)
- [ ] `pnpm --filter @safestock/backend exec jest --runInBand` → 94 suite / 557 test PASS.
- [ ] `cd apps/ai-service && python -m pytest -q` → 74 PASS (cần cài `pytest` + deps nhẹ).
- [ ] `pnpm lint` · frontend/mobile/desktop build · `pnpm osrm:test` → xanh.
- [ ] **Push nhánh + để CI thật chạy** `competition-quality.yml` (hiện file chưa commit — đây là bước còn thiếu để "nghiệm thu xong").

---

## Phần 5 — Rủi ro / điểm cần lưu ý khi demo (khách quan)

1. **Workflow CI chưa commit** — mọi thứ mới xanh ở local; chưa có bằng chứng CI trên checkout sạch.
   Đây là khoảng trống nghiệm thu lớn nhất còn lại.
2. **Diễn tập thiết bị thật + LAN offline** chưa làm — cổng tự động không thay được.
3. **Code legacy nhánh RESCUE** (dispatch/confirm/reject/complete) không gắn route — vô hại nhưng nên
   biết để không test nhầm. `INTER_WAREHOUSE_REQUEST` là enum không có emitter (chưa dùng).
4. **Thông báo theo org+role, không theo kho** — 2 user WAREHOUSE khác kho cùng org đều nhận thông
   báo vai trò WAREHOUSE; phân biệt kho dựa vào nội dung, không phải room. Xác nhận đúng ý đồ demo.
5. **Email cảnh báo bỏ qua im lặng** nếu thiếu SMTP env — nếu muốn trình diễn email, phải set env.
6. **Base URL `reports` (số nhiều)** — client cũ gọi `/api/report/*` sẽ 404.
7. **M7 còn lại** (xóa `package-lock.json` thừa) và **M8** (refactor `mission.service.ts`) đang hoãn
   có chủ đích — không ảnh hưởng chức năng, chờ bạn duyệt.

---

_Ghi chú: tài liệu này bổ sung cho `docs/bao-cao-danh-gia-san-sang-du-thi.md` (báo cáo lỗi/độ sẵn
sàng). Chưa commit theo yêu cầu._

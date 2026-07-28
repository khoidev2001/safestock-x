# Kế hoạch: App desktop giả lập cảm biến + app phản ứng (readiness & cảnh báo sự cố)

_Lập ngày: 2026-07-22 · Phạm vi đã chốt với người dùng: **app desktop riêng (Electron)** + **phản ứng đầy đủ (readiness + cảnh báo sự cố)**_

> File này là kế hoạch hành động, KHÔNG phải nguồn trạng thái. Nguồn sự thật vẫn là
> [docs/PRD.md](PRD.md). Khi làm xong hạng mục nào thì tick ở PRD, không tick ở đây.

## 1. Bối cảnh — vì sao làm

Người dùng muốn một "app giả lập" chạy trên máy tính để **chỉnh thông số thiết bị** rồi thấy **app phản ứng** (cảnh báo/đề xuất). Sau khi đọc code thật, phát hiện 2 việc:

1. **Backend đã phản ứng một nửa, còn thiếu một nửa.** Khi chỉnh nhiệt/ẩm qua `emit()`:
   - ✅ Điểm **Readiness** tự tính lại sau ~300ms — [simulation.service.ts:105](../apps/backend/src/simulation/simulation.service.ts#L105).
   - ✅ Cân tải tự sinh giao dịch kho — [simulation.service.ts:94](../apps/backend/src/simulation/simulation.service.ts#L94).
   - ❌ **Cảnh báo sự cố KHÔNG tự bật.** Hàm sinh cảnh báo `scanWarehouse()` chỉ gọi thủ công qua 1 endpoint — [incident.controller.ts:27](../apps/backend/src/incident/incident.controller.ts#L27). Cả `emit()` lẫn runner scenario đều không gọi. Nên kéo nhiệt lên 40°C thì điểm rớt (thấy được) nhưng dòng "⚠️ Bảo quản sai" thì không hiện — đúng cái "wow" demo cần lại đang thiếu.
2. **Chưa có app desktop nào.** Toàn repo không có Electron/Tauri/Vite (chỉ có `sim.html` thô trong `apps/backend/public`, và panel dashboard [simulator-panel.tsx](../apps/frontend/src/components/dashboard/simulator-panel.tsx) hiện **chỉ đọc**).

**Kết luận thiết kế:** tách 2 phần độc lập nhau về giá trị. **Phần 1 (backend wiring)** là phần giá trị cao / rủi ro thấp làm "app biết phản ứng" — dùng chung cho mọi giao diện. **Phần 2 (app desktop)** là công cụ demo mới. Làm Phần 1 trước để dù Phần 2 chưa xong, app vẫn phản ứng đầy đủ.

## 2. Nguyên tắc bất biến (không vi phạm)

- AI/hệ thống KHÔNG bịa số: cảnh báo do rule engine sinh từ event thật đã lưu DB; app desktop chỉ **gửi input cảm biến** và **hiển thị** kết quả backend trả về, không tự tính.
- App desktop là **công cụ demo/test**, KHÔNG phải cổng ghi dữ liệu vận hành. Chỉ chạy local, đăng nhập admin.
- Đơn vị hành chính 2 cấp (tỉnh + xã), không dùng "huyện".
- Không phá luồng `emit()` hiện tại: scan sự cố phải **không chặn** (debounce + catch lỗi, giống `scheduleRecalc`).

---

## 3. PHẦN 1 — Backend: cắm cảnh báo sự cố vào luồng cảm biến (ưu tiên #1)

Mục tiêu: mỗi lần chỉnh thông số (thủ công hoặc scenario), ngoài readiness, **cảnh báo sự cố tự bật realtime** tới UI.

### 3.1. Vì sao cắm ở `SimulationService.emit()` (không phải runner)

`emit()` là **điểm nghẽn chung duy nhất** mà CẢ slider thủ công (`POST /simulator/events`) và scenario runner (`RunnerService.fire → this.sim.emit`, [runner.service.ts:108](../apps/backend/src/simulation/runner.service.ts#L108)) đều đi qua. Cắm ở đây phủ cả 2 đường bằng 1 chỗ sửa; cắm ở runner sẽ bỏ sót slider thủ công.

### 3.2. Không có circular dependency (đã xác minh)

- `IncidentModule` **imports rỗng**, chỉ export `IncidentService` — [incident.module.ts](../apps/backend/src/incident/incident.module.ts).
- `IncidentService` chỉ phụ thuộc `PrismaService` (@Global) + `NotificationService` (`NotificationModule` là **@Global** — [notification.module.ts:7](../apps/backend/src/notification/notification.module.ts#L7)). Không có đường quay lại `SimulationModule`.
- ⇒ Chỉ cần thêm `IncidentModule` vào `SimulationModule.imports`, inject `IncidentService`. **Không cần `forwardRef`.**

### 3.3. Các thay đổi cụ thể

**a) [simulation.module.ts](../apps/backend/src/simulation/simulation.module.ts)** — thêm `IncidentModule` vào `imports`.

**b) [simulation.service.ts](../apps/backend/src/simulation/simulation.service.ts)** — mô phỏng đúng cơ chế `scheduleRecalc` đã có:
- Constructor inject thêm `private incidents: IncidentService`.
- Thêm `private incidentScanTimers = new Map<string, NodeJS.Timeout>()` và hằng `INCIDENT_SCAN_DEBOUNCE_MS = 1200` (nặng hơn recalc 300ms vì `scanWarehouse` chạy 3 query + quét 300 điểm lịch sử; 1200ms đủ gộp burst scenario).
- Thêm hàm `scheduleIncidentScan(warehouseId)` song song với `scheduleRecalc`, gọi `this.incidents.scanWarehouse(warehouseId).catch(...)` (không chặn, log warn khi lỗi).
- Gọi `this.scheduleIncidentScan(input.warehouseId)` trong `emit()` **chỉ khi event thực sự được lưu** (sau nhánh `if (!significant) return null` — vì `scanWarehouse` đọc `sensorEvent` đã persist). Cách sạch: tách biến `const saved = await this.prisma.sensorEvent.create(...)`, gọi `scheduleIncidentScan` rồi `return saved`.

**c) Đường cảnh báo tới UI — KHÔNG cần sửa gateway.** `scanWarehouse` khi phát hiện sự cố mới đã tự gọi `NotificationService.create({ recipientRole: ADMIN, kind: INCIDENT_DETECTED, ... })` — [incident.service.ts:73](../apps/backend/src/incident/incident.service.ts#L73). `NotificationGateway` đẩy event `"notification"` vào room `role:ADMIN` — [notification.gateway.ts:22](../apps/backend/src/notification/notification.gateway.ts#L22). Client (frontend hiện có `NotificationBell`, và app desktop mới) chỉ cần join `role:ADMIN` là nhận được. Dedupe sẵn có chống spam trùng (cùng kind+device đang mở thì bỏ qua) — [incident.service.ts:57](../apps/backend/src/incident/incident.service.ts#L57).

### 3.4. Giá trị demo để chắc chắn bật cảnh báo (theo ngưỡng [incident.rules.ts:47](../apps/backend/src/incident/incident.rules.ts#L47))

| Kéo thông số | Cảnh báo bật | Điều kiện |
|---|---|---|
| Độ ẩm **> 85%** (vd 90%) | Bảo quản sai (BAD_STORAGE) | Chỉ cần 1 nguồn ✅ dễ demo |
| Nhiệt độ **> 35°C** (vd 40°C) | Bảo quản sai | Chỉ cần 1 nguồn ✅ |
| Khói **> 30ppm** (vd 35) **+ nhiệt tăng > 15°C** | Nghi hỏa hoạn (FIRE_RISK, CRITICAL) | Cần 2 nguồn |
| Loadcell giảm xuống **≤ 47kg** + cửa mở + RFID | Nghi thất thoát (SUSPECTED_LOSS) | Cần ≥2 nguồn |
| POWER_OFF (không kèm gateway offline) | Mất điện (POWER_OUTAGE) | 1 nguồn |

Demo an toàn nhất = kéo **độ ẩm 90%** hoặc **nhiệt độ 40°C** (1 nguồn là đủ).

### 3.4b. Bẫy cần biết khi làm (từ khám phá seed vs scenario)

- **Device đã seed cho kho trung tâm** (17 device): `scale_A1/A2/B1/B2/C1/C2/C3` (LOADCELL), `temp_A/B/C` (TEMPERATURE), `humid_A/B/C` (HUMIDITY), `door_main` (DOOR), `gateway_01` (GATEWAY), `smoke_main` (SMOKE), `power_main` (POWER). App desktop render slider theo danh sách **API trả về**, KHÔNG hard-code — nên tự khớp.
- ⚠️ **Kịch bản `fire` tham chiếu `smoke_B` — CHƯA seed** (seed chỉ có `smoke_main`). Khi runner bắn tới device không tồn tại, `emit()` ném `Device không tồn tại` và bị nuốt ở [runner.service.ts:126](../apps/backend/src/simulation/runner.service.ts#L126) → phần khói của kịch bản cháy im lặng hỏng. Demo cảnh báo cháy nên **dùng slider thủ công** (`smoke_main` = 35 + `temp_B` nhảy 28→45) thay vì chạy scenario `fire`. (Sửa scenario/seed nằm ngoài phạm vi kế hoạch này — chỉ ghi chú để demo đúng.)
- ⚠️ **Loadcell dùng baseline cứng 50kg** trong rule ([incident.rules.ts:87](../apps/backend/src/incident/incident.rules.ts#L87)), không phải currentValue seed (80). Muốn bật "nghi thất thoát/lỗi cảm biến" phải kéo cân **≤ 47kg**.
- Bộ lọc lưu event ([simulation.service.ts:14](../apps/backend/src/simulation/simulation.service.ts#L14)): chỉ lưu khi delta đủ lớn (TEMP ≥0.5, HUMID ≥1, LOADCELL ≥0.1, SMOKE ≥5). Slider phải vượt các mức này thì event mới lưu và scan mới thấy.

### 3.5. Test (theo pattern pure-mock sẵn có)

- Thêm `simulation.service.spec.ts`: dùng `jest.useFakeTimers()`, mock `incidents = { scanWarehouse: jest.fn() }`, gọi `emit()` nhiều lần liên tiếp với event significant → `jest.advanceTimersByTime(1200)` → assert `scanWarehouse` gọi **đúng 1 lần** (chứng minh debounce gộp). Mẫu mock tham chiếu [first-warehouse.spec.ts](../apps/backend/src/simulation/__tests__/first-warehouse.spec.ts).
- Không cần test lại `detectIncidents` (đã có `incident.rules.spec.ts`).

---

## 4. PHẦN 2 — App desktop Electron giả lập cảm biến

Mục tiêu: 1 cửa sổ desktop chạy trên máy tính, đăng nhập admin, có **slider chỉnh thông số** + **nút chạy kịch bản**, và **bảng phản ứng realtime** (điểm readiness đổi + cảnh báo sự cố hiện lên). Chạy hoàn toàn offline, kết nối `http://localhost:3100`.

### 4.1. Chọn Electron (không Tauri)

Repo thuần JS/TS, không có Rust toolchain. Electron gần stack sẵn có, tái dùng trực tiếp `socket.io-client` (đã dùng ở frontend, version `^4.8` khớp backend). Tauri nhẹ hơn nhưng thêm phụ thuộc Rust → rủi ro build cho đội 2 người.

### 4.2. Cấu trúc workspace mới `apps/desktop/` (pnpm tự nhận qua `apps/*`, không sửa `pnpm-workspace.yaml`)

```
apps/desktop/
  package.json          # name @safestock/desktop
  electron.vite.config.ts
  src/
    main/index.ts       # Electron main: tạo BrowserWindow
    preload/index.ts    # contextBridge tối thiểu
    renderer/
      index.html
      App.tsx           # UI slider + bảng phản ứng
      lib/api.ts        # login + apiFetch (port từ frontend, base URL cố định)
      lib/socket.ts     # io() gửi access token, backend cấp room, nghe sensor_event + notification
```

Dùng **`electron-vite`** (scaffold sạch main/preload/renderer, HMR renderer). Renderer = React 19 (khớp frontend) để tái dùng type từ `@safestock/shared-types` và pattern gọi API.

### 4.3. Tái dùng có sẵn (tránh viết lại)

- **API client:** port [apps/frontend/src/lib/api.ts](../apps/frontend/src/lib/api.ts) — bỏ `resolveApiBase()` phụ thuộc `window.location`, thay bằng base URL cố định `http://localhost:3100` (cho phép cấu hình qua ô nhập IP để demo LAN). Giữ nguyên `apiFetch` + auto-refresh 401.
- **Login:** `POST /api/auth/login` với định danh ADMIN và mật khẩu runtime → lưu `accessToken`/`refreshToken`/`user`. Header gọi API: `Authorization: Bearer <accessToken>`.
- **WebSocket:** gửi access token qua Socket.IO handshake `auth`; backend xác thực và tự cấp room role/kho từ assignment hiện tại, client chỉ nghe `sensor_event` và `notification`.
- **Danh mục thiết bị/kịch bản:** lấy động — `GET /api/simulator/first-warehouse` → `warehouseId`; `GET /api/simulator/warehouses/:id/devices` → render slider theo device thật; `GET /api/simulator/scenarios` → dropdown kịch bản. Không hard-code device code.

### 4.4. UI app desktop (3 khối)

1. **Kết nối:** ô IP/host (mặc định localhost:3100), nút "Đăng nhập admin", trạng thái WS.
2. **Bảng điều khiển cảm biến:** với mỗi device môi trường (TEMPERATURE/HUMIDITY/SMOKE/LOADCELL) render 1 slider + nhãn tiếng Việt (tái dùng nhãn từ [simulator-panel.tsx:12](../apps/frontend/src/components/dashboard/simulator-panel.tsx#L12)). `onChange` → `POST /api/simulator/events { warehouseId, deviceCode, eventType, value }`. Thêm khối "Kịch bản": dropdown + tốc độ x1/x10 + nút Chạy/Reset (`POST /runs`, `/runs/:id/play|reset`).
3. **Bảng phản ứng realtime:** (a) log `sensor_event` (giống sim.html); (b) **điểm Readiness hiện tại** — poll `GET /api/readiness/...` sau mỗi lần chỉnh hoặc nghe socket rồi refetch; (c) **danh sách cảnh báo sự cố** — nghe event `"notification"` (kind INCIDENT_DETECTED) hiện toast/list đỏ. Đây là phần chứng minh "app phản ứng".

### 4.5. Script & đóng gói

- `apps/desktop/package.json`: `dev` (electron-vite dev), `build` (electron-vite build), `package` (electron-builder ra `.exe` portable Windows).
- Root [package.json](../package.json): thêm `"desktop:dev": "pnpm --filter @safestock/desktop dev"` (theo mẫu `be:dev`/`fe:dev`).
- Phụ thuộc mới (chỉ trong `apps/desktop`): `electron`, `electron-vite`, `electron-builder`, `react`, `react-dom`, `socket.io-client`.

### 4.6. Rủi ro & giảm thiểu

- **CORS/`file://`:** backend `enableCors()` mặc định + gateway `origin:"*"` → không chặn. Dev chạy qua HTTP dev server của electron-vite (origin `http://localhost:<port>`) an toàn; production Electron load renderer nội bộ, gọi API qua `Authorization` header (không cookie) nên không dính CORS credentials.
- **Đội 2 người + tooling mới:** giữ app desktop **tối giản** (1 cửa sổ, không router, không state phức tạp). Nếu thời gian gấp, Phần 1 đã đủ để demo phản ứng ngay trên web; app desktop là lớp "wow" bổ sung.

---

## 5. Thứ tự thực thi đề xuất

0. Lưu kế hoạch này thành `docs/plan-app-desktop-gia-lap-cam-bien.md` + trỏ ở PRD mục 12.
1. **Phần 1 (backend wiring)** — sửa 2 file + 1 test. Nghiệm thu: chạy scenario/kéo slider qua `sim.html` hoặc REST → thấy `INCIDENT_DETECTED` xuất hiện (query `GET /api/incidents` hoặc `NotificationBell` trên web). Đây là mốc "app phản ứng" xong.
2. **Phần 2 (app desktop)** — scaffold `apps/desktop`, login + sliders + bảng phản ứng. Nghiệm thu: mở app desktop, kéo độ ẩm lên 90% → trong ≤2s điểm readiness rớt VÀ cảnh báo "Bảo quản sai" hiện trên chính app desktop (và trên dashboard web đang mở song song).

## 6. Kiểm thử end-to-end

```powershell
# Backend + test Phần 1
pnpm --filter @safestock/backend test -- --runInBand
pnpm --filter @safestock/backend build

# Chạy full stack
pnpm infra:up ; pnpm be:dev   # terminal 1
pnpm fe:dev                    # terminal 2 (mở dashboard xem NotificationBell)
pnpm desktop:dev               # terminal 3 (app giả lập)
```

Kịch bản demo: đăng nhập admin trên app desktop → kéo **độ ẩm 90%** hoặc **nhiệt độ 40°C** → xác nhận: (1) log `sensor_event`, (2) điểm readiness đổi, (3) cảnh báo sự cố "Bảo quản sai" bật realtime cả trên desktop lẫn dashboard web. Kéo về ngưỡng an toàn → readiness hồi phục (cảnh báo cũ giữ tới khi RESOLVED — đúng thiết kế chống spam).

## 7. Danh sách file đụng tới

**Sửa (Phần 1):**
- [apps/backend/src/simulation/simulation.module.ts](../apps/backend/src/simulation/simulation.module.ts) — thêm import IncidentModule
- [apps/backend/src/simulation/simulation.service.ts](../apps/backend/src/simulation/simulation.service.ts) — inject IncidentService + scheduleIncidentScan + gọi trong emit()
- `apps/backend/src/simulation/__tests__/incident-scan-debounce.spec.ts` — mới, test debounce scan (gộp 3 event → 1 lần scan; delta nhỏ → không lưu, không scan)

**Tạo mới (Phần 2):** thư mục `apps/desktop/**` (electron-vite + React renderer), sửa root `package.json` thêm script `desktop:dev`.

**Tài liệu:** `docs/plan-app-desktop-gia-lap-cam-bien.md` (bản này), cập nhật `docs/PRD.md` mục 12.

---

## 8. Trạng thái thực thi (2026-07-22)

**Đã hoàn thành cả 2 phần** — nghiệm thu compile/test:

- **Phần 1 (backend wiring):** `emit()` nay gọi `scheduleIncidentScan` (debounce 1200ms) sau khi
  event được lưu → cảnh báo sự cố tự bật realtime qua `NotificationService → NotificationGateway`.
  Test `incident-scan-debounce.spec.ts` PASS (175/175 test toàn backend), `nest build` sạch.
- **Phần 2 (app desktop):** `apps/desktop` scaffold bằng electron-vite (main/preload/renderer React 19).
  UI 3 khối: kết nối/đăng nhập admin · slider cảm biến + kịch bản · bảng phản ứng (điểm readiness,
  danh sách cảnh báo, nhật ký realtime). `typecheck` + `electron-vite build` sạch.

**Lưu ý kỹ thuật phát hiện khi làm:**
- POST `/simulator/events` thủ công **không** phát `sensor_event` qua WS (chỉ scenario runner phát) →
  desktop **echo cục bộ** mỗi lần kéo slider + refetch readiness/incidents sau ~1.5s (chờ debounce backend).
- Readiness API trả `operationalStatus` (READY | NEEDS_ACTION | NOT_DISPATCHABLE), không phải `status`.
- Notification chỉ đẩy khi có sự cố **mới** (dedupe) → desktop refetch cả list incidents để không phụ
  thuộc riêng vào push, phủ trường hợp sự cố đã tồn tại từ trước.
- Chạy demo: `pnpm desktop:dev` (cần backend chạy sẵn ở `localhost:3100`).

---

## 9. PHẦN 3 — AI TỰ ĐỘNG cảnh báo qua tin nhắn + email (Hướng A · Ollama) · 2026-07-22

Nối tiếp Phần 1+2. Người dùng hỏi "thêm AI vào phần cảnh báo IoT được không" → ban đầu làm **nút
"Giải thích bằng AI"** (bấm thủ công). Người dùng phản hồi: **"Không phải làm nút. Mỗi lần thay đổi
thì cảnh báo bằng AI qua tin nhắn"** + **"thông báo qua cửa sổ chat + email"**.

⇒ Đổi từ **pull (bấm)** sang **push tự động**: hễ cảm biến đổi làm **bật sự cố MỚI**, backend tự gọi
AI giải thích rồi đẩy cùng nội dung tới **4 kênh**: nhật ký realtime desktop · chuông thông báo web ·
trợ lý chat web (tự mở nếu nghiêm trọng) · **email SMTP thật** (Gmail).

### 9.1. Kiến trúc — không chặn, không mất cảnh báo

Điểm cắm: vòng lặp sự cố mới trong [incident.service.ts](../apps/backend/src/incident/incident.service.ts)
`scanWarehouse` (đã dedupe `kind|deviceCode` đang mở → chỉ chạy sự cố **thật sự mới**). Phủ cả slider
thủ công lẫn scenario runner (đều qua `emit → scheduleIncidentScan → scanWarehouse`).

Thứ tự (quan trọng để AI chậm ~90s không chặn):
1. `persist` + `notifications.create` → **cảnh báo rule-based NỔ TỨC THÌ** (chuông/desktop/chat thấy ngay).
2. `enrichNewIncident(incidentId, notificationId)` chạy **fire-and-forget** (không `await`):
   - `ai.explain(buildIncidentContext(incident))` → lưu `explanation` → `notifications.updateAndPush`
     đè `body` của **đúng notification vừa tạo** (cùng id → client thay tại chỗ, không nhân đôi).
   - `mail.sendIncidentAlert(incident, explanation)`.
   - AI lỗi → **không lưu explanation** (không mạo danh AI), vẫn gửi email bản rule-based.

`AiModule` + `NotificationModule` đều `@Global` → inject thẳng vào `IncidentService`, **không circular dep**.
`buildContext` tách khỏi controller thành helper thuần [incident.context.ts](../apps/backend/src/incident/incident.context.ts)
dùng chung. Endpoint `POST /:id/explain` giữ lại (vô hại) nhưng **không còn UI nào gọi**.

**Bất biến giữ nguyên:** rule engine quyết định CÓ cảnh báo (từ sensor thật); AI chỉ DIỄN GIẢI,
không bịa số (prompt `_EXPLAIN_SYSTEM` + context chỉ chứa số đã tính).

### 9.2. Thay đổi

**Backend:**
- [incident.service.ts](../apps/backend/src/incident/incident.service.ts) — inject `ai` + `mail`;
  `enrichNewIncident` (AI → setExplanation → updateAndPush → email); body notification dùng nhãn
  severity tiếng Việt.
- [incident.context.ts](../apps/backend/src/incident/incident.context.ts) (mới) — helper thuần build context.
- [notification.service.ts](../apps/backend/src/notification/notification.service.ts) — `updateAndPush(id, data)`.
- [mail/alert-mail.service.ts](../apps/backend/src/mail/alert-mail.service.ts) + [mail/mail.module.ts](../apps/backend/src/mail/mail.module.ts) (mới)
  — `nodemailer`, guard `isConfigured()` (giống BackupService), lỗi gửi bị nuốt (log warn).
- [incident.module.ts](../apps/backend/src/incident/incident.module.ts) — import `MailModule`.
- [.env.example](../.env.example) — khối SMTP (`ALERT_EMAIL_ENABLED=false`, Gmail App Password), khóa rỗng.
- [apps/backend/package.json](../apps/backend/package.json) — `nodemailer` + `@types/nodemailer`.

**Web dashboard:**
- [lib/incident-alert-store.ts](../apps/frontend/src/lib/incident-alert-store.ts) (mới, zustand) —
  hàng đợi bong bóng AI + `seenExplainedIds` (dedupe) + `autoOpenReq`.
- [components/assistant/use-incident-alerts.ts](../apps/frontend/src/components/assistant/use-incident-alerts.ts) (mới hook) —
  sự cố có `explanation` & chưa seen → `pushAlert`; HIGH/CRITICAL → `requestAutoOpen`.
- [app/page.tsx](../apps/frontend/src/app/page.tsx) — socket "notification" invalidate `open-incidents`;
  `refetchInterval` fallback; mount hook bridge.
- [assistant/assistant-chat.tsx](../apps/frontend/src/components/assistant/assistant-chat.tsx) — trộn
  bong bóng cảnh báo AI (đỏ) vào turns, dedupe theo id.
- [assistant/floating-assistant.tsx](../apps/frontend/src/components/assistant/floating-assistant.tsx) —
  theo dõi `autoOpenReq` → tự mở + mở rộng.
- [dashboard-api.ts](../apps/frontend/src/lib/dashboard-api.ts) + [incident-view.tsx](../apps/frontend/src/components/dashboard/incident-view.tsx)
  — **gỡ** nút/`explainIncident`; **giữ** khối hiển thị `explanation` (nay tự có).

**Desktop:**
- [App.tsx](../apps/desktop/src/renderer/App.tsx) — **gỡ** nút + state/handler; `onNotification` tách
  dòng AI (body có `" — "`) hiện "🤖 AI cảnh báo"; thẻ hiện `explanation` hoặc "AI đang phân tích…".
- [lib/backend.ts](../apps/desktop/src/renderer/lib/backend.ts) — gỡ `explainIncident`, giữ field.
- [styles.css](../apps/desktop/src/renderer/styles.css) — gỡ `.btn.ai`/`.ai-error`, thêm `.ai-pending`.

### 9.3. Edge case tự review

- **AI chậm/không chặn.** `enrichNewIncident` fire-and-forget → cảnh báo rule-based nổ trong ~1.2s;
  text AI + email tới sau, không chặn scan/emit.
- **Ollama/ai-service tắt** → `ai.explain` ném 503 → bắt trong `enrichNewIncident`: không lưu
  explanation, email gửi bản rule-based, cảnh báo tức thì vẫn nguyên mọi kênh. **Test hóa** ở
  `incident-enrich.spec.ts`.
- **SMTP tắt/sai** → `isConfigured` skip êm hoặc transport lỗi bị nuốt → không phá luồng. **Test hóa**
  ở `alert-mail.spec.ts`.
- **Không spam** → dedupe sự cố sẵn có + enrich đúng 1 lần + **cập nhật đúng 1 notification** (không
  tạo bản mới); web bridge dedupe `seenExplainedIds` → bong bóng chat không lặp khi refetch/reconnect.
- **Evidence rỗng** → helper context + email vẫn có title/severity/confidence, không crash.

### 9.4. Nghiệm thu

- `pnpm --filter @safestock/backend exec jest --runInBand` → **182/182 pass** (thêm 7 test:
  incident-enrich 2 + alert-mail 5). `nest build` sạch.
- `pnpm --filter @safestock/desktop typecheck` + `build` sạch.
- `pnpm --filter @safestock/frontend build` sạch (compile + typecheck + lint 5/5 trang).
- **Chạy live (cần Ollama + SMTP trong `.env`):** `ollama serve` → `pnpm ai:dev` → kéo độ ẩm 90% →
  cảnh báo nổ ngay (chuông web + nhật ký desktop); vài giây sau **text AI tự hiện** (không bấm) ở
  nhật ký desktop, thẻ sự cố (desktop + web), chuông web, bong bóng trợ lý web (tự mở nếu HIGH), và
  **email tới `ALERT_EMAIL_TO`**. ⚠️ Bước chạy Ollama/SMTP thật **chưa** thực hiện trong phiên này —
  mới nghiệm thu compile/build/test tĩnh.

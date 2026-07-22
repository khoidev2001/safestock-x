# PRD + Checklist + Kế hoạch cuối - Ứng phó nhanh

> Nguồn sự thật duy nhất về phạm vi sản phẩm, trạng thái thực tế và thứ tự triển khai.
> Các plan, audit, work-log cũ đã chuyển vào `docs/archive/2026-07-21-before-master-prd/` để tra cứu lịch sử, không dùng để kết luận tiến độ hiện tại.

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 3.1 - cập nhật chức năng đã triển khai |
| Ngày đối chiếu | 2026-07-22 |
| Trạng thái | Đang phát triển; chưa đạt MVP end-to-end; chưa an toàn để mở Internet production |
| Mức hoàn thành thực tế | Khoảng 45-55% nếu chấm theo workflow vận hành và PRD |
| Điểm audit khó tính | 4,5/10 |
| Phạm vi kiểm chứng | Toàn bộ tài liệu, backend, frontend, desktop, AI service, mobile, shared packages và hạ tầng |

## 0. Cách dùng tài liệu

Tài liệu này đồng thời là:

1. **PRD:** sản phẩm phải giải quyết gì, cho ai, theo contract nào.
2. **Checklist:** phần nào đã đạt, phần nào còn thiếu hoặc đang hỏng.
3. **Plan:** thứ tự sửa và điều kiện thoát từng giai đoạn.

Quy ước:

- `[x]` chỉ dùng khi hành vi đã tồn tại và có bằng chứng build/test hoặc kiểm tra thực tế.
- `[ ]` nghĩa là chưa đạt điều kiện nghiệm thu, kể cả khi đã có một phần code/UI.
- `Một phần` không được tính là hoàn thành MVP.
- Dấu tick trong roadmap cũ không phải bằng chứng nếu workflow end-to-end chưa chạy.
- Khi code thay đổi, cập nhật mục checklist tương ứng tại đây; không tạo thêm plan rời nếu chưa thật sự cần một thiết kế chuyên sâu.

## 1. Kết luận điều hành

Ứng phó nhanh có lõi kỹ thuật thật. Readiness, Mission-to-Kit, rule engine, Action Plan, Geo fallback và cách giới hạn LLM đều có giá trị. Dự án không phải mock UI.

Khoảng cách lớn nhất không nằm ở số lượng endpoint. Vấn đề là các lát cắt chưa ghép thành workflow đúng, an toàn, atomic, scoped theo kho và dùng được qua nhiều tài khoản độc lập.

Trạng thái hiện tại:

| Thành phần | Đánh giá thực tế |
|---|---|
| Backend rule/algorithm | Khá mạnh, nhiều phần chạy thật |
| Backend nghiệp vụ dữ liệu | Còn lỗi integrity, concurrency, scope nghiêm trọng |
| Frontend web | Trình bày được nhiều màn; workflow vận hành còn thiếu/hỏng |
| AI service | Gemini/Ollama dùng được; test và hardening thiếu |
| Mobile | Chưa có source app thực tế |
| Deployment/offline | Có domain, tunnel và script nền; chưa nghiệm thu đầy đủ |
| MVP theo PRD | Chưa hoàn thành |
| Production Internet | Chưa được phép coi là an toàn |

### 1.1. Chức năng mới đã có và bằng chứng bàn giao (2026-07-22)

| Chức năng | Hành vi hiện có | Bằng chứng chính | Giới hạn phải biết |
|---|---|---|---|
| Hồ sơ cá nhân | Nút profile thay nút đăng xuất; xem/sửa avatar, họ tên, số điện thoại, email cá nhân nhận cảnh báo; xem đơn vị dạng `Xã ...`; đăng xuất nằm trong dialog | `apps/frontend/src/components/profile/`, `apps/frontend/src/lib/profile-api.ts`, `apps/backend/src/auth/`, `apps/backend/src/auth/__tests__/auth-profile.spec.ts` | Email cá nhân chưa có bước xác minh; avatar là WebP data URL lưu DB, giới hạn 80.000 ký tự |
| Scope tài khoản theo xã | `/auth/me` đọc hồ sơ mới từ DB; admin toàn xã mở kho trung tâm thuộc đúng `organizationId`; cache profile/kho tách theo user | `apps/backend/src/auth/auth.service.ts`, `apps/backend/src/simulation/simulation.service.ts`, `apps/backend/src/simulation/__tests__/first-warehouse.spec.ts`, `apps/frontend/src/components/dashboard/dashboard-shell.tsx` | Scope chưa được centralize cho mọi API/WebSocket; bản đồ offline vẫn là bộ dữ liệu cụm Đồng Xuân |
| Email cảnh báo sự cố | SMTP tùy chọn; gửi tới email cá nhân đúng tổ chức/kho, loại trùng, dùng BCC; `ALERT_EMAIL_TO` chỉ fallback; template không hiển thị điểm tin cậy | `apps/backend/src/mail/`, `apps/backend/src/incident/incident.service.ts`, `.env.example` | Chưa có email verification/outbox/retry bền vững; SMTP lỗi chỉ log và không chặn luồng sự cố |
| AI diễn giải sự cố | Sự cố rule-based tạo ngay; AI chạy nền để lưu explanation, cập nhật notification và email; AI lỗi vẫn giữ sự cố/email rule-based | `apps/backend/src/incident/incident.context.ts`, `apps/backend/src/incident/__tests__/incident-enrich.spec.ts`, `apps/frontend/src/components/dashboard/incident-view.tsx` | Chưa có bộ redaction/output-safety đầy đủ cho AI service; AI không được quyết định severity hoặc bịa số |
| Cảnh báo trong trợ lý web | Sau khi query/refetch thấy sự cố đã có AI explanation, dữ liệu được đồng bộ sang bong bóng trợ lý; sự cố nghiêm trọng có thể tự mở cảnh báo | `apps/frontend/src/components/assistant/use-incident-alerts.ts`, `apps/frontend/src/lib/incident-alert-store.ts`, `apps/frontend/src/components/assistant/floating-assistant.tsx` | Incident view vẫn polling; WebSocket handshake chưa xác thực JWT và chưa có browser E2E |
| App desktop giả lập cảm biến | Electron app đăng nhập admin demo, chọn backend, xem/chỉnh thiết bị, chạy scenario, theo dõi readiness, incident và log realtime | `apps/desktop/`, lệnh `pnpm desktop:dev` | Chỉ là công cụ demo/test; credentials tài khoản seed đang hard-code trong renderer; chưa được phép ghi production |
| Sensor emit tự kích hoạt incident | Event cảm biến đã persist sẽ lên lịch scan incident debounce 1,2 giây; burst event được gộp, lỗi scan không chặn cập nhật sensor | `apps/backend/src/simulation/simulation.service.ts`, `apps/backend/src/simulation/__tests__/incident-scan-debounce.spec.ts` | Dedupe chỉ chặn sự cố cùng loại/thiết bị còn mở; simulator isolation/permission production vẫn chưa hoàn tất |

Năm blocker trực tiếp:

1. Simulator có thể làm sai tồn kho thật và ghi actor admin không đúng.
2. Transfer nhận `quantity` nhưng di chuyển toàn batch.
3. Mission đa role không chạy qua các phiên đăng nhập độc lập.
4. Web trả vật tư gửi sai contract backend.
5. Kịch bản demo simulator -> readiness realtime -> mobile QR chưa tồn tại end-to-end.

## 2. Bài toán và giá trị sản phẩm

### 2.1. Vấn đề

Phần mềm kho thông thường trả lời kho đang ghi nhận bao nhiêu hàng. Trong cứu hộ, cần biết vật tư nào **thực sự dùng được ngay**, có bị hỏng/hết hạn/khóa/đang mượn không, kho đáp ứng được tình huống nào và điểm nghẽn nào làm chậm phản ứng.

### 2.2. Giải pháp

Ứng phó nhanh phải trả lời bốn câu hỏi:

1. Vật tư nào đang thực sự sẵn sàng?
2. Kho có blocker vận hành nào?
3. Với tình huống cụ thể, cần gì và đáp ứng được bao nhiêu?
4. Ai phải làm gì tiếp theo để chuẩn bị và bàn giao vật tư?

### 2.3. Tuyên bố giá trị

> Ứng phó nhanh quản lý năng lực phản ứng thực tế của kho, không chỉ số tồn trên sổ.

### 2.4. Mục tiêu MVP

- Quản lý tồn, lô, tình trạng, lưu hành, kiểm kê, mượn-trả và audit.
- Đánh giá Readiness theo blocker, sáu chiều, lý do và hành động.
- Biên dịch tình huống thành nhu cầu, phân bổ FEFO và Action Plan có kiểm chứng số.
- Khép workflow ADMIN -> RESCUE -> WAREHOUSE qua các phiên độc lập.
- Mô phỏng cảm biến deterministic, realtime nhưng không gây rủi ro cho dữ liệu production.
- Chạy được online qua domain và offline trong LAN với AI local.
- Có bộ kiểm thử đủ chứng minh quyền, concurrency và workflow chính.
- Nếu Mobile còn là deliverable: có APK và test trên thiết bị thật.

### 2.5. Ngoài phạm vi MVP

- Nhận diện khuôn mặt, computer vision phức tạp, blockchain, drone.
- Đồng bộ database tự động giữa các xã.
- Offline-write tự động merge tồn kho.
- OR-Tools hoặc tối ưu hóa phức tạp khi greedy + FEFO đã đủ.
- Dự báo thiên tai cấp tỉnh hoặc bản đồ GIS nghiệp vụ quy mô lớn.
- AI tự tính tồn, tự duyệt nghiệp vụ, chạy SQL/shell hoặc thực thi hành động nguy hiểm.

## 3. Người dùng, quyền và ranh giới dữ liệu

| Role | Trách nhiệm | Không được phép |
|---|---|---|
| `ADMIN` | Quản trị user, tạo mission, giám sát, hậu kiểm, cấu hình | Không được thay actor thật bằng admin hệ thống cho thao tác tự động |
| `WAREHOUSE` | Vận hành kho được phân công, chuẩn bị/xuất mission, kiểm kê, mượn-trả | Không đọc/ghi kho ngoài scope nếu không được giao rõ |
| `RESCUE` | Xem và xác nhận mission, nhận/hoàn vật tư, xem thông tin cần thiết | Không mutate simulator, tồn kho hoặc incident bằng quyền xem |

Quyết định nền:

- Mô hình kiểm soát là **hậu kiểm**, không duyệt hai bước cho mọi thao tác.
- Mỗi xã vận hành một hệ thống và một database độc lập.
- Trong xã: một kho tổng + nhiều kho thôn dùng chung `communeId`.
- Liên xã: chỉ lưu metadata kho lân cận và gợi ý liên hệ; không sync database.
- Mọi read/write/AI snapshot phải được scope theo tổ chức, xã và kho.
- WebSocket room do server suy ra từ JWT và assignment; client không tự khai role/kho đáng tin cậy.

## 4. Nguyên tắc kiến trúc bất biến

### 4.1. AI và nghiệp vụ

| Thành phần | Được làm | Không được làm |
|---|---|---|
| LLM | Parse tiếng Việt, diễn giải, viết narrative theo context | Tính tồn, tự bịa số, tự phê duyệt, thực thi mutation |
| Backend | Auth, scope, transaction, audit, state transition | Tin dữ liệu quyền từ client |
| Rule engine | Readiness, severity, forecast, nhu cầu, fulfillment | Dùng trung bình để che thiếu vật tư thiết yếu |

Mọi con số tồn, phần trăm đáp ứng, severity, ETA và forecast phải truy được về backend/rule/GeoService. LLM chỉ dùng số đã cung cấp.

### 4.2. Readiness

Thứ tự quyết định bắt buộc:

1. Blocker vận hành.
2. Trạng thái từng chiều: số lượng, tình trạng, hạn dùng, tiếp cận, môi trường, độ tin cậy.
3. Khả năng đáp ứng tình huống theo SKU yếu nhất.
4. Điểm 0-100 chỉ để xem xu hướng.

### 4.3. Tồn kho

- Không cho tồn âm.
- Xuất, mượn, hoàn, fulfillment và duyệt báo cáo phải transactionally safe.
- Partial transfer phải tách batch hoặc contract phải đổi rõ thành whole-batch. Bản kế hoạch này chọn **tách batch khi chuyển một phần** để khớp contract `quantity`.
- ON_LOAN không được tính là khả dụng.
- Mượn một phần không được khóa toàn bộ batch còn lại.
- Audit phải ghi đúng actor, target, thời điểm, lý do và before/after.

### 4.4. Simulator

- Simulator là môi trường demo/test, không phải nguồn được phép tự do sửa tồn production.
- Production mặc định disable mutation simulator.
- Nếu bật trong demo mode: permission riêng, warehouse scope, system actor riêng và dữ liệu/tenant tách biệt.
- Cùng seed phải sinh cùng chuỗi sự kiện.

### 4.5. Online/offline

- Online: `ungphonhanh.life` qua Cloudflare Tunnel, same-origin web/API.
- Offline trong LAN: backend, PostgreSQL, Redis, AI Service và Ollama chạy local.
- Mất LAN ngoài hiện trường: chỉ offline-read; nhập bù bằng quy trình có kiểm soát khi mạng về.
- Không phụ thuộc CDN cho kịch bản demo offline.

## 5. Ma trận yêu cầu và trạng thái thực tế

### 5.1. Nền tảng, auth và scope

- [x] NestJS, Prisma, PostgreSQL, Redis, health check và seed có thật.
- [x] JWT access/refresh, permission map và ba role có thật.
- [x] `GET/PATCH /api/auth/me` có hồ sơ DB-backed và chỉ cho tự sửa họ tên, số điện thoại, email cảnh báo, avatar.
- [x] Login/refresh trả hồ sơ mở rộng; frontend cache hồ sơ theo user và không giữ profile của tài khoản trước.
- [x] Admin toàn xã chọn kho trung tâm trong đúng `organizationId`; tài khoản kho mở đúng kho được gán.
- [ ] Email cá nhân nhận cảnh báo có bước xác minh trước khi kích hoạt.
- [ ] Warehouse/organization scope áp nhất quán cho mọi read, write, AI snapshot và WebSocket.
- [ ] Auth có rate limit, refresh rotation/revocation và quản lý session.
- [ ] Token frontend không còn phụ thuộc `localStorage` cho mô hình production.
- [ ] Navigation chỉ hiển thị route user có quyền và backend vẫn enforce độc lập.

**Verdict:** nền auth có, security boundary chưa đạt production.

### 5.2. Inventory và audit

- [x] Đọc cây kho, batch, scan SKU và tồn cơ bản.
- [x] Backend có import, export, bulk export, adjust và reconcile.
- [x] Export thường/bulk có conditional update chống âm tồn ở một số path.
- [ ] Transfer theo `quantity` đúng semantics, atomic và scoped nguồn/đích.
- [ ] Web có đủ import/export/bulk/transfer/adjust; hiện phần lớn backend-only.
- [ ] Mọi mutation có error state rõ; không được nuốt lỗi thành trạng thái rỗng/an toàn.
- [ ] Audit 5W đạt 100% với actor thật và target đầy đủ.
- [ ] Concurrency test chứng minh không âm tồn và không lost update.

**Verdict:** backend feature nhiều nhưng chưa thể gọi là inventory workflow hoàn chỉnh.

### 5.3. Mượn-trả

- [x] Có model và endpoint borrow/return.
- [x] Có khái niệm ok/hỏng/mất và trừ phần đang mượn khỏi khả dụng.
- [ ] Web gửi đúng contract `{ ok, damaged, lost }`.
- [ ] Borrow/return atomic khi hai request đồng thời.
- [ ] Tình trạng hỏng được lưu đúng, không mất thông tin condition.
- [ ] Partial loan chỉ trừ số lượng mượn, không làm toàn batch mất eligibility.
- [ ] Web có luồng tạo phiếu, hoàn từng phần và hiển thị lỗi.

**Verdict:** hiện không dùng được end-to-end an toàn.

### 5.4. Readiness

- [x] Có sáu thành phần, trọng số, reason và recommendation.
- [x] Có trạng thái `READY / NEEDS_ACTION / NOT_DISPATCHABLE` và blocker nền.
- [x] Mission loại lô hỏng, cần kiểm tra, hết hạn, kệ khóa và phần đang mượn.
- [ ] Blocker theo vật tư bắt buộc/tình huống và cấu hình địa phương đầy đủ.
- [ ] Recalc nhất quán sau mọi loan, report, transfer và mutation liên quan.
- [ ] Dữ liệu sensor quá hạn được thể hiện là unknown/stale, không thành safe state.
- [ ] Web cập nhật readiness realtime dưới 2 giây khi dữ liệu đổi.
- [ ] Browser E2E chứng minh blocker luôn thắng điểm tổng.

**Verdict:** hướng sản phẩm mạnh; implementation là strong partial, chưa hoàn tất contract PRD.

### 5.5. Mission-to-Kit và Action Plan

- [x] Parse tình huống qua Gemini/Ollama và validate schema.
- [x] Backend tính nhu cầu, FEFO, greedy và mức đáp ứng theo SKU yếu nhất.
- [x] Action Plan 8 mục có backend severity/forecast và template fallback.
- [x] GeoService có Haversine offline và Google Routes fallback/quota guard.
- [ ] Fulfillment atomic, idempotent và không double-export khi retry.
- [ ] Allocation/fulfillment scoped theo kho được giao.
- [ ] Mission inbox/list theo role và trạng thái.
- [ ] Notification deep-link mở đúng mission.
- [ ] ADMIN, RESCUE, WAREHOUSE hoàn thành workflow qua ba phiên độc lập.
- [ ] Seed/toạ độ đủ để chứng minh chọn kho gần nhất trong demo.

**Verdict:** compute tốt; workflow vận hành chưa khép kín.

### 5.6. Simulator, realtime và incident

- [x] Có virtual device, scenario deterministic, runner và event timeline.
- [x] Có rule incident, evidence, anomaly và predictive warning.
- [x] Sensor event đã persist tự kích hoạt incident scan nền có debounce; không chặn luồng emit khi scan lỗi.
- [x] App desktop Electron có điều khiển thiết bị/scenario, readiness, incident và log realtime cho demo local.
- [x] Sự cố mới được AI diễn giải nền, lưu explanation, cập nhật notification/email; AI lỗi vẫn giữ cảnh báo rule-based.
- [x] Email sự cố hỗ trợ SMTP, người nhận theo profile + organization/warehouse scope, BCC và fallback vận hành.
- [x] Web hiển thị explanation và đưa sự cố vào bong bóng trợ lý sau khi query/refetch thấy bản AI enrichment.
- [ ] Simulator mutation bị khóa khỏi production và có permission/scope riêng.
- [ ] Next.js có play/pause/reset/x1/x10 và chỉnh thiết bị; hiện panel chủ yếu read-only.
- [ ] Socket.IO handshake xác thực JWT; room do server cấp.
- [ ] Readiness/incident UI subscribe realtime đúng kho.
- [ ] Incident view có detail, evidence timeline, assign/ack/resolve đúng permission.
- [ ] Redaction, prompt-injection defense và output-safety test cho AI explain-incident hoàn chỉnh.
- [ ] `sim.html` không dùng CDN/credential hard-code nếu còn dùng cho demo.

**Verdict:** demo path đã có app desktop và phản ứng sensor -> readiness/incident; integration vẫn chưa an toàn cho production vì simulator permission/isolation và WebSocket auth chưa đạt.

### 5.7. Normal Mode, assistant và report

- [x] Có forecast cạn kho, hạn dùng, rebalance, trend, weather và monthly narrative.
- [x] Có assistant dùng snapshot kho, câu nhanh, Ollama cho câu mở và trả lời trực tiếp tình huống khẩn cấp trong chat; tình huống có người mắc kẹt có fallback không phụ thuộc AI/database.
- [ ] Snapshot assistant/insights scope đúng kho và quyền.
- [ ] Report approval atomic, idempotent và xử lý đúng SKU có nhiều batch.
- [ ] Role frontend/backend cho report thống nhất.
- [ ] AI service có automated test và policy redaction/output đầy đủ.
- [ ] Forecast nâng từ trung bình phẳng lên dự báo thống kê có độ tin cậy và reorder point (chi tiết: `docs/plan-tang-ham-luong-ai-di-thi.md`, B2).
- [ ] Trợ lý có RAG trích dẫn nguồn định mức (Sphere/PCTT) chạy offline; không trả lời ngoài corpus (chi tiết: plan AI, B1).
- [ ] Dự báo nhu cầu theo thời tiết: nối forecast tiêu thụ + mưa 72h Open-Meteo để cảnh báo thiếu vật tư trước thiên tai (plan AI, B4).
- [ ] Semantic search vật tư bằng embedding local (plan AI, B5).
- [ ] Bản tin AI đầu ngày tóm tắt readiness/forecast/incident/thời tiết cho lãnh đạo xã (plan AI, B6).
- [ ] Chuẩn hóa nhập liệu bằng embedding, chỉ gợi ý cho người duyệt, làm sau khi inventory ổn định (plan AI, B7).

**Verdict:** basic usable; thiếu integration/security proof. Ghi chú chiều sâu AI: phần "forecast/insight" hiện là thống kê tuyến tính, không phải ML — cần gọi đúng tên và nâng theo plan AI để chống bị bắt bài khi phản biện.

### 5.8. Mobile

- [ ] Expo scaffold và auth bằng SecureStore.
- [ ] Trang chủ, kho, readiness, mission và cảnh báo.
- [ ] QR scan + nhập SKU tay + nhập/xuất/chuyển/kiểm tra/báo hỏng.
- [ ] RESCUE nhận/hoàn vật tư và báo hỏng/mất.
- [ ] Offline-read cache và badge trạng thái.
- [ ] APK build, cài và test trên thiết bị Android thật.

**Verdict:** chưa triển khai. Nếu Mobile vẫn nằm trong MVP/deliverable, toàn bộ MVP chưa thể hoàn thành.

### 5.9. Deployment, backup và vận hành

- [x] Domain `ungphonhanh.life`, Cloudflare, tunnel và HTTPS đã có nền.
- [x] Frontend/backend có Windows autostart script nền.
- [x] Backend/frontend build production pass và live trả HTTP 200 sau cập nhật 2026-07-22.
- [ ] PostgreSQL/Redis/AI/Ollama không public và firewall được kiểm chứng từ ngoài.
- [ ] CORS, security headers, upload limits và auth hardening hoàn tất.
- [ ] Prisma migration history thay cho chỉ `db push`.
- [ ] Backup có checksum/retry/retention và restore drill thành công.
- [ ] Reboot máy chủ tự phục hồi toàn bộ service.
- [ ] Test online -> mất Internet -> LAN offline -> online phục hồi.
- [ ] Offline GIS tile đóng gói reproducible từ fresh checkout.

**Verdict:** có thiết kế và một phần hạ tầng; chưa nghiệm thu production/pilot.

## 6. Quality gates hiện tại

| Gate | Kết quả 2026-07-22 |
|---|---|
| Backend Jest | 29/29 suite, 188/188 test pass |
| Backend coverage | Chưa chạy lại ngày 2026-07-22; số audit 2026-07-21 là 69,44% statements; 60,42% branches; 65,35% functions; 69,38% lines |
| Shared types build | Pass |
| Scenario definitions build | Pass |
| Backend build | Pass |
| Frontend production build | Pass |
| Desktop typecheck/build | Pass (`tsc --noEmit`, `electron-vite build`) |
| Prisma validate | Pass |
| Backend/frontend health local | HTTP 200 tại thời điểm kiểm tra 2026-07-22 |
| AI health local | Chưa chạy lại trong đợt cập nhật PRD này |
| Live frontend + backend health | HTTP 200; database/Redis báo `up` tại thời điểm kiểm tra |
| Frontend lint | Fail; ESLint chưa cấu hình, `next lint` deprecated |
| Frontend automated test | Không có |
| AI automated test | Không có |
| Browser E2E | Không có |
| API/controller integration | Gần như không có |
| Concurrency test | Không có |
| CI workflow | Không có |
| Prisma migrations | Không có |
| Dependency audit production | 16 finding: 6 high, 9 moderate, 1 low |

Kết luận: test hiện tại chứng minh tốt các hàm rule/compute thuần. Chưa chứng minh authorization, controller contract, concurrency, WebSocket hoặc workflow đa role.

## 7. Workflow nghiệm thu bắt buộc

### 7.1. Workflow kho thường ngày

```text
WAREHOUSE đăng nhập
  -> xem đúng kho được giao
  -> nhập/xuất/chuyển/adjust/reconcile
  -> audit đúng actor và lý do
  -> Readiness cập nhật
  -> ADMIN hậu kiểm
```

Hiện trạng: **Một phần**. Read có UI; nhiều write path thiếu UI; transfer sai; error handling yếu.

### 7.2. Workflow cứu hộ đa role

```text
ADMIN tạo mission
  -> RESCUE nhận notification và mở mission
  -> RESCUE xác nhận
  -> WAREHOUSE nhận mission theo kho
  -> chuẩn bị và fulfill một lần
  -> ADMIN + RESCUE thấy READY
  -> bàn giao/hoàn vật tư có audit
```

Hiện trạng: **Chưa đạt**. Mission ID nằm trong local React state; không có inbox/deep-link; fulfillment chưa đủ an toàn.

### 7.3. Workflow simulator demo

```text
ADMIN bật demo mode
  -> chọn kho/scenario/seed
  -> play/pause/x10/reset
  -> event realtime đúng room
  -> Readiness/incident đổi dưới 2 giây
  -> reset đưa dữ liệu demo về trạng thái biết trước
```

Hiện trạng: **Một phần**. App desktop đã có slider thiết bị, chạy scenario x1/x10, reset và quan sát Readiness/incident; chưa có pause, Next.js control đầy đủ, WebSocket auth, production isolation, portable-package acceptance hoặc nghiệm thu Ollama/SMTP live.

### 7.4. Workflow online/offline pilot

```text
Domain hoạt động
  -> mất Internet
  -> user chuyển sang hostname/IP LAN
  -> API, DB, Redis, Ollama vẫn chạy
  -> tile offline hiển thị
  -> Internet phục hồi, domain hoạt động lại
```

Hiện trạng: **Chưa nghiệm thu**.

## 8. Checklist triển khai cuối

### P0 - Chặn corruption, privilege bypass và double-write

- [ ] Tách simulator demo/prod; production disable mutation mặc định.
- [ ] Thêm permission simulator riêng, scope kho và system actor riêng.
- [ ] Centralize organization/commune/warehouse scope cho REST, AI snapshot và WebSocket.
- [ ] Sửa transfer partial bằng tách batch transactionally; authorize source/destination.
- [ ] Xác thực Socket.IO handshake; server tự join role/warehouse room.
- [ ] Tách `incident:view`, `incident:ack`, `incident:assign`, `incident:resolve`.
- [ ] Sửa loan return contract; borrow/return atomic; giữ condition hỏng; partial loan đúng.
- [ ] Mission fulfillment atomic, idempotent, scoped theo allocation/kho.
- [ ] Report approval atomic, idempotent, multi-batch đúng.
- [ ] Giới hạn upload, nâng dependency có CVE high trên path public.

Điều kiện thoát P0:

- Không còn Critical/High data-integrity hoặc authorization đã biết.
- Có integration/concurrency test tái hiện và khóa từng lỗi.
- Retry request không làm xuất hoặc duyệt hai lần.

### P1 - Khép workflow lõi trên web

- [ ] Backend mission list/inbox filter theo role, trạng thái và warehouse assignment.
- [ ] Mission route/deep-link ổn định; refresh trình duyệt không mất mission.
- [ ] Notification click mở đúng mission/incident.
- [ ] UI inventory import/export/bulk/transfer/adjust/reconcile.
- [ ] UI borrow + return từng phần, validate tổng và hiển thị lỗi mutation.
- [ ] Role-aware navigation và route guard.
- [ ] Không biến API error/unknown thành empty/healthy state.
- [ ] Simulator controls đầy đủ trong Next.js.
- [ ] Readiness và incident realtime theo kho.
- [ ] Incident detail/evidence/action UI hoàn chỉnh.

Điều kiện thoát P1:

- Ba tài khoản ADMIN/RESCUE/WAREHOUSE chạy trọn workflow cứu hộ ở ba browser context.
- Workflow kho thường ngày dùng được từ UI, không cần script/API thủ công.
- Demo simulator không chạm dữ liệu production.

### P2 - Hoàn thiện contract sản phẩm và test

- [ ] Hoàn thiện blocker Readiness theo vật tư bắt buộc/tình huống.
- [ ] Recalc coverage cho mọi mutation ảnh hưởng readiness.
- [ ] Dữ liệu stale/unknown có UI và rule rõ.
- [ ] Seed/toạ độ/provenance đủ chứng minh phân bổ gần nhất và liên xã.
- [ ] Hoàn thiện AI explain-incident, redaction và automated tests.
- [ ] Cấu hình ESLint hiện hành; lint pass.
- [ ] Controller/API integration tests cho auth, scope, DTO và transition.
- [ ] Concurrency tests cho stock, loan, mission và report.
- [ ] Browser E2E cho login, inventory, mission, simulator và report.
- [ ] CI chạy lint, typecheck, test, build và Prisma validate.
- [ ] Tạo Prisma migration baseline và quy trình migrate/rollback.

Điều kiện thoát P2:

- Quality gate chạy tự động trên clean checkout.
- Không còn contract frontend/backend lệch ở workflow chính.
- Coverage tập trung vào boundary rủi ro, không chỉ tăng số phần trăm.

### P3 - Hardening và nghiệm thu pilot

- [ ] CORS allowlist theo domain/LAN; Helmet/security headers; request size limits.
- [ ] Login rate limit; refresh rotation/revocation; logout thu hồi session phù hợp.
- [ ] Docker bind nội bộ; firewall chặn PostgreSQL, Redis, AI Service và Ollama.
- [ ] Secret production ngoài Git; bỏ credential demo/hard-code.
- [ ] Backup retry/checksum/retention; restore drill ghi nhận RPO/RTO.
- [ ] Reboot test toàn bộ Windows services, Docker, AI và Ollama.
- [ ] Online/LAN/offline/recovery acceptance test.
- [ ] Offline tiles/package không phụ thuộc CDN.
- [ ] Scan cổng public và dependency audit không còn high exploitable trong scope.
- [ ] Logging/monitoring đủ truy login, mutation, queue, backup và lỗi AI.

Điều kiện thoát P3:

- Có biên bản nghiệm thu pilot và restore drill.
- Chỉ web/API cần thiết lộ ra Internet.
- Demo offline chạy từ fresh boot không cần Internet/CDN.

### P4 - Mobile và deliverable dự thi

- [ ] Chốt Mobile là bắt buộc trong MVP hay hậu MVP.
- [ ] Nếu bắt buộc: làm F0-F4, build APK và test thiết bị thật.
- [ ] Voice input `vi-VN` có fallback gõ tay.
- [ ] PDF/báo cáo/phiếu giấy dự phòng theo nhu cầu trình diễn.
- [ ] Chốt seed một cụm xã hay hai xã và sửa toàn bộ claim cho thống nhất.
- [ ] Chốt demo chính 5-7 phút; không dùng bước chưa tồn tại.
- [ ] Quay video, slide, poster, báo cáo kỹ thuật và tài liệu kiến trúc.
- [ ] Đồng bộ README và mọi claim public theo checklist master này.

Điều kiện thoát P4:

- Tất cả deliverable bắt buộc tồn tại, mở được và được test.
- Demo chạy lặp lại trên máy thi với dữ liệu reset được.
- Không còn claim “hoàn thành” trái với source hoặc acceptance test.

## 9. Thứ tự thực hiện đề xuất

Không làm song song quá nhiều module trước khi P0 đóng. Thứ tự:

1. **Sprint nền an toàn:** simulator isolation, scope, transfer, WebSocket, loan, mission/report transaction.
2. **Sprint workflow:** mission inbox/deep-link, inventory/loan UI, error states, simulator controls.
3. **Sprint proof:** integration, concurrency, browser E2E, lint, CI, migrations.
4. **Sprint pilot:** network hardening, backup/restore, reboot, online/offline acceptance.
5. **Sprint deliverable:** Mobile nếu bắt buộc, voice/PDF/polish, demo/video/slide.

Ước lượng lịch chỉ được lập sau khi chốt Mobile và phạm vi demo. Không dùng phần trăm endpoint để ước lượng hoàn thành.

## 10. Definition of Done cho MVP

Chỉ gọi MVP hoàn thành khi tất cả điều kiện sau được tick:

### Chức năng

- [ ] Inventory nhập/xuất/chuyển/adjust/reconcile dùng được từ UI.
- [ ] Loan borrow/return đúng contract và concurrency-safe.
- [ ] Readiness nêu đúng blocker, lý do, hành động và unknown state.
- [ ] Mission ba role chạy qua phiên độc lập, không mất state khi refresh.
- [ ] Fulfillment không double-export và đúng warehouse scope.
- [ ] Simulator demo realtime, reproducible và không sửa production stock.
- [ ] Nếu Mobile còn trong PRD: APK chạy trên thiết bị thật.

### Bảo mật và dữ liệu

- [ ] Không còn Critical/High integrity/authorization finding.
- [ ] REST/WebSocket/AI snapshot áp scope nhất quán.
- [ ] DB/Redis/AI/Ollama không public.
- [ ] Secrets production không nằm trong Git/tài liệu/client.
- [ ] Backup restore thành công.

### Chất lượng

- [ ] Lint, typecheck, test và build pass trên clean checkout.
- [ ] Integration test khóa DTO, permission, scope và transition.
- [ ] Concurrency test khóa stock/loan/mission/report.
- [ ] Browser E2E khóa các workflow chính.
- [ ] CI chạy tự động.
- [ ] Prisma migrations có lịch sử và thử migrate fresh DB.

### Vận hành và demo

- [ ] Online qua domain và offline LAN đều chạy.
- [ ] Reboot máy chủ tự khởi động đầy đủ.
- [ ] Demo 5-7 phút chạy lặp lại, không cần CDN.
- [ ] Dataset, slide, video và claim khớp source thật.

## 11. Monorepo: ownership và roadmap đã hợp nhất

### 11.1. Ownership

| Module | Trách nhiệm | Lệnh chính | Nguồn trạng thái |
|---|---|---|---|
| `apps/backend` | API, auth/scope, inventory, readiness, mission, simulator, incident, geo, report, backup | `pnpm be:dev`, `pnpm --filter @safestock/backend test`, `pnpm --filter @safestock/backend build` | Checklist P0-P3 trong tài liệu này |
| `apps/frontend` | Web role-facing và dashboard | `pnpm fe:dev`, `pnpm --filter @safestock/frontend build` | Checklist P1-P2 |
| `apps/desktop` | Công cụ Electron giả lập cảm biến và quan sát phản ứng realtime | `pnpm desktop:dev`, `pnpm --filter @safestock/desktop typecheck`, `pnpm --filter @safestock/desktop build` | Mục 5.6; chỉ dùng demo/test |
| `apps/ai-service` | Parse/narrative bằng Gemini/Ollama | `pnpm ai:dev` | Mục 5.7 và P2 |
| `apps/mobile` | App Android hiện trường | `pnpm mobile:dev` sau khi scaffold | Mục 5.8 và P4 |
| `packages/shared-types` | Enum/type/permission contract dùng chung | build theo workspace | Phải đổi cùng public contract |
| `packages/scenario-definitions` | Scenario deterministic | build theo workspace | Mục 5.6 |
| `infrastructure` | Docker, tunnel, Windows services, backup/offline | `pnpm infra:up` | P3 |

### 11.2. Nội dung roadmap backend đã hấp thụ

Đã có và được giữ: nền monorepo, auth cơ bản, hồ sơ cá nhân DB-backed, inventory read/write nền, simulator engine, sensor-to-incident debounce, readiness formulas, FEFO mission, Action Plan, Geo fallback, incident rules, AI incident enrichment, email cảnh báo, insights, assistant, backup mechanism và server-side env validation.

Các dấu `✅` cũ không còn được hiểu là hoàn thành end-to-end. Backlog thật đã chuyển vào P0-P3, gồm scope, transfer, loan, mission fulfillment, WebSocket, report, integration/concurrency test và production hardening.

Hạng mục backend riêng còn mở nhưng không phải blocker mặc định:

- RFID handler chưa làm; chỉ đưa vào MVP nếu câu chuyện phần cứng yêu cầu.
- Claude provider không phải backend contract và không cần cho MVP local-first.
- Double-confirm không thay thế atomicity/audit; hậu kiểm vẫn là mô hình chính.

### 11.3. Nội dung roadmap frontend đã hấp thụ

Đã có: login/layout, profile cá nhân, header/kho theo tài khoản, Readiness overview, warehouse map, Mission/Action Plan view, map pin, notification UI, incident explanation, cảnh báo sự cố trong trợ lý, insights, report/admin views và assistant.

Còn phải làm hoặc chứng minh:

- Inventory CRUD/write workflow, adjust/reconcile và mutation error handling.
- Mission inbox, stable route, deep-link và ba phiên role độc lập.
- Simulator controls trên Next.js; app desktop đã có control và quan sát realtime nhưng chưa thay thế workflow role-facing trên web.
- Permission-aware navigation.
- Readiness theo zone/shelf nếu cần cho quyết định vận hành.
- Voice input, readiness trước/sau, PDF và presentation health view là P4/polish; không chặn P0.
- ESLint, frontend automated test và browser E2E.

Roadmap cũ ghi Insights chưa làm và frontend placeholder là thông tin đã lỗi thời; source hiện có các view này.

### 11.4. Nội dung roadmap AI đã hấp thụ

- Gemini và Ollama là provider đang hỗ trợ; Ollama là lựa chọn local/offline.
- Claude branch chưa triển khai và được **defer khỏi MVP** trừ khi có quyết định mới.
- Explain-incident đã được nối vào luồng sự cố và có focused test; redaction, prompt-injection defense và output-safety tests đầy đủ vẫn nằm ở P2.
- AI không được thực thi SQL/shell/xóa dữ liệu/gửi mail hoặc tự mutation nghiệp vụ.

### 11.5. Nội dung roadmap Mobile đã hấp thụ

Toàn bộ F0-F4 vẫn chưa làm: toolchain, Expo scaffold, auth, home/kho, QR, offline-read, mission, alert, bàn giao và APK. Chi tiết đã nằm ở mục 5.8/P4; không duy trì checklist riêng ngoài tài liệu master.

### 11.6. README policy

- Root `README.md` chỉ là cổng vào, quick start và cảnh báo trạng thái.
- README theo app chỉ mô tả ownership, cách chạy và giới hạn hiện tại.
- README không chứa roadmap/checklist tiến độ riêng.
- Không tạo lại `apps/*/ROADMAP.md`; mọi backlog cập nhật tại đây.

## 12. Tài liệu còn hiệu lực

| Tài liệu | Vai trò |
|---|---|
| `docs/PRD.md` | Nguồn sự thật duy nhất: PRD + trạng thái + checklist + plan |
| `docs/plan-tang-ham-luong-ai-di-thi.md` | Plan tăng chiều sâu AI dự thi (RAG trích dẫn, forecast thống kê, chống gãy demo); trạng thái vẫn tick tại PRD |
| `docs/plan-app-desktop-gia-lap-cam-bien.md` | Plan app desktop giả lập cảm biến + cắm cảnh báo sự cố vào luồng emit (app phản ứng realtime); trạng thái vẫn tick tại PRD |
| `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md` | Hướng dẫn cài đặt/chạy |
| `docs/HUONG-DAN-TEST.md` | Hướng dẫn test thủ công |
| `docs/SEED-DATASET.md` | Contract dataset/seed |
| `docs/CONTRIBUTING.md` | Quy trình cộng tác |
| `docs/BAN-MO-TA-Y-TUONG.md` | Nội dung hồ sơ/ý tưởng dự thi |
| `docs/qa/` | Bằng chứng Q&A/QA theo lát cắt; không phải trạng thái tổng |
| `docs/archive/` | Lịch sử plan/audit/work-log đã bị thay thế |
| `README.md` | Cổng vào và quick start monorepo |
| `apps/*/README.md` | Hướng dẫn module ngắn, không phải roadmap |
| `skills/README.md` | Hướng dẫn coding standards và skill cho dev |

Các roadmap cũ của app đã chuyển vào archive. Nếu tài liệu lịch sử xung đột, tài liệu này và bằng chứng source/test mới nhất được ưu tiên.

## 13. Câu hỏi chưa giải quyết

1. Mobile APK còn là deliverable bắt buộc hay chuyển sang hậu MVP?
2. Simulator chỉ là công cụ demo/test hay sẽ được bật trong production?
3. Một WAREHOUSE chỉ fulfill allocation của kho mình hay được vận hành cả cụm xã?
4. Demo thi được phép dùng `sim.html`/API script hay bắt buộc toàn bộ qua UI role-facing?
5. Deliverable seed là một cụm xã Đồng Xuân hay hai xã như PRD cũ từng ghi?
6. Offline GIS tiles sẽ được đóng gói và cập nhật bằng cơ chế nào trên máy pilot?
7. Email cá nhân phải xác minh bằng link/OTP trước khi nhận dữ liệu sự cố hay pilot chấp nhận lưu trực tiếp?

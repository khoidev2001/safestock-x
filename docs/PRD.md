# PRD + Checklist + Kế hoạch cuối - Ứng phó nhanh

> Nguồn sự thật duy nhất về phạm vi sản phẩm, trạng thái thực tế và thứ tự triển khai.
> Các plan, audit và work-log lịch sử không phải nguồn trạng thái. Đối chiếu hiện tại nằm ở source/test và [báo cáo đánh giá dự thi](bao-cao-danh-gia-san-sang-du-thi.md).

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 3.9 - Hoàn tất source quản lý kho ngày thường, chờ acceptance thực tế |
| Ngày đối chiếu | 2026-07-28 |
| Trạng thái | Quản lý kho ngày thường đã hoàn tất trong phạm vi source/test/build đã chốt; MVP end-to-end và production vẫn chờ acceptance/hardening |
| Mức hoàn thành thực tế | P09, workflow kho ngày thường web/mobile, APK code/build và bốn AI feature bắt buộc đã hoàn thành ở mức code/test/build; browser đa phiên, thiết bị/LAN, database clone, full judged flow và production hardening còn mở |
| Điểm audit khó tính | Quản lý kho ngày thường: 100/100 source, approved for acceptance; không đồng nghĩa đã nghiệm thu production |
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
| Backend nghiệp vụ dữ liệu | Workflow kho ngày thường đã khóa integrity, idempotency và scope; hardening toàn hệ thống còn mở |
| Frontend web | Workflow kho ngày thường đã có đủ write path và error state; browser acceptance còn mở |
| AI service | Bốn AI feature bắt buộc đã có code/test/fallback; redaction/output-safety toàn hệ thống vẫn cần hardening production |
| Mobile | APK Android 0.5.0 đã ký release; có voice native/PhoWhisper, SecureStore, offline-read, dashboard/readiness, QR, nghiệp vụ kho/loan và báo cáo kiểm kê tháng; còn fresh-device/LAN acceptance |
| Deployment/offline | Có domain, tunnel và script nền; chưa nghiệm thu đầy đủ |
| MVP theo PRD | Chưa hoàn thành |
| Production Internet | Chưa được phép coi là an toàn |

### 1.1. Cách hiểu mức hoàn thành quản lý kho ngày thường

Trong phạm vi đã chốt và không bao gồm WMS mở rộng, source quản lý kho ngày
thường được xem là **hoàn thành 100% và sẵn sàng chuyển sang acceptance**.
Phạm vi này gồm danh mục/SKU/lô, nhập, xuất, điều chuyển, điều chỉnh, kiểm kê,
mượn–hoàn, báo cáo tháng, QR, dashboard/readiness, lịch sử/audit, mobile
offline-read, voice và bốn AI feature bắt buộc.

Các hạng mục WMS mở rộng không thuộc điểm hoàn thành trên: nhà cung cấp, đơn mua,
giá vốn/nguồn vốn, bảo trì thiết bị, phiếu giấy/PDF, CRUD tùy ý cấu trúc kho và
quản lý người mượn/hạn trả chuyên sâu.

Mức 100% này chỉ mô tả **phạm vi chức năng source + automated test + build**.
Không được dùng để tuyên bố production-ready cho tới khi hoàn tất acceptance trên
Galaxy S23 Ultra, browser đa phiên, private LAN, database clone, backup/restore,
CI clean-checkout và security hardening còn mở trong tài liệu này.

### 1.2. Chức năng mới đã có và bằng chứng bàn giao (2026-07-22)

| Chức năng | Hành vi hiện có | Bằng chứng chính | Giới hạn phải biết |
|---|---|---|---|
| Hồ sơ cá nhân | Nút profile thay nút đăng xuất; xem/sửa avatar, họ tên, số điện thoại, email cá nhân nhận cảnh báo; xem đơn vị dạng `Xã ...`; đăng xuất nằm trong dialog | `apps/frontend/src/components/profile/`, `apps/frontend/src/lib/profile-api.ts`, `apps/backend/src/auth/`, `apps/backend/src/auth/__tests__/auth-profile.spec.ts` | Email cá nhân chưa có bước xác minh; avatar là WebP data URL lưu DB, giới hạn 80.000 ký tự |
| Scope tài khoản theo xã | `/auth/me` đọc hồ sơ mới từ DB; admin toàn xã mở kho trung tâm thuộc đúng `organizationId`; Socket.IO xác thực access JWT rồi lấy role/assignment hiện tại từ DB để cấp room | `apps/backend/src/auth/auth.service.ts`, `apps/backend/src/auth/websocket-auth.service.ts`, `apps/backend/src/auth/__tests__/websocket-auth.rooms.spec.ts`, `apps/backend/src/simulation/simulation.service.ts` | Scope chưa được centralize cho mọi API/AI snapshot; notification realtime vẫn role-wide trong một database xã |
| Email cảnh báo sự cố | SMTP tùy chọn; gửi tới email cá nhân đúng tổ chức/kho, loại trùng, dùng BCC; `ALERT_EMAIL_TO` chỉ fallback; template không hiển thị điểm tin cậy | `apps/backend/src/mail/`, `apps/backend/src/incident/incident.service.ts`, `.env.example` | Chưa có email verification/outbox/retry bền vững; SMTP lỗi chỉ log và không chặn luồng sự cố |
| AI diễn giải sự cố | Sự cố rule-based tạo ngay; AI chạy nền để lưu explanation, cập nhật notification và email; AI lỗi vẫn giữ sự cố/email rule-based | `apps/backend/src/incident/incident.context.ts`, `apps/backend/src/incident/__tests__/incident-enrich.spec.ts`, `apps/frontend/src/components/dashboard/incident-view.tsx` | Chưa có bộ redaction/output-safety đầy đủ cho AI service; AI không được quyết định severity hoặc bịa số |
| Cảnh báo trong trợ lý web | Sau khi query/refetch thấy sự cố đã có AI explanation, dữ liệu được đồng bộ sang bong bóng trợ lý; sự cố nghiêm trọng có thể tự mở cảnh báo | `apps/frontend/src/components/assistant/use-incident-alerts.ts`, `apps/frontend/src/lib/incident-alert-store.ts`, `apps/frontend/src/components/assistant/floating-assistant.tsx` | Incident view vẫn polling; chưa có browser E2E và notification chưa partition theo warehouse |
| App desktop giả lập cảm biến | Electron app đăng nhập admin demo, chọn backend, xem/chỉnh thiết bị, chạy scenario, theo dõi readiness, incident và log realtime | `apps/desktop/`, lệnh `pnpm desktop:dev` | Chỉ là công cụ demo/test; credentials tài khoản seed đang hard-code trong renderer; chưa được phép ghi production |
| Sensor emit tự kích hoạt incident | Event cảm biến đã persist sẽ lên lịch scan incident debounce 1,2 giây; burst event được gộp, lỗi scan không chặn cập nhật sensor | `apps/backend/src/simulation/simulation.service.ts`, `apps/backend/src/simulation/__tests__/incident-scan-debounce.spec.ts` | Dedupe chỉ chặn sự cố cùng loại/thiết bị còn mở |
| Biên an toàn simulator | Mutation vận hành mặc định tắt; runtime demo có cấu hình PostgreSQL/Redis/volume/credentials/backend port riêng và launcher guard reset/start | `apps/backend/src/simulation/`, `.env.demo.example`, `infrastructure/docker-compose.yml`, `infrastructure/demo/`, `apps/backend/src/config/env.validation.ts` | Hỗ trợ cấu hình cô lập đã hoàn tất; chưa có biên bản smoke live chạy đồng thời stack vận hành và demo trên máy pilot |

Các blocker lịch sử dưới đây đã được xử lý một phần hoặc thay đổi trạng thái; không dùng danh sách này thay cho bảng blocker trong báo cáo readiness hiện tại:

1. Simulator đã có cấu hình runtime demo tách biệt; deployment vận hành vẫn phải giữ mutation flag ở `false`, và pilot còn phải smoke live hai stack đồng thời.
2. Transfer partial đã có transaction/CAS/concurrency coverage; vẫn cần giữ regression khi refactor.
3. Mission backend đa role đã có state transition/scope tests; web đã có inbox, lọc/ưu tiên theo vai trò và URL `?mission=...`; browser acceptance qua các phiên độc lập vẫn chưa khép kín.
4. Web loan mapper hiện gửi `{ok, damaged, lost}`; browser contract test vẫn chưa có.
5. Android APK REPORTER/RESCUE, dashboard/readiness, QR, nghiệp vụ kho mobile, real-device test và demo private-LAN khi public Internet tắt là deliverable bắt buộc; chỉ iOS và offline-write/sync tiếp tục defer.

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
- Nhận diện thôn đã được ADMIN cấu hình, tự chọn một hoặc nhiều kho nội xã, và trực quan hóa các tuyến kho → điểm cứu hộ trên dashboard.
- Khép workflow desktop simulator -> APK REPORTER -> web ADMIN -> APK RESCUE -> web WAREHOUSE -> APK RESCUE -> web ADMIN qua các phiên độc lập và UI nhìn thấy.
- Mô phỏng cảm biến deterministic, realtime nhưng không gây rủi ro cho dữ liệu production.
- Chạy được online qua domain và offline trong LAN với AI local.
- Có bộ kiểm thử đủ chứng minh quyền, concurrency và workflow chính.
- Android APK là deliverable bắt buộc: build, cài và test trên thiết bị thật.

### 2.5. Ngoài phạm vi MVP

- Nhận diện khuôn mặt, computer vision phức tạp, blockchain, drone.
- Đồng bộ database tự động giữa các xã.
- Offline-write tự động merge tồn kho.
- OR-Tools hoặc tối ưu hóa phức tạp khi greedy + FEFO đã đủ.
- Dự báo thiên tai cấp tỉnh hoặc bản đồ GIS nghiệp vụ quy mô lớn.
- GPS realtime, turn-by-turn navigation, cảnh báo lệch tuyến hoặc dẫn đường bằng giọng nói trên thiết bị cứu hộ.
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
- ADMIN cấu hình trước danh mục thôn, điểm cứu hộ/tập kết mặc định của từng thôn và vị trí thực tế từng kho; AI chỉ tra cứu điểm đã xác minh, không geocode hoặc sinh tọa độ.
- Liên xã: chỉ lưu metadata kho lân cận và gợi ý liên hệ; không sync database.
- Phạm vi demo vận hành chỉ có tenant Đồng Xuân. Sáu xã giáp ranh Xuân Thọ, Tuy An Bắc, Tuy An Tây, Xuân Lãnh, Phú Mỡ, Xuân Phước chỉ là metadata ngoài xã, không phải tenant/kho vận hành và không tham gia allocation/readiness/fulfillment.
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

### 4.6. Quy ước “mọi bước qua UI” cho bài thi

Đây là **release contract bắt buộc**, không phải ưu tiên UX. “Qua UI” nghĩa là giám khảo/operator có thể hoàn tất workflow đã hứa bằng control nhìn thấy trên web, desktop simulator hoặc APK Android: đăng nhập, nhập report, gửi, mở notification/inbox, tạo/dispatch mission, confirm/reject/prepare/complete và xem trạng thái cuối. Không dùng curl/Postman, SQL, sửa source/API URL, copy ID ẩn hoặc seed giữa chừng để thay cho thao tác nghiệp vụ.

Được phép trước khi bắt đầu: dùng terminal/launcher để khởi động service, chạy preflight và reset/seed một lần theo runbook; mở desktop simulator vì đây là công cụ demo có UI để phát scenario deterministic. Từ lúc bắt đầu câu chuyện chấm thi đến khi hiện kết quả cuối, mọi nghiệp vụ phải qua UI. Không tính script/API fallback hoặc video dự phòng là bằng chứng hoàn thành UI. Nếu mất LAN, app phải hiển thị stale/offline rõ ràng và không tự xếp hàng mutation.

Luồng acceptance: (1) desktop simulator phát incident; (2) APK REPORTER gửi report typed; (3) web ADMIN xem AI resolve thôn đã cấu hình, nhu cầu, phân bổ đa kho và các tuyến hội tụ rồi duyệt/dispatch Mission-to-Kit; (4) APK RESCUE nhận notification, mở mission, confirm/reject; (5) web WAREHOUSE mở inbox, prepare/fulfill; (6) APK RESCUE complete delivery; (7) web ADMIN xem timeline/readiness/audit.

| Chặng | UI bắt buộc | Bằng chứng pass | Không được dùng để thay thế |
|---|---|---|---|
| Khởi tạo tình huống | Desktop simulator | Scenario/incident xuất hiện và trạng thái realtime đổi | Gọi API phát event sau khi demo đã bắt đầu |
| Báo cáo hiện trường | APK REPORTER | Gửi typed report, thấy xác nhận và mission/report reference | Insert DB, curl/Postman, voice-only không có fallback gõ |
| Điều phối | Web ADMIN | Mở report từ inbox/notification, xem AI resolve marker thôn đã cấu hình, hệ thống tự chọn/ghép kho, xem tuyến rồi duyệt và dispatch | Tự chọn kho để thay thuật toán, tạo điểm ngẫu nhiên, copy/paste ID, mở URL ID chuẩn bị trước, chạy seed giữa luồng |
| Nhận nhiệm vụ | APK RESCUE | Notification/inbox mở đúng mission sau restart; confirm hoặc reject có lỗi hiển thị | Giữ state RAM từ phiên ADMIN hoặc gọi transition API |
| Chuẩn bị vật tư | Web WAREHOUSE | Đăng nhập phiên độc lập, tìm mission, prepare/fulfill đúng kho | Dùng tài khoản ADMIN thay role, SQL hoặc script export |
| Hoàn tất và hậu kiểm | APK RESCUE + Web ADMIN | Complete delivery; ADMIN thấy status, readiness và audit cuối | Sửa DB/status trực tiếp hoặc chỉ trình chiếu video |

Điều kiện continuity: mỗi role dùng phiên đăng nhập độc lập; logout/login, refresh, mở tab mới hoặc restart app vẫn tìm lại mission bằng inbox/notification/deep-link. Mọi loading, empty, 401, 403, 404, 5xx và mất LAN phải hiển thị rõ; không đổi lỗi thành danh sách rỗng hoặc trạng thái thành công giả.

### 4.7. AI điều phối đa kho và bản đồ tuyến cứu hộ

- Input tự nhiên như `Tân Bình cô lập 100 người` được AI parse thành loại sự cố, số người và tên thôn; địa điểm phải khớp danh mục thôn do ADMIN cấu hình trước.
- `Hamlet` và `Warehouse` là hai loại điểm khác nhau: điểm thôn là đích cứu hộ/tập kết mặc định; marker kho là nơi lấy vật tư. Chúng có thể gần nhau nhưng không được mặc định là cùng tọa độ.
- Mission lưu tham chiếu điểm thôn và snapshot tọa độ dùng lúc lập phương án để lịch sử không đổi khi ADMIN cập nhật marker sau này.
- Rule engine tính nhu cầu; inventory/readiness engine loại lô hoặc kho không điều phối được; allocation ưu tiên kho phù hợp/gần và tự ghép nhiều kho đến khi đủ. LLM không tự chọn số lượng, trừ tồn hoặc phê duyệt phương án.
- Dashboard chỉ vẽ marker/tuyến cho các kho thực sự được phân bổ. Nhiều kho cùng cứu một điểm phải hiện nhiều marker và nhiều tuyến hội tụ về một marker sự cố.
- Mỗi tuyến phải bám mạng đường, có màu/nhãn phân biệt, khoảng cách và ETA. Tuyến chính là kho nội xã đã phân bổ; gợi ý ngoài xã nếu thiếu chỉ hiển thị nét đứt/trạng thái `chờ liên hệ`, không được tính vào fulfillment hoặc tự xuất kho.
- Routing cho demo dùng engine local qua private LAN và dữ liệu đường đóng gói sẵn. Haversine chỉ là fallback có nhãn `ước tính đường chim bay`, không được vẽ thành đường giao thông.
- Phạm vi UI là xem trước phương án trên dashboard; không làm GPS realtime hoặc turn-by-turn navigation trong MVP.

## 5. Ma trận yêu cầu và trạng thái thực tế

### 5.1. Nền tảng, auth và scope

- [x] NestJS, Prisma, PostgreSQL, Redis, health check và seed có thật.
- [x] JWT access/refresh, permission map và bốn role ADMIN/WAREHOUSE/RESCUE/REPORTER có thật.
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
- [x] Transfer theo `quantity` đúng semantics và atomic: WAREHOUSE bị khóa ở kho nguồn được giao nhưng có thể chọn kho đích cùng organization/commune; không được đọc/ghi tồn kho đích ngoài thao tác chuyển. Ledger lưu snapshot kho nguồn/đích để lịch sử không trôi khi batch đổi kệ/kho.
- [x] Web có đủ receiving/import/export/bulk/transfer/adjust/reconcile/condition và in nhãn QR.
- [x] Mọi mutation kho ngày thường có error state rõ; lỗi query không bị đổi thành trạng thái rỗng/an toàn.
- [x] Audit inventory/loan ghi actor thật, target, before/after, lý do và hiển thị danh tính actor khi tra soát.
- [x] Nhật ký vận hành theo kho gồm nhập/xuất/chuyển/hoàn/điều chỉnh/kiểm kê/tình trạng; dữ liệu cũ có backfill snapshot kho.
- [x] Focused test khóa CAS loser, tồn không âm, idempotent retry và thứ tự lock inventory-loan.

**Verdict:** code-level workflow inventory ngày thường hoàn chỉnh; browser/device acceptance vẫn là release gate.

### 5.3. Mượn-trả

- [x] Có model và endpoint borrow/return.
- [x] Có khái niệm ok/hỏng/mất và trừ phần đang mượn khỏi khả dụng.
- [x] Web mapper gửi đúng contract `{ ok, damaged, lost }`; chưa có browser contract test.
- [x] Borrow/return dùng table lock, advisory lock theo batch, CAS và idempotency để khóa request đồng thời với inventory.
- [x] Tình trạng hỏng được tách thành batch `NEEDS_CHECK`, không mất condition hoặc cộng nhầm vào hàng tốt.
- [x] Partial loan không làm mất toàn batch eligibility ở các path đã test; cần bổ sung race return-vs-export.
- [x] Web có luồng tạo phiếu, hoàn từng phần tốt/hỏng/mất và hiển thị lỗi.

**Verdict:** code-level mượn-trả đã khép; browser/device acceptance vẫn chưa chạy.

### 5.4. Readiness

- [x] Có sáu thành phần, trọng số, reason và recommendation.
- [x] Có trạng thái `READY / NEEDS_ACTION / NOT_DISPATCHABLE` và blocker nền.
- [x] Mission loại lô hỏng, cần kiểm tra, hết hạn, kệ khóa và phần đang mượn.
- [ ] Blocker theo vật tư bắt buộc/tình huống và cấu hình địa phương đầy đủ.
- [x] Recalc sau receive/import/export/transfer/adjust/reconcile/condition,
  loan/return và report approval; retry có giới hạn, lỗi hậu commit không biến
  giao dịch tồn đã thành công thành thất bại giả.
- [x] Sensor quá hạn làm giảm độ tin cậy dữ liệu và sinh hành động kiểm tra;
  readiness snapshot có `computedAt`, `ageMs`, `isStale`, mobile hiển thị cảnh
  báo dữ liệu cũ và kho thôn không bị trừ vì không có IoT theo chủ trương.
- [ ] Web cập nhật readiness realtime dưới 2 giây khi dữ liệu đổi.
- [ ] Browser E2E chứng minh blocker luôn thắng điểm tổng.

**Verdict:** source readiness ngày thường đã đủ cho phạm vi acceptance đã chốt;
blocker tình huống/cấu hình địa phương mở rộng, realtime dưới 2 giây và browser
E2E vẫn là điều kiện nghiệm thu MVP/production.

### 5.5. Mission-to-Kit và Action Plan

- [x] Parse tình huống qua Gemini/Ollama và validate schema.
- [x] Backend tính nhu cầu, FEFO, greedy và mức đáp ứng theo SKU yếu nhất.
- [x] Action Plan 8 mục có backend severity/forecast và template fallback.
- [x] GeoService có Haversine offline và Google Routes fallback/quota guard.
- [x] Fulfillment atomic, idempotent và không double-export khi retry.
- [x] Allocation/fulfillment scoped theo kho được giao ở bước prepare.
- [x] Tiến độ prepare lưu riêng từng kho; mission chỉ `READY` sau kho cuối, kể cả hai kho thao tác đồng thời.
- [x] Allocation engine có thể lấy từ nhiều kho cùng `communeId`, ưu tiên khoảng cách rồi FEFO và loại kho/lô không dispatchable.
- [x] Có mission inbox, tìm kiếm, filter đang xử lý/đã kết thúc và ưu tiên việc theo ADMIN/RESCUE/WAREHOUSE.
- [x] Web notification deep-link tới URL mission cụ thể; selection không còn chỉ nằm trong RAM.
- [ ] Browser acceptance chứng minh F5, tab mới và logout/login vẫn mở lại mission bằng inbox/notification của đúng actor.
- [ ] REPORTER, ADMIN, RESCUE, WAREHOUSE hoàn thành workflow qua phiên độc lập; desktop simulator là UI khởi tạo scenario.
- [ ] REPORTER submit trả reference hoặc lỗi/retry rõ; RESCUE transition/WS reconnect và WAREHOUSE prepare không được false success.
- [ ] ADMIN nhìn thấy trạng thái, readiness và audit cuối sau WAREHOUSE prepare và RESCUE complete.
- [ ] Seed/toạ độ đủ để chứng minh chọn kho gần nhất trong demo.
- [ ] ADMIN cấu hình danh mục thôn, marker điểm cứu hộ mặc định và marker kho qua UI; tên thôn resolve duy nhất, không sinh điểm ngẫu nhiên.
- [ ] Mission lưu `hamletId` và snapshot điểm cứu hộ; mô tả không khớp địa danh phải yêu cầu ADMIN xác nhận.
- [ ] Routing local trả geometry đường bộ, khoảng cách và ETA cho từng kho được phân bổ khi public Internet tắt.
- [ ] Action Plan map vẽ nhiều polyline từ nhiều kho cùng hội tụ về một điểm cứu hộ, kèm popup vật tư từng kho.
- [ ] Kho ngoài xã thiếu hụt chỉ hiện như gợi ý liên hệ có nguồn/trạng thái; không tham gia allocation/readiness/fulfillment.

**Verdict:** compute tốt; workflow vận hành chưa khép kín.

### 5.6. Simulator, realtime và incident

- [x] Có virtual device, scenario deterministic, runner và event timeline.
- [x] Có rule incident, evidence, anomaly và predictive warning.
- [x] Sensor event đã persist tự kích hoạt incident scan nền có debounce; không chặn luồng emit khi scan lỗi.
- [x] App desktop Electron có điều khiển thiết bị/scenario, readiness, incident và log realtime cho demo local.
- [x] Sự cố mới được AI diễn giải nền, lưu explanation, cập nhật notification/email; AI lỗi vẫn giữ cảnh báo rule-based.
- [x] Email sự cố hỗ trợ SMTP, người nhận theo profile + organization/warehouse scope, BCC và fallback vận hành.
- [x] Web hiển thị explanation và đưa sự cố vào bong bóng trợ lý sau khi query/refetch thấy bản AI enrichment.
- [x] Simulator mutation mặc định khóa trong runtime vận hành; permission/scope riêng và cấu hình runtime demo cô lập đã có.
- [ ] Next.js có play/pause/reset/x1/x10 và chỉnh thiết bị; hiện panel chủ yếu read-only.
- [x] Socket.IO handshake xác thực access JWT; role/warehouse room do server cấp từ assignment DB, client không tự join.
- [ ] Readiness/incident UI subscribe realtime đúng kho.
- [ ] Incident view có detail, evidence timeline, assign/ack/resolve đúng permission.
- [ ] Redaction, prompt-injection defense và output-safety test cho AI explain-incident hoàn chỉnh.
- [ ] `sim.html` không dùng CDN/credential hard-code nếu còn dùng cho demo.

**Verdict:** demo path đã có app desktop, phản ứng sensor -> readiness/incident và cấu hình runtime demo cô lập. Đây là mức implementation/config; live pilot dual-stack smoke, session revocation và hardening mạng vẫn chưa nghiệm thu.

### 5.7. Normal Mode, assistant và report

- [x] Có forecast cạn kho, hạn dùng, rebalance, trend, weather và monthly narrative.
- [x] Có assistant dùng snapshot kho, câu nhanh, Ollama cho câu mở và trả lời trực tiếp tình huống khẩn cấp trong chat; tình huống có người mắc kẹt có fallback không phụ thuộc AI/database.
- [ ] Snapshot assistant/insights scope đúng kho và quyền.
- [x] Report approval atomic, idempotent và xử lý đúng SKU có nhiều batch.
- [x] Role frontend/backend cho báo cáo kiểm kê thống nhất: WAREHOUSE gửi/xem,
  ADMIN xem chi tiết rồi duyệt hoặc từ chối có lý do trên web/APK.
- [x] Báo cáo chặn hai bản PENDING/APPROVED trùng kho-kỳ bằng advisory lock; bản REJECTED được phép lập lại. APK bắt buộc nhập số đếm thực tế từng SKU, tồn hệ thống chỉ là số tham chiếu.
- [x] AI service có automated test; policy redaction/output trên toàn bộ endpoint vẫn chưa đầy đủ.
- [x] Forecast đã dùng EWMA, độ lệch chuẩn, confidence và reorder point; chưa phải mô hình dự báo nhu cầu/thời tiết hoàn chỉnh.
- [x] Trợ lý có RAG trích dẫn nguồn định mức chạy local, validate citation và từ chối ngoài corpus trong test; live model acceptance vẫn cần chạy trên máy thi.
- [x] Dự báo nhu cầu theo thời tiết đã nối EWMA tiêu thụ + mưa 72h Open-Meteo, hệ số nhóm vật tư minh bạch, confidence guard và cảnh báo thiếu; web/mobile đều hiển thị, thiếu weather không tự suy đoán.
- [x] Semantic search vật tư dùng embedding local qua Ollama, scope theo kho, cache vector catalog và fallback từ khóa có gắn nhãn; đã smoke thật với truy vấn theo công dụng.
- [x] Bản tin AI đầu ngày tổng hợp readiness/forecast/incident/thời tiết trên web/mobile; AI chỉ xếp thứ tự fact backend đã kiểm chứng, backend render nguyên văn và fallback template khi model lỗi.
- [x] Chuẩn hóa nhập liệu dùng cùng embedding catalog, chỉ trả gợi ý cho người có quyền nhập kho với `reviewRequired=true`, không tự ghi hoặc tự đổi SKU.

**Verdict:** bốn feature AI bắt buộc đã có contract, UI, test và live smoke local. Forecast nền vẫn được gọi đúng là dự báo thống kê EWMA; embedding/LLM chỉ hỗ trợ truy hồi, chuẩn hóa và ưu tiên diễn giải, không tự quyết số hay mutation.

### 5.8. Mobile

- [x] Có Expo SDK 52/RN 0.76, login/refresh/logout và session mã hóa bằng SecureStore.
- [x] Có notification/mission rút gọn cho RESCUE và report text/voice cho REPORTER.
- [x] Trang chủ, kho, readiness, cảnh báo, mưa 72h và bản tin đầu ngày theo role đã có trên mobile.
- [x] QR camera + nhập SKU tay + semantic search + nhập/xuất/chuyển/kiểm kê/điều chỉnh/báo tình trạng/xuất nhiều lô đã có.
- [x] RESCUE/WAREHOUSE mượn, hoàn một phần tốt/hỏng/mất đầy đủ theo permission.
- [x] Offline-read cache theo tài khoản, stale timestamp/badge và mutation fail-closed khi mất LAN.
- [x] APK release `0.5.0` đã build và ký local RSA 4096-bit, không dùng debug signing; artifact/checksum đã xác minh.
- [ ] Cài và chạy acceptance trên Samsung Galaxy S23 Ultra thật qua private LAN khi public Internet tắt.

**Verdict:** code + APK mobile bắt buộc đã hoàn thiện; release gate còn lại là fresh-install/device/LAN/restart acceptance trên S23 Ultra. iOS và offline-write vẫn ngoài phạm vi.

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

| Gate | Kết quả refresh 2026-07-27 |
|---|---|
| Backend Jest | 74 suite, 452/452 test pass |
| AI service pytest | 67/67 test pass |
| Mobile state tests | 7/7 test pass |
| Production dependency audit (high+) | Pass: 0 critical, 0 high; còn 6 moderate, 1 low được theo dõi |
| Backend coverage | Chưa chạy lại ngày 2026-07-22; số audit 2026-07-21 là 69,44% statements; 60,42% branches; 65,35% functions; 69,38% lines |
| Shared types build | Pass |
| Scenario definitions build | Pass |
| Backend build | Pass |
| Frontend production build | Pass |
| Desktop typecheck/build | Pass (`tsc --noEmit`, `electron-vite build`) |
| Prisma validate | Pass |
| Backend/frontend health local | HTTP 200 tại thời điểm kiểm tra 2026-07-27 |
| AI health local | AI/embedding/briefing live smoke pass ngày 2026-07-27 |
| Live frontend + backend health | HTTP 200; database/Redis báo `up` tại thời điểm kiểm tra |
| Frontend lint | Pass; root/workspace ESLint exit 0 |
| Frontend automated test | Chưa có browser/component suite |
| AI automated test | 62 pytest pass; live HTTP/model smoke chưa chạy trong refresh |
| Browser E2E | Không có |
| API/controller integration | Có các suite mission/report/transfer/loan; raw-ID coverage còn thiếu |
| Concurrency test | Có transfer/report/mission prepare; inventory-loan có lock-order, CAS loser, no-negative và idempotent retry coverage |
| CI workflow | Không có |
| Prisma migrations | Không có |
| Dependency audit production | Đã chạy 2026-07-27: 0 critical/high; còn 6 moderate và 1 low cần nhánh nâng dependency riêng |

Kết luận: test hiện tại chứng minh tốt các hàm rule/compute thuần, một số concurrency path và WebSocket auth/room isolation. Authorization toàn hệ thống, controller contract và workflow đa role vẫn chưa được chứng minh đầy đủ.

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

Hiện trạng: **Đã hoàn tất ở mức code và kiểm thử tự động**. Web/mobile có receiving, nhập,
xuất đơn/lô, chuyển, điều chỉnh, kiểm kê, tình trạng, mượn-trả và QR; backend khóa scope,
CAS/loan race, idempotency và audit. Browser thật và Galaxy S23 Ultra chưa nghiệm thu.

### 7.2. Workflow cứu hộ đa role

```text
ADMIN đã cấu hình thôn + điểm cứu hộ + marker kho
  -> nhập/mở báo cáo "Tân Bình cô lập 100 người"
  -> AI parse và resolve đúng marker Tân Bình
  -> rule engine tính nhu cầu
  -> inventory/readiness tự chọn và ghép các kho nội xã
  -> dashboard vẽ marker các kho tham gia + nhiều tuyến kho → Tân Bình
  -> mỗi tuyến hiện khoảng cách, ETA và vật tư kho đóng góp
  -> nếu toàn xã thiếu, hiển thị kho ngoài xã để liên hệ, chưa tính vào fulfillment
  -> ADMIN duyệt và dispatch phương án
  -> RESCUE/WAREHOUSE tiếp tục workflow nghiệp vụ
```

Acceptance bản đồ: ADMIN không chọn kho bằng tay để tạo phương án; hệ thống chọn từ tồn/readiness/vị trí. ADMIN được xem, xác minh và duyệt; không có tuyến đường bộ thì báo rõ, không vẽ đường thẳng giả làm tuyến.

```text
ADMIN tạo mission
  -> RESCUE nhận notification và mở mission
  -> RESCUE xác nhận
  -> WAREHOUSE nhận mission theo kho
  -> chuẩn bị và fulfill một lần
  -> ADMIN + RESCUE thấy READY
  -> bàn giao/hoàn vật tư có audit
```

Hiện trạng: **Chưa đạt end-to-end UI**. Prepare đa kho đã có state riêng từng kho, scope, retry/concurrency test và progress trên màn mission. Web inbox/deep-link đã được triển khai và qua unit/type/lint/production build cùng API smoke ba vai trò; blocker còn lại là browser acceptance qua các phiên độc lập, notification partition đúng actor và các bước APK.

### 7.3. Workflow simulator demo

```text
ADMIN bật demo mode
  -> chọn kho/scenario/seed
  -> play/pause/x10/reset
  -> event realtime đúng room
  -> Readiness/incident đổi dưới 2 giây
  -> reset đưa dữ liệu demo về trạng thái biết trước
```

Hiện trạng: **Một phần**. App desktop đã có slider thiết bị, chạy scenario x1/x10, reset, WebSocket auth và quan sát Readiness/incident; cấu hình demo đã tách database/Redis/volume/credentials/backend port khỏi vận hành. Chưa nghiệm thu live hai stack đồng thời, pause, Next.js control đầy đủ, portable package hoặc Ollama/SMTP live.

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

- [x] Production disable mutation simulator mặc định.
- [x] Hỗ trợ cấu hình runtime simulator demo tách database/Redis/volume/credentials/backend port khỏi vận hành.
- [x] Thêm permission simulator riêng, scope kho/run và system actor riêng từng kho.
- [ ] Centralize organization/commune/warehouse scope cho REST, AI snapshot và WebSocket.
- [x] Sửa transfer partial bằng tách batch transactionally; authorize source/destination và khóa race bằng unit/E2E.
- [x] Xác thực Socket.IO handshake; server tự join role/warehouse room từ assignment hiện tại trong DB.
- [ ] Tách `incident:view`, `incident:ack`, `incident:assign`, `incident:resolve`.
- [x] Khóa loan return-vs-export bằng table/advisory lock + CAS; giữ condition hỏng và partial-loan invariant.
- [x] Mission fulfillment atomic, idempotent, scoped theo allocation/kho ở bước prepare; các transition còn lại vẫn cần audit scope/notification atomic.
- [x] Report approval atomic, idempotent, multi-batch đúng.
- [x] Giới hạn upload báo cáo và xác minh dependency audit production không có CVE critical/high.

Điều kiện thoát P0:

- Không còn Critical/High data-integrity hoặc authorization đã biết.
- Có integration/concurrency test tái hiện và khóa từng lỗi.
- Retry request không làm xuất hoặc duyệt hai lần.

### P1 - Khép workflow lõi trên web

- [x] Backend mission list scope theo actor/organization/warehouse participation; web inbox filter trạng thái và ưu tiên hành động theo role.
- [x] Mission dùng URL `?mission=<id>` làm nguồn selection; có unit test encode và production build.
- [x] Notification web tạo deep-link trực tiếp tới mission ID.
- [ ] Browser/manual acceptance F5, tab mới và logout/login trên ADMIN/RESCUE/WAREHOUSE.
- [x] UI inventory receiving/import/export/bulk/transfer/adjust/reconcile/condition và in QR.
- [x] UI borrow + return từng phần, validate tổng và hiển thị lỗi mutation.
- [x] Role-aware navigation và route guard cho các route kho/báo cáo/audit.
- [x] Không biến API error/unknown của inventory/loan/report/audit thành empty/healthy state.
- [ ] Simulator controls đầy đủ trong Next.js.
- [ ] Readiness và incident realtime theo kho.
- [ ] Incident detail/evidence/action UI hoàn chỉnh.
- [ ] UI cấu hình thôn, điểm cứu hộ/tập kết và marker kho có xác minh/audit.
- [ ] AI resolve tên thôn đã cấu hình; bỏ hoàn toàn điểm sự cố ngẫu nhiên.
- [ ] Dashboard Action Plan vẽ nhiều tuyến kho được phân bổ → một điểm cứu hộ, có khoảng cách/ETA và vật tư theo kho.

Điều kiện thoát P1:

- Terminal/launcher chỉ dùng startup/preflight/reset trước lúc chấm; đóng trước bước scenario và không reset/reseed/restart giữa core flow, trừ recovery exercise được công bố.
- Browser automation ADMIN/RESCUE/WAREHOUSE chỉ là web subgate; không thay full live acceptance gồm desktop simulator và APK REPORTER/RESCUE.
- Bốn tài khoản REPORTER/ADMIN/RESCUE/WAREHOUSE chạy trọn workflow; REPORTER/RESCUE dùng APK, ADMIN/WAREHOUSE dùng web context độc lập, desktop simulator phát scenario.
- Mỗi role tìm lại cùng mission từ inbox/notification sau F5, tab mới, logout/login hoặc app restart; không copy mission ID.
- Lỗi submit report, transition RESCUE, WebSocket reconnect và WAREHOUSE prepare phải hiển thị rõ, không thành success/empty giả.
- Sau WAREHOUSE prepare và RESCUE complete, web ADMIN thấy status, readiness và audit cuối.
- Workflow kho thường ngày dùng được từ UI, không cần script/API thủ công.
- Demo simulator không chạm dữ liệu production.

### P2 - Hoàn thiện contract sản phẩm và test

- [ ] Hoàn thiện blocker Readiness theo vật tư bắt buộc/tình huống.
- [ ] Recalc coverage cho mọi mutation ảnh hưởng readiness.
- [ ] Dữ liệu stale/unknown có UI và rule rõ.
- [ ] Seed/toạ độ/provenance đủ chứng minh phân bổ gần nhất và liên xã.
- [ ] Routing engine local + graph đường Đồng Xuân/vùng đệm chạy khi public Internet tắt; không phụ thuộc public OSRM/Google/CDN.
- [x] Contract/integration test khóa multi-warehouse allocation/prepare, hamlet resolution, route failure và external-neighbor boundary.
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
- [ ] Smoke live đồng thời runtime vận hành và demo trên máy pilot; xác nhận runtime vận hành giữ `SIMULATION_MUTATION_ENABLED=false`, demo dùng cổng 3110 và không chia sẻ dữ liệu/volume.
- [ ] Online/LAN/offline/recovery acceptance test.
- [ ] Offline tiles/package không phụ thuộc CDN.
- [ ] Scan cổng public và dependency audit không còn high exploitable trong scope.
- [ ] Logging/monitoring đủ truy login, mutation, queue, backup và lỗi AI.

Điều kiện thoát P3:

- Có biên bản nghiệm thu pilot và restore drill.
- Chỉ web/API cần thiết lộ ra Internet.
- Demo offline chạy từ fresh boot không cần Internet/CDN.

### P4 - Mobile và deliverable dự thi

- [x] Chốt Android APK là deliverable bắt buộc; scope là REPORTER/RESCUE, không phải toàn bộ F0-F4 cũ.
- [x] Build APK release ký riêng, API/WS lấy từ release env/profile.
- [x] Persist session bằng SecureStore và offline-read/stale state rõ ràng; mutation không queue khi mất LAN.
- [ ] Cài/test thiết bị thật và chạy API/WS qua private LAN khi public Internet tắt.
- [x] Voice input `vi-VN` trên APK Android dùng WAV 16 kHz → PhoWhisper, chỉ điền sẵn để người dùng xác nhận và có fallback gõ tay; code/test/build đã đạt, độ chính xác và permission flow trên S23 Ultra còn thuộc device gate.
- [ ] PDF/báo cáo/phiếu giấy dự phòng theo nhu cầu trình diễn.
- [x] Chốt một tenant vận hành Đồng Xuân; sáu xã giáp ranh chỉ là metadata liên hệ ngoài xã.
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
5. **Sprint deliverable:** APK Android REPORTER/RESCUE, private-LAN offline, demo/video/slide.

Lịch 7 ngày đã chốt theo APK Android bắt buộc và một tenant Đồng Xuân. Không dùng phần trăm endpoint để ước lượng hoàn thành.

## 10. Definition of Done cho MVP

Chỉ gọi MVP hoàn thành khi tất cả điều kiện sau được tick:

Các checkbox trong mục này là **release acceptance cho toàn MVP**, rộng hơn phạm
vi source quản lý kho ngày thường. Vì vậy chúng vẫn để mở cho tới khi có bằng
chứng browser/device/LAN/database/production tương ứng; việc chưa tick ở đây
không phủ nhận trạng thái `100/100 source — approved for acceptance` của quản lý
kho ngày thường tại mục 1.1.

### Chức năng

- [ ] Inventory nhập/xuất/chuyển/adjust/reconcile dùng được từ UI.
- [ ] Loan borrow/return đúng contract và concurrency-safe.
- [ ] Readiness nêu đúng blocker, lý do, hành động và unknown state.
- [ ] Mission bốn role chạy qua UI/phiên độc lập, không mất state khi refresh, relogin, tab mới hoặc APK restart.
- [ ] Fulfillment không double-export và đúng warehouse scope.
- [ ] Simulator demo realtime, reproducible và không sửa production stock.
- [ ] APK Android REPORTER/RESCUE chạy trên thiết bị thật qua private LAN khi public Internet tắt.
- [ ] ADMIN cấu hình trước marker thôn và marker kho; nhập tên thôn resolve đúng điểm, không tạo tọa độ ngẫu nhiên.
- [ ] AI/rule engine tự ghép một hoặc nhiều kho nội xã; dashboard vẽ các tuyến đường bộ hội tụ về điểm cứu hộ với khoảng cách, ETA và vật tư từng kho.
- [ ] Thiếu nội xã chỉ sinh gợi ý ngoài xã để liên hệ; không làm tăng fulfillment hoặc tự xuất kho.

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
- Mission inbox, stable route, deep-link và bốn phiên role độc lập; REPORTER/RESCUE dùng APK, ADMIN/WAREHOUSE dùng web.
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

F0 scaffold/auth, APK release, SecureStore, offline-read/stale state, dashboard/readiness, QR, semantic search và nghiệp vụ kho/loan mobile đã có. Device/LAN acceptance trên S23 Ultra là gate còn lại; chỉ iOS và offline-write/sync defer. Chi tiết nằm ở mục 5.8/P4.

### 11.6. README policy

- Root `README.md` chỉ là cổng vào, quick start và cảnh báo trạng thái.
- README theo app chỉ mô tả ownership, cách chạy và giới hạn hiện tại.
- README không chứa roadmap/checklist tiến độ riêng.
- Không tạo lại `apps/*/ROADMAP.md`; mọi backlog cập nhật tại đây.

## 12. Tài liệu còn hiệu lực

| Tài liệu | Vai trò |
|---|---|
| `docs/PRD.md` | Phạm vi, contract và checklist hiện hành |
| `docs/bao-cao-danh-gia-san-sang-du-thi.md` | Bảng đối chiếu source/test và quyết định scope demo |
| `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md` | Hướng dẫn cài đặt/chạy |
| `docs/HUONG-DAN-TEST.md` | Hướng dẫn test thủ công |
| `docs/SEED-DATASET.md` | Contract dataset/seed |
| `docs/CONTRIBUTING.md` | Quy trình cộng tác |
| `docs/BAN-MO-TA-Y-TUONG.md` | Nội dung hồ sơ/ý tưởng dự thi |
| `docs/qa/` | Bằng chứng Q&A/QA theo lát cắt; không phải trạng thái tổng |
| `README.md` | Cổng vào và quick start monorepo |
| `apps/*/README.md` | Hướng dẫn module ngắn, không phải roadmap |
| `skills/README.md` | Hướng dẫn coding standards và skill cho dev |

Plan/audit/work-log lịch sử đã được loại khỏi gói source dự thi. Nếu bằng chứng cũ xung đột, source/test mới nhất và báo cáo đối chiếu được ưu tiên.

## 13. Quyết định vận hành đã chốt ngày 2026-07-27

1. Thiết bị thi chính là Samsung Galaxy S23 Ultra, cài bản cập nhật ổn định mới nhất tại buổi rehearsal; biên bản rehearsal phải lưu phiên bản Android, One UI và build cụ thể. APK release ký bằng local keystore riêng của dự án, không dùng debug signing.
2. Digital Twin/IoT chỉ áp dụng cho kho trung tâm. Desktop simulator dùng cho demo/test: chỉnh thiết bị phải phát realtime sang web/mobile; khi vượt ngưỡng, rule tạo incident ngay, AI làm giàu cảnh báo cho trợ lý và email. Kho thôn không có thiết bị IoT, vận hành nhập/xuất/chuyển/kiểm kê bằng web/mobile và không bị trừ Readiness vì thiếu cảm biến. Production không bật mutation simulator; phần cứng thật tương lai chỉ nối tại kho trung tâm.
3. Mỗi tài khoản WAREHOUSE chỉ prepare/fulfill phần allocation thuộc kho được gán; không được vận hành thay cả cụm xã.
4. Offline tiles và OSRM graph Đồng Xuân/vùng đệm được prebuild, gắn version/checksum và đóng gói cùng release; máy pilot không build graph trong lúc demo.
5. Liên hệ Đồng Xuân và sáu xã lân cận là thông tin công khai phục vụ người dân và điều phối thủ công. Chủ dự án đã xác minh trực tiếp các số hiện có là số của Chủ tịch UBND xã; trang `/contacts` hiển thị không cần đăng nhập, số thật lấy từ file môi trường cục bộ bị Git bỏ qua và xã chưa có số giữ `null`. OSM chỉ là provenance bản đồ, không phải nguồn số điện thoại hay cam kết tồn kho.
6. Email cá nhân phải xác minh bằng link hoặc OTP trước khi được dùng để nhận dữ liệu sự cố.

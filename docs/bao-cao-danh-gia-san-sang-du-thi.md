# Báo cáo đánh giá mức sẵn sàng dự thi

> PM review: 2026-07-26 · Đối chiếu PRD, source, test và cấu hình tại working tree hiện tại. Kế hoạch 7 ngày: [Competition Readiness Week](../plans/260726-1857-competition-readiness-week/plan.md).

> Cập nhật 2026-07-27: workflow kho ngày thường đã được khép ở mức code/test/build:
> receiving SKU/lô, nhập/xuất/bulk/chuyển/adjust/reconcile/condition, QR, mượn-trả,
> idempotency, inventory-loan lock/CAS, scope organization/kho và error state web/mobile.
> Các tỷ lệ PM bên dưới là snapshot 2026-07-26; trạng thái hiện hành lấy từ
> [PRD](PRD.md). Browser, Galaxy S23 Ultra/LAN và production hardening vẫn là gate.

## 1. Kết luận điều hành

Đối chiếu toàn bộ Markdown còn hiệu lực trước cleanup, `docs/PRD.md` với source, contract, test và cấu hình hiện tại cho thấy đây là sản phẩm có lõi kỹ thuật thật, không phải giao diện mô phỏng. Điểm mạnh nổi bật: quản lý năng lực kho theo blocker, Mission-to-Kit, FEFO, điều phối đa vai trò, mô phỏng cảm biến deterministic, AI local/RAG có trích nguồn và luồng báo cáo hiện trường.

Tuy nhiên, chưa nên tuyên bố “MVP hoàn tất” hoặc “sẵn sàng production”. Bản thi phải đạt **web + backend + desktop simulator + AI local + Android APK REPORTER/RESCUE** và chạy trong private LAN khi public Internet tắt. Trước demo phải đóng lỗi tenant/scope, SecureStore/API LAN, local asset và diễn tập sạch.

| Góc chấm | Mức hiện tại | Kết luận |
|---|---:|---|
| Hoàn thiện theo full PRD/deliverables | **63%** | Nhiều lõi đã có; frontend vận hành, mobile APK, pilot/offline và quality gate chưa khép kín |
| Adjusted implementation view | **63%** | APK/offline-LAN vẫn nằm trong cut-line; chưa có evidence device/LAN nên chưa nâng điểm |
| Sẵn sàng demo/đi thi với phạm vi rút gọn | **72%** | Có câu chuyện kỹ thuật tốt; APK, LAN offline, scope và rehearsal còn blocker |
| Sẵn sàng pilot/production | **45%** | Chưa đủ tenant isolation, hardening, CI/migration, backup/recovery và nghiệm thu mạng |

Các tỷ lệ là đánh giá có trọng số tại working tree hiện tại, không phải tỷ lệ số endpoint. **63,1%** là điểm full-deliverable trước acceptance device/LAN; **72%** là readiness demo hiện tại nhưng chưa phải go. Không dùng phần trăm để che APK/offline gate chưa có bằng chứng.

### Nhận xét PM độc lập

Tài liệu ban đầu đúng hướng, trung thực hơn phần lớn báo cáo dự án thi, nhưng chưa phải release-control document tốt: trộn snapshot audit, product backlog, cleanup manifest và release decision; test evidence có claim stale; thiếu owner/dependency/deadline/exit criteria; chưa có risk register, daily go/no-go, freeze/rollback. Sau audit, khuyến nghị dùng tài liệu này làm **readiness snapshot**, còn execution authority là plan 7 ngày liên kết ở đầu trang.

Khuyến nghị điều hành: không cố hoàn thành toàn PRD trong một tuần. Tập trung APK Android, private-LAN offline, P0 scope, mission inbox/deep-link, error states, metadata sáu xã giáp ranh và diễn tập sạch. QR, iOS, offline-write/sync, federation nhiều xã và production defer.

## 2. Mô hình chấm điểm

| Nhóm | Trọng số PRD | Hoàn thiện | Điểm quy đổi | Cơ sở |
|---|---:|---:|---:|---|
| Backend nghiệp vụ và toàn vẹn dữ liệu | 25% | 76% | 19.0 | Inventory, readiness, incident, mission, report có hành vi thật; scope chưa tập trung |
| Web workflow | 20% | 58% | 11.6 | Mission inbox/deep-link đã có code và build; vẫn thiếu write workflow và browser E2E độc lập |
| AI/RAG/insights | 15% | 78% | 11.7 | Gemini/Ollama, RAG 21 chunks, voice, forecast thống kê, 62 test Python; thiếu live HTTP/model acceptance/hardening đầy đủ |
| Simulator/realtime/desktop | 10% | 80% | 8.0 | Scenario deterministic, isolation, incident debounce, WS auth; chưa nghiệm thu offline/live hai stack |
| Mobile hiện trường | 10% | 38% | 3.8 | Có Expo login/report/mission/notification; thiếu APK, SecureStore, LAN/offline cache và device test |
| Bảo mật và tenant isolation | 10% | 48% | 4.8 | JWT/RBAC và một số scope tốt; vẫn còn IDOR/scope role-wide |
| Test, CI, migration, vận hành | 10% | 42% | 4.2 | Backend test mạnh; thiếu CI, browser/mobile test, migration, pilot/restore drill |
| **Tổng** | **100%** |  | **63.1%** | Điểm thô sau refresh AI/RAG; sai số đánh giá ±3 điểm |

APK Android và private-LAN offline đã được chốt bắt buộc, nên bỏ góc nhìn 67% từng loại chúng khỏi cut-line. Dùng **63% full PRD/deliverable** làm baseline chính cho tới khi có fresh APK/device/LAN evidence.

## 3. Ma trận PRD đối chiếu code

Quy ước: **Xong** = hành vi chính có code và bằng chứng test; **Một phần** = có lát cắt thật nhưng chưa đạt acceptance end-to-end; **Chưa làm/chưa chứng minh** = thiếu implementation hoặc chưa có nghiệm thu đủ để tuyên bố.

| Hạng mục PRD | Trạng thái | Hoàn thiện | Bằng chứng chính | Phần còn thiếu / ảnh hưởng thi |
|---|---|---:|---|---|
| Monorepo, NestJS, Prisma, PostgreSQL, Redis | Xong | 90% | `package.json`, `apps/backend`, `infrastructure` | Chưa có Prisma migration history và aggregate verify command |
| JWT login/refresh/profile/RBAC | Một phần | 65% | `apps/backend/src/auth`, `src/rbac` | Thiếu rate limit, refresh rotation/revocation, session/logout, email verification |
| Scope organization/warehouse | Một phần | 48% | Auth/mission/report paths đã có một phần scope | Inventory/readiness/loan/admin/notification và một số mission transition còn IDOR |
| Inventory nhập/xuất/bulk/audit | Xong code-level | 95% | inventory backend/web/mobile, focused tests | Browser/device acceptance chưa chạy |
| Transfer partial atomic | Xong | 92% | `inventory-transfer.ts`, `inventory.service.ts`, transfer unit/E2E | Cần giữ regression/concurrency suite; claim cũ trong PRD đã lỗi thời |
| Kiểm kê/reconcile | Xong code-level | 92% | inventory web/mobile, reconcile/CAS tests | Browser/device acceptance chưa chạy |
| Mượn/trả vật tư | Xong code-level | 92% | `loan.service.ts`, loan integrity/lock tests, `loan-view.tsx`, mobile inventory | Browser/device acceptance chưa chạy |
| Readiness 6 chiều/blocker/action | Một phần mạnh | 75% | `apps/backend/src/readiness`, readiness tests | Chưa chứng minh recalc mọi mutation, unknown/stale contract và scope mọi ID |
| Mission-to-Kit, FEFO, greedy, weakest SKU | Xong lõi | 88% | `apps/backend/src/mission`, rule/tests | Cần browser acceptance và audit scope transition còn lại |
| Mission prepare/fulfill atomic/idempotent | Xong lõi | 93% | per-warehouse preparation model, unit/concurrency + workflow E2E | Một số notification sau transition chưa atomic; browser acceptance còn thiếu |
| Mission list/get/report flow | Một phần mạnh | 86% | mission/report scope tests; web inbox/deep-link unit/build và API smoke ba role | Inbox/URL đã triển khai; admin scope-null, notification partition và continuity qua browser vẫn cần nghiệm thu |
| Report hiện trường text/voice, approve | Xong lõi | 88% | backend report tests, frontend/mobile report UI | Upload đã cap size/type; AI/report live acceptance chưa đủ |
| Sensor simulator deterministic | Xong lõi | 85% | `src/simulation`, scenario definitions, desktop app | Web controls chưa đủ; cần diễn tập reset/lặp lại trên máy thi |
| Sensor → incident debounce | Xong | 85% | incident/simulation tests | Permission incident còn quá rộng; UI realtime/scope chưa nghiệm thu |
| Socket.IO auth + server-derived rooms | Xong một phần | 78% | websocket auth tests | Notification vẫn role-wide, chưa partition chắc theo org/kho |
| AI parse/explain/action plan | Xong lõi | 82% | `apps/ai-service`, backend AI integration | Cần live provider/model smoke; production auth boundary/output policy |
| RAG local có citation | Xong lõi | 84% | `knowledge.py`, index 21 chunks, corpus 8 chủ đề, 62 Python tests | Cần chạy live HTTP/model smoke và kiểm fallback trên máy thi |
| Forecast/statistical insights | Xong lõi | 78% | `apps/backend/src/insights/forecast.ts`, tests | Chưa có demand/weather join và acceptance dữ liệu thật |
| Web dashboard/map/incident/assistant | Một phần mạnh | 68% | `apps/frontend/src/components` | Nhiều màn biến API error thành empty; route guard chưa permission-aware |
| Mobile RESCUE/REPORTER/WAREHOUSE | Xong code-level | 90% | `apps/mobile`, APK 0.3.0, mobile state tests | Còn fresh-device/Galaxy S23 Ultra/private-LAN acceptance |
| Demo Docker/runtime isolation | Một phần mạnh | 78% | `infrastructure/demo`, `.env.demo.example` | Chưa smoke đồng thời hai stack và fresh-boot recovery |
| Offline LAN + local AI + offline GIS | Chưa chứng minh | 35% | Có script/docs và Ollama/local paths | Chưa có biên bản Internet-off LAN→recovery; local font/tile package chưa nghiệm thu |
| CI, lint/build/test clean checkout | Một phần | 40% | Lệnh lint/test/build cục bộ | Không có `.github` workflow, frontend/browser/mobile test còn thiếu |
| Backup/restore/monitoring | Một phần | 45% | Infrastructure scripts | Chưa restore drill, checksum/retry/RPO-RTO và nghiệm thu reboot |

## 4. Những phần đã hoàn thành có giá trị trình diễn

1. **Readiness khác biệt với app kho thông thường:** đánh giá khả năng dùng ngay thay vì chỉ đếm tồn; có blocker, lý do và hành động.
2. **Mission-to-Kit có kiểm chứng số:** biên dịch tình huống thành nhu cầu, phân bổ FEFO/greedy, thể hiện thiếu hụt và Action Plan.
3. **Các biên integrity quan trọng đã được nâng cấp:** transfer partial, mission prepare, report approval có transaction/idempotency/concurrency tests.
4. **Digital twin thật:** desktop phát scenario deterministic; backend persist sensor event, debounce incident, cập nhật readiness và realtime.
5. **AI không tự quyết định số tồn:** AI dùng để parse/giải thích/truy xuất tri thức; số nghiệp vụ do rule/backend kiểm soát.
6. **RAG local có corpus/citation:** phù hợp câu chuyện hỗ trợ ứng phó khi Internet yếu.
7. **Mobile đã có lát cắt hiện trường:** REPORTER gửi text/voice report; RESCUE nhận notification và thao tác mission. APK Android + device/LAN acceptance là deliverable bắt buộc còn thiếu.

## 5. Blocker và lỗi đã xác định bằng `$ak:debug`

### P0 — phải xử lý trước khi demo có nhiều tài khoản/tổ chức

| Vấn đề | Root cause đã xác định | Tác động | Hướng sửa và bằng chứng thoát |
|---|---|---|---|
| Mission transition residual scope | Confirm/reject/defer/resend/cancel/complete/approve đã nhận `warehouseId` và guard kho; actor ADMIN scope-null vẫn chưa truyền organization vào mọi transition | Admin ngoài tổ chức có thể đổi mission ngoài tenant nếu biết ID; warehouse actor đã được chặn | Bind organization vào service scope chung, thêm cross-org E2E cho mọi transition; focused warehouse-scope tests đã pass |
| Loan residual tenant scope | Loan list/borrow/return đã guard warehouse assignment, nhưng scope-null organization boundary và browser contract chưa có đầy đủ | Admin/actor toàn xã có thể vượt tenant nếu org guard thiếu | Thêm org scope + controller integration; focused warehouse-scope tests đã pass |
| Frontend return loan contract | UI state vẫn dùng tên hiển thị `returnedOk/returnedDamaged`, mapper gửi backend `{ok, damaged, lost}` | Đã loại lỗi ValidationPipe đã xác định; chưa có browser contract test | Giữ mapper/type test và thêm browser E2E |
| Inventory/readiness raw-ID read | Controller nhận raw warehouse/zone/shelf ID nhưng không bind actor scope | Rò dữ liệu hoặc recalc kho khác | Dùng scope guard dùng chung + IDOR integration tests |
| Notification role-wide | List/mark-read/WS room theo role thay vì org/kho/actor | Rò mission/incident giữa tenant; đọc hộ notification | Partition query/room/id guard; integration + WS room tests |
| Admin service toàn cục | User/warehouse admin không luôn lọc organization của actor | Admin xã có thể thấy/sửa tenant khác | Actor-org scope + cross-org tests |
| Upload report thiếu giới hạn | `FileInterceptor` không cap size/type/missing file | 500 hoặc memory/abuse qua upload lớn | Multer limit/type guard + negative tests |

### P1 — phải đóng để demo trơn tru

- Nghiệm thu Mission inbox + stable URL/deep-link qua F5, tab mới và relogin ba vai trò.
- Inventory write UI và create-borrow/partial-return UI.
- Permission-aware navigation/route guard; hiển thị API error rõ thay vì empty/healthy.
- Notification click mở đúng mission/incident.
- Một kịch bản browser E2E + APK bốn context: REPORTER → ADMIN → RESCUE → WAREHOUSE.
- Loại dependency Internet khỏi font/map/tile của kịch bản offline.
- Build APK Android qua env/profile, SecureStore token, read-only cache và trạng thái LAN/offline rõ ràng.
- Seed sáu xã giáp ranh dưới dạng `NeighborWarehouse` external/manual metadata; không tạo peer tenant/kho hay đưa vào allocation.

### P2 — tăng điểm kỹ thuật sau khi hết blocker

- CI chạy lint, typecheck, test, build, Prisma validate trên clean checkout.
- Prisma migration baseline + migrate/rollback rehearsal.
- CORS allowlist, Helmet, request-size theo endpoint, login rate-limit.
- Backup restore drill; preflight/health dashboard; demo reset một nút.

### Bất cập bổ sung sau review source

| Vấn đề | Mức | Evidence | Quyết định tuần |
|---|---|---|---|
| Loan return-lost có thể race với inventory export | P0 integrity | Return khóa loan nhưng decrement batch chưa có bằng chứng CAS/lock dùng chung với export | Viết DB concurrency test; sửa theo cause nếu quantity có thể âm |
| Notification sau nhiều mission transition không atomic | P1 demo reliability | State có thể commit nhưng notification fail sau đó | Ưu tiên confirm/prepare/complete; full outbox defer nếu quá 1 tuần |
| Mission inbox/deep-link chưa có browser gate | P1 demo blocker | Inbox + URL selection đã triển khai, unit/build/API smoke pass | Chạy three-context browser acceptance và khóa regression |
| Navigation chỉ ẩn trang users | P1 UX/security clarity | RESCUE/WAREHOUSE/REPORTER vẫn thấy nhiều route không có quyền | Permission-aware nav/guard; backend vẫn là authority |
| Mobile config hard-code localhost, token RAM | P0 APK | Thiết bị thật không gọi được localhost; không SecureStore | Sửa bằng release env/profile, SecureStore, LAN status/cache trước device gate |
| Desktop/sim legacy có demo credential và CDN | P1 claim risk | Không phù hợp production/offline claim | Chỉ chạy trong demo stack cô lập; không public Internet |

### Maintainability risk

Một số module vượt xa ngưỡng dễ review (ví dụ `mission-view.tsx` ~1.164 dòng, `mission.service.ts` ~1.124, `knowledge.py` ~678, `map-canvas.tsx` ~504, mobile `MissionDetail.tsx` ~477, desktop `App.tsx` ~460). Không refactor lớn trong tuần thi vì rủi ro regression cao. Sau freeze nên tách theo boundary: workflow state/API, role actions, provenance/timeline, map layers, AI retrieval/provider; mỗi lần tách phải giữ contract và chạy focused gate.

## 6. Tính năng nên bổ sung để tăng điểm cuộc thi

Ưu tiên theo “điểm trình diễn / công sức”, không mở rộng trước khi đóng P0.

| Ưu tiên | Tính năng | Giá trị với giám khảo | Công sức |
|---|---|---|---|
| 1 | **Command timeline** từ báo cáo → AI plan → điều phối → chuẩn bị → hoàn tất | Biến nhiều module thành một câu chuyện 5–7 phút dễ hiểu | Trung bình |
| 2 | **Trace/provenance panel** cho số liệu và citation | Chứng minh AI không bịa, mỗi quyết định truy được nguồn/rule/audit | Trung bình |
| 3 | **One-click demo reset + preflight** | Giảm rủi ro demo, cho biết DB/Redis/AI/Ollama/map sẵn sàng | Thấp–trung bình |
| 4 | **After-action report/PDF** | Có deliverable giám khảo cầm được; thể hiện trước/sau và thời gian phản ứng | Trung bình |
| 5 | **Offline status/fallback UI** | Làm rõ local-first bằng bằng chứng trực quan | Trung bình |
| 6 | **QR bàn giao** | Kết nối kho với hiện trường, tạo khoảnh khắc demo tốt | Defer sau APK/LAN P0 |

## 7. Kịch bản thi đề xuất

Chốt demo 5–7 phút với tenant Đồng Xuân, một incident và bốn role UI:

1. Desktop simulator phát tình huống; dashboard hiện incident/readiness thay đổi.
2. REPORTER gửi mô tả hiện trường; AI parse nhưng không tự sửa số tồn.
3. ADMIN tạo Mission-to-Kit; giải thích nhu cầu, FEFO và thiếu hụt.
4. RESCUE nhận mission, xác nhận; WAREHOUSE chuẩn bị/fulfill; RESCUE hoàn tất giao.
5. ADMIN xem timeline/audit, readiness trước-sau và báo cáo kết quả.
6. Tắt public Internet trong rehearsal; phone vẫn nối private LAN, chứng minh local AI/map/font và recovery.

Không đưa QR, offline-write, iOS hoặc production security vào lời hứa; APK Android và private-LAN offline là gate phải có acceptance evidence.

## 8. Ma trận kiểm chứng

| Gate | Trạng thái | Kết quả gần nhất |
|---|---|---|
| Focused backend hardening/unit | **Passed** | Scope/atomic regression suites nằm trong full unit run |
| Full backend unit | **Passed** | 51 suites, 366/366 tests |
| Full backend E2E | **Passed with explicit env override** | 6 suites, 50/50 tests với test PostgreSQL ở `localhost:15432`; runbook/default `55433` vẫn phải chuẩn hóa |
| Backend TypeScript | **Passed** | Exit 0 |
| Frontend TypeScript | **Passed** | Exit 0 |
| Mobile TypeScript | **Passed** | Exit 0 |
| Desktop typecheck | **Passed** | Exit 0 |
| Monorepo lint | **Passed** | Workspace lint + root ESLint exit 0 |
| Prisma validate | **Passed** | Current schema hợp lệ; chưa có migration history |
| Demo infrastructure guards | **Passed** | 10/10 node tests; compose verify pass |
| Windows launcher syntax | **Passed** | `node --check` cho `ai-dev.mjs`, `dev-all.mjs` |
| Diff whitespace | **Passed** | `git diff --check` exit 0 |
| AI Python tests + index check | **Passed** | 62/62 tests; venv tồn tại; index 21 chunks và model embedding đã có |
| AI live HTTP/model smoke | **Not run** | Chưa khởi động uvicorn và chạy acceptance HTTP/model trong audit này |
| Browser E2E ba vai trò | **Not run / chưa có suite** | Chưa có bằng chứng acceptance |
| Mobile APK/device test | **Not run** | Chưa có APK artifact/device evidence; đây là P0 release gate |
| Internet-off private-LAN/recovery pilot | **Not run** | Chưa có biên bản live; đây là P0 release gate |
| Dependency/security scan | **Not run** | Không suy diễn “an toàn production” |

Current Passed phản ánh working tree tại lượt review này. Sau thay đổi code phải chạy focused gate trước, rồi full matrix vào ngày 3, 6 và 7. Full E2E hiện chỉ pass khi override đúng test DB; đây vẫn là rủi ro tái lập, chưa được coi là đã giải quyết.

## 9. Kế hoạch 7 ngày được PM đề xuất

Execution detail nằm tại [plan 7 ngày](../plans/260726-1857-competition-readiness-week/plan.md). Cut-line: web + backend + desktop simulator + AI/RAG local + Android APK; offline là private-LAN khi public Internet tắt.

| Ngày | Ưu tiên | Kết quả bắt buộc | Go/no-go cuối ngày |
|---|---|---|---|
| 1 | Evidence/scope | APK, private-LAN, UI-only, một tenant Đồng Xuân, sáu xã metadata | Scope ký chốt |
| 2 | Tenant isolation | Actor org scope cho inventory/readiness/insights/mission/loan/report/admin | Foreign org 403/404, zero-write |
| 3 | APK + quality | Hello APK, API LAN, SecureStore, full automated gate | APK cài/gọi LAN khi Internet tắt |
| 4 | Core UI workflow | Mission inbox, stable URL, role nav, errors, REPORTER/RESCUE APK | Luồng bốn role không API script |
| 5 | Offline + geo resilience | Local AI/map/font, preflight/reset, sáu xã external metadata | Internet-off flow + map pass |
| 6 | Rehearsal | UI scenario hai lần trên LAN, live AI smoke | Kịch bản 5–7 phút pass hai lần |
| 7 | Freeze/submission | Clean-checkout gate, video/slides, SHA/checksum, limitations | Chỉ freeze nếu không còn P0 |

### Risk register

| Rủi ro | Xác suất | Tác động | Giảm thiểu | Trigger no-go |
|---|---:|---:|---|---|
| Cross-tenant disclosure/mutation | Cao | Rất cao | ActorScope + negative integration matrix | Bất kỳ foreign-ID test fail |
| Test DB lệch port/máy | Cao | Cao | Dedicated disposable DB + fail-fast preflight | Full E2E không khởi động |
| Mission không mở lại giữa role | Cao | Cao | Inbox + URL + notification deep-link | RESCUE/WAREHOUSE cần API script |
| AI/Ollama cold start hoặc unavailable | Trung bình | Trung bình | Warm-up, cached index, fallback video | Core UI block vì AI |
| Internet mất làm map/font vỡ | Cao | Trung bình | Local layer, remove/narrow CDN dependency | Promised offline flow không hoàn thành |
| Mở thêm QR/iOS/offline-write/full CRUD/federation | Cao | Cao | Change-control; task mới phải thay task cũ | P0 bị lùi sau ngày 3 |

### Scope defer sau cuộc thi

- QR handover, iOS, offline-write queue/sync đầy đủ.
- Full inventory import/export/transfer/adjust/bulk UI.
- Full offline GIS, production public Internet, session rotation/revocation hoàn chỉnh.
- Backup/restore RPO-RTO pilot, multi-machine reboot/recovery, advanced weather-demand AI.

## 10. Manifest dọn repository

Mục tiêu: giữ source, test thực thi, runbook, PRD, corpus RAG và bằng chứng cần cho thi; bỏ lịch sử agent/plan và artifact cục bộ.

### Giữ lại

- `README.md`, `docs/PRD.md`, hướng dẫn cài/chạy/test, seed, mô tả ý tưởng.
- `docs/knowledge/`: corpus runtime của RAG, không phải tài liệu rác.
- `docs/qa/`: bằng chứng kỹ thuật dạng văn bản có giá trị khi phản biện; ảnh kiểm thử RAG đã bỏ khỏi gói source theo yêu cầu.
- Toàn bộ unit/integration/E2E test trong source.
- Scripts đang được manifest gọi hoặc phục vụ GIS/AI/demo/deploy.
- `.env.example`, `.env.demo.example`; không commit hoặc công bố `.env` thật.

### Xóa

- Plan lịch sử đã hoàn thành hoặc bị thay thế. **Giữ** plan 7 ngày đang active cho tới khi thi xong.
- `docs/archive/`: lịch sử cũ đã có trong Git.
- `docs/plan-*.md`: plan triển khai trạng thái, không phải authority sản phẩm.
- Báo cáo cũ mâu thuẫn code: `bao-cao-review-toan-du-an.md`, `bao-cao-xac-thuc-di-thi.md`, `bao-cao-e2e-rag-qua-giao-dien.md`.
- Checklist phụ `checklist-cong-viec-con-lai.md`; PRD + báo cáo này là authority tiến độ.
- `.claude/`, `.pytest_cache/`, `*.log`, build/cache cục bộ.

## 11. Quyết định phát hành

- **Có thể đem đi thi:** Có, nếu scope demo được chốt như mục 7 và P0 tenant/scope được đóng bằng tests.
- **Có thể public Internet production:** Chưa.
- **Có thể gọi full MVP hoàn tất:** Chưa.
- **Thông điệp nên dùng:** “Prototype vận hành tích hợp đã chứng minh lõi readiness, Mission-to-Kit, digital twin và AI local; đang hoàn thiện hardening và pilot acceptance.”

## 12. Quyết định đã chốt sau đánh giá

1. Thiết bị thi chính là Samsung Galaxy S23 Ultra với bản cập nhật ổn định mới nhất tại buổi rehearsal; APK release dùng local keystore riêng của dự án và biên bản phải ghi lại Android/One UI/build thực tế.
2. Các số hiện có của Đồng Xuân và xã lân cận đã được chủ dự án xác minh trực tiếp là số của Chủ tịch UBND xã và được phép công khai cho người dân gọi. Trang `/contacts` hiển thị danh sách không cần đăng nhập; giá trị thật vẫn lấy từ cấu hình cục bộ không commit. OSM vẫn chỉ là provenance bản đồ.

## 13. Giải thích “mọi bước qua UI”

Qua UI nghĩa là người chấm nhìn thấy và bấm/tap được toàn bộ nghiệp vụ chính, không cần terminal, curl/Postman, SQL, sửa ID/API URL hoặc chạy script ẩn giữa câu chuyện. Seed/reset/preflight trước demo và desktop simulator được phép vì có vai trò vận hành rõ ràng; chúng không thay thao tác nghiệp vụ của ADMIN, REPORTER, RESCUE hay WAREHOUSE.

Luồng thi cụ thể: desktop simulator phát scenario → APK REPORTER đăng nhập, gõ report và gửi → web ADMIN mở report, xem AI parse, chọn điểm và tạo/dispatch mission → APK RESCUE nhận notification, mở mission và confirm/reject → web WAREHOUSE mở inbox, prepare/fulfill → APK RESCUE complete delivery → web ADMIN xem timeline, readiness và audit. Mỗi bước phải có loading/error/403/empty state; refresh hoặc logout/login vẫn tìm lại được mission.

“Offline” ở đây là public Internet bị tắt nhưng điện thoại và máy chủ vẫn cùng private Wi-Fi/LAN. Nếu điện thoại mất cả LAN, app chỉ được hiển thị dữ liệu cache/stale hoặc trạng thái unavailable; tuần này không hứa offline-write/sync.

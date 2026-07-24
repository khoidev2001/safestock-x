# Checklist công việc còn lại — SafeStock-X

_Lập ngày: 2026-07-23 · Rút ra từ [bao-cao-review-toan-du-an.md](bao-cao-review-toan-du-an.md)._

> Đánh dấu `[x]` khi làm xong + verify (build sạch, test pass), KHÔNG chỉ code xong.
> Mỗi mục có file gốc để định vị. P0 = chặn/nguy hiểm, làm trước.

---

## P0 — Bảo mật & an toàn giao dịch (ưu tiên tuyệt đối)

- [x] **P0-1 · WebSocket auth + room server-side** ✅ 2026-07-24
  - [x] Xác thực access JWT ở Socket.IO middleware trước connection; tải role/organization/warehouse assignment hiện tại từ DB
  - [x] Bỏ handlers `join`/`join-role`; server tự cấp `role:*` và các `wh:*` đúng scope, middleware cài idempotent cho hai gateway
  - [x] Web, mobile, desktop, terminal demo và `sim.html` gửi token trong handshake; desktop refresh token rồi reconnect một lần khi bị `Unauthorized`
  - [x] Test: thiếu/sai/hết hạn/deleted-user token → reject; claim role/kho cũ không được tin; kho A không nhận event kho B; legacy spoof inert
  - [x] Verify: focused WebSocket **2 suites, 7/7**; backend **38 suites, 256/256**; PostgreSQL AppModule E2E **9/9**; backend/web/desktop build + mobile/desktop typecheck + diff check pass
  - [x] Giới hạn đã ghi nhận: socket đang mở chưa revoke giữa phiên; notification vẫn role-wide trong mô hình một database/xã; không schema/seed/reset/migration
- [x] **P0-2 · Cô lập simulator ở mức implementation/config** ✅ 2026-07-24
  - [x] `SIMULATION_MUTATION_ENABLED=false` mặc định; invalid config fail startup; disabled path zero-write
  - [x] Permission `simulation:view`/`simulation:mutate` + PermissionGuard; mutation chỉ ADMIN và recheck role hiện tại từ DB
  - [x] Scope organization/kho/run theo actor DB; runner nền reauthorize, pause/reset không đua với event đang chạy
  - [x] Actor nội bộ riêng từng kho cho loadcell; cấm login/admin mutation; không fallback human ADMIN
  - [x] Loadcell inventory + device baseline + sensor event atomic trong transaction, row-lock device, import/export scope trong mutation
  - [x] Verify: focused **59/59**; backend **44 suites, 298/298**; PostgreSQL E2E **4/4**; backend/shared/web/desktop build, desktop/mobile typecheck và diff check pass
  - [x] PostgreSQL E2E chứng minh disabled/non-admin/foreign-org zero-write, actor đúng và rollback atomic; không schema/seed/reset
  - [x] Runtime demo có `.env.demo`, PostgreSQL/Redis/volume/credentials/backend port riêng và launcher guard; owner tại `.env.demo.example`, `infrastructure/docker-compose.yml`, `infrastructure/demo/`, `package.json`
  - [x] Runbook operator tại `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md`; `.env` vận hành tiếp tục giữ `SIMULATION_MUTATION_ENABLED=false`
- [x] **P0-3 · Transfer tách lô + authorize** ✅ 2026-07-24
  - [x] Tách batch transactionally theo `quantity`; partial tạo child, full giữ batch ID (`inventory-transfer.ts`)
  - [x] Kiểm scope nguồn + kệ đích trong transaction; scope null vẫn giới hạn theo organization/xã
  - [x] Test: partial đúng 2 lô/số lượng; source hoặc destination ngoài scope → `403` và zero mutation
  - [x] Verify: focused unit **14/14**, PostgreSQL E2E **13/13**, backend Jest **229/229**; build + `git diff --check` và review pass, fixture cleanup `0 → 0`, không seed/reset
- [x] **P0-4 · Mission prepare atomic + scope** ✅ 2026-07-23
  - [x] Gộp conditional claim `READY` + `bulkExportInTx` vào một `$transaction`; retry/concurrent idempotent
  - [x] Truyền `scopeWarehouseId` từ JWT và kiểm scope mission/batch trong transaction
  - [x] Verify: focused 34/34; backend 215/215; PostgreSQL E2E 8/8; backend build + `git diff --check` pass
  - [x] Fixture E2E `missions/requirements/batches` 0/0/0 → 0/0/0; không seed/reset
- [x] **P0-5 · Report approve toàn bộ lô + atomic** ✅ 2026-07-24
  - [x] Phân bổ số đếm qua mọi batch theo thứ tự SKU + batch cố định; giữ lượng đang mượn ngoài tồn vật lý
  - [x] Claim report, reconcile theo snapshot CAS, audit và chuyển `APPROVED` trong một transaction; retry idempotent
  - [x] Phối hợp approve với borrow/return bằng `LoanRecord` `SHARE` + `ROW EXCLUSIVE`; public reconcile count-only vẫn no-op
  - [x] Verify: focused unit 3 suites **20/20**; report PostgreSQL E2E **9/9**; transfer E2E **13/13**; backend **36 suites, 249/249**; build + diff/whitespace pass; 13 fixture categories sạch; review **9.5/10 PASS**, không blocker
  - [x] Không seed/reset/schema/migration

---

## P1 — Chất lượng nền tảng

- [ ] **CI** — thêm `.github/workflows/`: lint + `jest` + `build` cho backend, `tsc` frontend, chặn merge khi đỏ
- [ ] **Concurrency test** — 2 request `prepare`/`transfer`/`export` song song (`Promise.all`): kiểm không âm tồn, không lost-update, không double-export
- [ ] **Prisma migrations** — chuyển từ `db push` sang migration history (`prisma migrate`) để review/rollback schema
- [ ] **ESLint config** — thêm `eslint.config.js` (flat config) cho toàn repo; thay `next lint` deprecated
- [ ] **Test 8 module trống** — admin, loan, notification, report, backup, health, ai, prisma (ít nhất controller RBAC/scope)

## P3 — Deployment/hardening acceptance

- [ ] **Simulator dual-stack pilot smoke** — chạy runtime vận hành và demo đồng thời trên máy pilot; xác nhận demo ở cổng 3110, desktop trỏ 3110, tài nguyên/dữ liệu tách biệt, `demo:infra:down` giữ dữ liệu và runtime vận hành vẫn disable mutation

---

## P1 — Frontend web (luồng nghiệp vụ)

- [ ] **Mission ID bền vững** — bỏ `useState` cho missionId (F5 mất); dùng URL param / query cache
- [ ] **Hộp thư nhiệm vụ** — danh sách mission theo trạng thái cho RESCUE/warehouse
- [ ] **Route-guard theo role** — chặn truy cập trang không đúng quyền
- [ ] **RESCUE reject từ web** — hiện chỉ mobile làm được
- [ ] **UI ghi kho** — nhập/xuất/điều chuyển/bulk (backend đã có, UI thiếu)
- [ ] **Không nuốt lỗi** — lỗi API hiện hiện thành empty state "khỏe"; phân biệt lỗi vs rỗng thật

---

## AI — hạng mục đã làm & đang làm

Roadmap gốc: [plan-tang-ham-luong-ai-di-thi.md](plan-tang-ham-luong-ai-di-thi.md) (B1–B7 + Track A/C) ·
Plan 2 hướng đã chốt: [plan-tang-mat-do-ai-rag-va-nl-plan.md](plan-tang-mat-do-ai-rag-va-nl-plan.md)

### ✅ AI đã làm chắc (giữ, đừng phá — chỉ để đối chiếu)

- [x] **Parse tình huống tiếng Việt → JSON** (LLM thật) — `ai-service/main.py` `_PARSE_SYSTEM`, có cache + retry + schema
- [x] **Sinh diễn giải Incident Action Plan** (LLM) — có `_find_unsupported_numbers` chống bịa số
- [x] **Trợ lý hỏi-đáp kho** (LLM + snapshot kho) — `assistant.service.ts`; ngoài phạm vi nói "không biết"
- [x] **AI cảnh báo tự động đa kênh** — sự cố mới → LLM giải thích → 4 kênh (desktop/chuông/chat/email); có fallback rule-based
- [x] **Forecast dự báo thống kê** — EWMA+std→khoảng tin cậy+reorder point+confidence (KHÔNG phóng đại thành ML)
- [x] **Guard chống lộ danh tính model** — `_IDENTITY_GUARD` + `_redact_identity` mọi câu trả lời
- [x] **Chạy offline bằng Ollama** (Qwen 3.5 4B) — điểm cộng thật, ít đội làm được

> Ghi chú trung thực: Readiness / Mission-to-Kit / Incident-fusion là **expert system + thống kê**,
> KHÔNG phải ML. Gọi đúng tên khi demo (xem Track A).

### 🔜 AI chưa làm (theo roadmap, thứ tự ưu tiên)

- [x] **B-NL→plan · Nối UI nhập tình huống bằng lời** (backend SẴN, chỉ thiếu UI — rủi ro thấp, wow nhanh) ✅ 2026-07-23
  - [x] `mission-api.ts`: thêm `parseIncident(description)` + type `ParsedIncident`
  - [x] `mission-view.tsx`: textarea "Mô tả tình huống" + nút "Phân tích bằng AI" → điền form cho admin sửa (con người xác nhận)
  - [x] Nhập giọng nói vi-VN offline bằng **PhoWhisper local** (thay Web Speech cloud) — nút mic ghi âm → WAV 16kHz → `/transcribe` → điền ô mô tả để người đọc lại
  - _Verify: frontend tsc exit 0. Degrade: mic/torch/ai-service không sẵn → báo lỗi nhẹ + vẫn nhập tay được._
- [x] **B1 · RAG trợ lý** ✅ 2026-07-23 — offline, có nguồn deterministic; hạ tầng embedding dùng chung cho B5/B7 ⭐
  - [x] Corpus `docs/knowledge/*.md`: 11 chunk, Sphere 2018 + IFRC 2020 + PCTT Việt Nam; mỗi mục có title + locator/trang + URL; sửa mâu thuẫn roadmap `3–4L` → đúng Sphere `2,5–3L` (uống/ăn), `7,5–15L` tổng cơ bản, `15L` uống+vệ sinh sinh hoạt
  - [x] Embedding provider riêng `nomic-embed-text` (batch `/api/embed`, fallback legacy chỉ 404/405); chat Gemini vẫn retrieval qua Ollama local
  - [x] `scripts/build_knowledge_index.py` → `knowledge_index.json` schema v2/fingerprint (11 chunks, 768 chiều, ~117KB); có corpus hash + text hash + model digest; `--check` pass
  - [x] `knowledge.py`: lazy-load, cosine + lexical answerability guard + rerank; reason code degrade, không sập `/assistant`
  - [x] `/assistant`: extractive RAG — LLM chỉ chọn sentence evidence IDs `K1S1...`, schema cấm field answer; hệ thống trả nguyên văn evidence + nguồn thật; không thể đổi claim/số/đơn vị
  - [x] Kiểm chứng: 59/59 pytest, 202/202 backend, backend+frontend tsc exit 0; live calibration 8/8 positive + 11/11 negative (gồm quantity cross-topic exploits); live HTTP 13 ca đúng nghĩa (validator thời tiết chấp nhận 72 giờ/ba ngày)
- [ ] **B4 · Dự báo nhu cầu theo thời tiết** (hợp chủ đề thi nhất, rủi ro thấp) — nối `forecast.ts` × `weather.ts`: mưa lớn → nhân hệ số nhu cầu WASH/RESCUE/FOOD → so tồn khả dụng → cảnh báo "kho X thiếu áo phao trước lũ"
- [ ] **B5 · Semantic search vật tư** (tái dùng embedding B1) — "đồ giữ ấm cho trẻ" → ra chăn/màn dù không trùng từ khoá
- [ ] **B6 · Bản tin AI đầu ngày** (Daily briefing) — LLM tóm tắt readiness+forecast+incident+thời tiết thành 1 đoạn cho lãnh đạo xã (chỉ diễn giải số đã tính)
- [ ] **B7 · Chuẩn hoá nhập liệu bằng embedding** — tên tự do → gợi ý SKU chuẩn. ⚠️ Chỉ làm SAU khi inventory/transfer ổn định (phụ thuộc P0-3); chỉ gợi ý cho người xác nhận, không tự ghi
- [x] **B3 · Voice input vi-VN → parse** ✅ 2026-07-23 — **PhoWhisper-medium local/offline** (VinAI), ghi âm trình duyệt → WAV 16kHz base64 → `/transcribe` → điền ô mô tả → nối `/parse`. Lazy-load (thiếu torch/model → 503, không sập LLM khác). Test: `tests/test_transcribe.py` 5/5 pass. Con người đọc lại & sửa trước khi lập phương án.

### 📣 Track A — Đóng gói câu chuyện AI (chi phí thấp, làm khi gần thi)

- [x] Cập nhật [docs/qa/tong-quan.md](qa/tong-quan.md): gọi đúng tên LLM/RAG/PhoWhisper/rule engine/thống kê; không phóng đại
- [x] Định vị hệ thống là **Decision Support System dùng AI có trách nhiệm** — số kho từ backend, kiến thức từ corpus có nguồn, con người quyết định; offline local không khoe "model to"
- [x] Chuẩn bị demo RAG: `scripts/evaluate_ollama.py` có ca định mức 15L + phân biệt 2,5–3L/7,5–15L + ngoài corpus; live 13/13 pass

---

## P2 — Mobile & polish

- [ ] **SecureStore** — token đang lưu không an toàn
- [ ] Màn kho/readiness trên mobile
- [ ] QR scan, inventory ops trên mobile
- [ ] Offline cache
- [ ] Build APK
- [ ] Bỏ URL backend hard-code (mobile) + creds admin hard-code (desktop simulator)

---

## Quyết định của người dùng (1 mục còn chờ)

- [x] **Commit forecast thống kê** — đã commit `46233b0` (`feat(insights): add statistical inventory forecast`)
- [ ] Chốt thứ tự triển khai AI: Phần B trước hay Phần A trước

# ROADMAP — Backend (`@safestock/backend`)

> NestJS + Prisma + PostgreSQL + Redis. Nguồn nghiệp vụ trung tâm: auth, inventory, readiness, simulation, mission (proxy), incident.
>
> **QUY TẮC:** mỗi phase khi code BẮT BUỘC tick từng dòng checklist. Xong hết checklist + verify pass → đổi trạng thái phase sang ✅. Chi tiết yêu cầu: [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md).
>
> **SAU KHI phase ✅:** cập nhật/bổ sung câu hỏi xoáy + trả lời vào [../../docs/qa/](../../docs/qa/) (đạn Q&A cho giám khảo).
>
> Trạng thái: ⬜ chưa · 🟡 đang làm · ✅ xong+verify. Ưu tiên: 🔴 CORE · 🟠 nên-có · ⚪ polish.

## ▶ DEMO TERMINAL (thay frontend tạm)
Chạy toàn bộ luồng backend end-to-end, in màu ra terminal (6 bước: Readiness → Mission → khoảnh khắc vàng → mượn-trả → duyệt → audit).
```bash
pnpm infra:up                              # Postgres + Redis
pnpm --filter @safestock/backend build && pnpm --filter @safestock/backend seed
node apps/backend/dist/src/main.js &        # backend :3100
pnpm ai:dev &                               # ai-service :8000 (cần GEMINI_API_KEY)
pnpm demo                                    # chạy demo
```
File: `apps/backend/demo/demo.mjs`. **✅ verify: 6 bước chạy thật, phân quyền 403, điểm rớt <2s, đáp ứng 14%=min, mượn-trả, audit 5W.**

---

## BE-A0 — Nền móng ✅ 🔴
- [x] pnpm workspace + docker-compose (Postgres + Redis healthcheck)
- [x] NestJS scaffold + PrismaModule + ConfigModule
- [x] HealthController (DB + Redis check)
- [x] Prisma schema core (Organization, User, Warehouse, Zone, Shelf, Item, Batch, Transaction, AuditLog)
- [x] Seed dữ liệu mẫu
- **Verify:** ✅ `GET /api/health` → status ok, db+redis up

## BE-A1 — Auth + Inventory ✅ 🔴
- [x] bcrypt + JWT access(15m)/refresh(7d) + login/refresh/me
- [x] JwtAuthGuard + RolesGuard + @Roles
- [x] Inventory read: cây kho, list batch, scan theo SKU
- [x] Inventory write: import/export/transfer atomic + audit; chặn xuất quá tồn
- [x] ValidationPipe global
- **Verify:** ✅ login→token→me; no-token 401; export 96→86; over-export chặn; audit before/after

## BE-B0 — Sensor: schema + CRUD device + DeviceState ✅ 🔴
- [x] Prisma: VirtualDevice(+currentValue), SensorEvent, SimulationScenario, SimulationRun
- [x] Shelf.isBlocked/isLocked (accessibility cho Readiness)
- [x] CRUD device + seed thiết bị ảo (10 device)
- [x] Ngưỡng lọc event trước khi lưu (tránh phình bảng)
- **Verify:** ✅ list device đúng cây; DeviceState update; delta nhỏ → không lưu

## BE-B1 — Scenario + runner scrubber ✅ 🔴
- [x] scenario-definitions: 6 kịch bản (offsetMs) + nhiễu seed (mulberry32)
- [x] RunnerService timeline-scrubber: play/pause/reset, x1/x10, cursorMs resume
- [x] Lưu event theo runId
- **Verify:** ✅ reproducible 27 event cùng seed

## BE-B2 — WebSocket realtime ✅ 🔴
- [x] Socket.IO gateway room theo warehouseId
- [x] Emit event khi runner phát
- [x] Endpoint control: runs/:id/{play,pause,reset}, POST events
- **Verify:** ✅ ws nhận event < 650ms (<2s NFR-02)

## BE-B3 — Simulator UI tối thiểu ✅ 🔴
- [x] public/sim.html (slider + chạy scenario) serve qua ServeStaticModule
- **Verify:** ✅ kéo slider → event realtime

## BE-Cminus — Schema nền Readiness ✅ 🔴
- [x] ItemCondition (NEW/USED/NEEDS_CHECK/DAMAGED) × CirculationStatus (IN_STOCK/ON_LOAN/RETURNED)
- [x] Item.consumable + unitWeightKg
- [x] Warehouse.distanceKm + NeighborWarehouse
- [x] LoanRecord (phiếu mượn)
- [x] InventoryTransaction.source + InventoryCount
- **Verify:** ✅ push + build + seed sạch
- **Ghi chú:** đang ở branch feat/c-minus-schema (PR #1, chưa merge)

---

## BE-A2core — RBAC permission + audit 5W ✅ 🔴
- [x] Đổi UserRole → WAREHOUSE / RESCUE / ADMIN (gộp 3 role) — shared-types + prisma
- [x] `ROLE_PERMISSIONS` hằng số code (không bảng DB) + PermissionGuard + @RequirePermission
- [x] Quyền: inventory:*, mission:*, readiness:view, loan:manage, admin:users, audit:view, warehouse:manage
- [x] AuditService 5W: reason BẮT BUỘC (throw nếu thiếu) + metadata before/after
- [x] GET /audit (chỉ audit:view) — hậu kiểm
- [x] Cập nhật seed 3 role (admin/ADMIN, warehouse@/WAREHOUSE, rescue@/RESCUE)
- [x] Xóa RolesGuard cũ (code chết §26), inventory chuyển sang @RequirePermission
- [ ] Double-confirm thao tác rất nhạy (ghi đè lớn) → làm ở Bp2 (adjust) cùng lúc
- **Verify:** ✅ 6 unit test RBAC; E2E: WAREHOUSE export 201, RESCUE export 403, ADMIN audit 200, WAREHOUSE audit 403, RESCUE scan 200
- **File:** `src/rbac/{permission.guard.ts,permissions.decorator.ts,audit.service.ts,audit.controller.ts,rbac.module.ts,__tests__/}`
- **Ghi chú:** shared-types thêm Permission enum + ROLE_PERMISSIONS + roleHasPermission. Double-confirm dời sang Bp2.

## BE-C0 — 6 công thức con + schema điểm ✅ 🔴
- [x] Prisma: ReadinessScore, ReadinessComponent, ReadinessRule (trọng số configurable), ReadinessRecommendation, ReadinessThreshold
- [x] Công thức Expiry (phái sinh từ expiryDate, không lưu cứng)
- [x] Công thức Condition (NEW=100/USED=75/NEEDS_CHECK=50/DAMAGED=0; ON_LOAN xử lý ở Quantity)
- [x] Công thức Accessibility (blocked/locked)
- [x] Công thức Quantity (countedQty/systemQty, trừ onLoan, cap 50 khi chưa kiểm kê)
- [x] Công thức Environment (nhiệt/ẩm ngưỡng, mắt xích yếu nhất)
- [x] Công thức DataReliability (độ mới kiểm kê + sensor fresh)
- [x] Trọng số + ngưỡng cấu hình (readiness.config.ts + ReadinessRule/Threshold) + disclaimer
- [x] combineComponents gộp có trọng số (chuẩn hóa 0-100, không cộng đơn vị thô)
- **Verify:** ✅ 27 unit test pass (mọi nhánh 6 công thức + gộp trọng số); schema push + build sạch
- **File:** `src/readiness/{formulas/,readiness.config.ts,readiness.types.ts,__tests__/}`
- **Ghi chú:** Jest setup mới (jest.config.js + ts-jest). Chạy `pnpm --filter @safestock/backend test`

## BE-C1 — Tính điểm 4 cấp + recalc ✅ 🔴
- [x] Roll-up batch→shelf→zone→warehouse (trọng số quantity) — compute.ts thuần
- [x] Đơn vị hỗn hợp: điểm 0-100 chuẩn hóa rồi gộp trọng số (không cộng đơn vị thô)
- [x] Recalc event-driven khi cảm biến môi trường đổi (debounce 300ms) — CỨU khoảnh khắc vàng
- [x] Cache: lưu ReadinessScore + Component, ghi đè bản mới nhất theo target (upsert)
- [x] Breakdown: mỗi điểm truy về 6 thành phần + gom lý do trừ điểm
- [x] Endpoint GET /readiness/warehouses/:id + POST .../recalculate (quyền READINESS_VIEW)
- [ ] Recalc on-write khi giao dịch inventory → làm cùng Bp (nối inventory→readiness)
- **Verify:** ✅ recalc kho seed → 78 điểm, breakdown đúng (quantity 50 chưa kiểm kê, expiry 77...); **đẩy độ ẩm khu B 60→95 → điểm zone rớt 81→77 trong <2s (khoảnh khắc vàng)**; 41 test pass
- **File:** `src/readiness/{compute.ts,readiness.service.ts,readiness.gather.ts,readiness.controller.ts,readiness.module.ts,__tests__/compute.spec.ts}`
- **Ghi chú:** on-write recalc (khi export/adjust) dời sang Bp. Component.weight tạm 0 (điền khi tích hợp ReadinessRule config).

## BE-C2 — Nguyên nhân trừ điểm + đề xuất ✅ 🔴
- [x] Mỗi thành phần bị trừ → lý do cụ thể (reasons trong breakdown)
- [x] Sinh recommendation từ reasons (buildRecommendations thuần, sắp yếu-nhất-trước)
- [x] Lưu recommendation cấp kho lúc recalc + GET /readiness/warehouses/:id/recommendations
- **Verify:** ✅ recalc kho → 3 đề xuất (quantity/dataReliability/expiry) khớp breakdown; 4 test
- **File:** `src/readiness/recommendations.ts`, `__tests__/recommendations.spec.ts`

## BE-C3 — Ngưỡng hành động 4 vùng ✅ 🔴
- [x] 4 vùng READY≥80/ATTENTION≥70/DEGRADED≥50/CRITICAL<50 (configurable qua ReadinessThreshold)
- [x] resolveActionZone + shouldNotifyManager + shouldBlockNewMission (thuần)
- [x] GET/recalc trả kèm zone; ngưỡng đọc từ DB (rỗng → mặc định)
- [ ] Hook trigger thông báo thực tế → làm ở lát Incident/notification (in-app alert)
- [ ] Mission đọc ngưỡng chặn khi <50 → làm ở Phase D (mission)
- **Verify:** ✅ score 78 → zone ATTENTION; môi trường xấu → 71 vẫn ATTENTION (môi trường 10% không phóng đại); 7 test
- **File:** `src/readiness/action-zone.ts`, `__tests__/action-zone.spec.ts`
- **Ghi chú:** hook thông báo + mission-block là điểm TÍCH HỢP, để lát tương ứng (không nhồi vào C3).

## BE-Bp0 — Xuất lô 1 chạm + atomic ✅ 🔴
- [x] POST /inventory/bulk-export (nhiều batch 1 transaction, thất bại 1 → rollback tất cả)
- [x] Atomic conditional update (updateMany WHERE quantity>=x) chống race — áp cả export thường + source
- [x] Quyền inventory:bulk_export + audit 5W hậu kiểm (không duyệt trước)
- **Verify:** ✅ bulk-export 2 batch OK; fail 1 → rollback (áo phao vẫn 86); **20 export song song 40>tồn30 → tồn cuối 0, KHÔNG âm**

## BE-Bp2 — Sửa tay + reconcile ✅ 🔴
- [x] POST /inventory/adjust (lý do BẮT BUỘC MinLength(3) + audit 5W, quyền inventory:adjust)
- [x] POST /inventory/reconcile (kiểm kê, **#22 chỉ đếm IN_STOCK trừ ON_LOAN**, ghi InventoryCount)
- [x] Ghi đè tùy chọn (applyOverride) → cập nhật tồn = counted + onLoan
- **Verify:** ✅ adjust không lý do 400, có lý do 86→80; reconcile 75 lệch -5 ghi đè→75; **batch mượn 10: đếm 15 kỳ vọng 15 lệch 0 KHÔNG mất số mượn**

## BE-Bp3 — Seed 2 kho + dữ liệu bẩn ✅ 🔴
- [x] NeighborWarehouse seed lệch loại (kho chính nhiều áo phao ít nước; lân cận gần 8km nhiều nước, xa 35km nhiều áo phao)
- [x] Seed batch bẩn: bạt không hạn+chưa kiểm kê, lô DAMAGED, lô MISPLACED, kệ B3 isBlocked
- [x] consumable + unitWeightKg seed cho catalog (áo phao/xuồng/đèn/bộ đàm tái sử dụng; nước/pin/sơ cứu tiêu hao)
- **Verify:** ✅ recalc kho có dữ liệu bẩn → itemCondition 99 (DAMAGED kéo xuống), quantity/dataReliability thấp (chưa kiểm kê); 2 neighbor (8km/35km lệch loại) query được; 11 batch / 2 neighbor
- **File:** `prisma/seed.ts`
- **Ghi chú:** Mission (D) đọc NeighborWarehouse để gợi ý mượn liên xã.

## BE-Bp4 — Mượn-trả LoanRecord ✅ 🔴
- [x] POST /loans (mượn, chỉ consumable=false → ON_LOAN; consumable=true chặn)
- [x] POST /loans/:id/return (trả từng phần ok/hỏng/mất, chặn hoàn quá nợ)
- [x] ok→USED+IN_STOCK, damaged→NEEDS_CHECK, lost→trừ tổng kho; phiếu CLOSED khi hoàn hết
- [x] Khả dụng-ngay = quantity − Σ đang mượn (borrow kiểm)
- [x] GET /loans/warehouses/:id/open; quyền loan:manage
- **Verify:** ✅ mượn nước chặn; mượn 20 áo phao tổng vẫn 96 circulation ON_LOAN; trả 15+3+2 → tổng 94 (−2 mất) condition NEEDS_CHECK phiếu CLOSED
- **File:** `src/loan/{loan.service.ts,loan.controller.ts,dto.ts,loan.module.ts}`

## BE-D-proxy — Mission backend (proxy AI + greedy + duyệt) ✅ 🔴
- [x] POST /missions/parse → gọi ai-service (AiClientService, có CACHE parse #D1b)
- [x] Bảng định mức mission.config.ts + dẫn nguồn Sphere (nước 15L/người/ngày...)
- [x] Phân bổ GREEDY + FEFO (mission.compute.ts thuần), lô gần hết hạn trước, không vượt tồn
- [x] Đáp ứng % = MIN qua các loại (mắt xích yếu nhất)
- [x] Prisma: Mission + MissionRequirement (allocations + neighborSuggestion JSON)
- [x] generate-plan (text→AI parse HOẶC incident nhập tay) / approve (DRAFT→APPROVED, chặn duyệt lại) / explain (AI diễn đạt)
- [x] Gợi ý mượn liên xã ưu tiên GẦN (đọc NeighborWarehouse, sort distanceKm)
- [x] Chỉ lấy lô IN_STOCK không DAMAGED, trừ phần ON_LOAN
- **Verify:** ✅ lũ 120 người → định mức đúng (áo phao 120, nước 3600L), greedy cấp 96/500, **đáp ứng 14% = min (nước yếu nhất)**, gợi ý Xuân Sơn 8km trước huyện 35km; full flow text→parse→greedy→explain→approve chạy; 19 test compute
- **File:** `src/mission/{mission.config.ts,mission.compute.ts,mission.service.ts,ai-client.service.ts,mission.controller.ts,dto.ts}`
- **Ghi chú:** start/complete + mission-done≠loan-done (#26) dời sang lát tích hợp mobile (F4). AI-D1b cache đã có ở AiClientService. Gemini free tier 503 tạm thời → đã thêm retry ở provider.

## BE-J — GeoService: khoảng cách + ETA có chặn quota ✅ 🔴
- [x] Schema: Warehouse +kind(CENTRAL/HAMLET)+communeId+lat/lng; Mission +incidentLat/lng+actionPlan; model ApiUsage(provider,yearMonth,count)
- [x] haversine.ts THUẦN: 2 lat/lng → km (đường chim bay) + ETA = km×1.3 ÷ tốc độ giả định
- [x] GeoService: Google Routes (Compute Route Matrix) làm chính, fallback Haversine khi mất mạng/không key/chạm quota — không ném lỗi lên workflow
- [x] usage-counter (bảng ApiUsage): đếm element/tháng, tới GEO_MONTHLY_CAP=8500 thì ngừng gọi Google
- [x] Không có GOOGLE_MAPS_API_KEY → luôn Haversine (dev/demo/thi chạy không cần key)
- **Verify:** ✅ 10 test (haversine đúng sai số nhỏ, đối xứng, 1 độ≈111km; counter≥8500→source=haversine không gọi Google; không key→không đụng DB); ETA Haversine ra số hợp lý (kho 0/1.9/4.3km)
- **File:** `src/geo/{haversine.ts,geo.service.ts,geo.module.ts,__tests__/}`
- **Ghi chú ngoài code (khi cần đường bộ thật):** tạo Google Cloud project → bật Routes API → key → **đặt quota cap 9.000/tháng** trên Console (chống trừ tiền) → `.env` GOOGLE_MAPS_API_KEY. Chưa cần cho MVP.

## BE-K — Cụm kho xã + AI Action Plan ✅ 🔴 (⭐ khác biệt thi)
- [x] Chọn kho cùng communeId, tính khoảng cách kho→điểm nạn (GeoService), greedy kho thôn GẦN trước → tràn kho tổng (byNearestThenFefo: gần trước, cùng kho thì FEFO)
- [x] Seed cụm kho: 1 kho tổng (CENTRAL) + 2 kho thôn (HAMLET) cùng communeId, lat/lng thật Phú Yên, tồn lệch nhau
- [x] ai-service POST /action-plan: schema ActionPlanNarrative (objectives/phases 0-2h,2-6h,6-24h/warnings/followUpQuestions), validate Pydantic + retry 4 lần, maxOutputTokens 4096
- [x] Backend chấm severityLevel(1-5) + forecasts(%) bằng RULE (scoreSeverity/computeForecasts thuần) — chống LLM bịa số, LLM chỉ viết văn
- [x] ETA từ GeoService vào context Action Plan (LLM dùng đúng số, không bịa ETA)
- [x] ai-client.actionPlanNarrative có cache; Mission.actionPlan lưu JSON; endpoint POST /missions/:id/action-plan
- [x] Template fallback (buildTemplateNarrative) khi LLM lỗi/mất mạng → 8 mục đầy đủ từ số backend
- **Verify:** ✅ 23 test (K1 kho gần trước + FEFO; action-plan rule severity/forecast/template). E2E thật: generate-plan lũ 100 người điểm nạn gần Phú Xuân → áo phao lấy Phú Xuân(0km) trước tràn kho tổng, nước vét cả 3 kho; **AI Gemini ra Action Plan 8 mục dùng ĐÚNG số backend (110 áo phao, 620/880 nước, ETA kho, dự báo 56/69%) — bằng/hơn docx**; rút AI service → template fallback vẫn ra 8 mục
- **File:** `src/mission/{action-plan.ts,mission.compute.ts,mission.service.ts,mission.controller.ts,dto.ts}`, `apps/ai-service/{main.py,schemas.py}`
- **Ghi chú:** Fix Gemini JSON cắt cụt (2048→4096 token cho Action Plan tiếng Việt). Workflow liên role + Notification tách sang BE-L.

## BE-Bp1 — Loadcell/RFID tự sinh giao dịch ⬜ 🟠
- [ ] Handler WEIGHT_CHANGED → suy số lượng (unitWeightKg) → tạo transaction source LOADCELL
- [ ] Handler RFID_DETECTED → map tag→item → transaction source RFID
- **Verify:** scenario suspected_loss → tự sinh transaction ~ đúng SL

## BE-E — Incident Intelligence ✅ 🟠
- [x] Prisma: Incident, IncidentEvidence, IncidentAction
- [x] Rule engine (incident.rules.ts THUẦN) ngưỡng cụ thể: loadcell giảm >3kg + cửa + RFID trong ±5ph → thất thoát; giảm mà không nguồn khác → lỗi cảm biến; ẩm>85/nhiệt>35 → bảo quản xấu
- [x] Phân biệt NHIỄU (giảm <3kg → bỏ) vs sự cố; ngoài cửa sổ thời gian → không hợp nhất (chống vòng tròn tự chứng minh)
- [x] Chấm điểm nghiêm trọng theo trọng số bằng chứng (2 nguồn=HIGH, 3=CRITICAL) + confidence
- [x] LLM giải thích (proxy AiClientService, không tự kết luận số)
- [x] Timeline bằng chứng theo thời gian; acknowledge/assign/resolve workflow
- [x] AiClientService tách ra AiModule global (dùng chung Mission + Incident)
- **Verify:** ✅ scenario suspected_loss → SUSPECTED_LOSS HIGH conf 0.7, 2 bằng chứng, timeline theo giờ; workflow OPEN→ACKNOWLEDGED→RESOLVED; 10 test rule engine (thất thoát/lỗi cảm biến/nhiễu/bảo quản/cửa sổ thời gian)
- **File:** `src/incident/{incident.rules.ts,incident.service.ts,incident.controller.ts,incident.module.ts}`, `src/ai/`
- **Ghi chú:** explain phụ thuộc Gemini quota (429 khi test nhiều) → retry + cache. Logic incident không đụng AI.

## BE-Bp5 — Backup Supabase ⬜ 🟠
- [ ] BullMQ cron 17:00: dump → Supabase, giữ 3 bản, skip nếu mất net
- **Verify:** chạy job → dump trên Supabase; bản thứ 4 xóa cũ nhất

## BE-G4api — Chatbot hỏi-đáp kho (context injection) ⬜ ⚪
- [ ] POST /assistant/ask: snapshot JSON kho → LLM → trả lời, ràng chỉ từ JSON
- **Verify:** hỏi số liệu đúng; ngoài phạm vi → "không biết"

## BE-L — Workflow liên role + Notification ⬜ 🔴 (CORE)
- [ ] MissionStatus mở rộng: DRAFT→PENDING_RESCUE→RESCUE_CONFIRMED→PENDING_WAREHOUSE→READY→COMPLETED (giữ REJECTED)
- [ ] Model Notification + NotificationService (create/list/markRead) + NotificationGateway (Socket.IO, room theo role)
- [ ] Transitions + notify: ADMIN generate→notify RESCUE; RESCUE confirm→notify WAREHOUSE; WAREHOUSE prepare(bulk-export)→READY→notify ADMIN+RESCUE; thiếu→notify kho lân cận
- [ ] Phân quyền lại (shared-types): +mission:confirm(RESCUE), +mission:fulfill(WAREHOUSE), mission:create→ADMIN
- **Verify:** state machine test transition sai→lỗi; notify đúng recipient mỗi bước; E2E ADMIN→RESCUE→WAREHOUSE chạy hết

## BE-M — Normal Mode: AI quản trị kho ngày thường ⬜ 🔴 (CORE, ⭐ "AI khi không thiên tai")
> Đã có 3/10: #3 anomaly (incident), #7 env (readiness), #8 readiness score — KHÔNG code lại.
- [ ] insights/forecast.ts (thuần+test): tốc độ xuất TB → dự báo thiếu hụt (#1) + đề xuất nhập (#2)
- [ ] insights/expiry-alert: batch sắp hết hạn → cảnh báo + đề xuất điều chuyển (#4)
- [ ] insights/rebalance.ts (thuần+test): chênh tồn cùng SKU giữa kho cùng communeId → điều chuyển (#5)
- [ ] insights/trends.ts (thuần+test): % tăng/giảm xuất (#6) + báo cáo tháng (#10)
- [ ] weather/: Open-Meteo (free, no key) theo lat/lng → cảnh báo mưa lớn 72h (#9)
- [ ] insights.controller: GET /insights/warehouses/:id + /monthly-report; LLM diễn giải số
- **Verify:** seed lịch sử xuất → insights số thật; monthly-report đủ mục; weather cảnh báo khi mưa vượt ngưỡng

## BE-N — Demo mở rộng + đồng bộ docs ⬜ 🟠
- [ ] demo.mjs: workflow Emergency (ADMIN→RESCUE→WAREHOUSE) + Normal Mode insights, in terminal
- [ ] Cập nhật PRD (2 chế độ), BUILD-PLAN (J-N), docs/qa (Q&A giám khảo)
- **Verify:** demo chạy hết 2 chế độ; docs khớp code

## BE-I — Server-time + config env ⬜ 🔴
- [ ] Server đặt mọi timestamp (client không gửi) — #31
- [ ] Env schema validate lúc khởi động (thiếu biến bắt buộc → dừng)
- **Verify:** client gửi timestamp bị bỏ qua; thiếu JWT_SECRET → app không start

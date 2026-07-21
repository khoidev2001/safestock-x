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
- [x] Shelf.isLocked (kệ khóa/thiếu quyền, dùng cho accessibility Readiness)
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
- [x] Công thức Accessibility theo trạng thái khóa/quyền truy cập
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
- [x] Recalc on-write khi giao dịch inventory (import/export/bulkExport/adjust/reconcile → recalc kho tương ứng, fire-and-forget sau transaction)
- **Verify:** ✅ recalc kho seed → 78 điểm, breakdown đúng (quantity 50 chưa kiểm kê, expiry 77...); **đẩy độ ẩm khu B 60→95 → điểm zone rớt 81→77 trong <2s (khoảnh khắc vàng)**; export/adjust/reconcile → readiness đổi ngay không cần gọi /recalculate tay; 128 test pass
- **File:** `src/readiness/{compute.ts,readiness.service.ts,readiness.gather.ts,readiness.controller.ts,readiness.module.ts,__tests__/compute.spec.ts}`
- **Ghi chú:** on-write recalc (khi export/adjust) dời sang Bp. Component.weight tạm 0 (điền khi tích hợp ReadinessRule config).

## BE-C2 — Nguyên nhân trừ điểm + đề xuất ✅ 🔴
- [x] Mỗi thành phần bị trừ → lý do cụ thể (reasons trong breakdown)
- [x] Sinh recommendation từ reasons (buildRecommendations thuần, sắp yếu-nhất-trước)
- [x] Lưu recommendation cấp kho lúc recalc + GET /readiness/warehouses/:id/recommendations
- **Verify:** ✅ recalc kho → 3 đề xuất (quantity/dataReliability/expiry) khớp breakdown; 4 test
- **File:** `src/readiness/recommendations.ts`, `__tests__/recommendations.spec.ts`

## BE-C3 — Trạng thái vận hành + blocker Readiness v2.2 ✅ 🔴
- [x] 4 vùng READY≥80/ATTENTION≥70/DEGRADED≥50/CRITICAL<50 (configurable qua ReadinessThreshold)
- [x] resolveActionZone + shouldNotifyManager + shouldBlockNewMission (thuần)
- [x] GET/recalc trả kèm zone; ngưỡng đọc từ DB (rỗng → mặc định)
- [x] Kết luận `READY / NEEDS_ACTION / NOT_DISPATCHABLE`; blocker có quyền ưu tiên cao hơn điểm
- [x] Blocker kho từ FIRE_RISK CRITICAL, accessibility=0 hoặc environment=0; thông báo khi trạng thái vận hành xấu đi
- [x] Mission lọc lô hỏng, NEEDS_CHECK, hết hạn, kệ khóa/chặn và trừ phần đang mượn
- [x] Lưu `readinessAssessment` từng mission; chặn approve/dispatch khi một SKU thiết yếu không cấp được
- [x] Giữ `zone` 4 vùng làm contract tương thích và chỉ báo xu hướng, không dùng để chặn mission
- **Verify:** ✅ test điểm 95 + blocker vẫn NOT_DISPATCHABLE; điểm 65 không blocker là NEEDS_ACTION; lọc expiry/lock/condition/loan; toàn backend 25 suite / 168 test và build pass ngày 2026-07-21
- **File:** `src/readiness/{operational-readiness.ts,readiness.service.ts}`, `src/mission/{batch-eligibility.ts,mission-readiness.ts,mission.service.ts}`

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
- [x] Seed lô cần xử lý: hết hạn, DAMAGED, NEEDS_CHECK và chưa kiểm kê
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
- [x] Seed cụm kho: 1 kho tổng (CENTRAL) + đủ 17 kho thôn (HAMLET) hiện hành cùng `communeId`; tọa độ thôn để trống chờ ADMIN pin vị trí thực
- [x] ai-service POST /action-plan: schema ActionPlanNarrative (objectives/phases 0-2h,2-6h,6-24h/warnings/followUpQuestions), validate Pydantic + retry 4 lần, maxOutputTokens 4096
- [x] Backend chấm severityLevel(1-5) + forecasts(%) bằng RULE (scoreSeverity/computeForecasts thuần) — chống LLM bịa số, LLM chỉ viết văn
- [x] ETA từ GeoService vào context Action Plan (LLM dùng đúng số, không bịa ETA)
- [x] ai-client.actionPlanNarrative có cache; Mission.actionPlan lưu JSON; endpoint POST /missions/:id/action-plan
- [x] Template fallback (buildTemplateNarrative) khi LLM lỗi/mất mạng → 8 mục đầy đủ từ số backend
- **Verify:** ✅ logic kho gần trước + FEFO và action-plan rule severity/forecast/template đã có test. Bộ seed 2026.07 kiểm tra đủ 17 thôn, 17 SKU, lô Mission khả dụng và tọa độ thôn để trống; cần pin tọa độ thật trước khi kiểm thử ETA/điều phối theo khoảng cách.
- **File:** `src/mission/{action-plan.ts,mission.compute.ts,mission.service.ts,mission.controller.ts,dto.ts}`, `apps/ai-service/{main.py,schemas.py}`
- **Ghi chú:** Fix Gemini JSON cắt cụt (2048→4096 token cho Action Plan tiếng Việt). Workflow liên role + Notification tách sang BE-L.

## BE-Bp1 — Loadcell/RFID tự sinh giao dịch ⬜ 🟠
- [x] Handler WEIGHT_CHANGED → suy số lượng (unitWeightKg) → tạo transaction source LOADCELL (chọn batch đầu tiên tạo trên kệ, ponytail: đủ demo 1 SKU/kệ)
- [ ] Handler RFID_DETECTED → map tag→item → transaction source RFID (chưa làm đợt này)
- **Verify:** ✅ scenario `suspected_loss` (loadcell 48→44kg) → batch tương ứng giảm đúng 4kg/unitWeightKg đơn vị, InventoryTransaction.source=LOADCELL; recalc readiness tự trigger qua đường C1 (không cần thêm LOADCELL vào ENV_DEVICE_TYPES)
- **File:** `src/simulation/simulation.service.ts`

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

## BE-E2 — Anomaly Detection + Cảnh báo sớm dự đoán ✅ 🟠
- [x] anomaly.rules.ts (THUẦN): detectStatisticalAnomaly (z-score, baseline ≥10 mẫu, |z|≥3)
- [x] detectPredictiveWarning (hồi quy tuyến tính, ngoại suy chạm ngưỡng trong 2h)
- [x] Test: KHÔNG báo giả với nhiễu bình thường (đúng tham số scenario normal) — chống "vòng tròn tự chứng minh"
- [x] scanWarehouse() nối 2 detector mới, dùng chung persist/notify có sẵn
- [x] Scenario heat_drift: nhiệt tăng dần CHƯA vượt ngưỡng → predictive báo trước rule ngưỡng cũ
- [x] Frontend: label STAT_ANOMALY/PREDICTIVE_WARNING
- [x] Chống spam trùng lặp: scan lại khi sự cố cùng kind+thiết bị đang mở (chưa RESOLVED) → bỏ qua, không tạo incident/notification mới
- **Verify:** ✅ `anomaly.rules.spec.ts` 7 test pass (kể cả case chống báo giả nhiễu `normal` seed 42); `incident.rules.spec.ts` 16 test cũ không đổi hành vi; build sạch. **Thủ công qua API thật:** chạy scenario `heat_drift` (nhiệt 28→34°C, chưa chạm 35) → scan → `PREDICTIVE_WARNING` CRITICAL nổ ra đúng lúc còn dưới ngưỡng; scan lại lần 2 (chưa resolve) → `detected: 0` (chặn trùng đúng); resolve xong → scan lại → tạo mới lại bình thường (`detected: 1`). Full suite 114 test pass, không regression.
- **File:** `src/incident/{anomaly.rules.ts,incident.rules.ts,incident.service.ts,__tests__/anomaly.rules.spec.ts}`, `packages/scenario-definitions/src/index.ts`, `apps/frontend/src/components/dashboard/incident-view.tsx`
- **Ghi chú:** khác với anomaly cũ ở ghi chú BE-M (chỉ là ngưỡng tuyệt đối cố định) — đây là thống kê thật (z-score so baseline lịch sử) + dự đoán (ngoại suy trend, báo TRƯỚC khi vượt ngưỡng). Dedupe áp dụng chung cho cả 5 rule cũ lẫn 2 detector mới (key `kind+deviceCode`), không riêng anomaly.

## BE-Bp5 — Backup Supabase ✅ 🟠
- [x] BullMQ cron 17:00 (repeatable, dedupe theo repeat key) → dump DB → Supabase Storage, giữ 3 bản (prune bản cũ)
- [x] pg_dump chạy TRONG container Postgres (host khỏi cài client); -O -x cho portable
- [x] Thiếu SUPABASE_URL/SUPABASE_SERVICE_KEY → skip êm lúc khởi động (không chặn app); POST /backup/run thủ công trả `{enqueued:false, reason}` thay vì lỗi
- [x] Upload Storage bằng fetch native (KHÔNG dùng supabase-js — SDK cần WebSocket/Node22+, thừa cho backup); gỡ dep supabase-js
- **Verify:** ✅ CHẠY THẬT với Supabase project thật: `POST /api/backup/run` → dump 59KB lên bucket db-backups (log "Backup xong"); chạy 4 lần → Storage giữ đúng 3 bản mới nhất, log "Đã xóa 1 bản backup cũ" (retention đúng); thiếu config → skip êm không crash; BullMQ connect Redis OK; build sạch, 137 test không regression
- **File:** `src/backup/{backup.service.ts,backup.processor.ts,backup.controller.ts,backup.module.ts}`
- **Ghi chú:** cần Supabase project (URL + service key + bucket) — hướng dẫn lấy key ở `.env.example`. Dùng BullMQ (theo ROADMAP) — retry/persistence sẵn khi sau này thêm job. Fix: supabase-js ném "native WebSocket not found" trên Node 20 → chuyển sang Storage REST qua fetch (gọn hơn, đúng ladder).

## BE-G4api — Chatbot hỏi-đáp kho (context injection) ✅ ⚪
- [x] ai-service POST /assistant: system prompt ràng CHỈ trả lời từ snapshot JSON, ngoài phạm vi → "không biết"/"chỉ hỗ trợ hỏi-đáp kho"; schema AssistantRequest/Answer + _redact_identity
- [x] Backend POST /assistant/warehouses/:id/ask: chụp snapshot (tồn theo SKU trừ mượn + readiness + sự cố mở) → AiClientService.assistantAsk → trả lời; AI lỗi → 400 rõ ràng
- [x] Frontend: view "Trợ lý" (AssistantView) — chat bong bóng, 4 câu gợi ý, trạng thái đang tra cứu
- [x] Đường trả lời nhanh từ snapshot cho tồn kho/hạn dùng/sự cố/readiness/thời tiết; câu hỏi mở mới gọi Ollama Qwen local
- **Verify:** ✅ 10/10 ca tích hợp đạt; chat dữ liệu 8–990ms, câu mở ~3,64s, Action Plan ~22s; 6 test fast-answer pass; backend build sạch. Báo cáo: `docs/qa/ollama-qwen-evaluation.md`
- **File:** `apps/ai-service/{main.py,schemas.py}`, `src/assistant/{assistant.service.ts,assistant.controller.ts,assistant.module.ts}`, `src/ai/ai-client.service.ts`, `apps/frontend/src/{lib/assistant-api.ts,components/dashboard/assistant-view.tsx,dashboard-shell.tsx,app/page.tsx}`
- **Ghi chú:** quyền READINESS_VIEW tái dùng; snapshot backend chụp (LLM không tự tra DB → chống bịa số). FE chat làm luôn theo yêu cầu.

## BE-L — Workflow liên role + Notification ✅ 🔴 (CORE)
- [x] MissionStatus mở rộng: DRAFT→PENDING_RESCUE→RESCUE_CONFIRMED→PENDING_WAREHOUSE→READY→COMPLETED (giữ REJECTED)
- [x] Model Notification + NotificationService (create/list/markRead/markAllRead) + NotificationGateway (Socket.IO, room `role:<role>`)
- [x] Transitions + notify: ADMIN generate→notify RESCUE; RESCUE confirm→notify WAREHOUSE; WAREHOUSE prepare→READY→notify ADMIN+RESCUE
- [x] Phân quyền lại (shared-types): +mission:confirm(RESCUE), +mission:fulfill(WAREHOUSE), mission:create→ADMIN
- **Verify:** ✅ `mission.workflow.spec.ts` — chuỗi hợp lệ ADMIN→RESCUE→WAREHOUSE→hoàn thành pass, nhảy cóc/sai thứ tự bị chặn, assertTransition ném lỗi rõ ràng, trạng thái cuối COMPLETED không đi tiếp

## BE-M — Normal Mode: AI quản trị kho ngày thường ✅ 🔴 (CORE, ⭐ "AI khi không thiên tai")
> Đã có 3/10: #3 anomaly thống kê thật (BE-E2, z-score — không chỉ ngưỡng), #7 env (readiness), #8 readiness score — KHÔNG code lại.
- [x] insights/forecast.ts (thuần+test): tốc độ xuất TB/ngày (30 ngày) → dự báo ngày cạn kho (#1) + lowStock khi <7 ngày (#2)
- [x] insights/expiry-alert.ts (thuần+test): batch sắp hết hạn trong 30 ngày → cảnh báo, sắp gần nhất trước (#4)
- [x] insights/rebalance.ts (thuần+test): chênh tồn cùng SKU giữa kho cùng communeId (lệch ≥2x trung bình) → đề xuất chuyển kho thừa→thiếu (#5)
- [x] insights/trends.ts (thuần+test): % tăng/giảm xuất kỳ này/kỳ trước theo SKU (#6) + dùng cho báo cáo tháng (#10)
- [x] insights/weather.ts: Open-Meteo (free, no key) theo lat/lng → cảnh báo mưa 72h ≥100mm (#9), null khi lỗi mạng/chưa ghim toạ độ (không chặn insights tổng hợp)
- [x] insights.controller: GET /insights/warehouses/:id (forecast+expiry+rebalance+weather) + GET .../monthly-report (trends + LLM diễn giải, fallback template khi ai-service lỗi); quyền READINESS_VIEW tái dùng
- [x] Tồn khả dụng TRỪ ON_LOAN (forecast + rebalance) — nhất quán mission/readiness, không lạc quan sai
- [x] Forecast bắt SKU cạn hẳn: có lịch sử xuất nhưng tồn 0 (hết batch) → vẫn báo daysLeft=0/lowStock (thứ cần báo gấp nhất)
- [x] Rebalance phân bổ phần dư theo nhu cầu từng kho thiếu (thiếu nhiều nhận trước), không dồn 1 kho vượt nhu cầu
- [x] Frontend: view "Ngày thường" (InsightsView) — dự báo/hết hạn/điều chuyển/thời tiết + nút sinh báo cáo tháng; đủ trạng thái loading/empty/error, dùng token màu + lucide theo convention dashboard
- **Verify:** ✅ 16 test thuần (forecast/expiry-alert/rebalance/trends, gồm case SKU cạn hẳn + rebalance đa kho) pass; BE build sạch, 16 suite / 130 test không regression; FE build sạch (Next.js)
- **File:** `src/insights/{forecast.ts,expiry-alert.ts,rebalance.ts,trends.ts,weather.ts,insights.service.ts,insights.controller.ts,insights.module.ts,__tests__/}`, `apps/frontend/src/{lib/insights-api.ts,components/dashboard/insights-view.tsx,components/dashboard/dashboard-shell.tsx,app/page.tsx}`
- **Ghi chú:** monthly-report gọi `AiClientService.explain()` có sẵn (không sửa ai-service), try/catch → template fallback đếm mặt hàng tăng/giảm/mới khi LLM lỗi/mất mạng — giống pattern Action Plan.

## BE-N — Demo mở rộng + đồng bộ docs ✅ 🟠
- [x] demo.mjs: thêm Bước 7 (Normal Mode: dự báo cạn kho/hết hạn/điều chuyển/thời tiết/báo cáo tháng) + Bước 8 (chatbot 3 câu: 2 in-scope + 1 chặn ngoài phạm vi)
- [x] Cập nhật PRD (2 chế độ + Normal Mode + chatbot + backup), docs/qa (phase-m, phase-g-bp5)
- **Verify:** ✅ demo chạy thật đủ 8 bước với seed mới: Bước 7 in "Gạo cứu trợ ĐÃ CẠN", trends "Bộ pin +200%", điều chuyển cụm xã; Bước 8 chatbot trả đúng số + chặn "Thủ đô Pháp"; 137 test pass
- **File:** `apps/backend/demo/demo.mjs`, `docs/PRD.md`
- **Ghi chú:** Bước 3 (khoảnh khắc vàng) + 3b (điều tra sự cố) đôi khi cần chạy scenario/tuning timing — không ảnh hưởng 2 chế độ mới. Demo cần BE+ai-service+seed.

## BE-I — Server-time + config env ✅ 🔴
- [x] Server đặt mọi timestamp (client không gửi) — #31: soát toàn bộ DTO KHÔNG khai field thời gian; `ValidationPipe({ whitelist: true })` strip field lạ → client gửi createdAt/timestamp bị bỏ; mọi mốc do Prisma `@default(now())` / `new Date()` server đặt (occurredAt lấy từ SensorEvent.createdAt, không từ body)
- [x] Env validate lúc khởi động (env.validation.ts THUẦN, cắm ConfigModule.forRoot({ validate })): thiếu DATABASE_URL/JWT_ACCESS_SECRET/JWT_REFRESH_SECRET → ném lỗi rõ, app KHÔNG start; +chặn secret <16 ký tự, +chặn 2 JWT secret trùng nhau; gom nhiều lỗi 1 lần
- **Verify:** ✅ 7 test env.validation (thiếu/rỗng/ngắn/trùng/gom lỗi); chạy thật `JWT_ACCESS_SECRET=""` → validateEnv ném "Cấu hình môi trường không hợp lệ" chặn boot; biến có default (AI/GEO/REDIS) không bắt buộc → không chặn nhầm dev; build sạch, 17 suite/137 test không regression
- **File:** `src/config/{env.validation.ts,__tests__/env.validation.spec.ts}`, `src/app.module.ts`, `src/main.ts`
- **Ghi chú:** KHÔNG bật `forbidNonWhitelisted` (sẽ 400 khi FE lỡ gửi field dư, vỡ luồng) — `whitelist` strip im lặng đã đủ cho #31 "client gửi bị bỏ qua". Không thêm dependency (joi/zod) — hàm thuần đủ.

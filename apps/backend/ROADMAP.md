# ROADMAP — Backend (`@safestock/backend`)

> NestJS + Prisma + PostgreSQL + Redis. Nguồn nghiệp vụ trung tâm: auth, inventory, readiness, simulation, mission (proxy), incident.
>
> **QUY TẮC:** mỗi phase khi code BẮT BUỘC tick từng dòng checklist. Xong hết checklist + verify pass → đổi trạng thái phase sang ✅. Chi tiết yêu cầu: [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md).
>
> **SAU KHI phase ✅:** cập nhật/bổ sung câu hỏi xoáy + trả lời vào [../../docs/qa/](../../docs/qa/) (đạn Q&A cho giám khảo).
>
> Trạng thái: ⬜ chưa · 🟡 đang làm · ✅ xong+verify. Ưu tiên: 🔴 CORE · 🟠 nên-có · ⚪ polish.

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

## BE-Bp0 — Xuất lô 1 chạm + atomic ⬜ 🔴
- [ ] POST /inventory/bulk-export (nhiều batch 1 transaction + audit từng dòng)
- [ ] Atomic conditional update (quantity >= x) chống race — áp cả export thường
- [ ] Quyền inventory:bulk_export + hậu kiểm (không duyệt trước)
- **Verify:** bulk-export kệ giảm đúng; 2 export song song không âm kho; không quyền 403

## BE-Bp2 — Sửa tay + reconcile ⬜ 🔴
- [ ] POST /inventory/adjust (lý do bắt buộc + audit 5W, quyền inventory:adjust)
- [ ] POST /inventory/reconcile (kiểm kê, chỉ đếm IN_STOCK trừ ON_LOAN — #22)
- [ ] Độ lệch nguồn tự động vs kiểm kê → feed dataReliability
- **Verify:** adjust có audit; reconcile lệch → ghi đè; không mất số ON_LOAN

## BE-Bp3 — Seed 2 kho + dữ liệu bẩn ⬜ 🔴
- [ ] NeighborWarehouse seed lệch loại (xã B nhiều áo phao ít nước)
- [ ] Seed batch bẩn (không hạn, MISPLACED, DAMAGED, kệ blocked, chưa kiểm kê)
- **Verify:** Readiness phản ánh dữ liệu bẩn; Mission gợi ý kho lân cận

## BE-Bp4 — Mượn-trả LoanRecord ⬜ 🔴
- [ ] POST /loans (mượn, chỉ consumable=false → ON_LOAN)
- [ ] POST /loans/:id/return (trả từng phần ok/hỏng/mất)
- [ ] ok→USED+IN_STOCK, damaged→DAMAGED, lost→trừ tổng kho
- [ ] Khả dụng-ngay = quantity − Σ đang mượn
- [ ] Quyền loan:manage
- **Verify:** mượn 20 áo phao ON_LOAN tổng không đổi; trả 15+3+2 → tổng −3, phiếu CLOSED

## BE-D-proxy — Mission backend (proxy AI + greedy + duyệt) ⬜ 🔴
- [ ] POST /missions/parse → gọi ai-service
- [ ] Bảng định mức configurable + dẫn nguồn Sphere
- [ ] Phân bổ GREEDY + FEFO, ưu tiên kho gần (distanceKm)
- [ ] Đáp ứng % = MIN qua các loại
- [ ] Prisma: Mission, MissionRequirement, MissionAllocation
- [ ] generate-plan/approve/start/complete; mission done ≠ loan done (#26)
- [ ] Gợi ý mượn liên xã (đọc NeighborWarehouse)
- **Verify:** phương án <10s; không vượt tồn; complete còn loan → nhắc

## BE-Bp1 — Loadcell/RFID tự sinh giao dịch ⬜ 🟠
- [ ] Handler WEIGHT_CHANGED → suy số lượng (unitWeightKg) → tạo transaction source LOADCELL
- [ ] Handler RFID_DETECTED → map tag→item → transaction source RFID
- **Verify:** scenario suspected_loss → tự sinh transaction ~ đúng SL

## BE-E — Incident Intelligence ⬜ 🟠
- [ ] Prisma: Incident, IncidentEvidence, IncidentAction
- [ ] Rule engine hợp nhất event ngưỡng cụ thể (phân biệt nhiễu)
- [ ] Chấm điểm nghiêm trọng + LLM giải thích (proxy ai-service)
- [ ] Timeline; acknowledge/assign/resolve; in-app alert WS
- **Verify:** scenario suspected-loss → incident có timeline + evidence + điểm

## BE-Bp5 — Backup Supabase ⬜ 🟠
- [ ] BullMQ cron 17:00: dump → Supabase, giữ 3 bản, skip nếu mất net
- **Verify:** chạy job → dump trên Supabase; bản thứ 4 xóa cũ nhất

## BE-G4api — Chatbot hỏi-đáp kho (context injection) ⬜ ⚪
- [ ] POST /assistant/ask: snapshot JSON kho → LLM → trả lời, ràng chỉ từ JSON
- **Verify:** hỏi số liệu đúng; ngoài phạm vi → "không biết"

## BE-I — Server-time + config env ⬜ 🔴
- [ ] Server đặt mọi timestamp (client không gửi) — #31
- [ ] Env schema validate lúc khởi động (thiếu biến bắt buộc → dừng)
- **Verify:** client gửi timestamp bị bỏ qua; thiếu JWT_SECRET → app không start

# Plan: Kho thôn + Trưởng thôn + Báo cáo tháng + Điều phối theo bán kính

> Mở rộng hệ Ứng phó nhanh theo mô hình 2 cấp (tỉnh + xã) thực tế 2026. Mỗi xã = 1 instance độc lập (AI local + DB). Kho tổng xã (nhiều vật tư) + kho thôn (ít). Trưởng thôn quản kho thôn qua app + báo cáo Excel cuối tháng. Điều phối sự cố né kho trong vùng cô lập, ưu tiên kho gần nhất, hết thì mượn xã giáp.

## Context — vì sao

Hiện hệ đã có xương sống: `WarehouseKind.CENTRAL/HAMLET`, `communeId`, điều phối `allocateGreedy` + `byNearestThenFefo` (gần nhất trước), `Mission.incidentLat/lng`, `GeoService` (Haversine sẵn), `reconcile` kiểm kê. Thiếu 4 mảng để khớp mô hình bạn muốn: (1) role trưởng thôn scope 1 kho, (2) bán kính sự cố loại kho cô lập, (3) Excel báo cáo tháng + duyệt, (4) OSRM tuyến đường thật + liên xã có toạ độ.

## Mô hình đã chốt (tổng hợp qua thảo luận)

- **Bản đồ**: ranh giới **cấp xã** từ OSM; **thôn = 1 điểm tâm** (tool tay, không ranh giới thôn — VN không có data công khai). **Bán kính là của SỰ CỐ** (người báo nhập), không phải của thôn.
- **Routing**: **OSRM** (tuyến đường thật, miễn phí, không key) thay Google Maps (Google đòi prepayment 800k — bỏ). Fallback Haversine khi OSRM lỗi. Map UI: Leaflet + OSM tiles (FE đã có).
- **Điều phối** (chốt C4):
  1. Điểm nạn (tâm) + bán kính r (người báo).
  2. **LOẠI mọi kho trong bán kính r** (cô lập, không lấy được) — trước tiên.
  3. Kho còn lại: sort **gần nhất trước** (không phân biệt tổng/thôn) → lấy tuần tự → thiếu → kế tiếp.
  4. Hết cả xã → mượn **xã giáp** (con người gọi điện; xã cho mượn có AI local riêng, tự tính thôn gần điểm nạn).
- **Role/dữ liệu thôn**: trưởng thôn = user app mobile gắn 1 kho thôn. Luồng 1: xuất/nhập realtime (app). Luồng 2: cuối tháng upload Excel kiểm kê → admin xã DUYỆT → đối soát.
- **Excel mẫu**: `SKU | Tên vật tư | Số lượng | Đơn vị | Hạn dùng | Tình trạng | Ghi chú`.

---

## PHASE 1 — Nền thôn (KHÔNG cần toạ độ/map/OSRM) ← làm trước

### 1a. Role trưởng thôn + scope kho (ĐẲNG CẤP — đủ 4 điểm)
- **CHỐT: `WAREHOUSE + warehouseId`** — không thêm role mới.
- **Schema**: thêm `User.warehouseId String?` (null = phụ trách toàn xã/kho tổng; có giá trị = trưởng thôn scope kho đó). Tái dùng `UserRole.WAREHOUSE` + scope bằng warehouseId (không đụng `ROLE_PERMISSIONS`).
- **JWT**: thêm `warehouseId` vào payload token để service scope không cần query lại.
- **(1) Scope hiển thị**: user có warehouseId → list kho/batch chỉ kho đó.
- **(2) CHẶN Ở SERVICE LAYER (chống IDOR)** — điểm mấu chốt: mọi thao tác kho (export/import/adjust/reconcile) verify `batch.shelf.zone.warehouseId === user.warehouseId` (nếu user bị scope). Không chỉ ẩn UI — chặn thật ở backend. Helper `assertBatchInScope(user, batchId)`.
- **(3) Admin CRUD user**: endpoint `POST /admin/users` (ADMIN tạo trưởng thôn + gán warehouseId), `GET /admin/users`, `PATCH`, xoá. Dùng `Permission.ADMIN_USERS` đã có.
- **(4) Test negative cross-scope**: test "trưởng thôn A gọi export batch kho B → 403/ForbiddenException".
- **Logic**: khi user có `warehouseId`, các endpoint inventory/readiness của họ **chỉ thấy kho đó** (filter theo warehouseId trong service, đọc từ JWT payload).
- **Seed**: thêm vài user trưởng thôn gắn kho thôn Long Hà, Long Thạch...

### 1b. App thôn xuất/nhập realtime (Luồng 1)
- **Tái dùng 100%** `inventory.service` (export/import/reconcile đã có). Chỉ khác: trưởng thôn thao tác trên kho thôn của mình.
- Không cần code mới ở BE (chỉ scope). FE: view kho theo warehouseId của user.

### 1c. Excel báo cáo tháng + admin duyệt (Luồng 2)
- **CHỐT: dùng `exceljs`** (an toàn, không CVE như SheetJS) + `MonthlyStockReport` model mới.
- **Thư viện**: thêm `exceljs` để parse `.xlsx`. Tôi sẽ tạo sẵn **file template mẫu** (`docs/templates/bao-cao-thon-mau.xlsx` hoặc sinh động) đúng 7 cột để trưởng thôn tải về điền.
- **Luồng**:
  1. Trưởng thôn upload file `.xlsx` (đúng cột mẫu) → BE parse thành danh sách `{sku, quantity, ...}`.
  2. BE tạo bản ghi **báo cáo chờ duyệt** (model mới `MonthlyReport` hoặc tái dùng — xem dưới), trạng thái PENDING.
  3. Admin xã xem báo cáo → **duyệt** → BE áp bằng cách gọi **`reconcile`** (đã có!) cho từng SKU (đối soát tồn = số báo cáo).
  4. Lệch được ghi audit như reconcile hiện tại.
- **Model mới** `MonthlyStockReport`: `id, warehouseId, submittedByUserId, period (YYYY-MM), status (PENDING/APPROVED/REJECTED), rows (JSON), createdAt, approvedByUserId, approvedAt`.
- **Endpoint**:
  - `POST /reports/warehouses/:id/upload` (trưởng thôn, multipart file) → parse → lưu PENDING.
  - `GET /reports?status=PENDING` (admin) → list chờ duyệt.
  - `POST /reports/:id/approve` (admin) → áp reconcile từng dòng.
  - `POST /reports/:id/reject`.
- **Verify Phase 1**: trưởng thôn login chỉ thấy kho mình; upload Excel mẫu → admin thấy PENDING → duyệt → tồn kho thôn đổi đúng + audit ghi.

### File Phase 1
- `prisma/schema.prisma`: `User.warehouseId`, model `MonthlyStockReport`.
- `src/report/{report.service.ts,report.controller.ts,report.module.ts,excel.parser.ts}` (mới).
- `src/inventory/*`: thêm scope warehouseId (nhẹ).
- `packages/shared-types`: +Permission `REPORT_SUBMIT`, `REPORT_APPROVE` (hoặc tái dùng RECONCILE/AUDIT_VIEW).
- FE: view upload Excel (trưởng thôn) + duyệt báo cáo (admin).
- Seed: user trưởng thôn.

---

## PHASE 2 — Bán kính sự cố + điều phối nội xã (cần toạ độ kho/thôn)

### 2a. Bán kính cô lập loại kho
- **Schema**: `Mission.impactRadiusKm Float?` (người báo nhập).
- **Logic**: trong `MissionService.loadClusterBatches` — TRƯỚC khi sort, **lọc bỏ kho** có `haversine(kho, điểm_nạn) ≤ impactRadiusKm`. Tái dùng `GeoService`/`haversine` có sẵn.
- Bước greedy gần-nhất (`byNearestThenFefo`) **giữ nguyên** — chạy trên phần kho còn lại.
- **Edge cần test**: bán kính trùm cả kho tổng → loại luôn → cả xã cô lập → nhảy liên xã (Phase 3).

### 2b. OSRM tuyến đường thật
- **Thêm nhánh OSRM** vào `GeoService.distanceAndEta`: gọi `https://router.project-osrm.org/table/...` (hoặc self-host). Ưu tiên OSRM → lỗi/rate-limit → Haversine fallback.
- Không key, không tiền. Public server đủ cho demo; self-host (Docker) cho offline thật.
- Config: `OSRM_URL` env (mặc định public server).

### File Phase 2
- `prisma/schema.prisma`: `Mission.impactRadiusKm`.
- `src/mission/mission.service.ts`: lọc bán kính.
- `src/geo/geo.service.ts`: nhánh OSRM.
- FE mission-view: input bán kính ảnh hưởng + vẽ vòng tròn trên map.
- **Verify**: sự cố bán kính 2km quanh thôn X → kho trong 2km bị loại → điều phối kho ngoài vùng gần nhất; OSRM trả khoảng cách tuyến thật.

---

## PHASE 3 — Liên xã + map ranh giới (cần toạ độ đầy đủ + OSM GeoJSON)

### 3a. Model liên xã có toạ độ (thay neighborWarehouse phẳng)
- `neighborWarehouse` hiện chỉ `name/distanceKm/summary` — KHÔNG đủ toạ độ để tính thôn gần. Cần:
  - Graph **giáp ranh xã↔xã** (data đã tra: Đồng Xuân giáp Xuân Lãnh/Xuân Thọ/Xuân Đài/Tuy An Bắc/Xuân Phước/Phú Mỡ).
  - Toạ độ kho/thôn các xã giáp (tool tay).
- **Logic 2 tầng**:
  1. Xã mình hết → tính tuyến (OSRM) từ điểm nạn → kho tổng các xã giáp → chọn xã gần nhất → gợi ý gọi điện.
  2. Admin xã cho mượn nhập toạ độ điểm nạn (nghe qua ĐT) → AI xã họ tính thôn gần điểm nạn → điều phối nội bộ.

### 3b. Map UI
- Leaflet + **ranh giới xã OSM** (GeoJSON admin_level 8, tải từ OSM) + marker kho/thôn + vòng tròn bán kính sự cố.

### File Phase 3
- Model liên xã mới hoặc mở rộng `neighborWarehouse` (+lat/lng, +adjacency).
- `src/mission/`: điều phối liên xã.
- FE: Leaflet ranh giới xã + vòng tròn.
- **Verify**: cả xã hết → gợi ý xã giáp gần điểm nạn → xã đó tính thôn gần nhất.

---

## Quyết định ĐÃ CHỐT (2026-07-17)
1. ✅ Role trưởng thôn: **WAREHOUSE + `User.warehouseId`** (không thêm role).
2. ✅ Excel: **`exceljs`** parse `.xlsx`.
3. ✅ Báo cáo: **model `MonthlyStockReport` mới** (PENDING/APPROVED, rows JSON).
4. ✅ Điều phối: lọc bán kính TRƯỚC → greedy gần nhất (không phân biệt tổng/thôn).

## Còn chờ quyết ở phase sau
- **OSRM** (Phase 2): public server (demo) hay self-host Docker (offline) — quyết khi tới.
- **Toạ độ** (Phase 2-3): user tool. Phase 1 KHÔNG chờ.

## Cần user cung cấp
- **Phase 1**: file Excel mẫu thật (hoặc để tôi tạo template đúng 7 cột) để test parser.
- **Phase 2-3**: toạ độ tâm mỗi kho/thôn (Đồng Xuân + 6 xã giáp có kho); GeoJSON ranh giới xã (tải OSM).

## Thứ tự thực hiện
Phase 1 (ngay, độc lập map) → Phase 2 (khi có toạ độ kho) → Phase 3 (khi có toạ độ đầy đủ + GeoJSON). Mỗi phase verify chạy thật (HTTP + seed) trước khi qua phase sau.

---

## TRẠNG THÁI PHASE 1 — ✅ XONG (2026-07-17)

**Đã làm + verify runtime thật:**
- ✅ `User.warehouseId` + JWT payload + AuthUser scope.
- ✅ Admin CRUD user: `POST/GET/PATCH/DELETE /admin/users` (quyền ADMIN_USERS). Verify: admin tạo trưởng thôn gán warehouseId OK; RESCUE tạo user → 403.
- ✅ Chặn IDOR service layer: `assertBatchInScope` áp cho export/import/bulkExport/adjust/reconcile. Verify HTTP thật: trưởng thôn xuất batch kho tổng → **403**; xuất batch kho mình → **201**.
- ✅ Excel báo cáo: `exceljs` parser (thuần, test) + `MonthlyStockReport` model + `/reports/upload` (trưởng thôn) + `/reports/:id/approve` (admin → reconcile từng SKU) + reject.
- ✅ Seed: 2 user trưởng thôn (`truongthon1/2@safestock.vn` / `truongthon123`) gắn kho thôn.
- ✅ 18 test suite / 141 test pass (thêm 4 test scope chống IDOR).

**✅ Verify Excel end-to-end HTTP thật (2026-07-17):** trưởng thôn upload .xlsx → PENDING (201); admin duyệt → APPROVED + reconcile áp từng SKU → tồn kho thôn đổi đúng (WATER 80→120, LIFE 19→15 theo số báo cáo).

**✅ FE Phase 1 (2026-07-17):** `report-view.tsx` (trưởng thôn upload Excel + list; admin duyệt/từ chối), `admin-users-view.tsx` (ADMIN tạo user gán kho + xoá), nav role-aware (view "Người dùng" chỉ ADMIN thấy), `report-api.ts` + `admin-api.ts`, auth-store + login trả `warehouseId`. Build FE sạch.

**File Phase 1:** `prisma/schema.prisma` (User.warehouseId, MonthlyStockReport, ReportStatus), `src/admin/*`, `src/report/*` (+excel.parser.ts exceljs), `src/inventory/warehouse-scope.ts` + scope ở inventory service/controller, `packages/shared-types` (REPORT_SUBMIT/APPROVE), `prisma/seed.ts` (2 trưởng thôn), `apps/frontend/src/{lib/report-api.ts,lib/admin-api.ts,components/dashboard/report-view.tsx,components/dashboard/admin-users-view.tsx,components/dashboard/dashboard-shell.tsx,app/page.tsx,lib/auth-store.ts}`.

**➡️ PHASE 1 XONG HOÀN TOÀN (BE+FE+verify).** Kế tiếp: Phase 2 (bán kính + OSRM) khi user tool xong toạ độ kho.

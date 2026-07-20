# Plan: Hoàn thành 100% checklist Backend

## Context

Backend đã ✅ phần lớn ROADMAP.md (A0→L). Còn lại 1 số mục dở dang/chưa làm. User yêu cầu code hết các mục còn lại — nhưng bất kỳ việc nào đụng FE hoặc ai-service phải hỏi trước qua AskUserQuestion, chỉ code khi được accept.

Đã hỏi 4 câu, user chốt phạm vi:
1. **BE-M Normal Mode** — làm đầy đủ 5 sub-module.
2. **BE-C3** — làm cả phần backend (notify + block) LẪN sửa FE `mission-view.tsx` thêm `onError`.
3. **BE-Bp1** — chỉ phần LOADCELL, RFID để sau (thiếu bảng mapping tag→Item).
4. 4 mục nhỏ (multiSelect) — chỉ chọn **C3 notify + C1 recalc-on-write**. KHÔNG làm A2core double-confirm, G4api chatbot, Bp5 backup Supabase.

Không đụng ai-service ở bất kỳ mục nào — `AiClientService.explain()` đã đủ generic để tái dùng cho BE-M mà không cần sửa gì ở `apps/ai-service`.

## Phạm vi — 4 hạng mục, thực hiện theo thứ tự phụ thuộc

### 1. BE-C1 — Recalc-on-write (nền tảng cho C3 dùng lại)

Sau MỌI giao dịch đổi `quantity` (import/export/bulkExport qua `InventoryService`; adjust/reconcile qua `InventoryAdjustmentService`) → gọi `ReadinessService.recalculateWarehouse(warehouseId)`. Transfer KHÔNG đổi tổng số lượng → bỏ qua.

- `InventoryService`/`InventoryAdjustmentService` hiện không trả `warehouseId`. Query từ `batchId`: `shelf.zone.warehouseId` (đã có include pattern mẫu ở `listBatches()`).
- Cách nối: KHÔNG gọi trong `$transaction` (recalc không cần atomic với ghi DB, và query nặng không nên nằm trong transaction). Sau khi `$transaction` trả về kết quả, lấy `warehouseId` rồi gọi `this.readiness.recalculateWarehouse(warehouseId).catch(...)` — fire-and-forget có log, giống pattern `scheduleRecalc` ở `simulation.service.ts` (log.warn khi lỗi, không throw chặn response).
- Cần lấy `warehouseId` gọn: thêm helper `private async warehouseIdOfBatch(batchId: string): Promise<string>` dùng `itemBatch.findUniqueOrThrow({ where, select: { shelf: { select: { zone: { select: { warehouseId: true } } } } } })`.
- Import `ReadinessModule`, inject `ReadinessService` vào `InventoryModule`/2 service.
- **File đụng**: `inventory.service.ts` (import, export, bulkExport), `inventory-adjustment.service.ts` (adjust, reconcile), `inventory.module.ts` (imports ReadinessModule).

### 2. BE-C3 — Hook notify + chặn mission CRITICAL (backend + frontend)

**a) Notify khi readiness rớt DEGRADED/CRITICAL**

Chèn ngay trong `ReadinessService.recalculateWarehouse()`, sau khi có `zone` kết quả cuối:
```ts
if (shouldNotifyManager(zone)) {
  await this.notifications.create({
    recipientRole: UserRole.WAREHOUSE,
    kind: NotificationKind.READINESS_DEGRADED, // enum mới
    title: `Readiness kho rớt ${zone}`,
    body: `Điểm hiện tại ${warehouseScore.score}`,
    warehouseId,
  });
}
```
- Thêm `NotificationKind.READINESS_DEGRADED` vào schema (enum `NotificationKind`, dòng ~526).
- Inject `NotificationService` vào `ReadinessService` (`NotificationModule` đã `@Global()` — không cần thêm `imports` ở `ReadinessModule`).
- **Chống spam**: chỉ notify khi zone THAY ĐỔI so với lần lưu trước (so `ReadinessScore` cũ đọc trước upsert, hoặc so zone cũ tính từ `score` cũ đã lưu) — không notify lại mỗi lần recalc nếu vẫn đang CRITICAL liên tục (khác dedupe-theo-key của incident vì đây chỉ 1 entity/warehouse, so trực tiếp state cũ/mới đơn giản hơn). Đọc `ReadinessScore` cũ (trước khi upsert) trong `recalculateWarehouse`, tính `oldZone` từ `oldScore?.score`, chỉ notify khi `oldZone !== newZone && shouldNotifyManager(newZone)`.

**b) Chặn tạo mission mới khi readiness CRITICAL**

`MissionService.generatePlan()` — sau khi có `warehouse`, trước khi tính toán:
```ts
const readinessScore = await this.readiness.getWarehouseScore(warehouseId);
if (readinessScore && shouldBlockNewMission(readinessScore.zone)) {
  throw new BadRequestException(
    `Kho đang ở mức CRITICAL (điểm ${readinessScore.score}) — không thể lập phương án mới. Cần xử lý sự cố trước.`,
  );
}
```
- Dùng `getWarehouseScore` (đọc đã lưu, không tính lại — tránh tính 2 lần vì C1 đã recalc-on-write liên tục giữ điểm mới).
- Nếu chưa từng recalc (`null`) → không chặn (tránh false-positive lúc khởi tạo).
- Inject `ReadinessService` vào `MissionService`, thêm `ReadinessModule` vào `imports` của `MissionModule`.

**c) Frontend `mission-view.tsx`** — thêm `onError` cho `genPlan`:
```tsx
const [planError, setPlanError] = useState<string | null>(null);
const genPlan = useMutation({
  mutationFn: () => generatePlan({...}),
  onSuccess: (m: Mission) => { setMissionId(m.id); setPlanError(null); },
  onError: (err) => setPlanError(err instanceof ApiError ? err.message : "Lỗi lập phương án"),
});
```
Hiển thị `planError` ngay dưới nút "Lập phương án phân bổ" (cùng vị trí dòng "Ghim điểm nạn..." hiện có, style `text-[var(--color-critical)]`), import `ApiError` từ `@/lib/api`.

- **File đụng**: `schema.prisma` (enum NotificationKind), `readiness.service.ts` (inject NotificationService, hook notify), `mission.service.ts` (inject ReadinessService, block check), `mission.module.ts` (imports ReadinessModule), `mission-view.tsx` (onError + hiển thị lỗi).

### 3. BE-Bp1 — Loadcell tự sinh giao dịch

Trong `SimulationService.emit()`, TRƯỚC dòng ghi đè `currentValue` (dòng 76-79 hiện tại), khi `device.type === LOADCELL` và có `prev != null`:

```ts
if (device.type === VirtualDeviceType.LOADCELL && prev != null && device.shelfId) {
  await this.autoGenerateLoadcellTxn(device, prev, input.value);
}
```

`autoGenerateLoadcellTxn(device, prev, newValue)` private:
- `deltaKg = prev - newValue` (dương = giảm cân = xuất/mất; âm = tăng = nhập). Bỏ qua nếu `Math.abs(deltaKg) < SIGNIFICANT_DELTA.LOADCELL` (0.1kg, ngưỡng đã có sẵn).
- Tìm batch: `itemBatch.findFirst({ where: { shelfId: device.shelfId }, include: { item: true }, orderBy: { createdAt: "asc" } })` — chỉ hỗ trợ shelf có batch (nếu shelf có nhiều batch, lấy batch đầu tiên tạo — đơn giản hoá hợp lý cho demo, ghi rõ giới hạn bằng comment `ponytail:`).
- Bỏ qua nếu không tìm thấy batch, hoặc `item.unitWeightKg` null/0 (không suy được số lượng).
- `deltaQty = Math.round(Math.abs(deltaKg) / item.unitWeightKg)`, bỏ qua nếu `deltaQty === 0` (làm tròn về 0).
- Cần `userId` cho `InventoryTransaction.userId` (NOT NULL, có FK `User`) — dùng user `ADMIN` đầu tiên của tổ chức làm actor hệ thống (không thêm user "SYSTEM" mới vào schema, giữ diff nhỏ nhất): `prisma.user.findFirst({ where: { role: "ADMIN" } })`, cache trong service (query 1 lần, giữ instance field).
- Gọi `this.inventory.export(systemUserId, batch.id, deltaQty, "Tự động từ loadcell")` nếu giảm cân (`deltaKg > 0`), hoặc `this.inventory.import(...)` nếu tăng. Dùng `TransactionSource.LOADCELL` — nhưng `InventoryService.export/import` hiện HARDCODE `source: TransactionSource.SCAN` qua `applyTxn` default param. Cần thêm tham số `source` optional vào `import()`/`export()` (mặc định giữ `SCAN` để không đổi hành vi endpoint cũ), simulation gọi truyền `TransactionSource.LOADCELL`.
- Wrap try/catch quanh toàn bộ, `log.warn` khi lỗi (không throw chặn luồng `emit()` chính — cảm biến vẫn phải cập nhật currentValue dù sinh giao dịch lỗi).
- Do C1 đã nối recalc-on-write vào `InventoryService.export/import`, gọi hàm này TỰ ĐỘNG trigger recalc readiness — không cần thêm `LOADCELL` vào `ENV_DEVICE_TYPES`.

**File đụng**: `simulation.service.ts` (handler mới + gọi trước ghi đè currentValue), `inventory.service.ts` (thêm param `source` optional cho `import`/`export`), `simulation.module.ts` (imports InventoryModule).

### 4. BE-M — Normal Mode (module `insights` mới)

Module mới `apps/backend/src/insights/`, đầy đủ 5 sub-module + controller, theo đúng convention `readiness.module.ts` (chỉ service + controller, không thêm gì lạ).

**`insights/forecast.ts`** (thuần + test) — tốc độ xuất trung bình/ngày (từ `InventoryTransaction` type=EXPORT, N ngày gần nhất) → dự báo ngày cạn kho (`quantity / avgPerDay`) + đề xuất nhập khi < ngưỡng ngày (vd còn <7 ngày).

**`insights/expiry-alert.ts`** (thuần + test) — batch có `expiryDate` trong X ngày tới (vd 30 ngày) → cảnh báo + đề xuất điều chuyển sang kho khác cùng `communeId` đang thiếu SKU đó (dùng lại logic rebalance bên dưới cho phần "đề xuất điều chuyển").

**`insights/rebalance.ts`** (thuần + test) — group batch theo `item.sku`, so tồn giữa các kho cùng `communeId` (lệch lớn → đề xuất chuyển từ kho thừa sang kho thiếu). Input: danh sách `{warehouseId, sku, quantity}` đã gom sẵn (query ở service, tính thuần ở đây).

**`insights/trends.ts`** (thuần + test) — % tăng/giảm xuất kỳ này so kỳ trước (vd 30 ngày vs 30 ngày trước đó) theo SKU hoặc tổng; dùng cho báo cáo tháng.

**`insights/weather.ts`** — gọi Open-Meteo (free, không cần key) qua native `fetch`, theo đúng pattern `GeoService` (try/catch + log.warn + fallback rỗng khi lỗi mạng, KHÔNG throw chặn API). Endpoint: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=precipitation_sum&forecast_days=3`. Cảnh báo khi tổng mưa 72h vượt ngưỡng (vd 100mm). Cần `Warehouse.lat/lng` (đã có sẵn, nullable) — nếu null thì bỏ qua weather (không lỗi).

**`insights.service.ts`** — gom gọi các hàm thuần trên, trả JSON tổng hợp `getWarehouseInsights(warehouseId)`. `getMonthlyReport(warehouseId)` — gọi `AiClientService.explain()` với context là số liệu đã tính (forecast/trends/expiry) để LLM diễn giải thành đoạn văn báo cáo — TÁI DÙNG explain có sẵn, không sửa ai-service.

**`insights.controller.ts`**:
```
GET /insights/warehouses/:id           → getWarehouseInsights (forecast+expiry+rebalance+weather)
GET /insights/warehouses/:id/monthly-report → getMonthlyReport (trends + LLM diễn giải)
```
Guard: `@RequirePermission(Permission.READINESS_VIEW)` — tái dùng permission có sẵn (đọc-only, cùng nhóm "xem tình trạng kho", không tạo permission mới để giảm diff `shared-types`).

**File mới**: `insights/{forecast.ts, expiry-alert.ts, rebalance.ts, trends.ts, weather.ts, insights.service.ts, insights.controller.ts, insights.module.ts, __tests__/*.spec.ts}`.
**File đụng**: `app.module.ts` (thêm `InsightsModule`).

## Cập nhật ROADMAP.md

Tick từng dòng checklist BE-C1, BE-C3, BE-Bp1 (bỏ dòng RFID — vẫn để `⬜`, KHÔNG đổi phase sang ✅ vì còn RFID dở), BE-M (tick hết → ✅) khi code+test+verify xong mỗi phần. Theo đúng quy tắc đầu file ROADMAP.md.

## Verify

- `pnpm --filter @safestock/backend build` sạch sau mỗi phần.
- `pnpm --filter @safestock/backend test` — test mới (forecast/expiry-alert/rebalance/trends thuần) + test cũ không regression.
- Thủ công C1: export 1 batch → `GET /readiness/warehouses/:id` điểm đổi ngay (không cần gọi `/recalculate` tay).
- Thủ công C3: hạ readiness 1 kho xuống CRITICAL (chỉnh threshold hoặc dữ liệu bẩn) → thử `generate-plan` → 400 kèm message rõ; xem `GET /notifications` có `READINESS_DEGRADED` mới; FE hiển thị lỗi đỏ dưới nút thay vì im lặng.
- Thủ công Bp1: chạy scenario `suspected_loss` (loadcell 48→44kg) → `GET /inventory/warehouses/:id/batches` batch tương ứng giảm đúng `4kg / unitWeightKg` đơn vị, `InventoryTransaction.source = LOADCELL`.
- Thủ công BE-M: `GET /insights/warehouses/:id` ra số thật (không rỗng) với seed hiện có; `monthly-report` trả đoạn văn LLM không lỗi khi ai-service chạy, fallback hợp lý khi tắt ai-service (giống cách Action Plan fallback template).

## Sau khi xong mỗi phần (theo quy tắc dự án)
- Tự review kỹ (spam/duplicate, edge case, giả định cứng) trước khi báo hoàn thành — đặc biệt spam notify readiness khi zone dao động quanh ngưỡng, và trường hợp shelf nhiều batch ở Bp1.
- Bổ sung Q&A vào `docs/qa/` sau khi phase chuyển ✅.

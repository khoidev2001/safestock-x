# Kế hoạch: Bổ sung kịch bản IoT còn thiếu — hỏa hoạn (SMOKE) + mất điện (POWER)

> Trạng thái: chưa code. Ghi lại để 2 dev/AI đối chiếu tránh làm lại.

## Context

Sensor Simulator có 9 loại thiết bị ảo (`VirtualDeviceType`), nhưng 2 loại **SMOKE** và **POWER** mới chỉ khai báo trong schema — chưa seed, chưa gắn vào kịch bản nào, rule engine (`incident.rules.ts`) chưa đọc chúng. User hỏi cụ thể "hỏa hoạn: nhiệt độ tăng → AI có cảnh báo admin không" → xác nhận hiện tại KHÔNG có kịch bản này, KHÔNG có rule kết luận cháy, và incident phát hiện được (kể cả loại có sẵn) không tự động báo admin.

Mục tiêu: thêm 2 kịch bản (`fire`, `power_outage`) dùng đủ 9 loại thiết bị, thêm rule phát hiện tương ứng, và nối `IncidentService.scanWarehouse` đẩy `Notification` cho ADMIN mỗi khi phát hiện sự cố — hoàn thiện vòng lặp "sensor → rule → cảnh báo admin" mà PRD §3.5 mô tả nhưng chưa nối dây thật.

Giữ nguyên 6 kịch bản + 3 rule cũ, không đổi hành vi hiện có — chỉ thêm.

## Việc cần làm

### 1. Seed thiết bị SMOKE + POWER (`apps/backend/prisma/seed.ts`)
Sau đoạn seed DOOR/GATEWAY (dòng ~161-167), thêm:
```ts
await prisma.virtualDevice.create({
  data: { warehouseId: wid, zoneId: zoneB.id, type: "SMOKE", code: "smoke_B", unit: "ppm", currentValue: 0 },
});
await prisma.virtualDevice.create({
  data: { warehouseId: wid, type: "POWER", code: "power_main", unit: "bool", currentValue: 1 },
});
```

### 2. Kịch bản mới trong `packages/scenario-definitions/src/index.ts`
Thêm vào mảng `SCENARIOS` (đặt sau `misplaced`), đúng format `Scenario` hiện có:

- **`fire`** — Nghi cháy: khói tăng đột biến (0→45ppm) + nhiệt độ tăng nhanh (28→55°C) trong ~10s, không kèm hoạt động cửa/RFID (phân biệt với thao tác người).
- **`power_outage`** — Mất điện: `power_main` POWER_OFF rồi (tuỳ chọn) POWER_ON lại sau một khoảng, tương tự pattern `disconnect` nhưng cho nguồn điện.

Deterministic, đúng cấu trúc `ScenarioEvent{offsetMs, deviceCode, eventType, value}` sẵn có.

### 3. Rule engine mới (`apps/backend/src/incident/incident.rules.ts`)
Thêm 2 hàm, theo pattern `detectSuspectedLoss`/`detectBadStorage` (thuần, ngưỡng cụ thể, `EvidenceItem`):

- `detectFireRisk`: SMOKE vượt ngưỡng (vd >30ppm) VÀ TEMPERATURE tăng nhanh trong cùng cửa sổ → `kind: "FIRE_RISK"`, severity CRITICAL (an toàn tính mạng, ưu tiên tối đa).
- `detectPowerOutage`: POWER OFF không kèm GATEWAY offline đồng thời (phân biệt mất điện thật vs lỗi mạng) → `kind: "POWER_OUTAGE"`, severity MEDIUM/HIGH tuỳ thời lượng.

Cập nhật `IncidentKind`: `"SUSPECTED_LOSS" | "SENSOR_FAULT" | "BAD_STORAGE" | "FIRE_RISK" | "POWER_OUTAGE"`, gọi 2 hàm mới trong `detectIncidents()`.

Thêm ngưỡng vào `RULES`: `smokeHigh: 30`, `fireTempJumpC: 15`, giữ nguyên ngưỡng cũ.

### 4. Test rule engine (`apps/backend/src/incident/__tests__/incident.rules.spec.ts`)
Thêm 2 `describe` block mới (dùng helper `sig`/`at` sẵn có):
- fire risk: khói+nhiệt tăng → CRITICAL; chỉ khói không nhiệt (hoặc ngược lại) → không kết luận cháy (tránh báo giả từ hơi nước/máy hàn); dưới ngưỡng → không kết luận.
- power outage: POWER OFF đơn độc → phát hiện; POWER OFF kèm GATEWAY OFFLINE cùng lúc → không kết luận trùng với sự cố mất kết nối.

### 5. Nối cảnh báo tới ADMIN (`apps/backend/src/incident/incident.service.ts`)
Phần trả lời câu hỏi gốc "AI có cảnh báo admin không" — hiện chưa có, thêm:
- Inject `NotificationService` vào `IncidentService` (module đã `@Global()`, không cần sửa `incident.module.ts` import list, chỉ constructor).
- Trong `scanWarehouse()`, sau `persist()` mỗi incident mới, gọi `NotificationService.create({ recipientRole: UserRole.ADMIN, kind: NotificationKind.INCIDENT_DETECTED, title: incident.title, body: ..., warehouseId })`.
- Thêm `INCIDENT_DETECTED` vào cuối `enum NotificationKind` trong `schema.prisma` (không sửa dòng có sẵn — đúng quy ước ở `docs/PHAN-CONG-2-DEV.md`).
- Chạy `pnpm --filter @safestock/backend prisma:push` sau khi sửa schema (dự án dùng `db push`, không có `migrations/`).

### 6. Frontend label (không đổi UI/theme theo yêu cầu trước — chỉ thêm label tránh hiện "undefined")
`apps/frontend/src/components/dashboard/incident-view.tsx` — thêm vào `KIND_LABEL`:
```ts
FIRE_RISK: "Nghi cháy",
POWER_OUTAGE: "Mất điện",
```

### 7. Demo script (tuỳ chọn, hỏi trước khi thêm)
`apps/backend/demo/demo.mjs` bước 3b (dòng 127-146) đã có pattern "chạy scenario → scan → in kết quả" cho `suspected_loss` — có thể thêm dòng tương tự cho `fire` để chứng minh cảnh báo admin khi demo.

## File đụng tới
- `packages/scenario-definitions/src/index.ts` — 2 kịch bản mới
- `apps/backend/prisma/schema.prisma` — thêm `INCIDENT_DETECTED` vào `NotificationKind`
- `apps/backend/prisma/seed.ts` — seed SMOKE + POWER device
- `apps/backend/src/incident/incident.rules.ts` — 2 rule mới + cập nhật `IncidentKind`, `RULES`
- `apps/backend/src/incident/incident.service.ts` — gọi `NotificationService.create` sau khi phát hiện
- `apps/backend/src/incident/__tests__/incident.rules.spec.ts` — test 2 rule mới
- `apps/frontend/src/components/dashboard/incident-view.tsx` — label mới

## Verify
- `pnpm --filter @safestock/backend test incident.rules` — test mới pass, test cũ không đổi hành vi.
- `pnpm --filter @safestock/scenario-definitions build` — biên dịch kịch bản mới không lỗi type.
- `pnpm --filter @safestock/backend prisma:push` — áp schema mới vào DB dev.
- `pnpm --filter @safestock/backend seed` — seed lại có SMOKE/POWER device.
- Thủ công qua backend `:3100`: `POST /api/simulator/runs {scenarioKey:"fire", warehouseId}` → `play` → `POST /api/incidents/scan/:id` → kỳ vọng incident `kind:"FIRE_RISK"` severity CRITICAL; kiểm tra bảng `Notification` có bản ghi mới `recipientRole:"ADMIN"`.
- `pnpm --filter @safestock/backend build && pnpm --filter @safestock/frontend build` — không lỗi type toàn repo.

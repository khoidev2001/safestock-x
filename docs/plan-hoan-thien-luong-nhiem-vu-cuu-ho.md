# Kế hoạch hoàn thiện luồng nhiệm vụ cứu hộ (sát thực tế hơn)

> Ngày: 2026-07-23 · Nhánh: `feat/operational-readiness-seed-map`
> Bối cảnh: sau khi merge `origin/main` (commit `4688521` — luồng từ chối/tạm hoãn/huỷ + app mobile),
> review cho thấy luồng còn vài khoảng hở so với vận hành cứu hộ thực tế. Tài liệu này chốt phạm vi vá.

## Luồng hiện trạng (sau merge)

```
DRAFT --dispatch--> PENDING_RESCUE --confirm--> PENDING_WAREHOUSE --prepare--> READY --(?)--> COMPLETED
                          |                            |
                      reject(+lý do)               reject(+lý do)
                          v                            v
                       REJECTED <---------------------+
                          |
              admin: defer / cancel
                          |
             DEFERRED --resend--> PENDING_RESCUE
                     \--cancel--> CANCELLED
```

## Các khoảng hở phát hiện & hướng vá

| # | Gap (so với thực tế) | Mức | Hướng xử lý |
|---|----------------------|-----|-------------|
| A | Admin **không huỷ được** nhiệm vụ đang chạy (chỉ huỷ được từ REJECTED/DEFERRED). Thực tế tình hình đổi từng phút → phải dừng được khi đang chờ cứu hộ/kho. | 🔴 | Mở `CANCELLED` từ `PENDING_RESCUE`, `RESCUE_CONFIRMED`, `PENDING_WAREHOUSE` (các state **chưa xuất kho** → huỷ sạch, không leak tồn). Không mở từ `READY` (đã xuất kho — thuộc luồng hoàn thành/giao, huỷ cần hoàn kho, ngoài phạm vi). |
| B | Đội cứu hộ **không rút được** sau khi đã xác nhận (chỉ từ chối được ở `PENDING_RESCUE`). Thực tế: nhận rồi mới gặp sự cố (xe hỏng, lũ dâng). | 🟡 | Backend đã cho `PENDING_WAREHOUSE → REJECTED`; bổ sung `RESCUE_CONFIRMED → REJECTED`. Khi đội rút lúc kho đang chờ chuẩn bị → **báo thêm WAREHOUSE** dừng. Mở nút "Không tiếp tục được" trên mobile ở các state sau xác nhận. |
| C | **Bug thật**: `READY → COMPLETED` có trong state machine nhưng **không endpoint nào set COMPLETED** → nhiệm vụ kẹt vĩnh viễn ở READY. Thiếu xác nhận kết quả giao. | 🔴 | Thêm endpoint `POST /missions/:id/complete` cho RESCUE: ghi `deliveryOutcome` (DELIVERED/PARTIAL/FAILED) + `deliveryNote` → `COMPLETED`, báo ADMIN + WAREHOUSE. |
| D | `resend` hứa "admin sửa nhân lực/vật tư rồi gửi lại" nhưng code chỉ đổi status + ghi chú, **không tái phân bổ** → nguy cơ vòng lặp từ chối vô nghĩa. | 🔴 | Đồng bộ lời hứa–hành vi: đổi comment/nhãn cho đúng ("gửi lại kèm phản hồi điều phối, giữ nguyên phương án"). Nếu cần đổi vật tư → admin lập phương án mới. Ghi rõ trên UI để không gây hiểu nhầm. |

## Thay đổi kỹ thuật

### 1. Prisma schema (`apps/backend/prisma/schema.prisma`)
- Thêm enum `DeliveryOutcome { DELIVERED, PARTIAL, FAILED }`.
- Mission thêm: `deliveryOutcome DeliveryOutcome?`, `deliveryNote String?`, `completedAt DateTime?`.
- NotificationKind thêm: `MISSION_COMPLETED` (đội xác nhận đã giao → báo admin + kho).
- Sync bằng `prisma db push` (dự án không dùng file migration).

### 2. State machine (`mission.workflow.ts`)
- `PENDING_RESCUE`: thêm đích `CANCELLED`.
- `RESCUE_CONFIRMED`: thêm đích `REJECTED`, `CANCELLED`.
- `PENDING_WAREHOUSE`: thêm đích `CANCELLED` (đã có `REJECTED`).
- Giữ nguyên phần REJECTED/DEFERRED.

### 3. Service (`mission.service.ts`)
- `cancelByAdmin`: đã có — nhờ state machine mở rộng nên tự động huỷ được từ active states (không đổi code, chỉ cần transition cho phép). Thêm: nếu huỷ khi đang `PENDING_WAREHOUSE`/`RESCUE_CONFIRMED` → báo thêm WAREHOUSE dừng chuẩn bị.
- `rejectByRescue`: khi nguồn là `PENDING_WAREHOUSE`/`RESCUE_CONFIRMED` (đội rút sau khi nhận) → báo thêm WAREHOUSE.
- `completeByRescue(id, outcome, note)`: mới — guard `READY → COMPLETED`, lưu outcome/note/completedAt, báo ADMIN + WAREHOUSE.
- `resendByAdmin`: giữ hành vi, sửa comment cho khớp thực tế.

### 4. Controller + DTO
- DTO mới: `CompleteMissionDto { outcome: DeliveryOutcome; note?: string }` (validate outcome ∈ enum).
- Endpoint mới: `POST :id/complete` (RequirePermission `MISSION_CONFIRM` — thuộc RESCUE).
- Endpoint `cancel` giữ nguyên (state machine lo phần mở rộng).

### 5. Frontend web
- `mission-api.ts`: type `MissionStatus` giữ; thêm `DeliveryOutcome`, field `deliveryOutcome/deliveryNote` vào `Mission`; hàm `completeMission(id, outcome, note)`.
- `mission-view.tsx`:
  - ADMIN: nút "Huỷ nhiệm vụ" (kèm lý do) hiện ở cả `PENDING_RESCUE`/`RESCUE_CONFIRMED`/`PENDING_WAREHOUSE`.
  - RESCUE: ở `READY` → nút "Xác nhận đã giao" (chọn DELIVERED/PARTIAL/FAILED + ghi chú).
  - Băng hiển thị kết quả giao khi `COMPLETED`.
  - Ghi chú rõ ở luồng resend (giữ nguyên phương án).
- `workflow-stepper.tsx`: `COMPLETED` hiển thị outcome; giữ off-flow cho CANCELLED.

### 6. Mobile
- `api.ts`: type `MissionDetail` thêm `status` mở rộng; hàm `completeMission`, `rejectMission` dùng lại cho state sau xác nhận.
- `MissionDetail.tsx`:
  - Hiện nút "Không tiếp tục được" (reject + lý do) ở `PENDING_WAREHOUSE`/`RESCUE_CONFIRMED`.
  - Hiện nút "Xác nhận đã giao" (outcome + note) ở `READY`.
  - STATUS_LABEL bổ sung DEFERRED/CANCELLED/COMPLETED.

### 7. Test
- `mission.workflow.spec.ts`: thêm case huỷ từ active states; reject sau xác nhận; `READY → COMPLETED` hợp lệ; chặn `COMPLETED → *`.
- (nếu có test service) bổ sung completeByRescue.

## Ngoài phạm vi (nói bằng lời khi demo)
- SLA/timeout khi đội không phản hồi; reassign sang đội khác (điều phối theo role, chưa theo đội cụ thể).
- Hoàn kho tự động khi huỷ sau khi đã xuất (READY) / khi outcome = FAILED.

## Kiểm thử trước khi chốt
1. `pnpm --filter @safestock/backend prisma:generate` + `prisma:push`.
2. `pnpm --filter @safestock/backend test` (workflow spec xanh).
3. Build backend + frontend + mobile typecheck.
4. Tự review: spam thông báo trùng, edge case double-submit, guard trạng thái cuối.

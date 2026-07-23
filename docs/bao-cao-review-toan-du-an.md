# Báo cáo review toàn dự án — SafeStock-X

_Lập ngày: 2026-07-23 · Nguồn: audit 5 mũi đọc code thật (không tin dấu tick PRD) + git state._

> Không phải nguồn trạng thái thay code. Nguồn sự thật là code + [PRD.md](PRD.md).
> File này là ảnh chụp đánh giá tại thời điểm lập, để lưu vết. Checklist hành động: [checklist-cong-viec-con-lai.md](checklist-cong-viec-con-lai.md).

## Chốt nhanh

App **chạy end-to-end**, nhiều tính năng thật (Readiness, Mission-to-Kit, điều tra sự cố, mượn-trả, dự
báo thống kê, chatbot kho). Nhưng **độ hoàn thiện thực ~50–55%**, và điểm yếu chí mạng **không phải
thiếu tính năng — mà là an toàn giao dịch & bảo mật**.

PRD tự chấm 45–55% (2026-07-22) vẫn **đúng tổng thể**: các commit gần đây (mission complete+hoàn kho,
desktop `.exe`, forecast thống kê) kéo lên chút ít, nhưng audit lần này lộ thêm **5 blocker P0 bảo mật**
mà PRD chưa đếm đủ.

## Bảng hoàn thiện theo mảng

| Mảng | % | Đánh giá thật |
|---|:--:|---|
| Backend — tính năng | ~75% | Luồng lõi chạy: readiness, mission workflow, loan, incident scan, insights. Giàu tính năng. |
| Backend — an toàn/bảo mật | ~40% | ⚠️ **Điểm yếu nhất.** 5 blocker P0 (xem dưới). Chỗ giám khảo kỹ thuật dễ bắt bài. |
| Frontend web | ~55% | Nhiều gap luồng nghiệp vụ: mission ID trong `useState` (F5 mất), không hộp thư nhiệm vụ, không route-guard theo role, không UI nhập/xuất/điều chuyển kho, lỗi bị nuốt thành "khỏe". |
| Mobile (RESCUE) | ~25–30% | Chỉ login + nhận thông báo + confirm/reject/complete mission. Thiếu SecureStore, màn kho/readiness, QR, offline, build APK; URL backend hard-code. |
| Desktop (Simulator) | ~90% | Hoàn chỉnh, đã build `.exe` (~75MB). Chỉ còn creds admin hard-code. |
| AI | ~60% | LLM **thật** cho parse/explain/assistant/action-plan (Ollama+Gemini). Forecast **đã nâng** lên thống kê. **Chưa có RAG/embedding/tri thức**. NL→plan backend xong nhưng **UI chưa nối**. **0 test** ai-service. |
| Chất lượng/Test/CI | ~40% | 202 unit backend (tốt) nhưng **8/21 module 0 test**, **0 test song song**, **không CI**, **không ESLint**, **0 test frontend/AI**, Prisma `db push` **không migration**. |

## 5 BLOCKER P0 — nghiêm trọng nhất, ưu tiên tuyệt đối

### P0-1. WebSocket không xác thực + room client tự khai
- **File:** `simulation.gateway.ts:13-31`, `notification.gateway.ts:14-32`
- **Vấn đề:** Gateway không xác thực JWT khi handshake. Room do **client tự khai**: `join {warehouseId}`
  và `join-role {role}` → bất kỳ ai mở socket là **hút toàn bộ sensor event + thông báo mọi kho, mọi role**.
- **Cần:** xác thực JWT ở handshake; room do **server suy từ JWT** (userId→warehouseId/role), không nhận room từ client.

### P0-2. Simulator không cô lập
- **File:** `simulation.controller.ts:24-77`, `simulation.service.ts:189-229`
- **Vấn đề:** Không tắt ở production (không có guard NODE_ENV), controller chỉ `@UseGuards(JwtAuthGuard)`
  — **không PermissionGuard**. `emit`/`createRun` nhận `warehouseId` tự do, không scope. System actor =
  `findFirst ADMIN` (mượn tài khoản admin đầu tiên), loadcell **tự sinh IMPORT/EXPORT** dưới danh nghĩa admin đó.
- **Hệ quả:** Một user thường có thể bơm sự cố giả và **tự sinh giao dịch tồn kho** cho kho bất kỳ.
- **Cần:** env-flag tắt mutation ở prod + permission `simulation:*` + scope kho + tài khoản SYSTEM riêng.

### P0-3. Transfer làm hỏng dữ liệu + IDOR
- **File:** `inventory.service.ts:176-208`
- **Vấn đề:** `transfer()` chỉ `update shelfId` → **di chuyển CẢ batch**; `quantity` chỉ ghi vào
  transaction/audit (cosmetic) → **lệch sổ**. Không `assertBatchInScope`, `toShelfId` không kiểm kho đích
  → **IDOR** chuyển lô sang kho khác tuỳ ý.
- **Cần:** tách batch transactionally theo `quantity` + authorize source/dest.

### P0-4. Mission prepare không atomic + không scope
- **File:** `mission.service.ts:384-412`, `inventory.service.ts:104-135`
- **Vấn đề:** `bulkExport` và `mission.update(READY)` ở **2 transaction tách rời** → chết giữa chừng thì
  status vẫn PENDING_WAREHOUSE, retry **xuất kho lần 2** (double-export). `prepareByWarehouse` gọi
  bulkExport **không truyền scopeWarehouseId**.
- **Cần:** gộp export + update status vào 1 `$transaction` (như `completeByRescue` đã làm) + truyền `scopeWarehouseId`.

### P0-5. Report approve sai với SKU nhiều lô + không atomic
- **File:** `report.service.ts:65-97`
- **Vấn đề:** Mỗi SKU chỉ lấy **1 batch** (`findFirst orderBy createdAt asc:77-83`) → **SKU nhiều lô bị
  sai** (chỉ đối soát lô đầu). Vòng lặp reconcile + `update(APPROVED)` **không chung transaction**.
- **Cần:** xử lý toàn bộ batch của SKU (phân bổ số đếm) + bọc atomic.

## Đã LÀM CHẮC (✅ khỏi lo)

- **Loan borrow/return** (`loan.service.ts:19-141`) — contract `{ok,damaged,lost}` đúng; đều trong
  `$transaction`; partial chỉ trừ phần mượn (không khoá cả batch).
- **Mission COMPLETE + hoàn kho khi FAILED** (`mission.service.ts:320-368`) — FAILED hoàn 100% trong
  CÙNG transaction với update mission; guard COMPLETED retry-safe.
- **E2E mission workflow** (`test/mission-workflow.e2e-spec.ts`, 10 `it`) — Postgres thật + seed, kiểm
  delta tồn kho, RBAC 403/401.
- **Forecast thống kê** (`insights/forecast.ts`) — EWMA+std+reorder point+confidence, 8 test khóa công thức.
- **Seed dữ liệu đi thi** — 156 EXPORT 60 ngày, RICE-01 cạn, lô cận hạn, idempotent.

## Gaps P1 (không phải bảo mật, nhưng ảnh hưởng lớn)

- **Không CI** — không `.github/workflows/`. 202 unit + 10 e2e chỉ chạy khi ai đó nhớ chạy tay, không gate.
- **0 test song song** — hệ tồn kho mà chưa từng kiểm âm tồn/lost-update/double-export dưới đua tranh.
- **Prisma `db push` không migration** — không `prisma/migrations/`, không review/rollback schema.
- **Frontend không có UI ghi kho** (nhập/xuất/điều chuyển/bulk) — backend có, UI thiếu.
- **8/21 module backend 0 test**: admin, loan, notification, report, backup, health, ai, prisma.
- **Frontend workflow gaps:** mission ID trong `useState` (F5 mất), không hộp thư nhiệm vụ, không
  route-guard theo role, RESCUE không reject được từ web, lỗi API bị nuốt thành empty state "khỏe".
- **Không ESLint config** toàn repo; frontend dựa `next lint` đã deprecated ở Next 15.

## Gaps P2 (mobile & polish)

- Mobile thiếu SecureStore (token lưu không an toàn), màn kho/readiness, QR scan, inventory ops,
  offline cache, build APK; URL backend hard-code.
- Desktop & AI service: creds admin hard-code trong simulator.

## Đề xuất thứ tự xử lý

Ưu tiên đi thi = **an toàn + demo mượt**, không phải thêm tính năng:

1. **Vá 5 blocker P0** (nhất là P0-1 WebSocket + P0-2 Simulator — dễ bị demo-hack tại chỗ). ~1–1.5 buổi.
2. **NL→plan UI** (Phần B của [plan-tang-mat-do-ai-rag-va-nl-plan.md](plan-tang-mat-do-ai-rag-va-nl-plan.md) — backend sẵn, chỉ nối UI) → điểm "wow" AI nhanh, rủi ro thấp.
3. **RAG trợ lý** (Phần A) → nâng "mật độ AI" mạnh nhất, tốn công hơn.
4. **CI + concurrency test** — nền tảng chất lượng, làm khi còn thời gian.

## Câu trả lời khi giám khảo hỏi "app hoàn thiện tới đâu?"

"Luồng nghiệp vụ lõi (readiness, lập phương án vật tư, điều tra sự cố, mượn-trả, dự báo cạn kho, trợ lý
kho) **chạy thật end-to-end**, có unit + e2e test và seed dữ liệu thực tế. Phần còn lại đang củng cố là
**an toàn giao dịch dưới tải song song, bảo mật realtime/simulator, và mở rộng UI ghi kho** — đã nhận
diện đầy đủ, có kế hoạch vá cụ thể. Chúng tôi ưu tiên chắc chắn hơn phô trương."

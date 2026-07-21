# Chia việc 2 Dev — AI Quản lý kho hằng ngày vs AI Vận hành cứu hộ

> Mục tiêu: 2 người code song song, đụng file trùng nhau **tối thiểu**. Ranh giới chia theo **module/folder**, không theo file lẻ trong cùng module của người khác.

---

## Nguyên tắc chia

1. Mỗi feature sở hữu **folder riêng** ở backend + frontend — không sửa file trong folder của người kia.
2. Có ~5 file dùng chung không tránh được (app.module.ts, page.tsx, dashboard-shell.tsx, demo.mjs, shared-types) — quy ước ở [phần cuối](#file-dùng-chung--quy-ước-tránh-conflict): chỉ **thêm dòng vào cuối/vị trí đã đánh dấu**, không sửa dòng có sẵn của người kia.
3. `schema.prisma`: Normal Mode (Dev 2) tính toán thuần từ bảng `InventoryTransaction`/`ItemBatch` đã có sẵn — **không cần thêm bảng mới**, nên hầu như không đụng file này. Nếu phát sinh cần thêm bảng (vd cache báo cáo tháng), thêm model mới ở cuối file, không sửa model có sẵn.
4. Nên tách 2 branch riêng, rebase thường xuyên vào `main`/branch tích hợp để giảm conflict dồn cục ở các file dùng chung.

---

## Dev 1 — AI Vận hành cứu hộ cứu nạn (Emergency Mode)

Đã có nền (BE-J/K done, BE-L phần lớn done) — việc còn lại chủ yếu là **hoàn thiện + FE**.

**Sở hữu (không ai khác đụng):**
- Backend: `apps/backend/src/mission/`, `apps/backend/src/geo/`, `apps/backend/src/notification/`, `apps/backend/src/incident/`, `apps/backend/src/simulation/`, `apps/backend/src/ai/`
- AI service: `apps/ai-service/` (prompt/schema cho `/parse`, `/explain`, `/action-plan`)
- Frontend: `apps/frontend/src/components/mission/*`, `apps/frontend/src/components/dashboard/warehouse-map.tsx`, `apps/frontend/src/components/dashboard/incident-view.tsx`, `apps/frontend/src/components/dashboard/simulator-panel.tsx`, `apps/frontend/src/lib/mission-api.ts`

**Việc còn lại (đối chiếu `apps/backend/ROADMAP.md` / `apps/frontend/ROADMAP.md`):**
- BE-L: soát lại checklist + tick (code/test đã có, roadmap chưa tick đủ)
- FE-K: nhập tình huống + ghim điểm nạn trên map, hiển thị kho gần điểm nạn trên `warehouse-map.tsx`, nút hành động theo role (RESCUE confirm / WAREHOUSE prepare) trong `workflow-stepper.tsx`, hoàn thiện `notification-bell.tsx` (đã có, verify realtime)
- BE-Bp1 (tùy chọn, nếu ghép vào cứu hộ): loadcell/RFID tự sinh giao dịch
- BE-N (phần Emergency): mở rộng `demo.mjs` cho luồng ADMIN→RESCUE→WAREHOUSE

---

## Dev 2 — AI Quản lý kho hằng ngày (Normal Mode)

Hoàn toàn **0% — folder mới tinh**, không đụng code cứu hộ.

**Sở hữu (không ai khác đụng):**
- Backend: `apps/backend/src/insights/` (mới), `apps/backend/src/weather/` (mới)
- Frontend: `apps/frontend/src/components/insights/` (mới), `apps/frontend/src/lib/insights-api.ts` (mới)

**Việc cần làm (BE-M / FE-M trong ROADMAP, chưa ai code):**
- `insights/forecast.ts` (thuần+test): tốc độ xuất TB → dự báo thiếu hụt + đề xuất nhập
- `insights/expiry-alert.ts`: batch sắp hết hạn → cảnh báo + đề xuất điều chuyển
- `insights/rebalance.ts` (thuần+test): chênh tồn cùng SKU giữa kho cùng `communeId` → đề xuất điều chuyển (đọc `GeoService` — chỉ **gọi**, không sửa `src/geo/`)
- `insights/trends.ts` (thuần+test): % tăng/giảm xuất kỳ này vs trước + báo cáo tháng
- `weather/` : Open-Meteo (free, không key) theo lat/lng kho → cảnh báo mưa lớn 72h
- `insights.controller.ts`: `GET /insights/warehouses/:id`, `GET /insights/monthly-report` — LLM diễn giải số (gọi `AiClientService` có sẵn ở `src/ai/`, không sửa module đó)
- FE: panel "AI Insight" trên dashboard (dự báo/nhập/hạn dùng/cân bằng/xu hướng/thời tiết) + nút xuất báo cáo tháng
- BE-Bp5 (backup) / BE-G4api (chatbot) — tùy chọn, gộp vào "vận hành hằng ngày" nếu muốn, không bắt buộc

---

## File dùng chung — quy ước tránh conflict

| File | Ai đụng | Quy ước |
|---|---|---|
| `apps/backend/src/app.module.ts` | Cả 2 | Mỗi người tự thêm **1 dòng import** module mới của mình + **1 dòng** trong mảng `imports`. Không sửa dòng có sẵn. |
| `apps/frontend/src/app/page.tsx` | Dev 2 | Thêm **1 case mới** `activeView === "insights"` (theo mẫu case `stocktake`/`loan` có sẵn). Không sửa case khác. |
| `apps/frontend/src/components/dashboard/dashboard-shell.tsx` | Dev 2 | Thêm `"insights"` vào union `DashboardView` (dòng 20-28) + **1 dòng** vào `navItems` (dòng 41-48). Không sửa dòng khác. |
| `apps/backend/demo/demo.mjs` | Cả 2 | Mỗi người viết **1 hàm riêng** (`demoEmergencyFlow()`, `demoNormalModeInsights()`), gọi cả 2 ở cuối `main()`. Không sửa hàm của người kia. |
| `packages/shared-types/src/index.ts` | Dev 2 (nếu cần quyền `insights:view`) | Thêm permission mới **vào cuối enum/hằng số**, không sửa permission có sẵn (Dev 1 đã thêm `mission:confirm`/`mission:fulfill` ở BE-L, giữ nguyên). |
| `docs/PRD.md`, `apps/backend/ROADMAP.md`, `apps/frontend/ROADMAP.md`, `docs/qa/` | Cả 2 | Mỗi người chỉ sửa mục/phase liên quan tới feature của mình (PRD §3.7-3.9 = Emergency, BE-M/FE-M = Normal Mode) — các mục đã tách sẵn theo phase, không đè lên đoạn của người kia. |

**Nếu vẫn conflict ở các file trên:** thường chỉ là conflict 1-2 dòng thêm-vào-cuối, merge tay là xong — không cần điều phối phức tạp hơn.

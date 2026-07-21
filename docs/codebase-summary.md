# Codebase Summary — Ứng phó nhanh

_Cập nhật: 2026-07-21. Nguồn đối chiếu: README, PRD, BUILD-PLAN, WORK-LOG, ROADMAP từng app, QA docs, `docs/plan-*.md`, cấu trúc source và test/build cục bộ._

## Tổng quan

Ứng phó nhanh là monorepo pnpm cho nền tảng AI đánh giá năng lực sẵn sàng của kho cứu hộ và điều phối vật tư trong tình huống khẩn cấp. Sản phẩm có 5 trục chính: quản lý kho, Readiness Score, Mission-to-Kit/Action Plan, Sensor Simulator, và app vận hành hiện trường.

Tech stack hiện tại:
- Backend: NestJS, Prisma, PostgreSQL, Redis, BullMQ, Socket.IO.
- Frontend: Next.js, Tailwind, TanStack Query, Recharts, Leaflet/React-Leaflet.
- AI service: FastAPI, Pydantic, provider Gemini/Ollama.
- Mobile: dự kiến React Native + Expo, chưa có source app thực tế.
- Shared packages: `@safestock/shared-types`, `@safestock/scenario-definitions`.

## Trạng thái Thật Theo App

| App | Trạng thái |
|---|---|
| Backend | Mạnh nhất, đã có đa số feature lõi và Readiness v2.2. Test pass 25 suite / 168 test, build pass ngày 2026-07-21. |
| Frontend | Đã có admin dashboard nhiều view, Readiness v2.2 và mission/map/action-plan/notification. Typecheck + Next.js production build pass ngày 2026-07-21. |
| AI service | Đã có FastAPI, parse/explain/action-plan/assistant với Gemini/Ollama. Claude provider và explain-incident riêng chưa hoàn chỉnh theo roadmap. |
| Mobile | Chưa triển khai app, chỉ có `package.json`, `README.md`, `ROADMAP.md`. |

## Feature Đã Có Trong Backend

- Nền tảng: health check, Prisma module, env validation, server-time, static simulator page.
- Auth/RBAC: JWT access/refresh, login/me, permission guard, role `ADMIN`, `WAREHOUSE`, `RESCUE`, audit 5W, warehouse scope.
- Inventory: warehouse tree, scan SKU, list batch, import/export/transfer, bulk-export atomic, adjust, reconcile/stocktake, chống xuất âm kho.
- Loan: mượn-trả vật tư không tiêu hao, trả ok/hỏng/mất, tính tồn khả dụng trừ đang mượn.
- Sensor Simulator: virtual devices, deterministic scenarios, runner play/pause/reset x1/x10, WebSocket room theo kho, `sim.html`.
- Readiness v2.2: 6 công thức và điểm xu hướng 4 cấp; blocker có bằng chứng; READY/NEEDS_ACTION/NOT_DISPATCHABLE; lý do, hành động, recalc realtime/on-write và notification theo trạng thái.
- Mission-to-Kit: AI parse tình huống, định mức rule, greedy + FEFO, loại lô hết hạn/hỏng/cần kiểm tra/kệ khóa/không còn khả dụng, fulfillment theo mắt xích yếu nhất, đánh giá từng SKU, explain, approve/generate.
- GeoService + cụm kho xã: `CENTRAL/HAMLET`, `communeId`, lat/lng, Haversine, Google Routes fallback, quota counter.
- Action Plan: kế hoạch 8 mục, severity/forecast do backend rule tính, LLM chỉ viết diễn giải, template fallback khi AI lỗi.
- Workflow liên role: ADMIN tạo mission, RESCUE confirm, WAREHOUSE prepare, READY/COMPLETED, notification realtime theo role.
- Incident Intelligence: rule engine sự cố, evidence timeline, acknowledge/assign/resolve, anomaly z-score, predictive warning, dedupe.
- Normal Mode/Insights: forecast cạn kho, expiry alert, rebalance, trends, weather Open-Meteo, monthly report fallback.
- Assistant: hỏi-đáp kho bằng snapshot JSON, fast-path tiếng Việt cho readiness/tồn kho/sự cố/hạn dùng/thời tiết, Ollama cho câu mở; tự tính readiness lần đầu và giới hạn không bịa số.
- Backup: BullMQ cron/manual, `pg_dump`, upload Supabase Storage, giữ 3 bản.
- Admin/Report: quản lý user/warehouse, báo cáo Excel/tháng, parser Excel.
- Standard dataset: 1 kho trung tâm + đủ 17 thôn Đồng Xuân, 17 SKU/126 lô, kiểm kê, mượn-trả, cảm biến, incident và lịch sử giao dịch khớp tồn; tọa độ thôn chờ ADMIN pin.

## Feature Đã Có Trong Frontend

- Auth/login, token store, route guard, dashboard shell responsive.
- Dashboard views: tổng quan/readiness, ngày thường, trợ lý, kho vật tư, mô phỏng, nhiệm vụ, sự cố, kiểm kê, mượn-trả, bản đồ kho, báo cáo tháng, users, audit.
- Readiness UI: trạng thái vận hành làm headline, blocker/lý do/hành động, điểm xu hướng hiển thị phụ và breakdown 6 chiều.
- Mission UI: nhập tình huống, ghim điểm nạn trên map, đánh giá đáp ứng từng SKU, action plan 8 mục, workflow theo role, notification bell realtime.
- GIS/map: Leaflet, GeoJSON/tile offline trong `public`, map warehouse/incident.
- Assistant/insights/report/admin API clients và UI tương ứng.

## Feature Đã Có Trong AI Service

- `/health` báo provider.
- `/parse` chuyển mô tả tình huống tiếng Việt thành JSON có schema.
- `/explain` diễn giải phương án đã tính.
- `/action-plan` sinh phần diễn giải action plan có validate/retry.
- `/assistant` trả lời từ snapshot kho.
- Provider pluggable: Gemini và Ollama đã có; Claude còn nhánh chưa dùng cho MVP.

## Chưa Xong / Còn Rủi Ro

- Mobile app chưa code.
- Chưa có test E2E browser tự động cho toàn luồng Readiness → Mission; hiện đã verify typecheck/build và unit test backend.
- RFID handler trong Bp1 chưa xong; loadcell đã có.
- AI `explain-incident` riêng chưa tick trong roadmap AI.
- Một số docs cũ vẫn có trạng thái thấp hơn thực tế nếu chưa được đồng bộ hết; nguồn gần nhất nên ưu tiên `apps/backend/ROADMAP.md`, `apps/frontend/ROADMAP.md`, và file này.

## Plan/Docs Bổ Sung Đã Có

- `docs/plan-be-100-phan-tram.md`: kế hoạch hoàn backend, nhiều phần đã phản ánh trong ROADMAP.
- `docs/plan-bo-sung-kich-ban-iot.md`: smoke/power IoT scenario, chưa code theo ghi chú.
- `docs/plan-fix-gis-osm.md`: đã có kết quả sửa/verify OSM/tile ngày 2026-07-20.
- `docs/plan-gis-dieu-phoi-lien-xa-dong-xuan.md`: plan lớn cho GIS láng giềng và điều phối mượn kho liên xã.
- `docs/plan-kho-thon-dieu-phoi.md`: kho thôn, trưởng thôn, báo cáo tháng, bán kính điều phối, OSRM.
- `docs/qa/`: đã có Q&A phòng thủ cho nền tảng, simulator, nhập/xuất đa nguồn, RBAC, readiness, mission, incident, normal mode, chatbot/backup.

## Verify Gần Nhất

- Backend: `pnpm --filter @safestock/backend test -- --runInBand` pass 25 suite / 168 test; `nest build` pass; seed idempotent 2 lần.
- Frontend: `tsc --noEmit` và `pnpm --filter @safestock/frontend build` pass.

## Khuyến Nghị Tiếp Theo

1. Viết/chạy E2E browser cho kho READY, NEEDS_ACTION và NOT_DISPATCHABLE, gồm cả nhiệm vụ thiếu SKU.
2. Chốt mobile: hoặc triển khai F0-F2 tối thiểu, hoặc ghi rõ mobile là lộ trình nếu deadline gấp.
3. Đồng bộ các Q&A cũ còn mô tả điểm số là luật chặn duy nhất.
4. Nếu chuẩn bị nộp thi, ưu tiên demo script backend + web dashboard ổn định hơn mở rộng feature mới.

# ROADMAP - Frontend (`@safestock/frontend`)

> Next.js + Tailwind + TanStack Query + Recharts. Web quản trị + Simulator UI cho role WAREHOUSE/ADMIN.
>
> Quy tắc: code phase nào thì tick từng dòng checklist phase đó. Xong hết + verify pass mới đổi phase sang done. Chi tiết: [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) Phase G.
>
> Trạng thái: ⬜ chưa · 🟡 đang làm · ✅ xong+verify. Ưu tiên: CORE · nên-có · polish.
>
> Phụ thuộc: cần API backend tương ứng xong trước. Design bám `design-taste-frontend` như bộ lọc anti-generic, nhưng dashboard dùng layout product UI data-dense.

---

## FE-G0 - Scaffold + auth ✅ CORE
- [x] Next.js + TypeScript + Tailwind, owned component style theo shadcn/ui conventions
- [x] Fetch client trỏ API bằng env + TanStack Query provider
- [x] Import `@safestock/shared-types`
- [x] Login page lưu token + refresh flow + route guard chờ Zustand hydrate
- [x] Layout sidebar/nav + loading/error state chuẩn cho dashboard
- **Verify:** `pnpm --filter @safestock/frontend build` pass; `tsc --noEmit` pass sau build; Playwright CLI screenshot login/dashboard trên build mới; backend health OK.

## FE-G1 - Dashboard Readiness 🟡 CORE
> Đây là màn hoàn thiện khoảnh khắc vàng cùng Simulator. Lát hiện tại đã dựng cockpit đọc dữ liệu thật, còn CRUD/adjust/reconcile để lát tiếp.
- [x] Tổng quan Readiness toàn kho bằng Recharts
- [x] Breakdown 6 thành phần
- [x] Khuyến nghị cấp kho từ backend
- [x] Ngưỡng hành động 4 vùng bằng màu trạng thái
- [x] Sơ đồ kho dạng grid theo khu/kệ, không dùng React Flow
- [x] Danh sách vật tư trọng yếu đọc từ API
- [ ] Điểm readiness từng khu/nhóm trên sơ đồ kho
- [ ] Quản lý kho/vật tư/định mức CRUD cơ bản
- [ ] UI sửa tay số lượng, form adjust có lý do bắt buộc
- [ ] UI reconcile, hiển thị lệch hệ thống vs kiểm kê rồi xác nhận ghi đè
- [x] Loading / empty / error state cho các call chính
- **Verify hiện tại:** recalc readiness thật tạo score 78, 6 components, 3 recommendations; desktop/mobile screenshot không overlap.
- **Verify còn lại:** adjust có audit; reconcile ghi đè; kéo slider G2 làm readiness rớt realtime.

## FE-G2 - Simulator UI đầy đủ ⬜ CORE
- [ ] Chọn kho/khu/cảm biến; chỉnh nhiệt/ẩm/trọng lượng; bật-tắt thiết bị
- [ ] Chạy scenario, tốc độ x1/x10, pause/resume/reset
- [ ] Timeline event realtime bằng Socket.IO client
- **Verify:** kéo slider độ ẩm → event bắn → readiness rớt trên dashboard + alert mobile.

## FE-K - Action Plan + Emergency Workflow ⬜ CORE (⭐ khác biệt thi, chờ BE-K/L)
- [ ] Màn Mission: nhập tình huống + ghim điểm nạn trên map → nút "✨ Sinh phương án cứu hộ"
- [ ] Action Plan view: 8 mục giống docx (đánh giá/severity/mục tiêu/cấp phát/điều phối kho+ETA/3 giai đoạn/cảnh báo/dự báo %/câu hỏi)
- [ ] Map ghim điểm kho (tổng/thôn) + điểm nạn (Google Maps JS hoặc Leaflet)
- [ ] Workflow liên role: ADMIN sinh→RESCUE xác nhận→WAREHOUSE chuẩn bị; nút theo role
- [ ] Notification UI: chuông + realtime WebSocket theo role
- **Verify:** ADMIN sinh Action Plan 8 mục → RESCUE nhận thông báo xác nhận → WAREHOUSE nhận chuẩn bị; map hiện kho gần điểm nạn.

## FE-M - AI Insight panel (Normal Mode) ⬜ CORE (chờ BE-M)
- [ ] Panel "AI Insight" trên dashboard: dự báo thiếu hụt, đề xuất nhập, hạn dùng, cân bằng kho, xu hướng, cảnh báo thời tiết
- [ ] Nút xuất báo cáo tháng
- **Verify:** panel hiện insight số thật từ /insights; báo cáo tháng đủ mục.

## FE-G3core - Voice Mission + so sánh readiness ⬜ nên-có
- [ ] Voice input Web Speech API `vi-VN` → text ra ô nhập → user sửa → mới gọi `/missions/parse`
- [ ] Nút gõ tay + tình huống mẫu để phòng mất mạng
- [ ] Màn Mission: nhập → xem phương án AI → duyệt
- [ ] So sánh readiness trước/sau khi duyệt phương án
- **Verify:** nói 1 câu → ra text → sửa → parse JSON; duyệt phương án thấy điểm trước/sau.

## FE-G3polish - Báo cáo + sức khỏe kho ⬜ polish
- [ ] Xuất báo cáo PDF 1 nút: readiness + phương án + audit
- [ ] Màn sức khỏe kho tổng hợp cho trình chiếu
- [x] Bản đồ thiên tai đã bỏ khỏi scope
- **Verify:** in PDF ra đúng nội dung.

## FE-G4 - Chatbot hỏi-đáp kho ⬜ polish
- [ ] UI chat gọi `POST /assistant/ask`
- **Verify:** hỏi số liệu → trả đúng; ngoài phạm vi → nói không biết.

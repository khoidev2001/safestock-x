# ROADMAP — Frontend (`@safestock/frontend`)

> Next.js + Tailwind + shadcn/ui + TanStack Query + Recharts. Web quản trị + Simulator UI cho role WAREHOUSE/ADMIN.
>
> **QUY TẮC:** mỗi phase khi code BẮT BUỘC tick từng dòng checklist. Xong hết + verify pass → phase ✅. Chi tiết: [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) Phase G.
>
> Trạng thái: ⬜ chưa · 🟡 đang làm · ✅ xong+verify. Ưu tiên: 🔴 CORE · 🟠 nên-có · ⚪ polish.
>
> **Phụ thuộc:** cần API backend tương ứng xong trước (readiness, inventory, mission). Design bám skill `design-taste-frontend` — KHÔNG UI generic.

---

## FE-G0 — Scaffold + auth ⬜ 🔴
- [ ] Next.js + TypeScript + Tailwind + shadcn/ui
- [ ] axios/fetch client trỏ API (base URL env) + TanStack Query
- [ ] Import `@safestock/shared-types`
- [ ] Login page → lưu token → refresh flow → route guard
- [ ] Layout (sidebar/nav) + loading/error state chuẩn
- **Verify:** login ADMIN → vào dashboard; token hết hạn → refresh; 401 → về login

## FE-G1 — Dashboard Readiness (làm CÙNG BE-C) ⬜ 🔴
> Đây là màn hoàn thiện KHOẢNH KHẮC VÀNG cùng Simulator.
- [ ] Tổng quan Readiness (Recharts): điểm toàn kho + từng khu/nhóm
- [ ] Breakdown 6 thành phần + nguyên nhân trừ điểm + đề xuất
- [ ] Ngưỡng hành động 4 vùng (màu 🟢🟡🟠🔴)
- [ ] Sơ đồ kho = SVG grid tô màu theo readiness (KHÔNG React Flow)
- [ ] Quản lý kho/vật tư/định mức (CRUD cơ bản)
- [ ] UI sửa tay số lượng (form adjust + lý do bắt buộc)
- [ ] UI reconcile (hiện độ lệch hệ thống vs kiểm kê → xác nhận ghi đè)
- [ ] Loading / empty / error / success state mọi call
- **Verify:** dashboard hiện điểm thật; sửa tay có audit; reconcile ghi đè; kéo slider (G2) → điểm rớt realtime

## FE-G2 — Simulator UI đầy đủ (nâng cấp từ sim.html) ⬜ 🔴
- [ ] Chọn kho/khu/cảm biến; chỉnh nhiệt/ẩm/trọng lượng; bật-tắt thiết bị
- [ ] Chạy scenario, tốc độ x1/x10, pause/resume/reset
- [ ] Timeline event realtime (Socket.IO client)
- **Verify:** kéo slider độ ẩm → event bắn → readiness rớt trên dashboard + alert mobile (KHOẢNH KHẮC VÀNG)

## FE-G3core — Voice Mission + so sánh readiness ⬜ 🟠
- [ ] Voice input (Web Speech API vi-VN) → text ra ô nhập → user SỬA → mới gọi /missions/parse
- [ ] Nút "gõ tay" + "tình huống mẫu" (phòng mất mạng)
- [ ] Màn Mission: nhập → xem phương án AI → duyệt
- [ ] So sánh readiness trước/sau khi duyệt phương án
- **Verify:** nói 1 câu → ra text → sửa → parse JSON; duyệt phương án thấy điểm trước/sau

## FE-G3polish — Báo cáo + sức khỏe kho ⬜ ⚪
- [ ] Xuất báo cáo PDF 1 nút (readiness + phương án + audit)
- [ ] Màn "sức khỏe kho" tổng hợp (1 trang chiếu lúc thuyết trình)
- [ ] ~~Bản đồ thiên tai~~ ĐÃ BỎ (#8)
- **Verify:** in PDF ra đúng nội dung

## FE-G4 — Chatbot hỏi-đáp kho ⬜ ⚪
- [ ] UI chat gọi POST /assistant/ask
- **Verify:** hỏi số liệu → trả đúng; ngoài phạm vi → "không biết"

# ROADMAP — Mobile (`@safestock/mobile`)

> React Native + Expo + TypeScript. App vận hành hiện trường cho WAREHOUSE + RESCUE.
>
> **QUY TẮC:** mỗi phase khi code BẮT BUỘC tick từng dòng checklist. Xong hết + verify pass → phase ✅. Chi tiết: [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) Phase F.
>
> Trạng thái: ⬜ chưa · 🟡 đang làm · ✅ xong+verify. Ưu tiên: 🔴 CORE · 🟠 nên-có · ⚪ polish.
>
> **⚠️ Phase trượt tiến độ nhất (~2.5-3 tuần).** Ngày đầu KHÔNG viết UI — chỉ setup toolchain. Cần API backend xong trước.

---

## MO-F0 — Scaffold + auth + toolchain ⬜ 🔴
- [ ] Setup Android: emulator HOẶC điện thoại thật (USB debug) — làm TRƯỚC
- [ ] Expo + TypeScript + Expo Router
- [ ] TanStack Query + Zustand + axios client (emulator `10.0.2.2:3100`, máy thật IP LAN)
- [ ] Import `@safestock/shared-types`
- [ ] Login screen → token (SecureStore) → refresh flow
- **Verify:** login trên điện thoại/emulator → vào trang chủ

## MO-F1 — Trang chủ + kho ⬜ 🔴
- [ ] Trang chủ: readiness toàn kho, cảnh báo mở, nhiệm vụ, vật tư nguy cơ thiếu
- [ ] Chi tiết kho: danh sách kệ + trạng thái + chênh lệch (list đơn giản, không sơ đồ phức tạp)
- [ ] Loading / empty / error state
- **Verify:** hiển thị dữ liệu thật từ API

## MO-F2 — Quét QR + giao dịch + offline ⬜ 🔴
- [ ] expo-camera quét QR → SKU → scan API → chi tiết vật tư
- [ ] Nút "nhập SKU tay" fallback (QR mờ/ánh sáng kém)
- [ ] Xuất/nhập/chuyển/kiểm tra/báo hỏng (≤3 bước xuất)
- [ ] Offline-ĐỌC: cache snapshot kho (SQLite) xem khi mất mạng
- [ ] Badge "đang offline — nhập bù sau"
- [ ] (KHÔNG làm offline-ghi sync tự động — nhập bù tay khi có mạng)
- **Verify:** quét QR thật → xuất kho → SL giảm ở backend; rớt mạng vẫn xem được kho

## MO-F3 — Nhiệm vụ + cảnh báo realtime ⬜ 🟠
- [ ] Nhiệm vụ: danh sách vật tư cần lấy, thứ tự kệ, tiến độ, thay thế
- [ ] Cảnh báo: Socket.IO client in-app alert (mức độ, bằng chứng, timeline)
- **Verify:** tạo sự cố ở Simulator → mobile nhận cảnh báo <2s (in-app)

## MO-F4core — Khép vòng đời (⭐ CORE câu chuyện demo) ⬜ 🔴
- [ ] [WAREHOUSE] Kiểm kê nhanh theo kệ (quét lần lượt → so hệ thống → chênh lệch)
- [ ] [RESCUE] Xác nhận bàn giao bằng QR (quét nhận hàng → audit)
- [ ] [RESCUE] Báo tình trạng vật tư sau nhiệm vụ (còn/hỏng/mất → cập nhật batch)
- [ ] [WAREHOUSE] Duyệt phương án xuất kho trên mobile (approve/reject)
- **Verify:** trọn vòng: duyệt phương án → kiểm kê 1 kệ ra chênh lệch → rescue quét nhận + báo hỏng → readiness kho đổi

## MO-F4polish — Tiện ích thêm ⬜ ⚪
- [ ] [WAREHOUSE] Lịch sử thao tác + undo nhầm
- [ ] [WAREHOUSE] Chụp ảnh báo hỏng → Cloudflare R2
- [ ] [RESCUE] Trạng thái nhiệm vụ realtime (X/Y món)
- [ ] Expo push notification (device token, nền)
- **Verify:** từng tiện ích chạy độc lập

## KHÔNG làm (scope creep)
chat nội bộ · chấm công · GPS đội hình · đa ngôn ngữ · mini Mission-to-Kit trên mobile

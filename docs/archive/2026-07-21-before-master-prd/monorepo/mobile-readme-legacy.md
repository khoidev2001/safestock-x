# @safestock/mobile

App vận hành hiện trường cho nhân viên kho + đội cứu hộ.

**Stack (dựng ở Phase F):** React Native + Expo + TypeScript + Expo Router + TanStack Query + Zustand + expo-camera + Socket.IO client.

**Chức năng:**
- Đăng nhập (JWT, SecureStore)
- Trang chủ: Readiness, cảnh báo, nhiệm vụ
- Quét QR → xuất/nhập/chuyển/kiểm tra/báo hỏng (+ nút nhập SKU tay dự phòng)
- Nhiệm vụ: danh sách vật tư cần lấy theo phương án
- Cảnh báo realtime (Socket.IO in-app)
- Mượn–hoàn (RESCUE)
- Offline-đọc (cache kho khi mất mạng)

Hiện tại: **placeholder**. Xem [BUILD-PLAN.md](../../docs/BUILD-PLAN.md) Phase F.

**Lưu ý toolchain:** cần Android SDK/emulator hoặc điện thoại USB debug. Emulator gọi host qua `10.0.2.2:3100`, máy thật qua IP LAN.

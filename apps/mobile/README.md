# @safestock/mobile

App hiện trường cho **đội cứu hộ (RESCUE)** — nhận thông báo điều phối **realtime** qua WebSocket. Dựng bằng Expo, target **Expo Web** (chạy trong trình duyệt trên máy dev, hợp với WSL2).

## Kiến trúc

Khi admin bấm **Điều phối** một nhiệm vụ ở dashboard web:

```
Dashboard (admin) ──POST /api/missions/:id/dispatch──▶ Backend
                                                          │ NotificationService.create()
                                                          │  ├─ lưu DB (Notification)
                                                          │  └─ push() → Socket.IO emit "notification"
                                                          ▼  vào room "role:RESCUE"
                                              Mobile app (RESCUE) nhận ngay ◀── WebSocket
```

Backend WebSocket đã có sẵn ([notification.gateway.ts](../backend/src/notification/notification.gateway.ts)). App này chỉ:
1. Đăng nhập lấy JWT (`POST /api/auth/login`).
2. Tải danh sách ban đầu (`GET /api/notifications`).
3. Mở Socket.IO với `auth: { token }`; backend tự cấp room theo tài khoản và app nghe event `notification`.

Bấm vào 1 thông báo (có `missionId`) → mở **màn chi tiết**: loại tình huống, số người, thời gian, mức đáp ứng, danh sách vật tư, thôn/vị trí báo cáo và từng kho cần tới lấy. Đội cứu hộ chỉ đọc phương án và tự tới các kho; app không có thao tác xác nhận, từ chối hay hoàn thành nhiệm vụ.

## Chạy

Cần **3 tiến trình** (mở 3 terminal, chạy từ thư mục gốc repo):

```bash
# 1. Backend (cổng 3100) — DB phải đã push + seed
pnpm be:dev

# 2. Dashboard web (để bấm Điều phối) — cổng 3000
pnpm fe:dev

# 3. App mobile (Expo Web)
pnpm mobile:dev        # rồi bấm phím "w" để mở web, hoặc:
pnpm --filter @safestock/mobile web
```

Expo mở tab trình duyệt (thường `http://localhost:8081`). Nếu backend không ở cổng 3100, sửa `API_BASE` trong [config.ts](config.ts).

## Test realtime (end-to-end)

1. **Mobile web**: đăng nhập tài khoản RESCUE được cấp. Thấy danh sách thông báo + chấm xanh **"Đã kết nối"**.
2. **Dashboard** (`http://localhost:3200`): đăng nhập ADMIN → mở báo cáo, phân tích, kiểm tra và duyệt.
3. **Kỳ vọng**: app mobile hiện thông báo *"Nhiệm vụ cứu hộ mới"* **ngay lập tức** (không cần refresh), nhảy lên đầu danh sách kèm badge **MỚI**.
4. **Test reconnect**: tắt rồi bật lại `pnpm be:dev` → chấm chuyển xám ("Mất kết nối") rồi xanh lại.

### Test chi tiết

1. Bấm vào thông báo để xem thôn, vị trí cụ thể và từng kho cần tới lấy.
2. RESCUE không có thao tác xác nhận, từ chối hoặc hoàn thành.

## Test trên điện thoại thật (Expo Go)

Đổi `API_BASE` trong [config.ts](config.ts) thành `http://<IP-LAN-máy>:3100` (không dùng `localhost`), chạy `pnpm mobile:dev`, quét QR bằng app **Expo Go**. Điện thoại phải cùng mạng Wi-Fi với máy dev.

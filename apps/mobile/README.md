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

Bấm vào 1 thông báo (có `missionId`) → mở **màn chi tiết**: loại tình huống, số người, thời gian, mức đáp ứng, danh sách vật tư (cần/cấp/thiếu). Khi nhiệm vụ đang `PENDING_RESCUE`, có 2 nút:
- **Chấp nhận** → `POST /api/missions/:id/confirm` (chuyển sang chờ kho chuẩn bị).
- **Từ chối** → nhập lý do (chips gợi ý: Thiếu nhân lực / Thiếu vật tư / Xin trì hoãn) → `POST /api/missions/:id/reject` → mission REJECTED + **admin nhận thông báo realtime kèm lý do**.

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

1. **Mobile web**: đăng nhập `rescue@safestock.vn` / `rescue123` (đã điền sẵn). Thấy danh sách thông báo + chấm xanh **"Đã kết nối"**.
2. **Dashboard** (`http://localhost:3000`): đăng nhập `admin` / `admin123@` → tab **Nhiệm vụ** → tạo/chọn 1 nhiệm vụ → bấm **Điều phối**.
3. **Kỳ vọng**: app mobile hiện thông báo *"Nhiệm vụ cứu hộ mới"* **ngay lập tức** (không cần refresh), nhảy lên đầu danh sách kèm badge **MỚI**.
4. **Test reconnect**: tắt rồi bật lại `pnpm be:dev` → chấm chuyển xám ("Mất kết nối") rồi xanh lại.

### Test chi tiết + Chấp nhận / Từ chối

**Chấp nhận:**
1. Sau khi dispatch, trên mobile bấm vào thông báo *"Nhiệm vụ cứu hộ mới"* → xem chi tiết vật tư.
2. Bấm **Chấp nhận** → về danh sách. Kho (role WAREHOUSE) nhận thông báo *"Cứu hộ đã xác nhận — chuẩn bị vật tư"*.

**Từ chối (kèm lý do):**
1. Bấm vào thông báo → **Từ chối** → chọn chip *"Thiếu nhân lực"* (hoặc gõ lý do) → **Xác nhận từ chối**.
2. Mission chuyển REJECTED, lưu `rejectionReason`. Đăng nhập dashboard bằng tài khoản **admin** → chuông thông báo hiện *"Đội cứu hộ từ chối nhiệm vụ — Lý do: …"* ngay lập tức (realtime).

### Test nhanh không cần dashboard (tuỳ chọn)

```bash
# Lấy token admin
TOKEN=$(curl -s localhost:3100/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin","password":"admin123@"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# Lấy 1 mission DRAFT bất kỳ rồi dispatch (thay <MISSION_ID>)
curl -s -X POST localhost:3100/api/missions/<MISSION_ID>/dispatch -H "Authorization: Bearer $TOKEN"
```

## Test trên điện thoại thật (Expo Go)

Đổi `API_BASE` trong [config.ts](config.ts) thành `http://<IP-LAN-máy>:3100` (không dùng `localhost`), chạy `pnpm mobile:dev`, quét QR bằng app **Expo Go**. Điện thoại phải cùng mạng Wi-Fi với máy dev.

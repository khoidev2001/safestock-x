# @safestock/mobile

App hiện trường cho **REPORTER/RESCUE/WAREHOUSE/ADMIN** theo role — report, notification/mission, dashboard/readiness, QR và nghiệp vụ kho. APK Android luôn gọi `https://ungphonhanh.life`: Internet dùng đường public, còn LAN mất Internet dùng split-DNS về máy chủ kho; Expo Web chỉ là dev fallback.

## Khả năng hiện tại

- Session access/refresh token lưu bằng Expo SecureStore; logout xóa session và cache theo tài khoản.
- Trên APK Android, mọi snapshot offline được mã hóa AES-256-GCM trước khi ghi
  AsyncStorage; khóa nằm trong Android Keystore và không được xuất sang
  JavaScript. Cache plaintext của bản cũ bị loại bỏ theo cơ chế fail-closed.
- Dashboard/readiness/cảnh báo, mưa Open-Meteo 72 giờ và bản tin AI đầu ngày; bản tin tải nền để không chặn dashboard.
- Kho mobile: quét QR hoặc nhập tay, tìm thường/tìm semantic local, nhập, xuất, chuyển kệ, kiểm kê, điều chỉnh, báo tình trạng và xuất nhiều lô.
- Mượn/hoàn vật tư, gồm hoàn tốt, hỏng và mất; action chỉ hiện khi role có quyền.
- Cache offline-read cho notification, mission, dashboard và kho. Mất LAN hiển thị stale timestamp và khóa toàn bộ mutation; không có queue offline-write.

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
# 1. Backend (cổng 3110) — DB phải đã push + seed
pnpm be:dev

# 2. Dashboard web (để bấm Điều phối) — cổng 3200
pnpm fe:dev

# 3. App mobile trên web (dev fallback)
pnpm mobile:dev        # rồi bấm phím "w" để mở web, hoặc:
pnpm --filter @safestock/mobile web
```

Expo mở tab trình duyệt (thường `http://localhost:8081`). API release phải lấy từ `EXPO_PUBLIC_API_BASE_URL` và dùng đúng `https://ungphonhanh.life`; không dùng `localhost` hoặc IP riêng trên điện thoại.

## Build APK release Android

Không cần đụng tới `.env.local`: script `android:release` tự nhúng `https://ungphonhanh.life` vào bundle và cắt hẳn đường đọc `.env*` của Metro, nên file dev trỏ về `localhost` cũng không lọt vào APK được. Build xong script đọc lại bundle để kiểm chứng endpoint và dừng nếu sai — bản 0.5.2 từng ra lò với `http://localhost:3110` vì lúc đó endpoint còn phụ thuộc `.env.local`, và trên điện thoại thật thì `localhost` là chính cái điện thoại nên mọi lời gọi đều "Network request failed".

Muốn build vào máy chủ khác (ví dụ staging), đặt `EXPO_PUBLIC_API_BASE_URL` thành một URL `https` ngay trong môi trường chạy lệnh; script sẽ cảnh báo rõ là bản này không trỏ vào máy chủ thật. URL `http` bị từ chối vì manifest đặt `usesCleartextTraffic="false"`.

APK release chỉ dùng HTTPS và mang CA nội bộ dành riêng cho domain này để kết nối được khi split-DNS LAN đang hoạt động. Khóa release chỉ tạo một lần; script không được dùng để thay khóa giữa các bản cập nhật:

```powershell
# Chỉ chạy một lần nếu chưa có release keystore
pnpm --filter @safestock/mobile android:keystore

# JDK 17 + Android SDK phải có trong JAVA_HOME/ANDROID_HOME.
# Trên máy Windows hiện tại, không dùng Java 8 mặc định:
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
pnpm --filter @safestock/mobile android:release
```

Artifact hiện tại:

- File: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- Package: `vn.ungphonhanh.safestock`
- Phiên bản: `0.5.0` (`versionCode=5`)
- SHA-256: `EC415126E26B4FC4F80B7A8825C5792B8DDCEE5F5A0EEFBE67960C33DA817CA2`
- Ký APK Signature Scheme v2, RSA 4096-bit; manifest release có camera và microphone, không có overlay, storage hay biometric.

Voice trên APK dùng `AudioRecord` native Android để tạo WAV PCM 16-bit, mono, 16 kHz rồi gửi lên endpoint PhoWhisper hiện có. App chỉ xin quyền micro khi người dùng bấm ghi âm, giới hạn mỗi clip 60 giây, điền chữ nhận dạng vào ô mô tả và không tự gửi báo cáo. Người dùng luôn có thể đọc lại, sửa hoặc gõ tay.

Mã native voice và mã hóa cache đang được giữ trực tiếp trong thư mục
`android/`. Không chạy `expo prebuild --clean` nếu chưa chuyển
`VoiceRecorderPackage` và `SecureCacheCipherPackage` thành config plugin, vì
thao tác đó tái tạo và có thể ghi đè thay đổi native thủ công.

Phải sao lưu riêng, có kiểm soát truy cập, cả `android/app/safestock-release.keystore` và `android/keystore.properties`. Hai file đã bị git-ignore; mất khóa sẽ không thể phát hành bản cập nhật mang cùng chữ ký.

Cài trên thiết bị đã bật USB debugging:

```powershell
adb devices -l
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Tại lần build ghi trong tài liệu này, `adb devices -l` chưa thấy thiết bị nên fresh-install/S23 Ultra acceptance chưa được đánh dấu pass.

## Test realtime (end-to-end)

1. **Mobile web**: đăng nhập bằng tài khoản seed/demo được cấu hình riêng trong môi trường local; không dùng credential demo khi mở Internet. Thấy danh sách thông báo + chấm xanh **"Đã kết nối"**.
2. **Dashboard** (`http://localhost:3200`): đăng nhập `superadmindongxuan` / `admin123` → tab **Nhiệm vụ** → tạo/chọn 1 nhiệm vụ → bấm **Điều phối**.
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
TOKEN=$(curl -s localhost:3110/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"superadmindongxuan","password":"admin123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# Lấy 1 mission DRAFT bất kỳ rồi dispatch (thay <MISSION_ID>)
curl -s -X POST localhost:3110/api/missions/<MISSION_ID>/dispatch -H "Authorization: Bearer $TOKEN"
```

## APK/device gate (bắt buộc)

Build/install APK release trên fresh device, cùng private Wi-Fi với máy chạy backend. Tắt public Internet nhưng giữ LAN, xác nhận login/report/mission sau restart; khi rút LAN, app phải hiện stale/offline state và không báo thành công giả. Expo Go chỉ dùng để debug, không phải bằng chứng nộp.

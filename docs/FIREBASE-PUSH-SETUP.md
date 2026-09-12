# Lấy khoá Firebase cho thông báo đẩy

Cần **hai file**, đều miễn phí, không cần thẻ tín dụng. Làm một lần, dùng mãi.

- `google-services.json` — cho **app Android**, để máy lấy được token nhận thông báo.
- Service account key (`.json`) — cho **máy chủ**, để gửi thông báo.

> Cả hai đã được chặn khỏi git trong `.gitignore`. Đừng gửi chúng qua Zalo hay
> email: ai cầm service account key là gửi được thông báo giả danh hệ thống tới
> mọi máy đã cài app.

---

## Phần 1 — Tạo dự án Firebase (2 phút)

1. Mở https://console.firebase.google.com và đăng nhập bằng tài khoản Google.
2. Bấm **Create a project** (hoặc *Tạo dự án*).
3. Tên dự án: `Ung Pho Nhanh` — bấm **Continue**.
4. Màn hình Google Analytics: **tắt** công tắc *Enable Google Analytics* rồi
   **Create project**. Thông báo đẩy không cần Analytics, bật lên chỉ thêm một
   thứ thu thập dữ liệu người dùng mà dự án không dùng tới.
5. Đợi khoảng 30 giây, bấm **Continue**.

---

## Phần 2 — File cho app: `google-services.json`

1. Ở màn hình chính của dự án, bấm biểu tượng **Android** (con robot) dưới dòng
   *Get started by adding Firebase to your app*.
2. **Android package name** — điền **chính xác**, không thừa dấu cách:

   ```
   vn.ungphonhanh.safestock
   ```

   > Sai một ký tự là app không nhận được thông báo nào, mà cũng không báo lỗi gì
   > — nên chép nguyên dòng trên thay vì gõ tay.

3. **App nickname**: `Ứng phó nhanh` (tuỳ ý, chỉ để nhận ra trong console).
4. **Debug signing certificate SHA-1**: **để trống**. Chỉ cần cho Google Sign-In,
   thông báo đẩy không dùng.
5. Bấm **Register app**.
6. Bấm **Download google-services.json**.
7. Chép file đó vào đúng chỗ này:

   ```
   D:\Mikitech Project\Kho\apps\mobile\google-services.json
   ```

8. Các bước "Add Firebase SDK" sau đó **bỏ qua** — bấm **Next** rồi **Continue to
   console**. Phần đó đã có sẵn trong mã nguồn.

---

## Phần 3 — File cho máy chủ: service account key

1. Trong Firebase Console, bấm biểu tượng **bánh răng ⚙** cạnh *Project Overview*
   → **Project settings**.
2. Sang tab **Service accounts**.
3. Bấm **Generate new private key** → hộp thoại hiện ra → bấm **Generate key**.
4. Trình duyệt tải về một file `.json` tên dài dòng.
5. Đổi tên và cất **ngoài thư mục dự án**, ví dụ:

   ```
   D:\Mikitech Project\secrets\fcm-service-account.json
   ```

   > Để ngoài repo cho chắc. Trong repo tuy đã có `.gitignore` chặn, nhưng một
   > khoá ký nằm cạnh mã nguồn là thứ sớm muộn cũng bị chép nhầm đi đâu đó.

---

## Phần 4 — Khai báo cho máy chủ

Mở file `.env` ở gốc dự án, thêm một dòng:

```
FCM_SERVICE_ACCOUNT_FILE=D:\Mikitech Project\secrets\fcm-service-account.json
```

Hoặc, nếu muốn dán thẳng nội dung JSON vào biến môi trường (tiện khi chạy trong
container):

```
FCM_SERVICE_ACCOUNT_JSON={"project_id":"...","client_email":"...","private_key":"..."}
```

Chỉ cần **một trong hai**. Khởi động lại backend, rồi kiểm tra:

```
GET /api/push/status  →  {"configured": true}
```

Còn trả `false` nghĩa là máy chủ chưa đọc được khoá — sai đường dẫn, hoặc file
thiếu một trong ba trường `project_id`, `client_email`, `private_key`.

---

## Nếu gặp lỗi 403 khi gửi

Vào https://console.cloud.google.com → chọn đúng dự án → **APIs & Services** →
**Enable APIs** → tìm **Firebase Cloud Messaging API** → **Enable**. Thường
Firebase đã bật sẵn, nhưng vài dự án tạo mới thì chưa.

---

## Điều cần biết trước khi dùng

Thông báo đẩy **đi qua máy chủ của Google**. Nghĩa là:

- **Mất Internet là mất thông báo đẩy.** Đúng lúc bão làm đứt mạng thì kênh này
  chết, trong khi socket trong mạng nội bộ vẫn sống. Nó là lớp bổ sung, không
  thay thế được kênh realtime.
- Vì vậy nội dung gửi đi cố tình nghèo: chỉ tiêu đề, một câu ngắn và số hiệu
  nhiệm vụ. Số liệu kho, danh sách vật tư và toạ độ điểm gặp nạn không đi qua
  Google — app phải đăng nhập hỏi máy chủ xã mới lấy được.

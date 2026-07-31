# Vận hành hybrid một domain

Mục tiêu vận hành là người dùng luôn truy cập `https://ungphonhanh.life`.
Internet quyết định đường đi, không quyết định URL hay quyền của tài khoản:

- Ngoài LAN: Vercel phục vụ web; Cloudflare Worker chuyển riêng `/api` và
  `/socket.io` đến backend qua tunnel.
- Trong LAN, kể cả khi mất Internet: DNS nội bộ trả chính hostname đó về máy
  chủ kho; Caddy phục vụ web Next.js tại chỗ và chuyển các đường API đến NestJS
  tại chỗ.

Đây là split-horizon DNS. Không đổi hostname sang địa chỉ IP, không dùng
database hay kịch bản simulator riêng để làm chế độ offline.

## Thành phần sở hữu cấu hình

| Bề mặt | Chủ sở hữu |
|---|---|
| Web public | Vercel project đang gắn `ungphonhanh.life` |
| Route API public | [`hybrid-api-router`](../infrastructure/cloudflare/hybrid-api-router/wrangler.toml) |
| Tunnel API | [`cloudflared-api-ingress.example.yml`](../infrastructure/cloudflare/cloudflared-api-ingress.example.yml) |
| Ingress LAN | [`Caddyfile.hybrid`](../infrastructure/caddy/Caddyfile.hybrid) |
| Khởi động Windows | [`install-autostart-tasks.ps1`](../infrastructure/windows/install-autostart-tasks.ps1) |

Không để Cloudflare Tunnel chiếm hostname gốc `ungphonhanh.life`: hostname đó
vẫn thuộc Vercel ở public. Tunnel chỉ công khai `api.ungphonhanh.life` cho
Worker gọi đến.

## 1. Thiết lập public một lần

1. Giữ domain `ungphonhanh.life` đã xác minh trong Vercel project; đây là web
   public. Đẩy commit vào Production Branch để Vercel cập nhật giao diện.
2. Tạo hostname tunnel `api.ungphonhanh.life`, dùng mẫu ingress đã liên kết ở
   trên và để service đích là `127.0.0.1:3100`. Không công khai PostgreSQL,
   Redis hay port Node trực tiếp.
3. Deploy Worker từ thư mục gốc repository bằng tài khoản Cloudflare quản lý
   zone. Wrangler hiện hành cần Node 22+, nên dùng terminal Node 22 cho bước
   này nếu máy chủ ứng dụng vẫn chạy Node 20:

   ```powershell
   npx --yes wrangler@latest deploy --config infrastructure/cloudflare/hybrid-api-router/wrangler.toml
   ```

   Worker chỉ nhận `/api` và `/socket.io` **qua HTTPS** của hostname public,
   giữ nguyên URL trên trình duyệt và không cache response API. Kiểm tra route
   trên dashboard trước khi deploy nếu zone đã có Worker route trùng đường dẫn.
4. Trên máy chủ backend, đặt `BIND_ADDRESS=127.0.0.1`,
   `AUTH_COOKIE_SECURE=true` và `CORS_ALLOWED_ORIGINS=https://ungphonhanh.life`.
   Restart backend sau khi đổi biến môi trường.

### Tunnel phải tự khởi động

`cloudflared` là Windows service riêng, không phải Scheduled Task ứng dụng.
Trước hết kiểm tra xem máy chủ đã có service `cloudflared` hay chưa. Nếu có,
**dùng lại service đó** và thêm ingress `api.ungphonhanh.life`; không cài thêm
một tunnel/daemon thứ hai. Nếu chưa có, cài một service `cloudflared` chạy bằng
SYSTEM theo hướng dẫn chính thức của Cloudflare. Service cần đọc `config.yml` và
credential JSON dưới `C:\Windows\System32\config\systemprofile\.cloudflared`.

Sau mỗi thay đổi ingress, trước khi restart service, chạy bằng quyền quản trị:

```powershell
C:\Cloudflared\bin\cloudflared.exe --config=C:\Windows\System32\config\systemprofile\.cloudflared\config.yml tunnel ingress validate
C:\Cloudflared\bin\cloudflared.exe --config=C:\Windows\System32\config\systemprofile\.cloudflared\config.yml tunnel ingress rule https://api.ungphonhanh.life/api/health
Restart-Service cloudflared
Get-Service cloudflared | Select-Object Name, Status, StartType
```

Không commit `config.yml`, `cert.pem`, tunnel credential JSON, tunnel token hay
Cloudflare API token. Nếu service hiện hữu dùng đường dẫn binary/config khác,
dùng các đường dẫn của service đó thay vì tạo service trùng.

Worker phải được deploy trước khi web Vercel mới gọi API qua cùng domain. Vercel
không chạy NestJS, PostgreSQL, email outbox hay Socket.IO server. Hostname
`api.ungphonhanh.life` là origin backend có xác thực, không phải URL người dùng
hay desktop client truy cập; client luôn dùng hostname gốc.

## 2. Thiết lập LAN một lần

1. Cài Caddy trên máy chủ kho tại `C:\Program Files\Caddy\caddy.exe` hoặc đặt
   biến máy `UNGPHONHANH_CADDY_PATH` đến binary đó. Đừng lưu certificate hoặc
   Cloudflare credential trong repository.
2. Build backend và frontend production, rồi đăng ký task Windows. Task
   `UngPhoNhanh-EdgeProxy` dùng Caddyfile đã liên kết ở trên và mở cổng 443
   local. Caddy chỉ nghe cổng 443 vì cổng 80 trên máy này đã dành cho dịch vụ
   khác; frontend Next.js bị bind vào `127.0.0.1:3200` nên không có đường HTTP
   LAN lách qua ingress.
3. Caddy dùng CA nội bộ cố định. Sau lần chạy đầu, xuất certificate gốc nằm
   dưới `%ProgramData%\UngPhoNhanh\caddy\caddy\pki\authorities\local\root.crt`
   và phân phối nó vào **Trusted Root
   Certification Authorities** của mọi PC/desktop simulator qua GPO hoặc quy
   trình quản lý thiết bị. Không bật split-DNS trước khi thiết bị tin CA này.
   Sao lưu thư mục Caddy đó như một bí mật vận hành; tạo mới sẽ tạo CA mới và
   bắt buộc cài trust lại cho toàn bộ client.
4. Trên DNS nội bộ, tạo zone split-horizon `ungphonhanh.life` với bản ghi apex
   A trỏ đến IP private cố định của máy chủ kho. Quy tắc này chỉ áp dụng cho
   resolver LAN; public DNS vẫn trỏ Vercel. Cho phép TCP 443 từ LocalSubnet
   đến máy chủ Caddy. APK đã tin CA này chỉ cho `ungphonhanh.life`; không cần
   cài CA bằng tay trên điện thoại quản lý bởi hệ thống.
5. Khởi động theo thứ tự backend, frontend, edge proxy. Trình duyệt và desktop
   simulator sau đó đều gõ đúng `https://ungphonhanh.life` trong LAN.

Khi DNS nội bộ chưa sẵn sàng, không tuyên bố chế độ hybrid hoàn tất. IP/hostname
LAN chỉ là phương án cứu hộ kỹ thuật, không phải luồng vận hành chính đã chốt.

## 3. Xác nhận trước nghiệm thu

1. Khi còn Internet, xác nhận DNS public đưa web đến Vercel, HTTP được chuyển
   sang HTTPS và `/api/health` nhận response từ backend qua Worker.
2. Từ một client LAN, xác nhận DNS nội bộ trả IP private của ingress; trình
   duyệt không báo lỗi certificate và cùng URL hiển thị web local.
3. Ngắt Internet bên ngoài nhưng giữ switch, DNS nội bộ và máy chủ kho hoạt
   động. Đăng nhập web và desktop bằng `https://ungphonhanh.life`; xác nhận
   snapshot lưu lịch sử trên backend local.
4. Xác nhận vượt ngưỡng: chuông desktop kêu ngay sau **Xác nhận và gửi**;
   email đi vào outbox khi SMTP không tới được. Khôi phục Internet và kiểm tra
   outbox gửi retry với các mốc `observedAt`, `receivedAt`, `sentAt`.
5. Khôi phục Internet, lặp lại kiểm tra bằng public DNS. Kiểm tra tài khoản chỉ
   thấy thiết bị thuộc scope kho ở cả hai đường.

Để xác nhận riêng Worker trước production, chạy test của nó:

```powershell
node --test infrastructure/cloudflare/hybrid-api-router/src/worker.test.mjs
```

## Rollback

Nếu LAN ingress lỗi, xóa/disable bản ghi split-DNS để client quay lại DNS public;
không đổi dữ liệu database. Nếu route Worker lỗi, rollback deployment Worker về
bản trước trong Cloudflare rồi kiểm tra lại `/api/health`. Giữ backend, Redis và
database ở nguyên trạng; không dùng seed hay reset để xử lý lỗi routing.

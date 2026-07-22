# Kế hoạch triển khai domain, online/offline và AI local

> Trạng thái: Domain và Cloudflare Tunnel đã hoạt động; Backend/Frontend đã tự khởi động bằng Windows Scheduled Task  
> Phạm vi: Web quản trị, Backend API, PostgreSQL, Redis, AI Service, Ollama/Qwen và bản đồ online/offline  
> Nguyên tắc cố định: Dù online hay offline, AI vẫn chạy local; không gửi dữ liệu nghiệp vụ sang dịch vụ AI bên ngoài.

## 1. Mục tiêu

Triển khai hệ thống để đáp ứng đồng thời hai cách sử dụng:

1. **Online:** cán bộ truy cập bằng domain qua Internet; bản đồ ưu tiên OpenStreetMap; yêu cầu AI vẫn được xử lý bởi Ollama tại cơ quan.
2. **Offline:** khi mất Internet, cán bộ trong mạng LAN vẫn truy cập được hệ thống; bản đồ dùng tile cục bộ; AI và dữ liệu vẫn hoạt động bình thường.

Domain chỉ cung cấp địa chỉ truy cập online và HTTPS. Domain không thay đổi AI provider, không đưa Ollama lên cloud và không thay thế cơ chế đăng nhập/JWT hiện có.

### 1.1 Quyết định pilot đã chốt

- Domain chính: `ungphonhanh.life`, đăng ký tại Mắt Bão.
- Chưa mua VPS và chưa dùng Vercel/Railway cho giai đoạn pilot.
- Máy `PLAT1NER` đang cài source code được dùng làm máy chủ pilot.
- Máy chủ hiện dùng Windows 11, Intel Core i7-10750H, RAM 16 GB và đang chạy Ollama.
- Frontend, Backend, PostgreSQL, Redis, AI Service và Ollama cùng chạy trên máy này.
- Cloudflare Tunnel chỉ tạo đường truy cập web/API từ domain về máy chủ.
- AI Service, Ollama, PostgreSQL và Redis không được public trực tiếp.
- Supabase chưa phải database chính; chỉ là lựa chọn lưu bản backup đã mã hóa trong tương lai.

## 2. Phạm vi và giả định

### 2.1 Thành phần hiện có

| Thành phần | Công nghệ | Cổng hiện tại | Phạm vi truy cập đề xuất |
|---|---|---:|---|
| Frontend | Next.js | `3200` | Public qua domain và nội bộ qua LAN |
| Backend | NestJS | `3100` | Public qua reverse proxy; có Auth/JWT |
| AI Service | FastAPI | `8000` | Chỉ Backend hoặc mạng LAN tin cậy |
| Ollama | Qwen 3.5 4B | `11434` | Chỉ AI Service; không public |
| PostgreSQL | PostgreSQL 16 Alpine | host `55433` → container `5432` | Chỉ nội bộ |
| Redis | Redis 7 Alpine | host `56380` → container `6379` | Chỉ nội bộ |

### 2.2 Điều không làm

- Không public trực tiếp Ollama `11434`.
- Không public AI Service `8000` cho trình duyệt.
- Không mở PostgreSQL hoặc Redis ra Internet.
- Không chuyển dữ liệu nghiệp vụ sang Gemini/Claude/OpenAI trong kiến trúc mặc định.
- Không yêu cầu IP tĩnh hoặc port forwarding nếu dùng Cloudflare Tunnel.
- Không dùng Vercel, Railway hoặc Supabase Database trong giai đoạn pilot đã chốt.

## 3. Kiến trúc mục tiêu

### 3.1 Giai đoạn đầu: một máy chủ tại cơ quan

Đây là kiến trúc đã chọn cho demo, chạy thử và vận hành quy mô nhỏ. “Máy chủ tại cơ quan” trong sơ đồ hiện là máy `PLAT1NER` của người cài source code.

```text
Internet
   |
Domain + HTTPS
   |
Cloudflare Tunnel
   |
Máy chủ tại cơ quan
   |-- Frontend :3200
   |-- Backend :3100
   |-- PostgreSQL
   |-- Redis
   |-- AI Service :8000
   `-- Ollama/Qwen :11434
```

Ưu điểm:

- Ít máy, dễ cài đặt và sao lưu.
- AI và dữ liệu đều nằm tại cơ quan.
- Không cần IP tĩnh.
- Không cần mở cổng modem.

Hạn chế:

- Máy tắt, mất điện hoặc hỏng thì toàn hệ thống dừng.
- AI có thể chiếm RAM/CPU và ảnh hưởng Backend.
- Cần UPS và cơ chế tự khởi động dịch vụ.

### 3.2 Giai đoạn vận hành chính thức: tách máy ứng dụng và máy AI

```text
                         Mạng LAN nội bộ

Máy người dùng
     |
     v
Máy ứng dụng                         Máy AI
|-- Frontend                         |-- AI Service :8000
|-- Backend -----------------------> |-- Ollama :11434
|-- PostgreSQL                       `-- Qwen 3.5 4B
`-- Redis
```

Quy tắc mạng:

- Backend được phép gọi `http://IP_MAY_AI:8000`.
- AI Service được phép gọi Ollama trên chính máy AI.
- Máy người dùng không được truy cập trực tiếp `8000` hoặc `11434`.
- Hai máy nên dùng IP LAN tĩnh hoặc DHCP reservation.

## 4. Luồng hoạt động online và offline

### 4.1 Online

```text
Trình duyệt
  -> https://tenmien.vn
  -> Cloudflare Tunnel
  -> Frontend/Backend trên máy chủ
  -> AI Service nội bộ
  -> Ollama local
```

- Giao diện truy cập bằng domain.
- HTTPS được bật.
- Bản đồ chọn OpenStreetMap online.
- API nghiệp vụ vẫn kiểm tra JWT.
- AI không đi qua Internet sau khi yêu cầu đã tới Backend.

### 4.2 Offline trong mạng LAN

```text
Trình duyệt trong LAN
  -> http://IP_MAY_CHU hoặc hostname nội bộ
  -> Frontend/Backend trên máy chủ
  -> AI Service nội bộ
  -> Ollama local
```

- Không phụ thuộc Cloudflare Tunnel.
- Không phụ thuộc DNS công cộng.
- Bản đồ tự chuyển sang tile cục bộ.
- PostgreSQL, Redis, AI Service và Ollama tiếp tục hoạt động.
- Chỉ người dùng đang kết nối cùng LAN mới truy cập được.

### 4.3 Điểm cần sửa để chuyển mode liền mạch

Frontend hiện dùng biến build-time `NEXT_PUBLIC_API_URL`. Nếu giá trị này là `https://api.tenmien.vn`, giao diện mở qua LAN khi mất Internet vẫn có thể cố gọi domain công cộng.

Phương án khuyến nghị:

1. Dùng **same-origin API** cho trình duyệt.
2. Public và LAN đều phục vụ frontend tại `/`.
3. Reverse proxy chuyển `/api/*` và `/socket.io/*` sang Backend `3100`.
4. Frontend gọi API bằng đường dẫn tương đối, ví dụ `/api/auth/login`.

Kết quả:

```text
Online:  https://tenmien.vn/api/* -> Backend
Offline: http://IP_MAY_CHU/api/*  -> Backend
```

Một bản build frontend có thể hoạt động ở cả hai mode mà không đổi cấu hình.

Phương án thay thế là dùng `api.tenmien.vn` và thiết lập split DNS trong LAN. Cách này phức tạp hơn, phụ thuộc router/DNS nội bộ và không được chọn làm mặc định.

## 5. Thiết kế domain và DNS

### 5.1 Hostname đề xuất

| Hostname | Mục đích | Bắt buộc |
|---|---|---|
| `tenmien.vn` | Giao diện và API same-origin | Có |
| `www.tenmien.vn` | Redirect về domain chính | Nên có |
| `api.tenmien.vn` | Chẩn đoán hoặc tương thích cũ | Không bắt buộc |

### 5.2 Cloudflare

1. Thêm domain vào Cloudflare.
2. Đổi nameserver tại nhà đăng ký domain theo nameserver Cloudflare cung cấp.
3. Chờ Cloudflare xác nhận domain active.
4. Tạo Cloudflare Tunnel cho máy chủ Windows.
5. Tạo public hostname trỏ về dịch vụ local.

Ví dụ ingress khuyến nghị:

```yaml
ingress:
  - hostname: tenmien.vn
    path: ^/api/.*
    service: http://localhost:3100

  - hostname: tenmien.vn
    path: ^/socket.io/.*
    service: http://localhost:3100

  - hostname: tenmien.vn
    service: http://localhost:3200

  - service: http_status:404
```

Lưu ý: cú pháp ingress thực tế phải được kiểm tra bằng phiên bản `cloudflared` cài trên máy trước khi chạy production.

### 5.3 Dịch vụ Windows

`cloudflared` đang chạy dưới dạng Windows Service với startup type `Automatic`.

Backend và Frontend chạy dưới hai Windows Scheduled Task:

- `UngPhoNhanh-Backend`: chạy Backend production tại cổng `3100`.
- `UngPhoNhanh-Frontend`: chạy Frontend production tại cổng `3200`.

Hai task chạy dưới tài khoản `SYSTEM`, được kích hoạt lúc Windows khởi động và không cần người dùng đăng nhập. Script giám sát tự chạy lại Node sau 10 giây nếu tiến trình thoát. Cài hoặc cập nhật task bằng PowerShell Administrator:

```powershell
.\infrastructure\windows\install-autostart-tasks.ps1
```

Log vận hành được ghi tại `C:\ProgramData\UngPhoNhanh\logs`.

Thông tin xác thực tunnel:

- Không commit tunnel token, `cert.pem` hoặc file credentials JSON vào Git.
- Chỉ tài khoản quản trị máy chủ được đọc các file này.
- Sao lưu thông tin cần thiết vào nơi quản lý bí mật của đơn vị.

Tài liệu tham chiếu:

- Cloudflare Tunnel: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/>
- Published applications: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/>
- Ingress configuration: <https://developers.cloudflare.com/tunnel/advanced/local-management/configuration-file/>

## 6. Mạng LAN và truy cập offline

### 6.1 Chuẩn bị mạng

- Gán IP LAN cố định cho máy chủ, ví dụ `192.168.1.10`.
- Có thể đặt hostname nội bộ, ví dụ `safestock-server`.
- Cho phép máy người dùng truy cập cổng reverse proxy nội bộ.
- Không cho VLAN khách truy cập máy chủ.
- Không mở các cổng dữ liệu/AI cho toàn bộ LAN nếu không cần.

### 6.2 Reverse proxy nội bộ

Chạy Caddy hoặc Nginx trên máy chủ để thống nhất đường dẫn:

```text
http://192.168.1.10/              -> Frontend :3200
http://192.168.1.10/api/*         -> Backend :3100
http://192.168.1.10/socket.io/*   -> Backend :3100
```

Đây là đường truy cập dự phòng khi Internet hoặc Cloudflare không hoạt động.

### 6.3 Phát hiện mode

- Trình duyệt online: dùng OSM.
- Trình duyệt phát sự kiện offline: chuyển tile cục bộ.
- Nếu Internet chập chờn nhưng `navigator.onLine` vẫn báo online, cần bổ sung health check tile hoặc nút chọn lớp offline thủ công.
- AI provider không đổi theo trạng thái mạng; luôn là Ollama.

## 7. Cấu hình môi trường production

### 7.1 Backend

```env
API_PORT=3100
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=<chuoi-ngau-nhien-dai>
JWT_REFRESH_SECRET=<chuoi-ngau-nhien-khac>
AI_SERVICE_URL=http://127.0.0.1:8000
```

Khi tách máy AI:

```env
AI_SERVICE_URL=http://IP_MAY_AI:8000
```

### 7.2 AI Service

```env
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen3.5:4b
OLLAMA_URL=http://127.0.0.1:11434
```

### 7.3 Frontend

Sau khi hoàn thiện same-origin API:

```env
NEXT_PUBLIC_API_URL=
```

Hoặc bỏ biến này và để API client dùng origin hiện tại của trình duyệt. Không dùng `localhost:3100` trong production build dành cho máy người dùng.

### 7.4 Quản lý secret

- Không dùng giá trị `change_me_*`.
- Hai JWT secret phải khác nhau và đủ dài.
- Không commit `.env`.
- Đổi toàn bộ mật khẩu demo trước khi vận hành thật.
- Lưu bản khôi phục secret ở nơi có kiểm soát truy cập.

## 8. Bảo mật

Auth/JWT hiện có tiếp tục là lớp bảo vệ API nghiệp vụ. Kế hoạch này không thay thế Auth, nhưng cần hoàn thiện lớp mạng trước khi public.

### 8.1 Bắt buộc trước khi mở domain

- [ ] Giới hạn CORS về domain chính và địa chỉ LAN được phép.
- [ ] Xác thực JWT trong Socket.IO handshake; không tin role/warehouse do client tự khai.
- [ ] Kiểm tra quyền endpoint mô phỏng và quản trị.
- [ ] Không public `5432`, `6379`, `8000`, `11434`.
- [ ] Chỉ Cloudflare Tunnel/reverse proxy được tiếp cận Frontend và Backend.
- [ ] Bật Windows Firewall và giới hạn rule theo nhu cầu.
- [x] Đổi tài khoản demo hoặc tắt đăng nhập demo.
- [ ] Bật log đăng nhập, thao tác quản trị và lỗi hệ thống.

### 8.2 Tăng cường sau pilot

- Cloudflare Access cho trang quản trị nếu phù hợp quy trình đơn vị.
- Rate limit cho đăng nhập và endpoint AI.
- Chính sách mật khẩu và khóa tạm khi đăng nhập sai nhiều lần.
- Quét dependency định kỳ.
- Kiểm tra thời gian hết hạn token và cơ chế thu hồi tài khoản.

## 9. Phần cứng và độ sẵn sàng

### 9.1 Máy chủ một máy giai đoạn pilot

Khuyến nghị thực tế, cần benchmark lại trên thiết bị mua:

- CPU từ 4 nhân thực hoặc tương đương.
- RAM tối thiểu 16 GB; 32 GB thuận lợi hơn khi chạy đồng thời Ollama, Docker và database.
- SSD còn trống tối thiểu 100 GB cho model, database, log và backup tạm.
- LAN Gigabit.
- UPS để tránh mất điện đột ngột.
- Tắt sleep/hibernate khi máy đang làm server.

### 9.2 Máy AI riêng

- RAM/VRAM chọn theo model quantization thực tế.
- GPU không bắt buộc với 4B nhưng giúp giảm thời gian phản hồi.
- Chỉ chấp nhận cấu hình sau khi chạy bộ đánh giá Ollama và đo tải đồng thời.
- Mục tiêu pilot: câu trả lời thường hoàn tất trong thời gian người dùng chấp nhận được; ngưỡng cụ thể được chốt sau benchmark.

## 10. Khởi động tự động và vận hành

Sau khi Windows khởi động, các dịch vụ phải tự chạy theo thứ tự:

1. PostgreSQL và Redis.
2. Ollama.
3. AI Service.
4. Backend.
5. Frontend.
6. Reverse proxy nội bộ.
7. Cloudflare Tunnel.

Mỗi dịch vụ cần:

- Tự restart khi lỗi.
- Ghi log vào thư mục có giới hạn dung lượng.
- Có health check.
- Không cần người dùng đăng nhập Windows để chạy.

Health check tối thiểu:

```text
Backend:    http://localhost:3100/api/health
AI Service: http://localhost:8000/health
Frontend:   http://localhost:3200
Ollama:     kiểm tra API nội bộ hoặc chạy prompt ngắn
```

## 11. Sao lưu và khôi phục

### 11.1 Dữ liệu cần sao lưu

- PostgreSQL.
- File cấu hình production, không ghi secret vào Git.
- Cloudflare Tunnel credentials.
- Tài liệu vị trí kho và dữ liệu pin tọa độ.
- Log audit theo thời gian lưu trữ được phê duyệt.

### 11.2 Chính sách tối thiểu

- Backup database hằng ngày.
- Giữ ít nhất ba bản gần nhất.
- Có một bản nằm ngoài ổ đĩa máy chủ.
- Mã hóa bản backup có dữ liệu thật.
- Mỗi tháng thử restore vào database thử nghiệm.

### 11.3 Mục tiêu khôi phục pilot

- Có tài liệu dựng lại máy từ đầu.
- Có thể khôi phục database từ bản backup gần nhất.
- Có thể chạy lại hệ thống LAN dù Cloudflare chưa phục hồi.

## 12. Kế hoạch thực hiện theo giai đoạn

### Phase 0 - Chốt thông tin triển khai

- [x] Ghi nhận domain `ungphonhanh.life`, đăng ký tại Mắt Bão.
- [x] Chọn một máy `PLAT1NER` cho pilot; chưa mua VPS và chưa tách máy AI.
- [x] Xác nhận Windows 11, Intel Core i7-10750H và RAM 16 GB; còn kiểm tra dung lượng trống trước deploy.
- [ ] Xác nhận router/LAN và IP nội bộ cố định.
- [ ] Chốt danh sách người dùng thật và phạm vi kho.
- [x] Tạo tài khoản Cloudflare và đổi nameserver tại Mắt Bão thành công.

**Tiêu chí hoàn thành:** có sơ đồ mạng, thông tin domain và người chịu trách nhiệm vận hành.

### Phase 1 - Hoàn thiện code cho online/offline thật

- [x] Chuyển API client frontend sang same-origin khi truy cập bằng HTTPS/domain.
- [x] Route `/api/*` và `/socket.io/*` tới Backend qua Cloudflare Tunnel.
- [ ] Giới hạn CORS theo cấu hình môi trường.
- [ ] Hoàn thiện xác thực WebSocket.
- [ ] Bổ sung trạng thái/nút fallback bản đồ offline khi tile online lỗi.
- [ ] Thêm kiểm thử cho URL online, URL LAN và Socket.IO.

**Tiêu chí hoàn thành:** cùng một bản build hoạt động bằng domain và IP LAN.

### Phase 2 - Chuẩn hóa máy chủ

- [ ] Cài runtime, Docker và Ollama.
- [ ] Tải trước model Qwen để không phụ thuộc Internet lúc chạy.
- [ ] Tạo production `.env` ngoài Git.
- [ ] Đồng bộ Prisma schema và seed dữ liệu được duyệt.
- [x] Cấu hình Backend và Frontend tự khởi động; AI Service/Ollama và Docker cần nghiệm thu riêng sau reboot.
- [ ] Cấu hình firewall.

**Tiêu chí hoàn thành:** rút Internet vẫn đăng nhập, xem dữ liệu và hỏi AI trong LAN được.

### Phase 3 - Domain và Cloudflare Tunnel

- [x] Thêm domain vào Cloudflare.
- [x] Đổi nameserver.
- [x] Cài `cloudflared` trên máy chủ.
- [x] Tạo tunnel và ingress rules.
- [x] Chạy tunnel dưới dạng Windows Service.
- [x] Kiểm tra HTTPS và WebSocket qua domain.

**Tiêu chí hoàn thành:** truy cập domain từ mạng 4G/5G ngoài cơ quan thành công.

### Phase 4 - Kiểm thử nghiệm thu

- [ ] Test online đầy đủ.
- [ ] Rút dây Internet và test offline đầy đủ.
- [ ] Cắm lại Internet, xác nhận hệ thống tự phục hồi online.
- [ ] Test restart máy chủ.
- [ ] Test nhiều người dùng hỏi AI đồng thời.
- [ ] Test backup và restore.
- [ ] Quét cổng public từ bên ngoài.

**Tiêu chí hoàn thành:** đạt toàn bộ checklist tại Mục 13.

### Phase 5 - Tách máy AI khi cần

- [ ] Chuẩn bị máy AI và IP LAN tĩnh.
- [ ] Chuyển AI Service/Ollama sang máy AI.
- [ ] Chỉ cho IP máy ứng dụng truy cập cổng `8000`.
- [ ] Đổi `AI_SERVICE_URL` trên Backend.
- [ ] Đo lại độ trễ và tải đồng thời.
- [ ] Giữ phương án quay lại cấu hình một máy.

**Tiêu chí hoàn thành:** AI chạy trên máy riêng, không public, Backend gọi ổn định qua LAN.

## 13. Checklist nghiệm thu

### 13.1 Online

- [x] `https://ungphonhanh.life` có HTTPS hợp lệ.
- [ ] Đăng nhập và refresh token hoạt động.
- [ ] Dashboard, kho, nhiệm vụ, mượn-trả và hậu kiểm hoạt động.
- [ ] Socket.IO hoạt động qua tunnel.
- [ ] Bản đồ dùng lớp online.
- [ ] Trợ lý trả lời bằng Ollama local.
- [ ] Không có request trực tiếp từ trình duyệt tới `8000` hoặc `11434`.

### 13.2 Offline

- [ ] Ngắt Internet hoàn toàn.
- [ ] Truy cập được bằng IP/hostname LAN.
- [ ] Đăng nhập bằng tài khoản đã có trong database.
- [ ] API không gọi domain công cộng.
- [ ] Bản đồ hiển thị tile cục bộ.
- [ ] Ollama trả lời bình thường.
- [ ] Dữ liệu nhập mới được lưu vào PostgreSQL local.

### 13.3 Bảo mật và vận hành

- [ ] Chỉ cổng dự kiến xuất hiện từ Internet.
- [ ] Ollama, AI Service, PostgreSQL và Redis không public.
- [ ] JWT secret production đã thay.
- [x] Tài khoản demo đã thay hoặc vô hiệu hóa.
- [ ] Restart máy không cần chạy thủ công từng dịch vụ.
- [ ] Backup tự động chạy và restore thử thành công.
- [ ] Có người phụ trách nhận cảnh báo và xử lý sự cố.

## 14. Kịch bản sự cố và xử lý

| Sự cố | Ảnh hưởng | Xử lý dự kiến |
|---|---|---|
| Mất Internet | Không truy cập domain/bản đồ online | Dùng URL LAN và tile offline; AI vẫn local |
| Cloudflare Tunnel dừng | Không truy cập từ ngoài | Restart service; LAN không bị ảnh hưởng |
| Ollama dừng | Trợ lý AI không trả lời | Restart Ollama; nghiệp vụ kho vẫn hoạt động |
| AI Service dừng | Backend không gọi được AI | Restart AI Service; hiển thị lỗi thân thiện |
| PostgreSQL dừng | Phần lớn nghiệp vụ dừng | Restart DB, kiểm tra ổ đĩa và restore nếu cần |
| Máy chủ mất điện | Toàn hệ thống dừng | UPS, tự boot và tự chạy dịch vụ |
| Ổ đĩa hỏng | Có thể mất dữ liệu | Thay ổ và restore từ backup ngoài máy |
| Máy AI riêng hỏng | Mất tính năng AI | Tạm chuyển AI Service/Ollama về máy ứng dụng |

## 15. Thứ tự ưu tiên

1. **P0:** cùng một frontend chạy được bằng domain và LAN.
2. **P0:** không public Ollama, database, Redis hoặc AI Service.
3. **P0:** rút Internet vẫn đăng nhập, thao tác kho và hỏi AI được.
4. **P1:** dịch vụ tự khởi động và có backup restore được.
5. **P1:** hoàn thiện WebSocket auth và giới hạn CORS.
6. **P2:** tách máy AI sau khi pilot chứng minh cần thiết.

## 16. Quyết định đã thống nhất

- Mua domain là hợp lý và domain được dùng cho truy cập online.
- Domain đã mua là `ungphonhanh.life` tại Mắt Bão.
- Máy `PLAT1NER` của người cài source code là máy chủ pilot.
- Chưa mua VPS; chưa dùng Vercel hoặc Railway trong pilot.
- Online và offline đều dùng Ollama local.
- Auth/JWT hiện có tiếp tục bảo vệ API nghiệp vụ.
- Offline dùng LAN và tile bản đồ cục bộ.
- PostgreSQL 16 và Redis 7 tiếp tục chạy local bằng Docker.
- Supabase không phải database chính; chỉ cân nhắc cho backup mã hóa ngoài máy.
- Production có thể tách một máy AI riêng, nhưng không bắt buộc cho pilot.
- Cloudflare Tunnel là phương án ưu tiên để tránh IP tĩnh và port forwarding.

## 17. Câu hỏi còn mở

- Domain có thể chuyển nameserver sang Cloudflare không?
- Máy `PLAT1NER` còn bao nhiêu dung lượng SSD trống cho model, database, log và backup tạm?
- Router hiện tại có hỗ trợ IP LAN tĩnh/DHCP reservation không?
- Đơn vị có yêu cầu người dùng ngoài cơ quan phải qua VPN hoặc Cloudflare Access không?
- Thời gian lưu backup và audit log cần bao lâu?

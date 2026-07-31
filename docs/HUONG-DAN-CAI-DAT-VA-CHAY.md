# Hướng dẫn cài đặt và chạy Ứng phó nhanh

Tài liệu này dành cho người mới clone repository để chạy trên Windows. Domain và Cloudflare không bắt buộc khi phát triển local.

## 1. Yêu cầu

Cài các công cụ sau trước khi clone:

- Git.
- Node.js 20 trở lên.
- pnpm 10 trở lên.
- Docker Desktop, dùng Linux containers.
- Python 3.11 trở lên.
- Ollama cùng hai model `qwen3.5:4b` (sinh câu trả lời) và `nomic-embed-text` (RAG/truy hồi tri thức) nếu dùng AI local.

Kiểm tra nhanh:

```powershell
git --version
node --version
pnpm --version
docker version
python --version
ollama --version
```

Nếu máy chưa có pnpm, có thể bật Corepack đi kèm Node.js:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

## 2. Clone và cài dependency

```powershell
git clone https://github.com/khoidev2001/safestock-x.git
cd safestock-x
pnpm install
```

Chạy mọi lệnh còn lại từ thư mục gốc repository, trừ khi tài liệu ghi rõ thư mục khác.

## 3. Tạo cấu hình môi trường

Tạo file `.env` từ mẫu, chỉnh giá trị, rồi sao chép cho Prisma seed:

```powershell
Copy-Item .env.example .env
notepad .env
Copy-Item .env apps/backend/.env
```

Các giá trị bắt buộc và mô tả nằm trong [`.env.example`](../.env.example). Trước khi chạy cần:

- Đổi `POSTGRES_PASSWORD` và cập nhật cùng mật khẩu trong `DATABASE_URL`.
- Thay `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` bằng hai chuỗi ngẫu nhiên dài, khác nhau.
- Giữ `SIMULATION_MUTATION_ENABLED=false` theo mặc định. Chỉ đặt `true` trên
  môi trường local đáng tin cậy khi chủ động gửi sự kiện từ app desktop, rồi
  restart backend.
- Giữ `AI_PROVIDER=ollama` nếu AI phải chạy local.
- Giữ `OLLAMA_MODEL=qwen3.5:4b` và `OLLAMA_EMBED_MODEL=nomic-embed-text` nếu đã tải hai model này.

Không commit `.env`, `apps/backend/.env`, API key hoặc tunnel credentials vào Git.

Mỗi khi thay cấu hình database trong `.env`, đồng bộ lại bản dùng bởi Prisma:

```powershell
Copy-Item .env apps/backend/.env -Force
```

## 4. Khởi động PostgreSQL và Redis

Mở Docker Desktop, chờ Docker Engine sẵn sàng rồi chạy:

```powershell
pnpm infra:up
docker ps
```

Hai container cần ở trạng thái chạy:

- `safestock_postgres`
- `safestock_redis`

Xem log khi có lỗi:

```powershell
pnpm infra:logs
```

## 5. Tạo schema và dữ liệu ban đầu

### 5.1. Nâng schema cho database đã có dữ liệu

Sau mỗi lần pull code có thay đổi `apps/backend/prisma/schema.prisma`, chạy:

```powershell
pnpm be:schema:diff
pnpm be:schema
```

`be:schema:diff` in SQL dự kiến để kiểm tra trước. Với bản cập nhật hồ sơ ngày 2026-07-22, database cũ chỉ nên có ba lệnh thêm cột nullable `User.phone`, `User.notificationEmail` và `User.avatarUrl`. Nếu output có drop cột/bảng, đổi kiểu hoặc thay đổi unrelated, dừng lại và kiểm tra đúng `DATABASE_URL` cùng schema drift trước khi push.

`be:schema` chạy `prisma db push --skip-generate`, không chạy seed. Backup database đang vận hành trước khi áp dụng thay đổi schema.

Nếu code mới cần generate lại Prisma Client, dừng backend trước rồi chạy:

```powershell
pnpm be:generate
```

Trên Windows, generate khi backend đang chạy có thể lỗi `EPERM` vì tiến trình Node đang khóa Prisma query-engine DLL. Việc này không liên quan đến trạng thái cột trong PostgreSQL.

Đọc kỹ output của Prisma trước khi xác nhận nếu một thay đổi tương lai có cảnh báo mất dữ liệu. Không dùng `--accept-data-loss` trên database đang vận hành nếu chưa backup và duyệt thay đổi.

### 5.2. Tạo mới hoặc chủ động reset dữ liệu local

Chỉ chạy bước này khi tạo database mới hoặc chủ động muốn làm lại dữ liệu local:

```powershell
pnpm --filter @safestock/backend prisma:generate
pnpm be:db
```

> **Cảnh báo:** lệnh seed gọi `resetDatabase()` trong [`apps/backend/prisma/seed.ts`](../apps/backend/prisma/seed.ts). Nó xóa dữ liệu nghiệp vụ, người dùng và mật khẩu hiện có trước khi tạo lại bộ dữ liệu local. Không chạy `pnpm be:db` trên database đang vận hành hoặc đã có dữ liệu cần giữ.

Tài khoản local sau seed được ghi trong [Hướng dẫn kiểm thử](HUONG-DAN-TEST.md). Các mật khẩu đó chỉ dành cho development. Trước khi mở domain Internet, đăng nhập ADMIN, vào **Tài khoản** và đổi toàn bộ mật khẩu demo.

## 6. Chuẩn bị Ollama và AI Service

Tải model một lần:

```powershell
ollama pull qwen3.5:4b
ollama pull nomic-embed-text
ollama list
```

`knowledge_index.json` đã có sẵn trong repo nên không cần vector hóa lại corpus khi cài máy mới. Tuy nhiên,
`nomic-embed-text` vẫn bắt buộc ở runtime để vector hóa **câu hỏi**.

Tạo Python virtual environment, cài dependency và kiểm index/corpus không bị stale:

```powershell
cd apps/ai-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\build_knowledge_index.py --check
cd ..\..
```

AI Service đọc cấu hình từ `.env` ở thư mục gốc. Ollama phải đang chạy tại địa chỉ trong `OLLAMA_URL`.

## 7. Chạy development

Mở ba cửa sổ PowerShell tại thư mục gốc.

Terminal 1 - Backend:

```powershell
pnpm be:dev
```

Terminal 2 - Frontend:

```powershell
pnpm fe:dev
```

Terminal 3 - AI Service:

```powershell
pnpm ai:dev
```

Địa chỉ kiểm tra:

| Thành phần | Địa chỉ |
|---|---|
| Frontend | <http://localhost:3200> |
| Backend health | <http://localhost:3100/api/health> |
| AI health | <http://localhost:8000/health> |
| Ollama | <http://localhost:11434> |

Backend health hợp lệ phải trả `status: "ok"`. AI health phải trả `status: "ok"` và provider `ollama`.

### 7.1. Gửi snapshot cảm biến đã xác nhận bằng app desktop

Không có runtime, database hay kịch bản demo riêng. Trên máy local, đặt
`SIMULATION_MUTATION_ENABLED=true` trong `.env`, restart backend, sau đó chạy:

```powershell
pnpm desktop:dev
```

Đăng nhập bằng `ungphonhanh.life` khi qua Internet; khi Internet ngoài mất nhưng
LAN còn, dùng hostname/IP backend LAN (hoặc vẫn dùng cùng domain nếu DNS nội bộ đã
split-horizon). Kéo slider chỉ sửa bản nháp. Bấm **Xác nhận và gửi** mới tạo một
snapshot idempotent chứa các thông số đã đổi.

App lưu snapshot vào hàng chờ cục bộ trước khi gọi API, nên khi mất đường tới backend
nó sẽ được gửi lại an toàn khi có kết nối. Policy ngưỡng đã cache làm chuông cục bộ
kêu ngay sau xác nhận vượt ngưỡng; chuông chỉ dừng bằng nút **Tắt chuông**. Backend
lưu lịch sử cảm biến, Incident và email outbox; email chưa gửi được sẽ retry với
`observedAt`, `receivedAt`, `sentAt` tách bạch. Đặt cờ về `false` rồi restart backend
khi không còn cần thao tác này.

Không chạy `pnpm be:db` để làm sạch sau thử nghiệm trên database đang dùng:
lệnh seed sẽ reset dữ liệu. Nếu schema thay đổi, trước hết xem SQL từ
`pnpm be:schema:diff`; không áp dụng lệnh drop khi chưa backup và duyệt.

## 8. Dừng development

Nhấn `Ctrl+C` trong ba terminal ứng dụng. Khi không cần database local nữa:

```powershell
pnpm infra:down
```

Lệnh này dừng container nhưng giữ dữ liệu trong Docker volumes. Không xóa volume nếu chưa có backup.

## 9. Build production trên Windows

Đảm bảo database, Redis và `.env` đã sẵn sàng:

```powershell
pnpm install --frozen-lockfile
pnpm be:generate
pnpm be:schema
pnpm --filter @safestock/backend build
pnpm --filter @safestock/frontend build
```

Kiểm tra thủ công trước khi cài tự khởi động:

```powershell
cd apps/backend
node dist/src/main.js
```

Trong terminal khác tại thư mục gốc:

```powershell
pnpm --filter @safestock/frontend start
```

## 10. Cài Backend, Frontend và AI Service tự khởi động

Build production trước, sau đó mở PowerShell bằng **Run as administrator** và chạy:

```powershell
cd "D:\duong-dan-den\safestock-x"
.\infrastructure\windows\install-autostart-tasks.ps1
Start-ScheduledTask -TaskName "UngPhoNhanh-Backend"
Start-ScheduledTask -TaskName "UngPhoNhanh-Frontend"
Start-ScheduledTask -TaskName "UngPhoNhanh-EdgeProxy"
Start-ScheduledTask -TaskName "UngPhoNhanh-AiService"
```

Task chạy bằng tài khoản `SYSTEM`, khởi động cùng Windows và tự chạy lại Node/Python sau 10 giây nếu tiến trình thoát. Kiểm tra:

```powershell
Get-ScheduledTask -TaskName "UngPhoNhanh-*" | Select-Object TaskName, State
```

Log nằm tại:

```text
C:\ProgramData\UngPhoNhanh\logs\backend.log
C:\ProgramData\UngPhoNhanh\logs\frontend.log
C:\ProgramData\UngPhoNhanh\logs\edge-proxy.log
C:\ProgramData\UngPhoNhanh\logs\ai-service.log
```

Các script thực thi là nguồn cấu hình chính:

- [`infrastructure/windows/install-autostart-tasks.ps1`](../infrastructure/windows/install-autostart-tasks.ps1)
- [`infrastructure/windows/run-backend.ps1`](../infrastructure/windows/run-backend.ps1)
- [`infrastructure/windows/run-frontend.ps1`](../infrastructure/windows/run-frontend.ps1)
- [`infrastructure/windows/run-edge-proxy.ps1`](../infrastructure/windows/run-edge-proxy.ps1)
- [`infrastructure/windows/run-ai-service.ps1`](../infrastructure/windows/run-ai-service.ps1)

Các task trên chưa quản lý Docker Desktop hoặc Ollama. Máy production phải cấu hình hai thành phần đó tự chạy riêng và nghiệm thu bằng một lần restart Windows.

## 11. Domain và Cloudflare

Clone repository không cần dùng chung tunnel của máy khác. Mỗi máy chủ phải tạo tunnel và credentials riêng; không sao chép hoặc commit `cert.pem` và file tunnel JSON.

Với deployment Vercel public và LAN dùng cùng `https://ungphonhanh.life`, làm theo
[runbook hybrid cùng domain](HYBRID-DOMAIN-RUNBOOK.md). Kiến trúc, ingress và
checklist domain nằm trong [PRD + checklist + kế hoạch cuối](PRD.md#p3---hardening-và-nghiệm-thu-pilot).

## 12. Kiểm tra trước khi bàn giao

```powershell
pnpm --filter @safestock/backend test -- --runInBand
pnpm --filter @safestock/backend build
pnpm --filter @safestock/frontend build
```

Sau đó thực hiện bộ kiểm thử thủ công tại [HUONG-DAN-TEST.md](HUONG-DAN-TEST.md).

Trước khi public:

- Đổi toàn bộ mật khẩu demo.
- Đổi JWT secrets và mật khẩu PostgreSQL.
- Không public PostgreSQL, Redis, AI Service hoặc Ollama.
- Chỉ route Frontend, `/api/*` và `/socket.io/*` qua reverse proxy hoặc Cloudflare Tunnel.
- Bật HTTPS, 2FA Cloudflare và backup database.

## 13. Lỗi thường gặp

### Backend health báo `degraded`

Kiểm tra Docker và hai cổng trong `.env`:

```powershell
docker ps
docker logs safestock_postgres --tail 50
docker logs safestock_redis --tail 50
```

### Frontend đăng nhập báo không kết nối được

Kiểm tra Backend có nghe cổng `3100`:

```powershell
Get-NetTCPConnection -LocalPort 3100 -State Listen
Invoke-RestMethod http://localhost:3100/api/health
```

### Trợ lý AI không phản hồi

```powershell
ollama list
Invoke-RestMethod http://localhost:8000/health
```

Nếu model chưa có, chạy lại `ollama pull qwen3.5:4b`. Nếu AI Service chưa chạy, kiểm tra terminal `pnpm ai:dev`.

### Cổng `3100` hoặc `3200` đã bị chiếm

```powershell
Get-NetTCPConnection -LocalPort 3100,3200 -State Listen
```

Dừng đúng tiến trình development cũ hoặc task Windows tương ứng; không kết thúc tiến trình khi chưa xác định PID thuộc ứng dụng nào.

### Đăng nhập demo không còn đúng

Mật khẩu có thể đã được ADMIN đổi sau khi seed. Không chạy seed để lấy lại mật khẩu trên database có dữ liệu thật; dùng chức năng đổi mật khẩu tại mục **Tài khoản** hoặc quy trình khôi phục được quản trị viên phê duyệt.

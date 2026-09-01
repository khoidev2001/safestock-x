# Cài đặt từ mã nguồn

Hướng dẫn dựng hệ thống trên máy mới sau khi `git clone`.

> **Vì sao cần tài liệu này.** Repo **không chứa** `node_modules/` và `apps/ai-service/.venv/`.
> Đó là thư viện phụ thuộc được tải về, không phải mã nguồn — và riêng `.venv` với PyTorch
> bản CUDA nặng hơn 3 GB, vượt giới hạn 100 MB mỗi tệp của GitHub. Cả hai dựng lại được
> bằng lệnh trong tài liệu này, đúng phiên bản đã khóa trong `pnpm-lock.yaml`
> và `requirements.txt`.
>
> Đang tìm hướng dẫn *sử dụng* và tài khoản dùng thử? Xem
> [HUONG-DAN-DUNG-THU-VA-CAI-DAT.md](HUONG-DAN-DUNG-THU-VA-CAI-DAT.md).

---

## Mục lục

1. [Cần cài trước](#1-cần-cài-trước)
2. [Cài nhanh — 6 lệnh](#2-cài-nhanh--6-lệnh)
3. [Từng bước chi tiết](#3-từng-bước-chi-tiết)
4. [Chạy hệ thống](#4-chạy-hệ-thống)
5. [Phần tùy chọn](#5-phần-tùy-chọn)
6. [Kiểm tra cài đặt thành công](#6-kiểm-tra-cài-đặt-thành-công)
7. [Lỗi thường gặp](#7-lỗi-thường-gặp)
8. [Gỡ và cài lại](#8-gỡ-và-cài-lại)

---

## 1. Cần cài trước

| Phần mềm | Phiên bản | Bắt buộc | Ghi chú |
|---|---|---|---|
| **Node.js** | `>= 20` | ✅ | Bản LTS |
| **pnpm** | `>= 10` | ✅ | Repo khóa ở `pnpm@10.32.1` |
| **Docker Desktop** | mới nhất | ✅ | Chạy PostgreSQL và Redis |
| **Git** | bất kỳ | ✅ | |
| **Python** | `3.11`–`3.13` | ⬜ | Chỉ khi cần dịch vụ AI |
| **Ollama** | mới nhất | ⬜ | Chỉ khi cần AI chạy tại chỗ |
| **Android Studio** | mới nhất | ⬜ | Chỉ khi tự dựng APK |

Cài `pnpm` đúng phiên bản đã khóa:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
```

Kiểm tra:

```bash
node -v      # v20.x trở lên
pnpm -v      # 10.32.1
docker -v
```

---

## 2. Cài nhanh — 6 lệnh

Dành cho người đã có đủ công cụ ở mục 1. Chi tiết từng bước ở mục 3.

```powershell
git clone https://github.com/khoidev2001/safestock-x.git
cd safestock-x

pnpm install                      # 1. Dựng lại node_modules
Copy-Item .env.example .env       # 2. Tạo file cấu hình
pnpm infra:up                     # 3. Bật PostgreSQL + Redis
pnpm be:db                        # 4. Tạo bảng + nạp dữ liệu mẫu
pnpm dev:all                      # 5. Chạy backend + web + AI
```

Trên macOS/Linux đổi lệnh thứ 2 thành `cp .env.example .env`.

---

## 3. Từng bước chi tiết

### 3.1. Tải mã nguồn

```bash
git clone https://github.com/khoidev2001/safestock-x.git
cd safestock-x
```

### 3.2. Dựng lại `node_modules`

```bash
pnpm install
```

Lệnh này cài cho **toàn bộ 6 workspace** cùng lúc (`backend`, `frontend`, `mobile`, `desktop`, `shared-types`, `scenario-definitions`) theo đúng phiên bản trong `pnpm-lock.yaml`.

Lần đầu mất khoảng 3–6 phút. Dùng `pnpm install`, **không dùng `npm install` hay `yarn`** — repo là pnpm workspace, hai công cụ kia sẽ dựng sai cấu trúc liên kết giữa các gói.

### 3.3. Tạo file cấu hình

```powershell
Copy-Item .env.example .env
```

`.env.example` đã có sẵn giá trị chạy được cho môi trường phát triển. **Không cần sửa gì** để chạy thử lần đầu.

Những khóa cần điền khi dùng thật:

| Nhóm | Khóa | Khi nào cần |
|---|---|---|
| Bảo mật | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **Bắt buộc đổi trước khi chạy thật.** Mặc định là `change_me_*` |
| Cơ sở dữ liệu | `POSTGRES_PASSWORD` | Đổi trước khi chạy thật |
| AI đám mây | `GEMINI_API_KEY` | Chỉ khi đặt `AI_PROVIDER=gemini` |
| Thư cảnh báo | `SMTP_*`, `ALERT_EMAIL_*` | Chỉ khi bật `ALERT_EMAIL_ENABLED=true` |
| Sao lưu | `SUPABASE_*` | Chỉ khi dùng sao lưu lên đám mây |
| Bản đồ | `GOOGLE_MAPS_API_KEY` | Không bắt buộc — có định tuyến offline thay thế |

> `.env` nằm trong `.gitignore` và **không được commit**. Mỗi máy tự tạo từ `.env.example`.

### 3.4. Bật PostgreSQL và Redis

```bash
pnpm infra:up
```

Dựng hai container Docker:

| Dịch vụ | Ảnh | Cổng mặc định |
|---|---|---|
| PostgreSQL | `postgres:16-alpine` | `55433` |
| Redis | `redis:7-alpine` | `16379` |

Kiểm tra đã chạy:

```bash
docker ps
```

Phải thấy `safestock_postgres` và `safestock_redis` ở trạng thái `Up`.

### 3.5. Tạo cấu trúc dữ liệu và nạp dữ liệu mẫu

```bash
pnpm be:db
```

Lệnh này chạy ba việc liên tiếp:

1. `prisma generate` — sinh mã truy cập cơ sở dữ liệu
2. `prisma db push` — tạo 34 bảng theo lược đồ
3. `seed` — nạp dữ liệu mẫu của xã Đồng Xuân: 18 kho, danh mục vật tư, tài khoản mẫu

Sau khi xong, dữ liệu mẫu phải có **5 thôn kèm tọa độ đã xác minh** và 12 thôn để trống tọa độ.

### 3.6. Chuẩn bị dịch vụ AI *(tùy chọn)*

Bỏ qua bước này nếu chưa cần trợ lý AI, phân tích tình huống hay nhận dạng giọng nói. Hệ thống vẫn chạy đầy đủ phần nghiệp vụ kho.

```bash
cd apps/ai-service
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

**Về PyTorch — đọc kỹ chỗ này.**

`requirements.txt` **không ghim** phiên bản `torch`. Chọn bản phù hợp máy anh **trước** khi chạy `pip install -r requirements.txt`:

```bash
# Máy KHÔNG có GPU NVIDIA — nên chọn mặc định.
# Khoảng 200 MB, chạy được mọi máy, clip giọng nói ngắn đủ nhanh.
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Máy CÓ GPU NVIDIA và muốn nhanh hơn.
# Nặng hơn 3 GB vì đóng gói cả runtime CUDA.
# Chọn kênh khớp kiến trúc card: RTX 40xx → cu124, RTX 50xx → cu128
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

Nếu **không** cần nhận dạng giọng nói, bỏ hẳn khối `transformers` / `soundfile` / `numpy` — endpoint `/transcribe` trả về 503 và giao diện tự chuyển sang nhập tay.

### 3.7. Cài mô hình ngôn ngữ chạy tại chỗ *(tùy chọn)*

Cài [Ollama](https://ollama.com), rồi:

```bash
ollama pull qwen3.5:4b        # mô hình ngôn ngữ
ollama pull nomic-embed-text  # mô hình nhúng cho tìm kiếm ngữ nghĩa
```

Hai tên mô hình này khớp `OLLAMA_MODEL` và `OLLAMA_EMBED_MODEL` trong `.env.example`.

Muốn dùng AI đám mây thay vì chạy tại chỗ: đặt `AI_PROVIDER=gemini` và điền `GEMINI_API_KEY`.

---

## 4. Chạy hệ thống

### 4.1. Chạy tất cả bằng một lệnh

```bash
pnpm dev:all
```

### 4.2. Hoặc chạy từng phần ở các cửa sổ riêng

```bash
pnpm be:dev        # Máy chủ API   → http://localhost:3100/api
pnpm fe:dev        # Web vận hành  → http://localhost:3200
pnpm ai:dev        # Dịch vụ AI    → http://localhost:8000
pnpm desktop:dev   # App giả lập cảm biến (Electron)
pnpm mobile:dev    # Expo cho ứng dụng điện thoại
```

### 4.3. Các cổng

| Thành phần | Địa chỉ |
|---|---|
| Máy chủ API | `http://localhost:3100/api` |
| Kiểm tra sức khỏe | `http://localhost:3100/api/health` |
| Web vận hành | `http://localhost:3200` |
| Dịch vụ AI | `http://localhost:8000` · sức khỏe tại `/health` |
| Định tuyến OSRM | `http://localhost:5000` *(tùy chọn)* |
| Ollama | `http://localhost:11434` *(tùy chọn)* |

### 4.4. Dừng

Đóng các cửa sổ đang chạy, rồi:

```bash
pnpm infra:down
```

---

## 5. Phần tùy chọn

### 5.1. Định tuyến đường bộ chạy offline (OSRM)

Repo **không chứa** đồ thị OSRM đã dựng (khoảng 45 MB tệp nhị phân). Dựng lại:

```bash
pnpm osrm:fetch
pnpm osrm:build -- --source infrastructure/osrm/data/dong-xuan.osm --graph-version dong-xuan-YYYY-MM-DD
pnpm osrm:up
pnpm osrm:verify-live
```

Sau khi dựng, lấy đúng phiên bản từ tệp manifest sinh ra và đặt vào `LOCAL_ROUTING_GRAPH_VERSION` trong `.env`.

`osrm:up` luôn chạy preflight trước và **không khởi động** nếu artifact thiếu hoặc sai checksum.

### 5.2. Dựng APK Android

```bash
cd apps/mobile
# Đặt địa chỉ máy chủ trước khi dựng
pnpm exec expo prebuild
cd android && ./gradlew assembleRelease
```

Repo **không chứa** keystore ký bản phát hành. Tự tạo keystore riêng và khai vào `apps/mobile/android/keystore.properties`.

### 5.3. Gửi dữ liệu cảm biến từ app máy tính

Trong `.env` đặt `SIMULATION_MUTATION_ENABLED=true`, **khởi động lại backend**, rồi `pnpm desktop:dev`.

Kéo thanh trượt chỉ đổi bản nháp cục bộ. Bấm **Xác nhận và gửi** mới ghi dữ liệu thật.

---

## 6. Kiểm tra cài đặt thành công

```bash
curl http://localhost:3100/api/health
```

Kết quả mong đợi:

```json
{ "status": "ok", "services": { "database": "up", "redis": "up" } }
```

Rồi mở `http://localhost:3200` và đăng nhập bằng tài khoản mẫu trong
[HUONG-DAN-DUNG-THU-VA-CAI-DAT.md](HUONG-DAN-DUNG-THU-VA-CAI-DAT.md).

Chạy bộ kiểm thử tự động:

```bash
pnpm --filter @safestock/backend test    # kiểm thử máy chủ API
pnpm lint                                # kiểm tra tĩnh toàn workspace
```

---

## 7. Lỗi thường gặp

### Backend treo lúc khởi động, không báo lỗi

Cổng Redis rơi vào **dải cổng Windows giữ trước**. Windows chiếm sẵn một số dải TCP, và Docker map trúng dải đó thì kết nối treo im lặng.

Kiểm tra dải bị chiếm:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

`.env.example` đã đặt `REDIS_PORT=16379` để tránh. Nếu vẫn trúng, đổi sang cổng khác ngoài mọi dải trong danh sách trên.

### `pnpm desktop:dev` mở rồi tắt ngay

Terminal đang có biến `ELECTRON_RUN_AS_NODE` — shell tích hợp của VS Code hay đặt biến này, và nó làm Electron chạy như Node thay vì mở cửa sổ.

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
pnpm desktop:dev
```

### `pnpm install` báo lỗi phiên bản pnpm

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
```

### Cổng đã bị chiếm

Đổi trong `.env`: `API_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `OSRM_PORT`. Nhớ cập nhật `DATABASE_URL` và `REDIS_URL` cho khớp cổng mới.

### `pip install` lỗi khi cài PyTorch

Thường do chọn kênh không khớp phiên bản Python. PyTorch chưa có wheel cho các bản Python mới nhất — dùng Python 3.11–3.13. Phối hợp đã kiểm thử: `torch 2.13.0+cpu` · `transformers 5.14.1` · `soundfile 0.14.0` · `numpy 2.5.1`.

### Trợ lý AI trả về lỗi 503

Dịch vụ AI chưa chạy (`pnpm ai:dev`) hoặc Ollama chưa bật. Kiểm tra `http://localhost:8000/health` và `http://localhost:11434`.

Đây là suy giảm có chủ đích: phần nghiệp vụ kho vẫn chạy đầy đủ khi không có AI.

### Nhận dạng giọng nói trả về 503

Chưa cài khối `transformers` / `soundfile` / `numpy` trong `requirements.txt`. Giao diện tự chuyển sang nhập tay — đây là hành vi đúng, không phải lỗi.

---

## 8. Gỡ và cài lại

Khi `node_modules` hỏng hoặc muốn dựng lại từ đầu:

```powershell
# Xóa mọi node_modules trong workspace
Get-ChildItem -Path . -Filter node_modules -Recurse -Directory | Remove-Item -Recurse -Force
pnpm install
```

Xóa sạch dữ liệu và nạp lại từ đầu:

```bash
pnpm infra:down
docker volume rm safestock_pgdata safestock_redisdata
pnpm infra:up
pnpm be:db
```

Dựng lại môi trường Python:

```bash
cd apps/ai-service
rm -rf .venv          # Windows: Remove-Item .venv -Recurse -Force
python -m venv .venv
```

Rồi làm lại mục [3.6](#36-chuẩn-bị-dịch-vụ-ai-tùy-chọn).

---

## Những thư mục không có trong repo

Danh sách đầy đủ những gì `.gitignore` loại ra và cách dựng lại:

| Thư mục | Vì sao không commit | Dựng lại bằng |
|---|---|---|
| `node_modules/` | Thư viện tải về, khóa trong `pnpm-lock.yaml` | `pnpm install` |
| `apps/ai-service/.venv/` | PyTorch CUDA hơn 3 GB, vượt giới hạn 100 MB/tệp của GitHub | mục [3.6](#36-chuẩn-bị-dịch-vụ-ai-tùy-chọn) |
| `.env`, `*.env.local` | Chứa mật khẩu và khóa API | `cp .env.example .env` |
| `*.keystore`, `keystore.properties` | Khóa ký APK — lộ ra là không thu hồi được | Tự tạo keystore riêng |
| `infrastructure/osrm/data/` | Đồ thị định tuyến, dựng lại được và có kiểm checksum | mục [5.1](#51-định-tuyến-đường-bộ-chạy-offline-osrm) |
| `dist/`, `build/`, `.next/`, `out/`, `release/` | Kết quả biên dịch | các lệnh `build` |
| `__pycache__/`, `.pytest_cache/` | Bộ nhớ đệm Python | tự sinh |

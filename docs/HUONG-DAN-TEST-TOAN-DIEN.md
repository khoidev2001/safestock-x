# Hướng dẫn test toàn diện — Ứng phó nhanh (SafeStock)

> **Tài liệu này dành cho giám khảo / người tiếp nhận source.** Đọc một mạch từ trên
> xuống: từ lúc clone repo trống đến khi test xong **mọi thành phần** (backend, web,
> AI, mobile, desktop simulator, email cảnh báo, test tự động). Mỗi lệnh đều copy-paste
> chạy được trên Windows PowerShell.
>
> Tài liệu chi tiết sâu hơn (giữ nguyên, không thay thế):
>
> - [Test theo luồng ba ứng dụng](HUONG-DAN-TEST-3-UNG-DUNG.md) — kịch bản xuyên web ·
>   điện thoại · desktop, bám sát vai trò và luồng hiện tại. **Khi mâu thuẫn, lấy tài
>   liệu này làm chuẩn.**
> - [Hướng dẫn cài đặt và chạy](HUONG-DAN-CAI-DAT-VA-CHAY.md) — chi tiết từng cấu hình, production, autostart.
> - [Hướng dẫn kiểm thử theo UI](HUONG-DAN-TEST.md) — 11 ca test tính năng T01–T11 chi tiết.
> - [Bộ dữ liệu seed](SEED-DATASET.md) · [Báo cáo đánh giá dự thi](bao-cao-danh-gia-san-sang-du-thi.md).

---

## 0. Bản đồ hệ thống (đọc 1 phút trước khi bắt đầu)

Đây là **monorepo pnpm**, gồm 5 app + 2 package dùng chung:

| Thành phần | Thư mục | Công nghệ | Cổng mặc định |
|---|---|---|---|
| Backend API | `apps/backend` | NestJS + Prisma + PostgreSQL + Redis + Socket.IO | **3100** |
| Frontend web | `apps/frontend` | Next.js | **3200** |
| AI Service | `apps/ai-service` | FastAPI + Ollama (local) | **8000** |
| Mobile | `apps/mobile` | React Native + Expo | Expo (Metro) |
| Desktop simulator | `apps/desktop` | Electron (giả lập cảm biến kho) | — |
| Shared types | `packages/shared-types` | Contract dùng chung | — |

Desktop simulator dùng cùng backend/database đang cấu hình. Mặc định backend
không nhận mutation; chỉ bật `SIMULATION_MUTATION_ENABLED=true` trong `.env`
khi chủ động tạo sự kiện test, rồi restart backend. Sự kiện này có thể làm đổi
readiness, incident và email alert.

---

## 1. Yêu cầu công cụ

Cài trước khi bắt đầu:

- **Git**, **Node.js 20+**, **pnpm 10+**
- **Docker Desktop** (Linux containers) — cho PostgreSQL + Redis
- **Python 3.11+** — cho AI Service
- **Ollama** + 2 model: `qwen3.5:4b` (sinh câu trả lời) và `nomic-embed-text` (RAG) — chỉ cần nếu test AI local

Kiểm tra nhanh:

```powershell
git --version; node --version; pnpm --version; docker version; python --version; ollama --version
```

Nếu chưa có pnpm, bật Corepack đi kèm Node:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

---

## 2. Cài đặt (một lần)

```powershell
# 2.1 — Clone + cài dependency
git clone https://github.com/khoidev2001/safestock-x.git
cd safestock-x
pnpm install

# 2.2 — Tạo cấu hình môi trường
Copy-Item .env.example .env
notepad .env          # đổi POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
Copy-Item .env apps/backend/.env

# 2.3 — Bật PostgreSQL + Redis (Docker)
pnpm infra:up
docker ps             # phải thấy safestock_postgres + safestock_redis đang chạy

# 2.4 — Tạo schema + seed dữ liệu demo
pnpm --filter @safestock/backend prisma:generate
pnpm be:db            # = generate + push schema + seed
```

> ⚠️ `pnpm be:db` gọi `resetDatabase()` — **xóa sạch rồi seed lại**. Chỉ chạy trên DB
> mới/demo, không chạy trên DB có dữ liệu cần giữ.

**Kết quả seed đúng** (baseline để đối chiếu mọi test sau này):

| Dữ liệu | Số lượng |  | Dữ liệu | Số lượng |
|---|---:|---|---|---:|
| Kho trung tâm | 1 |  | Mặt hàng/SKU | 17 |
| Kho thôn | 17 |  | Lô hàng | 126 |
| Người dùng | 20 |  | Bản kiểm kê | 126 |
| Thiết bị ảo | 68 |  | Phiếu mượn mở | 2 |
| Sự cố | 2 |  | Giao dịch lịch sử | 190 |

### 2.5 — (Tùy chọn) Chuẩn bị AI local

```powershell
ollama pull qwen3.5:4b
ollama pull nomic-embed-text
cd apps/ai-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\build_knowledge_index.py --check
cd ..\..
```

> `knowledge_index.json` đã commit sẵn nên **không cần** vector hóa lại corpus. Nhưng
> `nomic-embed-text` vẫn cần ở runtime để vector hóa câu hỏi. Nếu **không** test AI, có
> thể bỏ qua mục này — web vẫn chạy, chỉ các tính năng AI báo "tạm thời không phản hồi".

---

## 3. Chạy hệ thống

Mở **4 cửa sổ PowerShell** tại thư mục gốc:

```powershell
# Terminal 1 — Ollama (bỏ qua nếu đã chạy dạng Windows service ở cổng 11434)
ollama serve

# Terminal 2 — AI Service
pnpm ai:dev

# Terminal 3 — Backend
pnpm be:dev

# Terminal 4 — Frontend
pnpm fe:dev
```

**Kiểm tra sức khỏe dịch vụ:**

```powershell
Invoke-RestMethod http://localhost:3100/api/health    # status = ok, database + redis = up
Invoke-RestMethod http://localhost:8000/health        # status = ok, provider = ollama
Invoke-WebRequest  http://localhost:3200 -UseBasicParsing   # HTTP 200
```

Mở giao diện: **http://localhost:3200**

> Mẹo: chạy nhanh tất cả cùng lúc bằng `pnpm dev:all` (script `scripts/dev-all.mjs`).

---

## 4. Tài khoản test

| Tài khoản | Mật khẩu | Vai trò / phạm vi |
|---|---|---|
| `superadmindongxuan` | `admin123` | ADMIN — toàn xã, bản đồ, người dùng, lập Mission |
| `staff` | `staff123` | Vận hành kho trung tâm |
| `rescue` | `rescue123` | Đội cứu hộ |
| `longchau` | `truongthon123` | Kho thôn Long Châu, kiêm báo cáo tình huống của thôn mình |
| `phuson@` `triemduc@` `kydu@` `phuochue@` `tanbinh@` … | `truongthon123` | 17 kho thôn, tên đăng nhập là tên thôn bỏ dấu viết liền |

> Đây là mật khẩu **development**. Trước khi public phải đổi hết (mục §12
> trong [HUONG-DAN-CAI-DAT-VA-CHAY.md](HUONG-DAN-CAI-DAT-VA-CHAY.md)).

---

## 5. Smoke test 10 phút (làm trước mỗi buổi demo)

Đăng nhập `superadmindongxuan` rồi lần lượt:

| ID | Thao tác | Kết quả đạt |
|---|---|---|
| S01 | Đăng nhập `superadmindongxuan` | Vào dashboard, kho mặc định **Kho xã Đồng Xuân** |
| S02 | Mở **Tổng quan** | Trạng thái vận hành + 6 mặt đánh giá + lý do + hành động |
| S03 | Mở **Kho vật tư** | Có lô, vị trí kệ, số lượng, tình trạng, hạn dùng |
| S04 | Mở **Ngày thường** | Dự báo 17 mặt hàng + cảnh báo hạn dùng |
| S05 | **Trợ lý** → hỏi `Kho sẵn sàng đáp ứng được chưa?` | Trả lời từ dữ liệu thật, **không** `Failed to fetch` |
| S06 | Mở **Sự cố** | 1 lỗi cảm biến đang mở + 1 sự cố bảo quản đã xử lý |
| S07 | Mở **Mượn-trả** | 2 phiếu mở: áo phao + bộ đàm |
| S08 | Mở **Bản đồ kho** | 18 kho; 17 kho thôn hiển thị `chưa ghim` |
| S09 | Mở **Báo cáo tháng** | Báo cáo kho thôn Long Hà đang chờ duyệt |
| S10 | Mở **Người dùng** | 20 tài khoản; chỉ ADMIN thấy mục này |

Nếu **S01–S05 fail → dừng, chưa demo tiếp**.

---

## 6. Test chi tiết theo tính năng (T01–T11)

Bộ 11 ca test tính năng đầy đủ (đăng nhập/phân quyền, pin tọa độ, readiness, kiểm kê,
mượn-trả, sự cố, AI ngày thường, trợ lý AI, Mission-to-Kit, workflow liên vai trò, báo
cáo tháng) nằm trong **[HUONG-DAN-TEST.md §6](HUONG-DAN-TEST.md#6-kiểm-thử-chi-tiết-theo-tính-năng)**.
Tóm tắt để giám khảo chọn nhanh:

| ID | Tính năng | Điểm cần chứng minh |
|---|---|---|
| T01 | Đăng nhập & phân quyền | Sai vai trò → API trả **403**, không chỉ ẩn nút |
| T02 | 17 thôn + pin tọa độ | Pin xong reload vẫn còn; đủ 17 tên thôn |
| T03 | Readiness vận hành | Có blocker nghiêm trọng thì **chặn điều phối** dù điểm cao |
| T04 | Kho vật tư & kiểm kê | Ghi đè chênh lệch → tồn đổi + có hậu kiểm |
| T05 | Mượn-trả | Tổng hoàn/hỏng/mất ≤ số nợ; mất làm giảm tồn thực |
| T06 | Sự cố kho | Vòng đời Tiếp nhận → Xử lý xong + hậu kiểm |
| T07 | AI ngày thường | Dự báo cạn kho từ lịch sử; lỗi thời tiết không làm sập trang |
| T08 | Trợ lý AI | Câu 1–9 dựa dữ liệu thật, **không bịa số**; câu ngoài phạm vi bị từ chối |
| T09 | Mission-to-Kit | Số liệu do **backend** tính, AI chỉ diễn giải |
| T10 | Workflow liên vai trò | `DRAFT→PENDING_WAREHOUSE→READY→COMPLETED`; kho chuẩn bị theo từng vật tư; sai vai → 403 |
| T11 | Báo cáo tháng | Duyệt/từ chối cập nhật trạng thái + reconcile tồn sau duyệt |

**Bảng câu hỏi test Trợ lý AI (T08)** — hỏi lần lượt, câu 10 phải bị từ chối:

```
1. Kho sẵn sàng đáp ứng được chưa?
2. Còn bao nhiêu áo phao người lớn có thể cấp ngay?
3. Còn bao nhiêu áo phao trẻ em có thể cấp ngay?
4. Kho còn bao nhiêu nước uống đóng chai?
5. Còn bao nhiêu gạo cứu trợ?
6. Còn bao nhiêu bộ sơ cứu có thể cấp ngay?
7. Vật tư nào có hạn dùng gần nhất?
8. Kho đang có sự cố gì?
9. Ba ngày tới có cảnh báo mưa lớn không?
10. Thủ đô nước Pháp là gì?   ← phải từ chối / báo ngoài phạm vi
```

---

## 7. Test Desktop Simulator (Electron) — snapshot đã xác nhận

App desktop gửi một snapshot các giá trị cảm biến IoT đã được người vận hành
xác nhận (nhiệt độ, độ ẩm, khói, loadcell) tới backend đang chạy. Trước khi mở app, đặt
`SIMULATION_MUTATION_ENABLED=true` trong `.env` và restart backend.

### 7.1 — Chạy app desktop và test luồng xác nhận

```powershell
pnpm desktop:dev
```

Trong cửa sổ Electron:

1. **Đăng nhập**: Host = `localhost:3100`, `ungphonhanh.life`, hoặc hostname/IP LAN; dùng tài khoản ADMIN đúng scope kho.
2. Kéo slider **Nhiệt độ** vượt `35°C` (ví dụ `46°C`). Kỳ vọng: badge “đã chỉnh, chưa gửi” tăng, web/database chưa có snapshot mới.
3. Bấm **Xác nhận và gửi**.
   - Kỳ vọng: app lưu hàng chờ trước, nhật ký báo đã gửi một snapshot; web poll tối đa 10 giây sẽ thấy số đọc/timeline mới, readiness và Incident cập nhật.
   - Chuông desktop kêu ngay theo policy cục bộ, kể cả khi gửi đang chờ. Chuông chỉ dừng khi bấm **Tắt chuông**; sau đó app gửi/lưu ACK vào lịch sử Incident.
4. **Luồng offline**: khi đang đăng nhập, ngắt đường tới backend, đổi một slider rồi bấm **Xác nhận và gửi**. Kỳ vọng: thao tác hiện “chờ gửi”, chuông cục bộ vẫn hoạt động nếu vượt ngưỡng. Khôi phục đường kết nối → đúng một snapshot xuất hiện nhờ idempotency.
5. **Luồng email**: tắt SMTP/Internet nhưng vẫn để backend chạy, xác nhận vượt ngưỡng. Kỳ vọng: Incident vẫn tạo; AlertEmailOutbox ở trạng thái chờ/retry. Khôi phục SMTP → email có giờ phát hiện, backend nhận và gửi khác nhau nếu bị trễ.
6. Đặt `SIMULATION_MUTATION_ENABLED=false` và restart backend khi kết thúc.

### 7.2 — Đóng gói bản portable (tùy chọn)

```powershell
pnpm --filter @safestock/desktop package     # electron-builder --win portable → apps/desktop/dist
```

---

## 8. Test Mobile (Expo / Android)

```powershell
# Chạy Metro + mở trên web/emulator/thiết bị
pnpm mobile:dev              # expo start (quét QR bằng Expo Go)
# hoặc:
pnpm --filter @safestock/mobile web       # mở bản web của app mobile

# Build APK release (cần keystore)
pnpm --filter @safestock/mobile android:keystore
pnpm --filter @safestock/mobile android:release
```

Mobile trỏ backend qua cấu hình host trong app. Tính năng chính để test: đăng nhập theo
vai trò, dashboard/readiness, đọc offline (SecureStore cache), quét QR, ghi nhận kho, báo
cáo tháng, và **voice native → PhoWhisper** (bản APK `0.5.0`).

> App điện thoại chỉ còn **hai giao diện**, chọn theo vai lúc đăng nhập: lực lượng
> hiện trường (Lệnh · Báo cáo · Cảnh báo, không có nghiệp vụ kho) và phụ trách kho
> tại chỗ (kiêm việc báo tình huống). Kịch bản chi tiết theo luồng xem
> [HUONG-DAN-TEST-3-UNG-DUNG.md](HUONG-DAN-TEST-3-UNG-DUNG.md).
>
> Gate còn lại là **fresh-install trên thiết bị thật + private-LAN** — thuộc rehearsal,
> xem [COMPETITION-REHEARSAL.md](COMPETITION-REHEARSAL.md).

---

## 9. Test tự động (unit / build / lint / typecheck)

Đây là phần **giám khảo chấm chất lượng source** — chạy được không cần UI. Chạy tại thư mục gốc.

### 9.1 — Backend (NestJS + Prisma)

```powershell
# Dùng `exec jest`, KHÔNG dùng `test -- --runInBand`: pnpm 10.32.1 chuyển tiếp "--"
# thành tham số của jest, jest hiểu nhầm là mẫu đường dẫn và báo "No tests found"
# rồi thoát với mã lỗi — dễ bị hiểu nhầm là dự án hỏng.
pnpm --filter @safestock/backend exec jest --runInBand    # unit test (Jest)
pnpm --filter @safestock/backend build                    # production build (nest build)
```

> Hiện có **100 suite / 588 test** trong `apps/backend`. Đối chiếu **toàn bộ suite PASS
> (xanh)** ở dòng tổng kết cuối; nếu Windows báo `EPERM` khi generate Prisma thì **dừng
> backend đang chạy** rồi chạy lại (tiến trình Node khóa query-engine DLL).
>
> Bộ e2e chạy riêng bằng `pnpm --filter @safestock/backend test:e2e` (7 suite / 58 test),
> cần PostgreSQL sống. Nó tự dọn dữ liệu của mình, không đụng dữ liệu mẫu.

### 9.2 — Frontend (Next.js)

```powershell
pnpm --filter @safestock/frontend exec tsc --noEmit       # typecheck
pnpm --filter @safestock/frontend build                   # production build
pnpm --filter @safestock/frontend test:mission-inbox      # unit state test
pnpm --filter @safestock/frontend test:map-marker-state   # unit state test
```

### 9.3 — Mobile

```powershell
pnpm --filter @safestock/mobile test:state                # state machine test
pnpm --filter @safestock/mobile test:resolution           # dependency resolution test
```

### 9.4 — Package dùng chung

```powershell
pnpm --filter @safestock/shared-types test:coordination   # contract test
```

### 9.5 — Lint + Format toàn repo

```powershell
pnpm lint            # eslint toàn bộ workspace
pnpm format:check    # prettier --check
```

### 9.6 — Hạ tầng định tuyến offline (OSRM) — nếu chấm phần routing

```powershell
pnpm osrm:test       # test artifact/operations/runtime OSRM
```

---

## 10. Test AI Service (pytest)

```powershell
cd apps/ai-service
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt   # dev deps (pytest)
.\.venv\Scripts\python.exe -m pytest -q
cd ..\..
```

Bộ test gồm 8 nhóm: RAG trợ lý, briefing, field-update intent, knowledge, embedding
Ollama, semantic rank, phân tích tình huống, transcribe. Một số test cần Ollama đang chạy
(embedding/semantic); nếu Ollama tắt, các test đó có thể skip/fail có chủ đích — đọc thông
báo pytest để phân biệt.

> ⚠️ Chạy pytest **từ trong `apps/ai-service`** (không phải root), nếu không sẽ dính
> `ModuleNotFoundError: No module named 'main'` do sai working directory.

---

## 11. Kiểm chứng email cảnh báo (SMTP)

**Câu hỏi thường gặp: "Chạy simulator nhưng sao không nhận được email cảnh báo?"**

Slider desktop dùng backend/database hiện tại. Nếu `ALERT_EMAIL_ENABLED=true`,
một sự kiện vượt ngưỡng có thể gửi email thật theo cấu hình `SMTP_*`. Tắt email
hoặc dùng địa chỉ nhận thử trước khi chạy slider. Đường dẫn code:
`IncidentService.enrichNewIncident` → `AlertMailService.sendIncidentAlert`.

---

## 12. Reset về baseline sau khi test

Các ca pin tọa độ, kiểm kê, mượn-trả, xử lý sự cố, duyệt báo cáo, tạo Mission đều **đổi dữ liệu**.

```powershell
pnpm --filter @safestock/backend seed
```

Sau reset phải quay lại: 18 kho, 17 thôn chưa ghim, 2 phiếu mượn mở, 2 sự cố, không Mission test.

---

## 13. Lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Backend health `degraded` | `docker ps`; xem `docker logs safestock_postgres` / `safestock_redis`; kiểm tra cổng trong `.env` |
| Frontend báo không kết nối | `Get-NetTCPConnection -LocalPort 3100 -State Listen`; `Invoke-RestMethod http://localhost:3100/api/health` |
| Trợ lý AI không phản hồi | `ollama list` (có `qwen3.5:4b`?); `Invoke-RestMethod http://localhost:8000/health`; kiểm tra terminal `pnpm ai:dev` |
| Cổng 3100/3200 bị chiếm | `Get-NetTCPConnection -LocalPort 3100,3200 -State Listen` → dừng đúng tiến trình cũ |
| `EPERM` khi Prisma generate (Windows) | Dừng backend đang chạy rồi `pnpm be:generate` lại (Node khóa DLL) |
| Đăng nhập demo sai | Mật khẩu có thể đã bị ADMIN đổi sau seed; dùng chức năng đổi mật khẩu, **không** seed lại trên DB có dữ liệu thật |
| Backend hang khi khởi động | Redis host port có thể trúng dải TCP Windows reserved — dùng `16379` local |
| pytest `ModuleNotFoundError: 'main'` | Chạy pytest **từ trong `apps/ai-service`**, không phải root |

---

## 14. Bảng ghi nhận kết quả (in ra để chấm)

| Hạng mục | Lệnh/Thao tác | Đạt/Không | Bằng chứng |
|---|---|---|---|
| Cài đặt + seed | §2 | | số liệu seed khớp bảng §2.4 |
| Khởi động 4 dịch vụ | §3 | | 3 health check ok |
| Smoke test | S01–S10 | | |
| Phân quyền | T01 | | sai role → 403 |
| Readiness | T03 | | blocker chặn điều phối |
| Mission-to-Kit | T09 | | số do backend tính |
| Workflow liên vai trò | T10 | | 403 khi sai role/state |
| Trợ lý AI | T08 | | câu 10 bị từ chối |
| Desktop simulator | §7 | | realtime + cảnh báo |
| Mobile | §8 | | đăng nhập + dashboard |
| Backend unit test | §9.1 | | suite PASS |
| Frontend build+typecheck | §9.2 | | PASS |
| AI pytest | §10 | | PASS |
| Email cảnh báo | §11 | | log "Đã gửi email cảnh báo" |
| Reset baseline | §12 | | về đúng baseline |

Khi báo lỗi ghi tối thiểu: **tài khoản · màn hình · dữ liệu đã nhập · kết quả thực tế ·
kết quả mong đợi · log Console/Network**.

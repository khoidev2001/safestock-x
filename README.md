# Ứng phó nhanh

Nền tảng đánh giá mức sẵn sàng kho và điều phối vật tư cứu hộ. Hệ thống kết hợp quản lý tồn, Readiness theo blocker, Mission-to-Kit, mô phỏng cảm biến, AI local và web vận hành.

> Trạng thái đối chiếu mới nhất (2026-07-28): P09 routing offline, workflow kho ngày thường web/mobile, APK Android `0.5.0` có voice native → PhoWhisper, dashboard/readiness/QR, AI điều phối/What-if/trợ lý hiện trường và quality gate CI đã có code/test. Audit dependency production hiện 0 advisory; web session HttpOnly đã qua browser acceptance. Gate còn lại là biên bản rehearsal hai lượt: fresh-install S23 Ultra, private-LAN/public-Internet-off, mission bốn role và desktop simulator → alert/email. Xem [báo cáo đánh giá dự thi](docs/bao-cao-danh-gia-san-sang-du-thi.md) và [runbook rehearsal](docs/COMPETITION-REHEARSAL.md).

## Nguồn sự thật

- [PRD + checklist + kế hoạch cuối](docs/PRD.md): phạm vi, trạng thái thật, backlog và Definition of Done.
- [PM re-review quản lý kho ngày thường](docs/PM-REVIEW-QUAN-LY-KHO-NGAY-THUONG.md):
  điểm trước/sau, finding đã khắc phục và release gate còn chờ.
- [Bàn giao chênh lệch so với GitHub](docs/BAN-GIAO-CHENH-LECH-SO-VOI-GITHUB.md):
  danh sách chức năng/file/schema để dev khác tiếp nhận.
- ⭐ [Hướng dẫn dùng thử và cài đặt](HUONG-DAN-DUNG-THU-VA-CAI-DAT.md):
  đường dẫn demo, tài khoản dùng thử, hướng dẫn sử dụng ba ứng dụng và các bước
  cài đặt đầy đủ trên máy mới — đọc file này trước.
- ⭐ [Toàn bộ chức năng và luồng nghiệp vụ](docs/TOAN-BO-CHUC-NANG-VA-LUONG-NGHIEP-VU.md):
  tài liệu tham chiếu đầy đủ — mọi chức năng, thao tác, trạng thái và API, đọc trực
  tiếp từ mã nguồn.
- ⭐ [Hướng dẫn test toàn diện (cho giám khảo)](docs/HUONG-DAN-TEST-TOAN-DIEN.md):
  một file tất-tần-tật từ clone → chạy → test mọi thành phần (backend, web, AI, mobile,
  desktop simulator, email cảnh báo, test tự động).
- [Hướng dẫn cài đặt và chạy](docs/HUONG-DAN-CAI-DAT-VA-CHAY.md)
- [Runbook hybrid cùng domain](docs/HYBRID-DOMAIN-RUNBOOK.md)
- [Hướng dẫn kiểm thử](docs/HUONG-DAN-TEST.md)
- [Bộ dữ liệu seed](docs/SEED-DATASET.md)
- [Quy tắc đóng góp](docs/CONTRIBUTING.md)
- [Coding standards](skills/CODING-STANDARDS.md)

Các plan, work-log và báo cáo lịch sử đã được loại khỏi gói source dự thi; Git history không phải nguồn trạng thái. Báo cáo đánh giá và source/test hiện tại là bằng chứng đối chiếu.

## Kiến trúc monorepo

| Thư mục | Vai trò | Trạng thái ngắn |
|---|---|---|
| `apps/backend` | NestJS, Prisma, PostgreSQL, Redis, Socket.IO | Lõi nghiệp vụ + AI gateway chạy; integrity/idempotency/scope kho ngày thường đã khóa |
| `apps/frontend` | Next.js web vận hành và dashboard | Production build pass; workflow kho/loan/QR, Insights AI và công cụ semantic/chuẩn hóa đã có |
| `apps/ai-service` | FastAPI + Gemini/Ollama | RAG, semantic rank, extractive daily briefing và live Ollama smoke đã chạy |
| `apps/mobile` | React Native + Expo | APK `0.5.0` có voice native/PhoWhisper, SecureStore, offline-read, dashboard, QR, nghiệp vụ kho và báo cáo tháng; còn device/LAN gate |
| `packages/shared-types` | Contract dùng chung | Build pass |
| `infrastructure` | Docker và Windows pilot scripts | Có nền; chưa nghiệm thu production/offline đầy đủ |

## Chạy development

> 📋 **Giám khảo/người tiếp nhận:** xem [Hướng dẫn test toàn diện](docs/HUONG-DAN-TEST-TOAN-DIEN.md)
> để chạy và test mọi thành phần theo từng bước.

Yêu cầu: Node.js 20+, pnpm 10+, Docker. AI local cần Python, Ollama và model được cấu hình.

```powershell
pnpm install
Copy-Item .env.example .env
pnpm infra:up
pnpm be:db
pnpm be:dev
```

Mở terminal khác:

```powershell
pnpm fe:dev
pnpm ai:dev
```

- Backend health: `http://localhost:3100/api/health`
- Frontend: `http://localhost:3200`
- AI health: `http://localhost:8000/health`
- Local routing (OSRM, khi đã dựng graph Đồng Xuân): `http://localhost:5000/route/v1/driving/...`
- Desktop simulator: `pnpm desktop:dev` (host mặc định `localhost:3100`)

### Dựng OSRM local cho Đồng Xuân

```powershell
pnpm osrm:fetch
pnpm osrm:build -- --source infrastructure/osrm/data/dong-xuan.osm --graph-version dong-xuan-YYYY-MM-DD
pnpm osrm:up
pnpm osrm:verify-live
pnpm osrm:verify-offline
```

`osrm:build` chạy pipeline MLD `extract → partition → customize`, sinh manifest
version/checksum. `osrm:up` luôn chạy preflight trước và không khởi động nếu artifact
bị thiếu hoặc sai checksum. `osrm:verify-offline` chạy một acceptance riêng với
Docker `--network none`. Sau khi build, đặt đúng `LOCAL_ROUTING_GRAPH_VERSION` từ
manifest vào `.env` cục bộ.

## Gửi snapshot cảm biến đã xác nhận từ desktop

Desktop simulator không có scenario/run. Để gửi dữ liệu vào backend/database đang
cấu hình, đặt `SIMULATION_MUTATION_ENABLED=true` trong `.env`, restart backend,
rồi chạy:

```powershell
pnpm desktop:dev
```

Đăng nhập bằng `ungphonhanh.life` khi đi qua Internet; khi chỉ còn LAN, dùng
hostname/IP backend LAN (hoặc vẫn dùng cùng domain nếu đã cấu hình split-horizon
DNS). Kéo slider chỉ thay đổi bản nháp cục bộ. Bấm **Xác nhận và gửi** mới tạo một
`SensorSubmission` idempotent cùng các `SensorEvent` lịch sử của những thông số đã đổi.

Snapshot được lưu vào hàng chờ cục bộ trước khi gửi. Nếu desktop tạm không tới được
backend, lần xác nhận vẫn được giữ và gửi lại idempotent khi kết nối trở lại. Desktop
đánh giá policy ngưỡng đã cache và bật chuông tại chỗ ngay khi xác nhận vượt ngưỡng;
chuông chỉ dừng khi người vận hành bấm **Tắt chuông**. Thao tác tắt được xếp hàng để
ghi vào lịch sử Incident khi backend nhận được.

Backend lưu riêng giờ operator phát hiện (`observedAt`) và giờ nhận (`receivedAt`).
Incident tạo email outbox bền vững: SMTP/Internet mất thì email chờ retry; email gửi
muộn vẫn ghi rõ thời điểm phát hiện, nhận và gửi để không nhầm một cảnh báo cũ là mới.
Không có lệnh reset riêng: không dùng luồng này trên dữ liệu bạn không muốn thay đổi.

Sau khi pull code mới trên database đã có dữ liệu, đồng bộ Prisma schema trước khi chạy backend:

```powershell
pnpm be:schema:diff
pnpm be:schema
```

Kiểm tra SQL do `be:schema:diff` in ra trước; dừng lại nếu có lệnh drop/type
change. `be:schema` không chạy seed hoặc generate Prisma Client, nhưng vẫn có
thể áp dụng thay đổi mất dữ liệu nếu bạn xác nhận Prisma. Với database hiện có,
backup trước và chỉ chạy khi đã duyệt SQL. Nếu cần generate client, dừng backend
trước rồi chạy `pnpm be:generate`. Không dùng `pnpm be:db` cho database đang
vận hành vì bước seed sẽ reset dữ liệu.

## Lệnh chính

| Lệnh | Mục đích |
|---|---|
| `pnpm infra:up` | Khởi động PostgreSQL và Redis |
| `pnpm infra:down` | Dừng hạ tầng local |
| `pnpm be:generate` | Generate Prisma Client; trên Windows cần dừng backend để tránh khóa DLL |
| `pnpm be:schema:diff` | In SQL chênh lệch giữa database hiện tại và Prisma schema để duyệt trước |
| `pnpm be:schema` | Đồng bộ database schema, không generate/seed/reset dữ liệu |
| `pnpm be:db` | Push schema và seed dữ liệu dev |
| `pnpm be:dev` | Chạy backend watch mode |
| `pnpm fe:dev` | Chạy frontend cổng 3200 |
| `pnpm ai:dev` | Chạy AI service bằng venv Windows |
| `pnpm desktop:dev` | Chạy công cụ slider cảm biến trực tiếp |

## Lưu ý an toàn

- Không dùng mật khẩu demo khi mở Internet.
- Hệ thống chấp nhận mật khẩu từ 8 ký tự; tài khoản production nên dùng mật khẩu dài và riêng biệt.
- Không commit `.env`, token, key, backup hoặc dữ liệu cá nhân.
- Không public PostgreSQL, Redis, AI Service hoặc Ollama.
- Simulator hiện chưa được coi là an toàn cho dữ liệu production.
- Chỉ tick hoàn thành trong [docs/PRD.md](docs/PRD.md) sau khi có bằng chứng test/nghiệm thu.

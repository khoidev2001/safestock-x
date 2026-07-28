# Ứng phó nhanh

Nền tảng đánh giá mức sẵn sàng kho và điều phối vật tư cứu hộ. Hệ thống kết hợp quản lý tồn, Readiness theo blocker, Mission-to-Kit, mô phỏng cảm biến, AI local và web vận hành.

> Trạng thái đối chiếu mới nhất: P09 routing offline, workflow kho ngày thường trên web/mobile, APK Android `0.5.0` có voice native → PhoWhisper, báo cáo kiểm kê tháng, dashboard/readiness/QR và bốn feature AI bắt buộc đã có code và kiểm thử mục tiêu. MVP end-to-end vẫn chưa an toàn để mở Internet production; browser, fresh-install/device/LAN acceptance trên Galaxy S23 Ultra, dependency hardening và full judged flow còn là release gate. Xem [báo cáo đánh giá dự thi](docs/bao-cao-danh-gia-san-sang-du-thi.md).

## Nguồn sự thật

- [PRD + checklist + kế hoạch cuối](docs/PRD.md): phạm vi, trạng thái thật, backlog và Definition of Done.
- [PM re-review quản lý kho ngày thường](docs/PM-REVIEW-QUAN-LY-KHO-NGAY-THUONG.md):
  điểm trước/sau, finding đã khắc phục và release gate còn chờ.
- [Bàn giao chênh lệch so với GitHub](docs/BAN-GIAO-CHENH-LECH-SO-VOI-GITHUB.md):
  danh sách chức năng/file/schema để dev khác tiếp nhận.
- [Hướng dẫn cài đặt và chạy](docs/HUONG-DAN-CAI-DAT-VA-CHAY.md)
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
| `packages/scenario-definitions` | Kịch bản cảm biến deterministic | Build pass |
| `infrastructure` | Docker và Windows pilot scripts | Có nền; chưa nghiệm thu production/offline đầy đủ |

## Chạy development

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
- Simulator legacy: `http://localhost:3100/sim.html`

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

## Chạy simulator demo cô lập

Simulator ghi dữ liệu chỉ được chạy bằng runtime demo riêng để tránh seed/reset hoặc sự kiện cảm biến chạm database vận hành. Không sửa `.env` vận hành cho luồng này; giữ `SIMULATION_MUTATION_ENABLED=false` tại đó. Runbook đầy đủ nằm trong [Hướng dẫn cài đặt và chạy](docs/HUONG-DAN-CAI-DAT-VA-CHAY.md#71-chạy-simulator-demo-cô-lập).

```powershell
Copy-Item .env.demo.example .env.demo
notepad .env.demo
pnpm demo:validate
pnpm demo:compose:verify
pnpm demo:infra:up
pnpm demo:db:reset -- --confirm-demo-reset
pnpm --filter @safestock/backend build
pnpm demo:backend
```

Mở `http://localhost:3110/sim.html`; app desktop cũng phải trỏ backend tới `http://localhost:3110`. Khi xong, `pnpm demo:infra:down` dừng stack demo nhưng giữ dữ liệu trong volume.

Nguồn thực thi là [`.env.demo.example`](.env.demo.example), [`package.json`](package.json), [`infrastructure/docker-compose.yml`](infrastructure/docker-compose.yml) và [`infrastructure/demo/`](infrastructure/demo/). Hỗ trợ cấu hình cô lập đã hoàn tất; chưa tuyên bố nghiệm thu pilot chạy đồng thời stack vận hành và demo trên máy thật.

Sau khi pull code mới trên database đã có dữ liệu, đồng bộ Prisma schema trước khi chạy backend:

```powershell
pnpm be:schema:diff
pnpm be:schema
```

Kiểm tra SQL do `be:schema:diff` in ra trước; dừng lại nếu có lệnh drop/type change ngoài dự kiến. `be:schema` không chạy seed, không generate Prisma Client và không chủ động xóa dữ liệu. Nếu cần generate client, dừng backend trước rồi chạy `pnpm be:generate`. Không dùng `pnpm be:db` cho database đang vận hành vì bước seed sẽ reset dữ liệu demo.

## Lệnh chính

| Lệnh | Mục đích |
|---|---|
| `pnpm infra:up` | Khởi động PostgreSQL và Redis |
| `pnpm infra:down` | Dừng hạ tầng local |
| `pnpm demo:validate` | Kiểm tra file `.env.demo` trước khi chạy |
| `pnpm demo:compose:verify` | Kiểm tra template Compose vận hành/demo cô lập tài nguyên |
| `pnpm demo:infra:up` / `pnpm demo:infra:down` | Khởi động/dừng hạ tầng demo; lệnh down giữ dữ liệu |
| `pnpm demo:db:reset -- --confirm-demo-reset` | Reset và seed riêng database demo sau xác nhận rõ ràng |
| `pnpm demo:backend` | Chạy backend demo đã build bằng `.env.demo` trên cổng 3110 |
| `pnpm be:generate` | Generate Prisma Client; trên Windows cần dừng backend để tránh khóa DLL |
| `pnpm be:schema:diff` | In SQL chênh lệch giữa database hiện tại và Prisma schema để duyệt trước |
| `pnpm be:schema` | Đồng bộ database schema, không generate/seed/reset dữ liệu |
| `pnpm be:db` | Push schema và seed dữ liệu dev |
| `pnpm be:dev` | Chạy backend watch mode |
| `pnpm fe:dev` | Chạy frontend cổng 3200 |
| `pnpm ai:dev` | Chạy AI service bằng venv Windows |
| `pnpm demo` | Chạy demo terminal hiện có |

## Lưu ý an toàn

- Không dùng mật khẩu demo khi mở Internet.
- Hệ thống chấp nhận mật khẩu từ 8 ký tự; tài khoản production nên dùng mật khẩu dài và riêng biệt.
- Không commit `.env`, token, key, backup hoặc dữ liệu cá nhân.
- Không public PostgreSQL, Redis, AI Service hoặc Ollama.
- Simulator hiện chưa được coi là an toàn cho dữ liệu production.
- Chỉ tick hoàn thành trong [docs/PRD.md](docs/PRD.md) sau khi có bằng chứng test/nghiệm thu.

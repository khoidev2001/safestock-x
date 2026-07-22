# Ứng phó nhanh

Nền tảng đánh giá mức sẵn sàng kho và điều phối vật tư cứu hộ. Hệ thống kết hợp quản lý tồn, Readiness theo blocker, Mission-to-Kit, mô phỏng cảm biến, AI local và web vận hành.

> Trạng thái thực tế 2026-07-21: lõi backend/rule engine đã có nhiều phần thật, nhưng MVP end-to-end chưa hoàn thành và chưa an toàn để mở Internet production. Mobile chưa triển khai.

## Nguồn sự thật

- [PRD + checklist + kế hoạch cuối](docs/PRD.md): phạm vi, trạng thái thật, backlog và Definition of Done.
- [Hướng dẫn cài đặt và chạy](docs/HUONG-DAN-CAI-DAT-VA-CHAY.md)
- [Hướng dẫn kiểm thử](docs/HUONG-DAN-TEST.md)
- [Bộ dữ liệu seed](docs/SEED-DATASET.md)
- [Quy tắc đóng góp](docs/CONTRIBUTING.md)
- [Coding standards](skills/CODING-STANDARDS.md)

Các `BUILD-PLAN`, `WORK-LOG`, feature review và roadmap cũ đã được lưu tại `docs/archive/`; không dùng chúng để kết luận tiến độ hiện tại.

## Kiến trúc monorepo

| Thư mục | Vai trò | Trạng thái ngắn |
|---|---|---|
| `apps/backend` | NestJS, Prisma, PostgreSQL, Redis, Socket.IO | Nhiều module thật; còn lỗi scope/integrity P0 |
| `apps/frontend` | Next.js web vận hành và dashboard | Build pass; workflow đa role/inventory/simulator còn thiếu |
| `apps/ai-service` | FastAPI + Gemini/Ollama | Parse/explain/action-plan/assistant có; test/hardening thiếu |
| `apps/mobile` | React Native + Expo | Chưa scaffold |
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
- Simulator legacy: `http://localhost:3100/sim.html`

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

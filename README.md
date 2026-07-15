# SafeStock X

**Nền tảng AI đánh giá năng lực sẵn sàng và điều phối vật tư cứu hộ trong tình huống khẩn cấp.**

Dự thi Cuộc thi Sáng tạo AI tỉnh Đắk Lắk. Sinh ra từ bối cảnh bão lũ Phú Yên (cũ) 2025.

> Phần mềm thường quản lý hàng tồn kho. SafeStock X quản lý **năng lực phản ứng thực tế** của kho khi sự cố xảy ra — kể cả khi con người quá bận để nhập liệu.

## Trả lời 4 câu hỏi
1. Vật tư nào đang thực sự sẵn sàng sử dụng?
2. Kho đáp ứng được tình huống khẩn cấp nào?
3. Với một tình huống cụ thể, cần chuẩn bị gì?
4. Điểm nghẽn nào khiến cứu hộ bị chậm?

## 5 module cốt lõi
1. **Quản lý kho** — 4 tầng nhập/xuất, mượn-trả, kiểm kê, hậu kiểm
2. **Readiness Score** — chỉ số sẵn sàng 6 thành phần, 4 cấp, ngưỡng hành động
3. **Mission-to-Kit Compiler** — tình huống (ngôn ngữ tự nhiên) → phương án vật tư
4. **Sensor Simulator** — mô phỏng lớp cảm biến IoT (deterministic, realtime)
5. **Mobile App** — vận hành hiện trường (Expo)

## Tech stack
Monorepo pnpm · **Backend** NestJS + Prisma + PostgreSQL + Redis · **AI** FastAPI + LLM pluggable (Gemini/Ollama/Claude) · **Web** Next.js · **Mobile** React Native + Expo

## Tài liệu
- [PRD.md](PRD.md) — yêu cầu sản phẩm (CÁI GÌ + TẠI SAO)
- [BUILD-PLAN.md](BUILD-PLAN.md) — kế hoạch build từng phase (LÀM THẾ NÀO), resume-able

## Cấu trúc
```
apps/
  api/                 # NestJS backend (auth, inventory, simulation...)
  admin-web/           # Next.js (chưa dựng)
  mobile/              # Expo (chưa dựng)
  ai-service/          # FastAPI (chưa dựng)
packages/
  shared-types/        # Enum + type dùng chung
  scenario-definitions/ # Kịch bản mô phỏng cảm biến
infrastructure/
  docker-compose.yml   # Postgres + Redis
```

## Chạy dev
```bash
pnpm install
cp .env.example .env          # điền secret nếu cần
pnpm infra:up                 # Postgres + Redis (Docker)
pnpm --filter @safestock/api prisma:push
pnpm --filter @safestock/api seed
pnpm --filter @safestock/api start:dev   # http://localhost:3100/api/health
```

Simulator UI tối thiểu: `http://localhost:3100/sim.html`

## Trạng thái
- ✅ Phase A — nền + auth + inventory
- ✅ Phase B — sensor simulator (verify pass)
- 🔜 Phase C — Readiness Score

## Tài khoản demo
| Login | Password | Role |
|---|---|---|
| `admin` | `admin123@` | ADMIN |
| `staff@safestock.vn` | `staff123` | WAREHOUSE |
| `rescue@safestock.vn` | `rescue123` | RESCUE |

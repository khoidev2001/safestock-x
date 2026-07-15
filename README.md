# SafeStock X

**Nền tảng AI đánh giá năng lực sẵn sàng và điều phối vật tư cứu hộ trong tình huống khẩn cấp.**

Dự thi Cuộc thi Sáng tạo AI tỉnh Đắk Lắk. Sinh ra từ bối cảnh bão lũ Phú Yên (cũ) 2025.

> Phần mềm thường quản lý hàng tồn kho. SafeStock X quản lý **năng lực phản ứng thực tế** của kho khi sự cố xảy ra — kể cả khi con người quá bận để nhập liệu.

---

## ⛔ ĐỌC TRƯỚC KHI VIẾT DÒNG CODE ĐẦU TIÊN

**Bắt buộc mọi thành viên đọc đủ 5 mục dưới. Không đọc = không code.**

### 1️⃣ Quy tắc code — [skills/CODING-STANDARDS.md](skills/CODING-STANDARDS.md)
Bộ quy tắc chuẩn (đặt tên, cấu trúc, xử lý lỗi, bảo mật, API, DB, AI, test, Git). **MUST tuân thủ.** Mọi PR bị review theo bộ này.

### 2️⃣ Skill hỗ trợ — [skills/README.md](skills/README.md)
Cài skill Claude Code vào máy (agent search, taste design, debug). Chạy lệnh `npx skills add ...` sau khi clone.

### 3️⃣ Sản phẩm cần làm gì — [docs/PRD.md](docs/PRD.md)
CÁI GÌ + TẠI SAO. 5 module, yêu cầu chức năng, kiến trúc, phân vai AI.

### 4️⃣ Kế hoạch & phase — [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) + ROADMAP mỗi app
LÀM THẾ NÀO. BUILD-PLAN là kế hoạch tổng (phase A→I). Mỗi app có **ROADMAP riêng với checklist bắt buộc tick khi code**:
- [apps/backend/ROADMAP.md](apps/backend/ROADMAP.md) · [apps/frontend/ROADMAP.md](apps/frontend/ROADMAP.md) · [apps/mobile/ROADMAP.md](apps/mobile/ROADMAP.md) · [apps/ai-service/ROADMAP.md](apps/ai-service/ROADMAP.md)

> **Code phase nào → tick từng dòng checklist trong ROADMAP app đó.** Xong hết + verify → đổi phase sang ✅. Không tick = không kiểm soát được đã làm gì.

### 5️⃣ Quy trình làm việc — [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) + [docs/WORK-LOG.md](docs/WORK-LOG.md)
Flow branch → PR → review → merge (KHÔNG push thẳng `main`). Checklist ngày, nhận việc, tránh giẫm chân.

> **Trước mỗi PR:** chạy checklist mục 27 của [CODING-STANDARDS](skills/CODING-STANDARDS.md) + `lint`, `typecheck`, `test`, `build`.

---

## 5 module cốt lõi
1. **Quản lý kho** — 4 tầng nhập/xuất, mượn-trả, kiểm kê, hậu kiểm
2. **Readiness Score** — chỉ số sẵn sàng 6 thành phần, 4 cấp, ngưỡng hành động
3. **Mission-to-Kit Compiler** — tình huống (ngôn ngữ tự nhiên) → phương án vật tư
4. **Sensor Simulator** — mô phỏng lớp cảm biến IoT (deterministic, realtime)
5. **Mobile App** — vận hành hiện trường (Expo)

## Tech stack
Monorepo pnpm · **Backend** NestJS + Prisma + PostgreSQL + Redis · **AI** FastAPI + LLM pluggable (Gemini/Ollama/Claude) · **Web** Next.js · **Mobile** React Native + Expo

## Cấu trúc (monorepo pnpm)
```
apps/
  backend/             # BE — NestJS ✅
  frontend/            # FE — Next.js admin + simulator (Phase G, placeholder)
  mobile/              # Mobile — Expo (Phase F, placeholder)
  ai-service/          # AI — FastAPI, không thuộc pnpm workspace (Phase D, placeholder)
packages/
  shared-types/        # enum/type dùng chung BE↔FE↔mobile
  scenario-definitions/ # kịch bản mô phỏng cảm biến
infrastructure/
  docker-compose.yml   # Postgres + Redis
docs/                  # PRD, BUILD-PLAN, CONTRIBUTING, WORK-LOG, thư quan tâm
skills/                # CODING-STANDARDS + skill hỗ trợ
```

## Chạy dev
```bash
pnpm install
cp .env.example .env          # điền secret nếu cần
pnpm infra:up                 # Postgres + Redis (Docker)
pnpm --filter @safestock/backend prisma:push
pnpm --filter @safestock/backend seed
pnpm be:dev                   # http://localhost:3100/api/health
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

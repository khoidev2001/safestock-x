# Ứng phó nhanh

**Nền tảng AI đánh giá năng lực sẵn sàng và điều phối vật tư cứu hộ trong tình huống khẩn cấp.**

Dự thi Cuộc thi Sáng tạo AI tỉnh Đắk Lắk. Sinh ra từ bối cảnh bão lũ Phú Yên (cũ) 2025.

> Phần mềm thường quản lý hàng tồn kho. Ứng phó nhanh quản lý **năng lực phản ứng thực tế** của kho khi sự cố xảy ra — kể cả khi con người quá bận để nhập liệu.

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
2. **Mức sẵn sàng vận hành kho** — điều kiện chặn, trạng thái từng mặt, khả năng đáp ứng tình huống; điểm tổng chỉ để tham khảo xu hướng
3. **Mission-to-Kit Compiler** — tình huống (ngôn ngữ tự nhiên) → phương án vật tư
4. **Sensor Simulator** — mô phỏng lớp cảm biến IoT (deterministic, realtime)
5. **Mobile App** — vận hành hiện trường (Expo)

## Readiness được hiểu thế nào

Readiness không nhằm tạo một con số đẹp để “chấm điểm kho”. Hệ thống phải giúp cán bộ trả lời theo đúng thứ tự:

1. **Có điều kiện nào chặn vận hành không?** Ví dụ vật tư bắt buộc đã hỏng/hết hạn, vị trí không tiếp cận được hoặc kho có sự cố nghiêm trọng.
2. **Kho đang vướng vấn đề gì?** Hiển thị riêng số lượng, chất lượng, hạn dùng, tiếp cận, môi trường và độ tin cậy dữ liệu.
3. **Với tình huống cụ thể, kho đáp ứng được bao nhiêu?** Đối chiếu nhu cầu theo số người/thời gian với vật tư thực sự khả dụng; loại thiếu nhất quyết định mức đáp ứng.

Trạng thái chính là **Sẵn sàng · Cần xử lý · Không thể điều phối**, luôn kèm lý do và hành động đề xuất. Điểm `0-100` vẫn có thể dùng để xem xu hướng hoặc so sánh nội bộ, nhưng không được tự mình ghi đè điều kiện chặn hay quyết định điều phối.

## Tech stack
Monorepo pnpm · **Backend** NestJS + Prisma + PostgreSQL + Redis · **AI** FastAPI + LLM pluggable (Gemini/Ollama/Claude) · **Web** Next.js · **Mobile** React Native + Expo

## Cấu trúc (monorepo pnpm)
```
apps/
  backend/             # BE — NestJS ✅
  frontend/            # FE — Next.js admin + simulator + Readiness/Mission UI
  mobile/              # Mobile — Expo (Phase F, placeholder)
  ai-service/          # AI — FastAPI + Ollama/Gemini, không thuộc pnpm workspace
packages/
  shared-types/        # enum/type dùng chung BE↔FE↔mobile
  scenario-definitions/ # kịch bản mô phỏng cảm biến
infrastructure/
  docker-compose.yml   # Postgres + Redis
docs/                  # PRD, BUILD-PLAN, CONTRIBUTING, WORK-LOG, thư quan tâm
  codebase-summary.md  # tóm tắt trạng thái thật đã đối chiếu code + roadmap
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
- ✅ Backend lõi đã vượt Phase A/B: auth/RBAC, inventory, Readiness v2.2, simulator, mission, incident, geo, notification, insights, assistant, backup, report/admin.
- ✅ Readiness v2.2 đã triển khai: blocker có bằng chứng, 3 trạng thái vận hành, 6 chiều đánh giá, lọc lô đủ điều kiện và mức đáp ứng từng SKU; điểm chỉ hiển thị phụ.
- ✅ AI service đã có FastAPI + Gemini/Ollama provider, parse tình huống, explain, action-plan, assistant.
- ✅ Frontend web admin đã có dashboard nhiều view, trạng thái/lý do/hành động Readiness, mission/action-plan/map/notification/assistant/insights; build production đã pass ngày 2026-07-21.
- ⬜ Mobile Expo chưa triển khai source app, mới có roadmap/package.
- Chi tiết đối chiếu mới nhất: [docs/codebase-summary.md](docs/codebase-summary.md).

## Tài khoản demo
| Login | Password | Role |
|---|---|---|
| `admin` | `admin123@` | ADMIN |
| `staff@safestock.vn` | `staff123` | WAREHOUSE |
| `rescue@safestock.vn` | `rescue123` | RESCUE |
| `truongthon1@safestock.vn` ... `truongthon17@safestock.vn` | `truongthon123` | WAREHOUSE theo từng thôn |

Seed chuẩn hiện có 1 kho trung tâm và đủ 17 thôn của xã Đồng Xuân. Tọa độ kho thôn để trống để ADMIN pin vị trí thật trên bản đồ. Chi tiết catalog, trạng thái mô phỏng và nguồn dữ liệu: [docs/SEED-DATASET.md](docs/SEED-DATASET.md).

Hướng dẫn chạy và kiểm thử thủ công toàn bộ tính năng: [docs/HUONG-DAN-TEST.md](docs/HUONG-DAN-TEST.md).

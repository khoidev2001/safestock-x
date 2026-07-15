# WORK LOG — SafeStock X

> Điều phối ai làm gì. Chi tiết checklist từng phase nằm ở **ROADMAP của mỗi app** (bắt buộc tick khi code):
> - Backend → [../apps/backend/ROADMAP.md](../apps/backend/ROADMAP.md)
> - Frontend → [../apps/frontend/ROADMAP.md](../apps/frontend/ROADMAP.md)
> - Mobile → [../apps/mobile/ROADMAP.md](../apps/mobile/ROADMAP.md)
> - AI Service → [../apps/ai-service/ROADMAP.md](../apps/ai-service/ROADMAP.md)
>
> Nguồn yêu cầu gốc: [BUILD-PLAN.md](BUILD-PLAN.md). Quy trình PR: [CONTRIBUTING.md](CONTRIBUTING.md).
>
> **BẮT BUỘC:** khi code 1 phase → tick từng dòng checklist trong ROADMAP của app đó. Không tick = không kiểm soát được đã làm gì.

## Ký hiệu
⬜ chưa · 🟡 đang làm (ghi tên) · ✅ xong+verify. Ưu tiên: 🔴 CORE · 🟠 nên-có · ⚪ polish.

---

## Tiến độ tổng (theo app)

| App | Phase xong | Đang/kế tiếp |
|---|---|---|
| **Backend** | A0, A1, B0-B3, C-minus ✅ | C0-C3 (Readiness), A2-core (RBAC) |
| **Frontend** | — (placeholder) | G0 scaffold → G1 dashboard (cùng BE-C) |
| **Mobile** | — (placeholder) | F0 scaffold (cần API) |
| **AI Service** | — (placeholder) | D0 scaffold (cần GEMINI_API_KEY) |

---

## Đang làm

| App-Phase | Việc | Ai | Trạng thái |
|---|---|---|---|
| BE-Cminus | Schema nền Readiness | Claude | 🟡 branch feat/c-minus-schema (chưa merge) |
| BE-C0 | 6 công thức con + schema điểm | | ⬜ kế tiếp |

---

## Ai nhận việc gì (điền tên tránh giẫm chân)

| App | Người phụ trách |
|---|---|
| Backend (C, D, A2, Bp, E) | |
| Frontend (G) | |
| Mobile (F) | |
| AI Service (D0, D1) | |

## Ghi chú điều phối
- **Song song được:** Backend (BE-C readiness) và Frontend (FE-G0 scaffold) tách; FE-G1 cần BE-C1 xong API. Mobile cần API inventory/readiness. AI-service độc lập (cần key Gemini).
- **File dễ đụng (báo nhau trước):** `apps/backend/prisma/schema.prisma`, `apps/backend/src/app.module.ts`, `apps/backend/prisma/seed.ts`, `packages/shared-types/src/index.ts`.
- Mỗi lát = 1 branch → PR → review → merge.

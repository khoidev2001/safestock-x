# WORK LOG — Ứng phó nhanh

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
| **Backend** | A0, A1, A2core, B0-B3, Bp0/Bp2/Bp3/Bp4/Bp5, Readiness v2.2, D-proxy, E/E2, J, K, L, M, G4api, I ✅ | Bp1 RFID còn dở; tiếp tục ổn định demo/E2E |
| **Frontend** | G0, G1 Readiness v2.2, FE-K, các view dashboard/assistant/insights/report/map 🟡 | Kiểm thử browser; hoàn thiện simulator UI đầy đủ, CRUD/adjust/reconcile nếu cần |
| **Mobile** | — (chưa có source app) | F0 scaffold nếu vẫn giữ mobile trong MVP |
| **AI Service** | D0, D1, D3exp, K action-plan, assistant ✅ | Claude provider và explain-incident riêng còn dở |

---

## Đang làm

| App-Phase | Việc | Ai | Trạng thái |
|---|---|---|---|
| FE-E2E | Kiểm thử browser luồng Readiness → Mission sau v2.2 | | ⬜ kế tiếp |
| Mobile-F0 | Scaffold Expo nếu vẫn cần app hiện trường cho demo | | ⬜ kế tiếp |
| BE-Bp1 | RFID tự sinh giao dịch từ tag mapping | | ⬜ nên-có |

---

## Ai nhận việc gì (điền tên tránh giẫm chân)

| App | Người phụ trách |
|---|---|
| Backend (C, D, A2, Bp, E) | |
| Frontend (G) | |
| Mobile (F) | |
| AI Service (D0, D1) | |

## Ghi chú điều phối
- **Song song được:** sửa build/frontend; scaffold mobile F0; hoàn thiện RFID/AI explain-incident không chặn nhau.
- **File dễ đụng (báo nhau trước):** `apps/backend/prisma/schema.prisma`, `apps/backend/src/app.module.ts`, `apps/backend/prisma/seed.ts`, `packages/shared-types/src/index.ts`.
- Mỗi lát = 1 branch → PR → review → merge.
- **Nguồn trạng thái mới nhất:** [codebase-summary.md](codebase-summary.md) + ROADMAP từng app. README/BUILD-PLAN có thể là tài liệu kế hoạch, ROADMAP là checklist sát code hơn.

# WORK LOG — SafeStock X

> Checklist ngày, bám [BUILD-PLAN.md](BUILD-PLAN.md). Ai nhận việc gì ghi tên vào, xong tick. Tránh giẫm chân. Mỗi lát = 1 branch/PR (xem [CONTRIBUTING.md](CONTRIBUTING.md)).
>
> Ký hiệu: ⬜ chưa · 🟡 đang làm (ghi tên) · ✅ xong+merge

## Đã xong (trước khi có repo)
- ✅ Phase A0 — nền móng monorepo
- ✅ Phase A1 — auth + inventory
- ✅ Phase B0-B3 — sensor simulator (timeline-scrubber, WS, 6 scenario, sim.html)

---

## Đang làm — Phase C (Readiness Score, differentiator)

Thứ tự: C-minus (schema) → C0 (công thức) → C1 (tính điểm + recalc) → C2 (đề xuất) → C3 (ngưỡng hành động).

| Lát | Việc | Ai | Trạng thái | Branch/PR |
|---|---|---|---|---|
| C-minus | Schema: condition×circulation 2 chiều, consumable, distanceKm, NeighborWarehouse, LoanRecord | Claude | 🟡 chờ review | [PR #1](https://github.com/khoidev2001/safestock-x/pull/1) |
| C0 | 6 công thức con + schema điểm (trọng số/ngưỡng configurable) | | ⬜ | |
| C1 | Tính điểm 4 cấp + breakdown + recalc 3 tầng (event-driven) | | ⬜ | |
| C2 | Nguyên nhân trừ điểm + recommendation | | ⬜ | |
| C3 | Ngưỡng hành động (4 vùng, tự động hành động) | | ⬜ | |
| Verify C | kéo slider độ ẩm → điểm zone rớt <2s | | ⬜ | |

---

## Backlog gần (sau C)
- G0+G1 — admin web scaffold + dashboard Readiness (song song frontend được sau C1)
- A2-core — RBAC permission + audit 5W
- Bp0/Bp2/Bp3/Bp4 — xuất lô, sửa tay/reconcile, seed 2 kho, mượn-trả
- D — Mission-to-Kit

## Ghi chú điều phối
- Backend (C, D) và Frontend (F, G) tách được → 2 người song song sau khi C1 có API readiness.
- File dễ đụng: `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`, `apps/api/prisma/seed.ts` — báo nhau trước khi sửa.

# Quy ước làm việc — Ứng phó nhanh (2 người)

> **Đọc [../skills/CODING-STANDARDS.md](../skills/CODING-STANDARDS.md) trước.** File này chỉ bổ sung quy trình Git; mọi quy tắc code (đặt tên, cấu trúc, xử lý lỗi, PR checklist) nằm ở CODING-STANDARDS.
>
> Repo private free không bật được branch protection tự động → **kỷ luật thủ công**: KHÔNG push thẳng `main`. Mọi thay đổi qua PR, khoidev2001 review trước khi merge.

## Flow mỗi tính năng

```
1. git checkout main && git pull            # đồng bộ main mới nhất
2. git checkout -b <loại>/<mô-tả>           # tạo branch (xem quy ước tên dưới)
3. code + commit                            # commit nhỏ, thông điệp rõ
4. git push -u origin <branch>
5. gh pr create                             # mở PR về main
6. khoidev2001 review → approve → merge     # KHÔNG tự merge nếu chưa review
7. git checkout main && git pull            # dọn, đồng bộ lại
```

## Quy ước tên branch
`<loại>/<mô-tả-ngắn>` — loại: `feat` (tính năng), `fix` (sửa lỗi), `chore` (dọn dẹp), `docs`.
Ví dụ: `feat/readiness-score`, `feat/c-minus-schema`, `fix/reconcile-onloan`.

## Quy ước commit — Conventional Commits (CODING-STANDARDS §19.2)
Prefix tiếng Anh (`feat`/`fix`/`refactor`/`test`/`docs`/`chore`/`perf`), mô tả tiếng Việt được. Ví dụ:
```
feat(readiness): tính điểm 6 thành phần 4 cấp + breakdown

- 6 công thức con theo bảng định mức C0
- roll-up trọng số theo quantity
- recalc event-driven khi sensor môi trường đổi (cứu khoảnh khắc vàng)
```
Commit nhỏ, độc lập, một mục tiêu. KHÔNG commit `update`/`fix`/`done`/`sua loi`/`final`.

## Chia việc theo checklist ngày
- Checklist bám [BUILD-PLAN.md](BUILD-PLAN.md) — mỗi lát 1 branch/PR.
- Ai nhận việc gì → ghi vào [WORK-LOG.md](WORK-LOG.md), tránh giẫm chân.
- Việc backend (C Readiness, D Mission) và frontend (F mobile, G web) tách được → làm song song sau khi API xong.

## Chống conflict
- Branch ngắn ngày (1-2 ngày merge), không để branch sống lâu.
- Trước khi code: `git pull` main. Trước khi mở PR: rebase/merge main mới nhất.
- File dễ đụng (schema.prisma, app.module.ts, seed.ts) → báo nhau trước khi sửa cùng lúc.

## KHÔNG commit
- `.env` (secret) — đã có trong .gitignore
- `node_modules`, `dist`, build output
- `memory/` (ghi chú nội bộ AI)

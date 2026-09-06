---
name: dev-environment
description: Cấu hình port + lệnh dev cho SafeStock X (máy user chạy nhiều docker project)
metadata:
  type: project
---

Máy user chạy NHIỀU docker project song song (tkb, mikiname, timetable, landingpage...) → port mặc định 5432/6379/3000 đều bị chiếm. [[project-safestock-x]] dùng port lệch:

- Postgres: **55433** (host) → 5432 (container)
- Redis: **56380** (host) → 6379 (container)
- API: **3110** (3000 bị mikiname-web chiếm)

Cấu hình trong `.env` root. Docker compose PHẢI chạy với `--env-file .env` (compose -f trỏ subdir không tự đọc .env root). Scripts root đã set sẵn.

`apps/api/.env` riêng chỉ chứa DATABASE_URL cho Prisma CLI (db push/seed/studio) — ts-node/prisma CLI không đọc .env root. Seed đã thêm dotenv preload.

Nest build ra `dist/src/main.js` (không phải dist/main.js) vì có prisma/ ở rootDir. Chạy trực tiếp: `node apps/api/dist/src/main.js`. Dev: `pnpm --filter @safestock/api start:dev`.

Verify stack: `curl http://localhost:3110/api/health` → status ok + database/redis up.

**Lưu ý:** đừng dùng `taskkill /IM node.exe` (giết mọi node của user) — nhắm đúng PID.

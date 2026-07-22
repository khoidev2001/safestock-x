# @safestock/frontend

Web Next.js cho dashboard Readiness, inventory, Mission/Action Plan, incident, map, report, assistant và quản trị.

Trạng thái: production build pass; chưa workflow-ready. Mission đa role thiếu inbox/deep-link, inventory write UI và simulator controls chưa đầy đủ, frontend lint/test/E2E chưa đạt.

```powershell
pnpm --filter @safestock/frontend dev
pnpm --filter @safestock/frontend build
```

Frontend chạy tại `http://localhost:3200`. Contract sản phẩm, checklist còn thiếu và thứ tự làm nằm tại [docs/PRD.md](../../docs/PRD.md).

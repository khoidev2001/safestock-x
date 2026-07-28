# @safestock/frontend

Web Next.js cho dashboard Readiness, inventory, Mission/Action Plan, incident, map, report, assistant và quản trị.

Trạng thái: production build pass; chưa workflow-ready. Mission đa role đã có inbox, filter/tìm kiếm, URL selection và notification deep-link; còn thiếu browser acceptance qua ba phiên độc lập, inventory write UI, simulator controls và full frontend E2E.

```powershell
pnpm --filter @safestock/frontend dev
pnpm --filter @safestock/frontend build
pnpm --filter @safestock/frontend test:mission-inbox
```

Frontend chạy tại `http://localhost:3200`. Contract sản phẩm, checklist còn thiếu và thứ tự làm nằm tại [docs/PRD.md](../../docs/PRD.md).

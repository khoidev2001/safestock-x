---
phase: 4
title: "Mission inbox and demo workflow"
status: in_progress
priority: P1
effort: "1.5d"
dependencies: [2, 3]
---

# Phase 4: Mission inbox and demo workflow

## Context Links

- [Mission PRD workflow](../../docs/PRD.md#7-workflow-nghiệm-thu-bắt-buộc)
- [Frontend mission view](../../apps/frontend/src/components/mission/mission-view.tsx)
- [Mission API](../../apps/frontend/src/lib/mission-api.ts)

## Overview

Khép lát cắt desktop simulator → APK REPORTER → web ADMIN → APK RESCUE → web WAREHOUSE → APK RESCUE qua UI thật. Người dùng role khác phải tìm được mission được giao sau logout/login, refresh hoặc mở notification.

## Requirements

- REPORTER submit thành công trả reference nhìn thấy; ADMIN mở report/mission từ owned inbox/notification, không copy ID.
- Mission inbox consumes `GET /missions` with actor/warehouse/status filtering.
- Selected mission is addressable via `?mission=`; F5 preserves it.
- Notification click opens correct mission and marks only an owned notification read.
- Role-aware navigation hides unusable pages and every query/mutation exposes an error state.

## Architecture

Keep server-side authorization authoritative. Frontend query keys include actor scope and mission ID. Use URL as durable selection; Zustand is only an enhancement, not the source of truth. Avoid fake demo state.

## Related Code Files

- Modify: `apps/frontend/src/components/mission/mission-view.tsx`, `notification-bell.tsx`, `mission-focus-store.ts`.
- Modify: `apps/frontend/src/app/(dashboard)/mission/page.tsx`, dashboard shell/nav and route guard.
- Modify: `apps/frontend/src/lib/mission-api.ts`, dashboard API error/result types.
- Modify backend mission list/get only if filters or assignment semantics are incomplete.
- Create: browser E2E suite/config cho web subgate và device/manual acceptance matrix cho full desktop+APK+web UI flow.

## Implementation Steps

1. Add inbox query and empty/loading/error/retry states. Filter assignments by role, warehouse and status from server.
2. Add URL mission selection and notification deep-link. Handle invalid/forbidden ID with visible 403/404 state.
3. Make role-aware nav/route guard reflect permissions, not only `ADMIN` special case.
4. Remove random incident-point fallback. A report location resolves to an ADMIN-configured hamlet marker; unmatched/ambiguous names require visible ADMIN confirmation.
5. Audit inventory, loan, incident, report and audit screens: replace `data ?? []` healthy-empty fallback with explicit error cards and retry.
6. Implement web subgate with independent ADMIN/RESCUE/WAREHOUSE contexts, then full judged UI acceptance: desktop simulator emits; APK REPORTER submits; web ADMIN reviews resolved hamlet, system-selected multi-warehouse allocation and route map before dispatch; APK RESCUE confirms/rejects; web WAREHOUSE prepares; APK RESCUE completes; web ADMIN sees final status/readiness/audit.
7. Keep the loan mapper contract `{ok, damaged, lost}` and add a browser/API contract assertion.

## Todo

- [x] Mission inbox consumes the scoped list for ADMIN, RESCUE and WAREHOUSE; API smoke opens returned mission details for all three.
- [x] Selection is URL-backed through `?mission=`; search/filter/role-priority/deep-link unit tests and production build pass.
- [x] Web notification click writes the mission ID directly into the route.
- [ ] Manual/browser acceptance proves deep-link survives F5 and new tab in three independent contexts.
- [ ] Notification list/mark-read/room is partitioned so only the current actor's mission/incident can appear.
- [ ] All core screens show 401/403/5xx explicitly.
- [ ] Web ADMIN/RESCUE/WAREHOUSE subgate passes twice; full desktop + APK + web UI scenario passes twice.
- [ ] APK REPORTER/RESCUE steps pass without copying mission IDs or using API tools.
- [ ] F5, new tab, logout/login and APK restart rediscover the same mission from owned inbox/notification.
- [ ] REPORTER submit, RESCUE transition/WS reconnect and WAREHOUSE prepare failures render visibly with retry; no false success/empty.
- [ ] ADMIN sees final mission status, readiness change and audit after prepare/complete.
- [ ] Location text resolves only to configured hamlet data; no random or silent geocoding fallback remains.

## Success Criteria

- [ ] A fresh RESCUE session sees its assigned dispatched mission without an API script.
- [ ] A fresh WAREHOUSE session sees only missions it may prepare.
- [ ] Core scenario completes with no manual SQL/API and no hidden error.
- [ ] Terminal is closed during the judged core flow; no reset/reseed/service restart except an announced recovery exercise.
- [ ] Forbidden mission URL cannot reveal title, requirements, or notification body.

## Risk Assessment

- Existing mission local state is large and coupled. Mitigation: add URL/inbox boundary first; do not rewrite rule engine.
- Browser automation có thể không chạy trên máy thi. Mitigation: giữ full deterministic UI acceptance matrix để chạy thật; label đúng là Manual UI acceptance, không gọi Browser E2E. Video chỉ là fallback trình chiếu, không thay gate UI live.

## Next Steps

Phase 5 adds deterministic multi-warehouse routing and the converging route map. Phase 6 then adds preflight, provenance and explicit offline recovery.

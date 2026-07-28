---
phase: 2
title: "Tenant isolation and data safety"
status: pending
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 2: Tenant isolation and data safety

## Context Links

- [PRD data boundary](../../docs/PRD.md#3-người-dùng-quyền-và-ranh-giới-dữ-liệu)
- [Readiness report blockers](../../docs/bao-cao-danh-gia-san-sang-du-thi.md#5-blocker-và-lỗi-đã-xác-định-bằng-akdebug)

## Overview

Đóng các IDOR và cross-organization mutation trước khi cho nhiều tài khoản diễn tập. Tạo actor-scope dùng chung thay vì thêm guard rời rạc.

## Requirements

- Functional: mọi read/write raw ID phải chứng minh resource thuộc `organizationId`; actor có kho còn phải đúng `warehouseId`.
- Integrity: forbidden request không tạo mutation, audit hoặc notification.
- Upload: file thiếu, sai MIME/extension, quá lớn hoặc workbook quá nhiều row/cell phải trả lỗi có kiểm soát.

## Architecture

JWT guard resolve principal từ DB thành `ActorScope { userId, role, organizationId, warehouseId }`. Service resolve owner organization inside transaction for mutation. Notification audience persists organization plus optional warehouse/user; REST và WebSocket derive rooms from server principal.

## Related Code Files

- Modify: `apps/backend/src/auth/authenticated-request.ts`, JWT/principal resolution.
- Modify: inventory/readiness/insights controllers and services.
- Modify: mission transitions, loan, report submit, admin user/warehouse services.
- Modify: notification schema/service/controller/gateway; create a versioned Prisma migration.
- Modify: report upload controller/parser.
- Create/modify: cross-org controller/integration/concurrency tests.

## Implementation Steps

1. Tests first: build a table-driven same-org / foreign-org / foreign-warehouse matrix for every raw-ID endpoint.
2. Add reusable ActorScope resolution. Do not trust organization or role claimed by client payload.
3. Guard inventory tree/batches/scan; readiness warehouse/zone/shelf/recalculate; insights warehouse/report.
4. Pass actor organization through all mission transitions and loan list/borrow/return. Bind report submit to actor organization.
5. Scope admin list/create/update/remove and warehouse pinning to actor organization.
6. Add `organizationId` plus optional warehouse/user targeting to notifications; partition list/read-all/mark-read and WS rooms.
7. Add upload limits, file filter, missing-file guard and parser row/cell caps.
8. Prove lost-return vs concurrent export preserves `quantity >= 0`; use a shared row lock/CAS if race reproduces.

## Todo

- [ ] ActorScope available in HTTP and Socket flows.
- [ ] Inventory/readiness/insights raw-ID isolation tests pass.
- [ ] Mission/loan/report scope-null actor cross-org tests pass.
- [ ] Admin cross-org list/mutation tests pass.
- [ ] Notification REST/WS/mark-read partition tests pass.
- [ ] Upload missing/type/size/workbook limits tests pass.
- [ ] Loan return/export concurrency invariant test passes.

## Success Criteria

- [ ] Foreign organization returns 403/404 consistently and causes zero writes.
- [ ] Two organizations with the same role never receive each other's notification through API or WS.
- [ ] Oversize upload returns 413 or documented 400; missing/wrong file never causes 500.
- [ ] Existing transfer/report/mission concurrency suites remain green.

## Risk Assessment

- Notification schema change can break all producers. Mitigation: enumerate producers, migration/backfill policy, compile plus end-to-end dispatch/report/incident tests.
- Loading actor per request increases queries. Mitigation: one indexed principal lookup; optimize only after measurement.
- Prisma migration history is absent. Mitigation: create reviewed baseline/migration and rehearse apply/rollback on disposable DB only.

## Security Considerations

This is release-blocking. UI hiding is not acceptance. Every negative test must call the real controller/service boundary with foreign IDs.

## Next Steps

Phase 4 may start only when mission list/get/transition and notification audience contracts are stable.

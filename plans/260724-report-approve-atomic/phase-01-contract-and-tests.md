---
title: P0-5 contract and tests
status: completed
phase: 1
---

# Phase 01 - Contract And Tests

## Requirements

- Lock allocation, idempotency, rollback, scope, audit, and readiness behavior with focused tests.
- Use isolated PostgreSQL fixtures and cleanup without seed/reset.

## Files

- `apps/backend/src/inventory/__tests__/inventory-adjustment-reconcile.spec.ts`
- `apps/backend/src/loan/__tests__/loan-table-lock.spec.ts`
- `apps/backend/src/report/__tests__/report-approve-atomic.spec.ts`
- `apps/backend/test/report-approve-atomic.e2e-spec.ts`

## Checklist

- [x] Unit covers two-batch allocation below/equal/above aggregate stock.
- [x] Unit covers loan preservation, missing SKU, duplicate rows, retry, and readiness failure.
- [x] Unit covers loan lock-before-read and public reconcile no-op/stale-snapshot CAS.
- [x] E2E covers rollback, concurrent approve, approve/reject race, and cleanup baseline.
- [x] E2E covers stale borrow, partial return, and inventory mutation after allocation.
- [x] Tests preserve current route and response shape.

## Risks

- Fake transactions cannot prove PostgreSQL locking; concurrency and rollback stay in E2E.

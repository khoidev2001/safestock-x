---
title: P0-5 atomic implementation
status: completed
phase: 2
---

# Phase 02 - Atomic Implementation

## Requirements

- Move reconciliation into a caller-owned transaction without changing the public wrapper.
- Allocate every SKU count deterministically across all warehouse batches.
- Prevent stale quantity overwrite and duplicate report transitions.

## Files

- `apps/backend/src/inventory/inventory-adjustment.service.ts`
- `apps/backend/src/loan/loan-table-lock.ts`
- `apps/backend/src/loan/loan.service.ts`
- `apps/backend/src/report/report.service.ts`

## Checklist

- [x] Add `reconcileInTx` with scope/CAS validation and no pre-commit readiness work.
- [x] Keep `reconcile()` behavior by wrapping the helper and recalculating after commit; preserve count-only no-op.
- [x] Claim report `PENDING` and perform allocation/reconcile/audit in one transaction.
- [x] Lock loans for approve and acquire the coordinating table lock before borrow/return reads.
- [x] Reconcile with the original allocation snapshot as the CAS baseline.
- [x] Process SKU and batch keys in deterministic lock order.
- [x] Make APPROVED retry side-effect free and reject competing terminal state.
- [x] Use conditional reject transition to close approve/reject race.
- [x] Recalculate the report warehouse once after successful commit.

## Risks

- Allocation is synthetic because Excel has no batch code; plan records the deterministic policy.
- Concurrent stock mutation must fail CAS and roll back instead of being overwritten.

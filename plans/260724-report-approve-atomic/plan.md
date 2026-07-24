---
title: P0-5 report approve atomic
status: completed
priority: P0
effort: medium
branch: feat/operational-readiness-seed-map
tags: [backend, report, inventory, atomicity]
created: 2026-07-24
---

# P0-5 Report Approve Atomic

## Outcome

Approve one pending monthly stock report by reconciling every matching batch for each reported SKU, with all inventory counts, quantity overrides, audits, and the report transition committed atomically and applied at most once.

## Constraints

- Keep route, controller DTO shape, frontend contract, Prisma schema, and permissions unchanged.
- Preserve open-loan quantities when reconciling physical in-stock counts.
- No seed, reset, schema push, migration, or network operation.
- Preserve unrelated P0-3 worktree changes.
- Use organization + commune model only; no district boundary.

## Decisions

- Order batches by `createdAt`, then `id`.
- Allocate the SKU count oldest-first up to each batch's current expected in-stock; the final batch absorbs excess.
- Reconcile every matching batch, including zero and unchanged allocations.
- Reject duplicate SKU rows and malformed persisted rows before any committed mutation.
- Missing SKU keeps current skipped behavior.
- Claim `PENDING` conditionally; an `APPROVED` retry returns the existing response shape with empty `applied` and creates no new writes.
- Lock the `LoanRecord` table in `SHARE` mode during approve; borrow/return acquire an explicit `ROW EXCLUSIVE` table lock before reading stock or loans.
- Use the allocation snapshot as the reconcile CAS baseline so concurrent inventory changes fail and roll back instead of being overwritten.
- Process SKU and batch keys in deterministic order to keep concurrent lock acquisition consistent.
- Record per-batch reconcile audit only when quantity changes and one report-level approval audit.
- Recalculate readiness once after commit; failure is best-effort and does not reverse approval.
- Preserve the public count-only reconcile no-op contract.

## Phases

| Phase | Status | File |
|---|---|---|
| Contract and tests | completed | [phase-01-contract-and-tests.md](phase-01-contract-and-tests.md) |
| Atomic implementation | completed | [phase-02-atomic-implementation.md](phase-02-atomic-implementation.md) |
| Verification and finalize | completed | [phase-03-verification-and-finalize.md](phase-03-verification-and-finalize.md) |

## Acceptance Criteria

- Two or more batches receive non-negative allocated counts whose sum equals the report row quantity.
- Outstanding loans remain part of system quantity but not physical counted quantity.
- Later failure rolls back every quantity, count, audit, and report status write.
- Concurrent approve/retry creates one mutation set; approve/reject race has one coherent winner.
- Concurrent borrow/return cannot pass approval with a stale availability or loan snapshot.
- Concurrent inventory mutation cannot be overwritten by reconciliation calculated from an older allocation snapshot.
- Deterministic SKU and batch ordering avoids inconsistent lock order across concurrent approvals.
- Missing SKU is reported as skipped; duplicate SKU rows fail without writes.
- Route, schema, controller signature, and frontend behavior remain compatible.
- Focused unit, PostgreSQL E2E, full backend Jest, build, and whitespace checks pass.

## Dependencies

- `InventoryAdjustmentService` transaction-client reconciliation seam.
- Existing mission conditional-claim and inventory CAS patterns.

## Unresolved Questions

- None blocking; allocation policy is explicitly fixed above because the report format has no batch identity.

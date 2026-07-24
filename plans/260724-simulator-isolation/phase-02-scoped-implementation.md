# Phase 02 - Scoped Implementation

## Requirements

- Apply view/mutation decorators and pass `userId` through every simulator operation.
- Reauthorize direct service calls and every background runner event.
- Scope first warehouse, device, timeline, event, and run access by current database state.
- Authorize create-run before the scenario upsert or any other write.
- Replace the cached human ADMIN actor with one dedicated actor per warehouse.
- Create reserved actors concurrency-safely and reject any existing reserved identity that violates organization, warehouse, role, or system-name invariants.
- Pass exact warehouse scope into loadcell inventory mutations.

## Files

- `apps/backend/src/simulation/simulation.controller.ts`
- `apps/backend/src/simulation/simulation.service.ts`
- `apps/backend/src/simulation/runner.service.ts`
- `apps/backend/src/simulation/simulation.module.ts`
- `apps/backend/src/simulation/simulation-system-actor.service.ts`
- `apps/backend/src/simulation/__tests__/first-warehouse.spec.ts`
- `apps/backend/src/simulation/__tests__/incident-scan-debounce.spec.ts`
- New focused simulator and runner isolation tests.

## Completion

- [x] Controller applies view/mutation permission metadata and propagates current user ID.
- [x] Direct service and runner paths reauthorize current DB actor and stored run warehouse.
- [x] Create-run authorization executes before scenario upsert.
- [x] Loadcell inventory, audit, device baseline, and sensor event commit atomically under a device row lock.
- [x] Reserved actors are per warehouse, revalidated, non-login, and immutable through admin APIs.
- [x] Runner control commands serialize; pause/reset await in-flight fire; completion/resume/failure paths are covered.

## Validation

- Direct service bypass is denied before device/run writes.
- Denied create-run attempts do not upsert scenarios.
- Run state changes and scheduled events use the initiating actor and stored run warehouse.
- Device/shelf warehouse mismatch is rejected.
- Loadcell import/export receives the reserved actor and exact warehouse scope.
- Reserved-email collisions fail instead of repurposing an ordinary user.

## Risk and Rollback

- Risk: changing internal service signatures breaks in-repository callers. Mitigation: search every caller and compile all affected packages.
- Risk: active timers continue after revocation. Mitigation: reauthorize in `fire` and stop the run on authorization failure.
- Rollback: revert controller/runner integration together; do not leave route-only protection as the final state.

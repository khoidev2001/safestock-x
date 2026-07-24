---
title: P0-2 Simulator isolation
status: completed
priority: P0
effort: medium
branch: feat/operational-readiness-seed-map
tags: [backend, simulator, authorization, tenant-isolation]
created: 2026-07-24
---

# P0-2 Simulator Isolation

## Outcome

Make simulator mutation fail closed by default, restrict mutation to current database-backed ADMIN users, enforce organization and warehouse scope on every simulator resource, and attribute loadcell inventory changes to a dedicated warehouse system actor.

## Constraints

- Do not change Prisma schema, migrations, seed data, or reset/push the database schema.
- Keep simulator REST paths, request DTOs, response shapes, scenario defaults, and the three existing roles.
- Preserve unrelated P0-1, P0-3, and P0-5 worktree changes.
- Do not read or print `.env`; document only `.env.example`.
- Do not claim `reset` rolls back inventory, incidents, notifications, or prior sensor events.

## Non-goals

- No simulator UI redesign.
- No full-system authorization centralization.
- No separate simulator database or schema-level demo-tenant marker in this slice.
- No general session revocation or notification partitioning changes.

## Decisions

- Add `simulation:view` for all three roles and `simulation:mutate` for ADMIN only.
- Add `SIMULATION_MUTATION_ENABLED=false`; only case-insensitive `true` enables writes, while invalid configured values fail startup.
- Return HTTP 403 for disabled mutation and out-of-scope warehouse access.
- Reload actor role, organization, and warehouse assignment from the database inside the simulator boundary; JWT claims are not authorization authority.
- Authorize run mutations through the run's stored `warehouseId` before changing run state.
- Store the initiating actor in active runner memory and reauthorize every background event.
- Provision one reserved `@local.invalid` WAREHOUSE user per warehouse for loadcell attribution, with an unknown random password hash and no ADMIN fallback. Existing reserved identities must match the exact organization, warehouse, role, and system-name invariants or provisioning fails.
- Pass the exact warehouse scope into loadcell inventory import/export and reject device/shelf warehouse inconsistencies.

## Threat Model

- Elevation of privilege: RESCUE or WAREHOUSE user invokes simulator POST routes.
- Horizontal access: an authenticated user supplies another warehouse or run ID.
- Stale authority: JWT still says ADMIN or warehouse A after the database user is demoted, reassigned, or deleted.
- Repudiation: loadcell changes are attributed to an unrelated human ADMIN.
- Tampering/amplification: an enabled run continues generating writes after configuration or actor authority changes.

## Phases

| Phase | Status | File |
|---|---|---|
| Contract and policy | completed | [phase-01-contract-and-policy.md](phase-01-contract-and-policy.md) |
| Scoped implementation | completed | [phase-02-scoped-implementation.md](phase-02-scoped-implementation.md) |
| Verification and finalize | completed | [phase-03-verification-and-finalize.md](phase-03-verification-and-finalize.md) |

## Acceptance Criteria

- [x] Missing or false mutation flag blocks all simulator POST operations before any write.
- [x] Create-run authorization happens before the shared scenario upsert, so denied requests also produce zero scenario writes.
- [x] RESCUE and WAREHOUSE cannot mutate; ADMIN can mutate only when enabled and still authorized in the database.
- [x] A warehouse-scoped actor cannot read or write another warehouse; an unscoped ADMIN cannot access another organization.
- [x] Play, pause, reset, and background fire authorize through the run warehouse before mutation.
- [x] Disabled or revoked background runs stop without producing further sensor/inventory mutations.
- [x] Loadcell inventory transactions use the reserved actor for the exact warehouse and never a human ADMIN.
- [x] Simulator GET and POST REST paths, DTOs, response shapes, Prisma schema, and role count remain unchanged.
- [x] Focused tests, backend tests/build, shared-types build, and affected client builds pass.

## Residual Risks

- The ordinary-user system actor may appear in admin user management until a future schema-backed internal-user discriminator exists.
- Enabling the flag still targets operational warehouse data; true physical data separation needs a separate deployment/database or durable demo-tenant model.
- This slice must not mark the PRD demo/prod data-separation requirement complete.
- `reset` remains runner-state reset only.
- A process restart between multiple scenario events with the same `offsetMs` can skip remaining same-offset events; same-process pause/resume keeps the exact index.

## Unresolved Questions

- None blocking for this phase.

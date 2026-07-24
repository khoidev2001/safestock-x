---
type: project-manager
date: 2026-07-24
---

# P0-2 Simulator Isolation - Completion Report

**Date:** 2026-07-24
**Status:** Completed plan slice
**Authority:** `plans/260724-simulator-isolation/plan.md`

## Result

| Area | Result | Evidence |
|---|---|---|
| Safe default | Completed | `SIMULATION_MUTATION_ENABLED=false`; invalid values fail startup |
| Current authorization | Completed | Service reloads current role, organization, and warehouse assignment from DB |
| RBAC | Completed | All roles view; only ADMIN has `simulation:mutate` |
| Resource isolation | Completed | Warehouse and run access checked before write; create-run checks before scenario upsert |
| Background runner | Completed | Actor rechecked per event; controls serialized; pause/reset await in-flight event |
| Loadcell attribution | Completed | Reserved non-login actor per warehouse; no human ADMIN fallback |
| Atomicity | Completed | Inventory, audit, device baseline, and sensor event share one transaction and device row lock |
| Public contracts | Preserved | REST paths, DTOs, response construction, Prisma schema, and three roles unchanged |

## Verification

| Gate | Result |
|---|---|
| Focused unit tests | 10 suites, 59/59 pass |
| Full backend Jest | 44 suites, 298/298 pass |
| PostgreSQL simulator E2E | 1 suite, 4/4 pass |
| Backend build | Pass |
| Shared-types build | Pass |
| Frontend build | Pass |
| Desktop typecheck/build | Pass |
| Mobile TypeScript | Pass |
| `git diff --check` | Pass |
| Independent tester/debugger/reviewer | No blocking finding |

## Security Boundary

- Missing/false flag, non-ADMIN role, stale/deleted actor, foreign organization, and wrong warehouse fail before operational writes.
- Reserved actor cannot login, refresh, use old HTTP/Socket tokens, or be created/edited/deleted through admin APIs.
- Loadcell import/export scope is enforced inside the same transaction as quantity mutation.
- Failed event persistence rolls back inventory, audit, and device baseline.

## Known Limits

- This plan does not provide a separate simulator database/tenant. Production must keep the flag false; enabled simulation targets that deployment's warehouse data.
- `reset` resets run state/cursor only; it does not undo prior inventory, events, incidents, or notifications.
- After process restart, multiple events sharing one `offsetMs` can cause remaining same-offset events to be skipped; same-process resume is exact.
- Reserved actors remain ordinary `User` rows because schema changes were excluded, but interactive and admin mutation paths are blocked.
- Desktop build emits the existing non-fatal `expo/tsconfig.base` warning while exiting 0.

## Data Safety

- No Prisma schema, migration, seed, reset, or schema-push command used.
- PostgreSQL E2E creates isolated fixtures and removes operational rows/system actors afterward.
- Existing P0-1, P0-3, and P0-5 dirty work preserved.

## Unresolved Questions

- Durable demo/prod data separation remains a follow-up deployment/schema decision.

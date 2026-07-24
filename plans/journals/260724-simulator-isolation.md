---
date: 2026-07-24
session: p0-2-simulator-isolation
---

# Journal: 2026-07-24 - P0-2 Simulator Isolation

## Context

The simulator mutation boundary needed to fail closed, use current database-backed authorization, enforce organization and warehouse scope, and stop attributing loadcell inventory changes to an arbitrary human ADMIN.

## What Happened

- Added a strict, default-off mutation gate and separate simulator view/mutate permissions.
- Moved authorization checks into the simulator boundary, reloading the actor from the database and checking warehouse/run ownership before writes.
- Added a reserved warehouse system actor convention and atomic loadcell persistence for inventory, audit, device baseline, and sensor events.
- Reauthorized background events, serialized runner controls, and preserved exact same-process pause/resume progress.
- Verified focused tests at 59/59, full backend tests at 298/298, and PostgreSQL simulator E2E at 4/4.
- Backend, shared-types, frontend, and desktop builds passed; desktop and mobile typechecks passed; `git diff --check` passed.

## Reflection

The work closed the immediate cross-role, cross-warehouse, stale-authority, attribution, and partial-write risks without changing public simulator contracts or the data schema. The boundary remains operational isolation, not true demo/production data separation. `reset` remains runner-state reset rather than rollback. A restart can still skip remaining events sharing the last processed `offsetMs`, and reserved actors remain ordinary `User` rows until a schema-backed internal actor type exists.

## Decisions Made

| Decision | Rationale | Impact |
|---|---|---|
| Keep simulator mutation disabled unless explicitly enabled | Fail closed on missing, false, or invalid configuration | Production deployments can keep simulator writes off by default |
| Reload actor authority and scope each mutation/background event | JWT claims can become stale | Demotion, deletion, reassignment, and foreign-resource access fail before writes |
| Use one reserved WAREHOUSE actor per warehouse | Avoid attributing automation to a human ADMIN | Loadcell transactions have deterministic warehouse-local attribution under the ordinary `User` actor convention |
| Persist loadcell effects atomically | Prevent partial inventory, audit, device, or sensor state | Failed event persistence rolls back the whole event transaction |
| Keep reset and restart semantics explicit | Avoid claiming guarantees the implementation does not provide | Reset is not rollback; same-offset restart remains a known caveat |

## Next Steps

- Resolve durable demo/production separation through deployment or schema design before enabling simulation against sensitive operational data.
- Consider a schema-backed internal actor discriminator and restart-safe event cursor model in later work.
- Keep durable product behavior and setup guidance in the PRD/setup documentation; this journal remains work history only.
- External and AgentWiki publication skipped because it was not authorized.

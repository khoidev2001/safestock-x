---
title: P0-1 WebSocket authentication and server-derived rooms
status: completed
priority: P0
effort: medium
branch: feat/operational-readiness-seed-map
tags: [backend, websocket, authentication, authorization]
created: 2026-07-24
---

# P0-1 WebSocket Authentication

## Outcome

Reject unauthenticated Socket.IO handshakes and derive every role and warehouse room from the authenticated user's current database assignment.

## Constraints

- Keep existing `notification` and `sensor_event` event names and payloads.
- Do not accept role or warehouse room authority from client messages.
- Do not change Prisma schema, seed data, migrations, or REST contracts.
- Preserve unrelated P0-3 and P0-5 worktree changes.
- Keep the one-database-per-commune deployment boundary documented by the PRD.

## Decisions

- Authenticate in Socket.IO middleware before the connection event.
- Accept the access token from `handshake.auth.token`, with Bearer header fallback for non-browser clients.
- Verify with `JWT_ACCESS_SECRET`, then load the current user role and assignment from the database.
- A warehouse-scoped user joins only `wh:<assignedWarehouseId>`.
- A commune-wide user joins every warehouse room in the user's organization.
- Every user joins only `role:<currentDatabaseRole>`.
- Install shared middleware idempotently because both gateways use the default namespace.
- Remove legacy `join` and `join-role` handlers instead of retaining an insecure compatibility fallback.
- Keep notification routing role-based in this phase; multi-organization notification partitioning remains separate scope.

## Phases

| Phase | Status | File |
|---|---|---|
| Contract and implementation | completed | [phase-01-contract-and-implementation.md](phase-01-contract-and-implementation.md) |
| Client migration | completed | [phase-02-client-migration.md](phase-02-client-migration.md) |
| Verification and finalize | completed | [phase-03-verification-and-finalize.md](phase-03-verification-and-finalize.md) |

## Acceptance Criteria

- Missing, invalid, expired, or deleted-user tokens fail the handshake.
- Role and warehouse rooms come only from current database state.
- A warehouse-A user does not receive warehouse-B sensor events.
- Legacy client room messages cannot add unauthorized membership.
- Web, mobile, desktop, terminal demo, and static simulator send an access token during handshake.
- Focused WebSocket security tests, backend tests/build, and affected client type/build checks pass.

## Unresolved Questions

- None blocking. Token-expiry disconnect and mobile refresh-token support are follow-up hardening work.

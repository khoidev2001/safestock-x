# Phase 01 - Contract and Implementation

## Requirements

- Add one shared authentication service owned by `AuthModule`.
- Install Socket.IO middleware once for the shared default namespace.
- Persist the authenticated principal on `socket.data` without logging tokens.
- Join role and warehouse rooms only after successful authentication.
- Remove client-controlled room handlers.

## Files

- `apps/backend/src/auth/websocket-auth.service.ts`
- `apps/backend/src/auth/auth.module.ts`
- `apps/backend/src/simulation/simulation.gateway.ts`
- `apps/backend/src/simulation/simulation.module.ts`
- `apps/backend/src/notification/notification.gateway.ts`
- `apps/backend/src/notification/notification.module.ts`

## Validation

- Focused authentication and room-isolation tests.
- Backend build.

## Risk and Rollback

- Risk: both gateways install duplicate middleware. Mitigation: service-level `WeakSet` guard.
- Risk: old clients lose realtime. Mitigation: migrate all in-repository clients in the same change.
- Rollback: restore legacy gateway handlers and remove the shared service if the complete client migration cannot ship atomically.

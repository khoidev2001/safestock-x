# 2026-07-24 - P0-1 WebSocket Authentication

## Context

The default Socket.IO namespace accepted unauthenticated connections. Clients could emit `join` or `join-role` with arbitrary warehouse and role values, then receive sensor or notification traffic outside their assignment.

## Decision

- Install one idempotent Socket.IO middleware before connection acceptance.
- Verify access JWTs with `JWT_ACCESS_SECRET` and HS256.
- Use only the token subject to load the current user role, organization, and warehouse assignment from the database.
- Join a scoped user to its assigned warehouse and a commune-wide user to organization warehouses.
- Join the current database role room and remove both legacy room handlers.
- Send handshake auth from every in-repository Socket.IO client.
- Let desktop refresh once on `Unauthorized`, guarded by session version and original refresh token so late responses cannot restore a logged-out or replaced session.

## Evidence

- Focused WebSocket tests: 2 suites, 7/7 pass.
- Full backend Jest: 38 suites, 256/256 pass.
- PostgreSQL AppModule E2E: 9/9 pass.
- Backend, frontend, and desktop builds pass.
- Mobile and desktop TypeScript checks pass.
- `git diff --check` passes.
- Independent tester found no P0 blocker.
- Security reviewer passed the final code after the desktop refresh race was fixed.

## Accepted Limits

- Connected sockets are not revoked mid-session when the access token expires or assignment changes.
- Notifications remain role-wide within the one-database-per-commune deployment model.
- Mobile has no refresh-token flow.
- Desktop makes one guarded refresh attempt; transient refresh failure needs a later reconnect or login.

## Data Safety

- No schema, migration, seed, reset, or schema-push operation was used.
- Existing P0-3 and P0-5 worktree changes were preserved.

## Next P0 Work

- P0-2 simulator production isolation, permissions, warehouse mutation scope, and dedicated system actor.

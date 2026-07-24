# Phase 02 - Client Migration

## Requirements

- Pass access tokens with Socket.IO handshake auth.
- Remove every `join` and `join-role` emit.
- Preserve current event listeners and reconnect behavior where possible.
- Surface connection errors in clients that already show connection status.

## Files

- `apps/frontend/src/app/page.tsx`
- `apps/frontend/src/components/mission/notification-bell.tsx`
- `apps/mobile/App.tsx`
- `apps/desktop/src/renderer/lib/api.ts`
- `apps/desktop/src/renderer/lib/socket.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/backend/demo/demo.mjs`
- `apps/backend/public/sim.html`

## Validation

- Frontend build.
- Mobile TypeScript check.
- Desktop typecheck and build.

## Risk and Rollback

- Risk: token refresh occurs after socket creation. Use dynamic token access where the client already supports refresh.
- Rollback: revert client handshake options together with backend middleware; do not ship a mixed contract.

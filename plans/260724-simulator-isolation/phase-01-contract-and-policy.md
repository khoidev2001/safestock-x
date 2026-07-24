# Phase 01 - Contract and Policy

## Requirements

- Add separate simulator view and mutation permissions without adding roles.
- Validate the optional mutation flag with a safe default.
- Implement a database-backed access service for current permission, organization, warehouse, and run scope.
- Keep disabled and cross-scope failures fail closed before writes.

## Files

- `packages/shared-types/src/index.ts`
- `apps/backend/src/config/env.validation.ts`
- `apps/backend/src/config/__tests__/env.validation.spec.ts`
- `apps/backend/src/rbac/__tests__/permissions.spec.ts`
- `apps/backend/src/simulation/simulation-access.service.ts`
- `apps/backend/src/simulation/__tests__/simulation-access.service.spec.ts`
- `.env.example`

## Completion

- [x] Added separate view and mutation permissions while preserving exactly three roles.
- [x] Added strict optional mutation flag validation and safe false default.
- [x] Added current-DB permission, organization, and warehouse access service.
- [x] Added focused permission, config, deleted-user, stale-role, and scope tests.

## Validation

- Permission mapping tests prove exactly three roles, view for all roles, and mutation for ADMIN only.
- Configuration tests prove absent/false disabled, true enabled, and invalid values rejected.
- Access tests prove current DB role and organization/warehouse scope override stale JWT claims.

## Risk and Rollback

- Risk: a route-level JWT permission passes stale authority. Mitigation: service-level database reload is mandatory before resource access.
- Rollback: remove the new permission/config contract and provider before any controller or runner integration ships.

# Phase 01 - Contract and Guard

## Requirements

- Add the demo runtime contract and explicit env-file selection.
- Fail startup when simulator mutation is enabled outside an unmistakable demo database.
- Preserve all behavior when mutation is false or unset.

## Files

- `apps/backend/src/app.module.ts`
- `apps/backend/src/config/env.validation.ts`
- `apps/backend/src/config/__tests__/env.validation.spec.ts`
- New focused config helper/test only if needed for clarity.

## Steps

1. Resolve `SAFESTOCK_ENV_FILE` as the sole config file when explicitly supplied; keep current fallback paths otherwise.
2. Validate runtime/stack plus exact PostgreSQL and Redis URL agreement when simulator mutation is true.
3. Add focused happy/error tests without weakening existing validation.

## Validation

- Run the backend env validation suite.
- Run backend build.

## Completion

- [x] Explicit env-file selection preserves operational fallback and isolates demo loading.
- [x] Mutation-enabled startup requires fixed demo runtime, stack, bind, PostgreSQL, Redis, and API endpoints.
- [x] Focused backend config tests pass: 2 suites, 26/26.

## Risk and Rollback

- Risk: an existing ad-hoc demo config with only the old flag will stop starting. This is intentional fail-closed behavior; migrate it to the new demo contract.
- Rollback: remove the new coupling checks and explicit env-file helper.

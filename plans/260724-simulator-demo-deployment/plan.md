---
title: P0-2b isolated simulator demo deployment
status: completed
priority: P0
effort: medium
branch: feat/operational-readiness-seed-map
tags: [infrastructure, simulator, database-isolation, deployment]
created: 2026-07-24
---

# P0-2b Isolated Simulator Demo Deployment

## Outcome

Provide a supported second runtime on the same Windows host where simulator mutations use a dedicated PostgreSQL database, Redis instance, Docker volumes, credentials, and backend port. The operational runtime remains unchanged and cannot enable simulator writes accidentally.

## Constraints

- Preserve current operational commands, ports, container names, volumes, and `.env` behavior.
- Do not change Prisma schema, migrations, seed data, REST paths, DTOs, or simulator responses.
- Do not run schema push, seed, reset, or any operational database mutation while implementing this slice.
- Do not read or print `.env`; only add and validate `.env.demo.example`.
- Preserve unrelated P0-1, P0-3, and P0-5 dirty work.

## Non-goals

- No second Next.js or AI service deployment; demo uses backend-served `/sim.html` and the desktop client's configurable backend host.
- No Docker image/containerization for application processes.
- No scheduled-task installer for the demo backend.
- No tenant discriminator or Prisma schema split.
- No automatic reset on startup; demo data persists until an explicit guarded reset.

## Decisions

- Reuse `infrastructure/docker-compose.yml`, parameterizing container names while preserving `safestock_postgres` and `safestock_redis` defaults.
- Use Compose project `safestock-demo` plus `STACK_NAME=safestock_demo` for separate volumes and containers.
- Fix demo PostgreSQL/Redis/backend to `55434`/`56381`/`3110`.
- Add `SAFESTOCK_RUNTIME=demo`; enabling simulator mutation also requires exact demo PostgreSQL and Redis connection invariants.
- Load the demo backend from an explicit `.env.demo` only. The launcher removes inherited application config before applying parsed demo values, so a poisoned parent shell cannot redirect the child to operational services.
- Route all demo lifecycle commands through a guarded Node launcher; reset requires `--confirm-demo-reset`, malformed arguments fail closed, and schema/reset/backend require healthy containers owned by the `safestock-demo` Compose project.

## Phases

| Phase | Status | File |
|---|---|---|
| Contract and guard | completed | [phase-01-contract-and-guard.md](phase-01-contract-and-guard.md) |
| Isolated runtime tooling | completed | [phase-02-isolated-runtime-tooling.md](phase-02-isolated-runtime-tooling.md) |
| Verification and finalize | completed | [phase-03-verification-and-finalize.md](phase-03-verification-and-finalize.md) |

## Acceptance Criteria

- [x] Operational `pnpm infra:*` commands still resolve the original container names and project volumes.
- [x] Demo Compose resolves distinct container names, project volumes, credentials, database, Redis, and host ports.
- [x] Backend startup rejects `SIMULATION_MUTATION_ENABLED=true` unless runtime, stack, PostgreSQL, Redis, and API port all satisfy the demo contract.
- [x] Demo launcher rejects inherited config poisoning, placeholders, malformed/duplicate options, URL/config mismatches, non-demo resources, and reset without explicit confirmation immediately before spawn.
- [x] Schema/reset/backend verify running container names, images, Compose labels, loopback bindings, health, and project-owned volumes before executing.
- [x] Demo backend loads only `.env.demo` and starts on port `3110`; `/sim.html` remains the supported demo UI.
- [x] No Prisma schema, API, role, DTO, or response contract changes.
- [x] Focused guard tests, launcher tests with poisoned parent env, inspectable Compose isolation assertions, full backend tests/build, ignore checks, and diff checks pass.
- [x] Setup, README, PRD/checklist, report, and journal describe the real isolation and remaining live-deployment limitation.

## Rollback

- Remove demo-only files and package scripts.
- Restore fixed Compose container names.
- Remove the runtime/database coupling checks while retaining the existing mutation flag default.
- No database rollback is needed because this slice changes no schema or operational data.

## Unresolved Questions

- None blocking. A live dual-stack smoke test remains an operator acceptance step because this implementation intentionally does not create or reset databases.

---
title: "P0-2b isolated simulator demo deployment"
date: 2026-07-24
type: technical-journal
status: completed
authority: historical-only
---

# P0-2b Isolated Simulator Demo Deployment

## Context

P0-2 had made simulator mutations fail closed and warehouse-scoped, but a supported same-host demo still needed physical runtime separation from operational PostgreSQL, Redis, volumes, credentials, and backend port. This slice added that deployment/configuration boundary without changing Prisma schema, migrations, seed data, REST/DTO contracts, or simulator responses.

This entry records work history only. Current behavior and operator instructions remain owned by the code, `README.md`, `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md`, `docs/PRD.md`, and `docs/checklist-cong-viec-con-lai.md`.

## What Happened

1. The plan defined a second runtime on the same Windows host: Compose project `safestock-demo`, stack `safestock_demo`, PostgreSQL `55434`, Redis `56381`, and backend `3110`. Existing operational commands, names, ports, volumes, and `.env` lookup remained compatible.
2. Initial plan review returned **BLOCK**. Main gaps: inherited parent-shell variables could redirect child processes; seed targeting was not proven; Redis isolation was weaker than database isolation; Compose separation lacked inspectable assertions; `.env.demo` ignore/tracking behavior was not proven.
3. The launcher was hardened to parse `.env.demo`, remove known application keys from the inherited environment case-insensitively, then apply demo values and an absolute `SAFESTOCK_ENV_FILE`. This covers Windows key casing such as `DATABASE_URL` versus `database_url` while preserving unrelated system variables.
4. Backend config and Prisma seed now honor an explicit environment file. Mutation-enabled startup and launcher guards require the demo runtime, stack/container identity, loopback bind, matching PostgreSQL URL/user/password/database/port, matching Redis URL/port, strong demo-only secrets, and disabled external email/backup effects.
5. Compose kept operational defaults but parameterized stack names and bind addresses. A render-only verifier asserts operational and demo project names, containers, published ports, PostgreSQL settings, credentials difference, and distinct PostgreSQL/Redis volume identities without starting containers.
6. Fixed lifecycle commands were exposed through `package.json`. Reset refuses to proceed without `--confirm-demo-reset`; no startup path automatically resets or seeds. `.gitignore` ignores `.env.demo` while explicitly keeping `.env.demo.example` trackable.
7. A second debugger review returned **BLOCK**. The launcher still accepted a custom local Redis endpoint instead of the one reviewed demo endpoint, malformed or duplicate CLI options were not rejected strictly enough, and mutation-capable actions needed proof that running containers were the intended demo resources rather than lookalikes.
8. The follow-up fix pinned endpoints to PostgreSQL `localhost:55434`, Redis `redis://localhost:56381` with no credentials/path/query/fragment, bind `127.0.0.1`, and API `3110`. A strict parser now rejects unknown actions/options, missing or duplicate `--env-file`, invalid reset confirmation placement, and other unexpected arguments.
9. Before `schema`, `reset`, or `backend`, the launcher now inspects both containers and verifies Compose project/service labels, exact container names and images, running/healthy state, loopback port bindings, project-owned volume names/destinations, and PostgreSQL database/user/password environment values.
10. README, setup guide, PRD, and remaining-work checklist were updated with exact commands, safety boundaries, resource ownership, and the uncompleted live pilot acceptance step.
11. Final debugger result: **PASS**. Final reviewer result: **PASS**. Tester evidence: Node demo tests **10/10**, focused tests **26/26**, full backend **45 suites / 310/310**, backend build pass, Compose verification pass, and diff checks pass.
12. During implementation and verification, no Docker `up`/`down`, schema push, seed, reset, migration, or database mutation was run.

## Reflection

The two block rounds were useful because the largest risks were process-boundary and operator-targeting failures, not the visible Compose template. A separate port or database name is insufficient when inherited environment variables, seed loading, a merely local Redis endpoint, permissive CLI parsing, or a lookalike container can still cross the boundary. The final approach makes those assumptions executable and testable.

Static guards, rendered Compose assertions, and container-identity inspection provide strong configuration and pre-mutation proof without touching live data. They do not prove two stacks can run together on the actual pilot host. Documentation therefore states implementation/config support is complete while live dual-stack acceptance remains pending.

## Decisions

| Decision | Rationale | Impact |
|---|---|---|
| Preserve operational Compose defaults and add a named demo project/stack | Avoid changing current container and volume ownership | Existing `pnpm infra:*` behavior remains compatible; demo resources resolve separately |
| Sanitize inherited application variables case-insensitively | Windows environment keys can differ only by case and poison child targeting | Demo child processes receive only explicit demo application configuration |
| Use `SAFESTOCK_ENV_FILE` for backend and seed | All mutation-capable processes need the same proven target | Backend startup and seed load the selected `.env.demo` instead of implicit `.env` fallback |
| Pin exact PostgreSQL, Redis, bind, and API endpoints | Any alternative local endpoint remains outside the reviewed demo contract | Startup fails closed unless PostgreSQL is `55434`, Redis is exactly `redis://localhost:56381`, bind is `127.0.0.1`, and API is `3110` |
| Parse launcher arguments strictly | Malformed, duplicate, or misplaced options can change targeting or operator intent | Unknown actions/options and invalid `--env-file` or reset confirmation forms fail before execution |
| Require explicit reset confirmation and never auto-reset | Reset/seed is destructive even against an intended demo database | Operator intent is required; demo volumes persist across normal shutdown |
| Inspect container identity before schema/reset/backend | Correct environment text does not prove the running resources are the intended stack | Compose project/service, name, image, health, loopback port, volume, and PostgreSQL environment must match before a mutation-capable process starts |
| Verify Compose by rendering and asserting identities | Isolation needed machine-checkable proof without live infrastructure changes | Projects, containers, ports, service config, and volumes are checked without Docker lifecycle actions |
| Keep this journal historical-only and local | Journals do not replace current docs or grant publication authority | No external or AgentWiki publication was attempted; publishing was skipped because it was not authorized |

## Next Steps

- Run the live dual-stack pilot smoke on the intended Windows host: operational and demo stacks together, operational mutation still disabled, demo backend on `3110`, desktop targeting `3110`, and no shared data or volumes.
- Confirm `pnpm demo:infra:down` preserves demo data and does not disturb operational services.
- Update the owning acceptance/report artifacts only after live evidence exists; do not promote this journal as product authority.

## Unresolved Questions

- Which pilot host and maintenance window will be used for the remaining live dual-stack smoke test?

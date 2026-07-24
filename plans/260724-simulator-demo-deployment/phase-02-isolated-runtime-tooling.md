# Phase 02 - Isolated Runtime Tooling

## Requirements

- Provide distinct PostgreSQL credentials, JWT credentials, Redis instance, volumes, and backend port. Redis authentication remains out of scope because current consumers do not support it.
- Prevent demo reset commands from targeting operational configuration.
- Keep existing operational commands and resource names stable.

## Files

- `infrastructure/docker-compose.yml`
- `.gitignore`
- New `.env.demo.example`
- `package.json`
- New `infrastructure/demo/demo-environment-guard.mjs`
- New `infrastructure/demo/manage-demo-environment.mjs`
- New `infrastructure/demo/demo-environment-guard.test.mjs`

## Steps

1. Parameterize Compose container names with defaults matching current operational names.
2. Add the demo environment template with isolated ports/resources and disabled external side effects.
3. Parse `.env.demo` without mutating the parent process, remove inherited application keys, and build a sanitized child environment from the demo file.
4. Add pure guards for fixed demo endpoints, strict CLI arguments, credentials, and reset confirmation.
5. Add a fixed-command launcher for validate/config/up/down/logs/status/schema/reset/backend. Schema/reset receive the exact guarded child environment; reset checks confirmation immediately before spawn.
6. Require schema/reset/backend to inspect healthy containers and prove demo Compose project, names, images, loopback bindings, and volumes.
7. Add inspectable Compose assertions for project names, containers, published ports, service configuration, and resolved volume identities.
8. Expose concise package scripts; do not auto-seed or auto-reset.

## Validation

- Run Node built-in tests for the guard.
- Render operational and demo Compose JSON from safe example env files and assert exact defaults versus demo resources.
- Verify `git check-ignore .env.demo` succeeds while `.env.demo.example` remains visible to Git.

## Completion

- [x] Operational Compose names, ports, project volumes, and commands remain compatible.
- [x] Demo Compose project, containers, loopback ports, PostgreSQL settings, and volumes render separately.
- [x] Inherited application environment is removed case-insensitively before demo config is applied.
- [x] Strict CLI parser rejects missing, duplicate, and unknown options.
- [x] Reset requires explicit confirmation before any container/process check.
- [x] Schema/reset/backend require healthy demo-owned container identity and PostgreSQL environment agreement.
- [x] Node guard and identity tests pass: 10/10.
- [x] Local `.env.demo` is ignored; committed example remains trackable.

## Risk and Rollback

- Risk: changing Compose project naming would orphan volumes. Keep the operational project invocation unchanged and set the project name only in demo commands.
- Rollback: restore literal container names and remove demo tooling.

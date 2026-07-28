---
phase: 3
title: "Deterministic quality gates"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 3: Deterministic quality gates

## Context Links

- [Testing guide](../../docs/HUONG-DAN-TEST.md)
- [Root commands](../../README.md#lệnh-chính)

## Overview

Biến current green runs thành gate có thể lặp trên clean checkout và máy thi. Chấm environment failure là Failed, không đổi thành Not run.

## Requirements

- One command or documented sequence for lint, types, unit, E2E, AI, infra, Prisma, web builds and Android APK build.
- Dedicated test database contract; no implicit dependence on developer `.env` port.
- CI must use non-secret example values and disposable services.

## Related Code Files

- Modify: backend E2E bootstrap/config and `.env.example`/test example config.
- Create: `.github/workflows/quality-gates.yml` if repository delivery includes GitHub.
- Modify: root `package.json`, `docs/HUONG-DAN-TEST.md`, relevant runbook sections.
- Create/modify: demo preflight command; no destructive reset without explicit demo guard.

## Implementation Steps

1. Make E2E provision or validate its own PostgreSQL port/database; fail early with exact remediation.
2. Add root verify command with stable order and exit propagation.
3. Run focused tests first, then full backend unit/E2E, AI, infra, typechecks, lint, builds, Prisma validate.
4. Add CI using PostgreSQL/Redis services and cached dependencies. Do not run destructive seed outside isolated database.
5. Save only concise command/result evidence; no raw logs or secrets in repo.

## Todo

- [ ] E2E runs without manual `DATABASE_URL` override on documented setup.
- [ ] Root quality command exists and fails on any child failure.
- [ ] CI workflow covers shared contracts and all release apps.
- [ ] Test guide counts/ports/commands match manifests.
- [ ] Clean-checkout rehearsal recorded.
- [ ] Android prebuild/bundle/APK gate and device contract smoke recorded.

## Success Criteria

- [ ] Backend E2E 6/6 suites, 50/50 tests pass twice from disposable DB.
- [ ] Backend unit, AI 62, demo guard 10, lint/type/build/Prisma gates pass.
- [ ] No “works only on this machine” port assumption remains.

## Risk Assessment

- Full gates can exceed the daily window. Mitigation: focused gate per change; full gate at end of Days 3, 6 and 7.
- Native/desktop build may be environment-dependent. Mitigation: distinguish typecheck/build/package artifact gates.

## Next Steps

Use this gate after each remaining phase; do not weaken or skip failures to meet schedule.

---
title: "Phase 2: Single runtime configuration and docs"
status: completed
---

# Phase 2: Single runtime configuration and docs

## Overview

Remove the separate demo-runtime guard and make the existing local .env the
single configuration source for manual desktop testing.

## Requirements

- [x] Preserve an explicit SIMULATION_MUTATION_ENABLED permission gate.
- [x] Do not require SAFESTOCK_RUNTIME=demo or a second database for sliders.
- [x] Remove demo lifecycle scripts, templates and guidance.
- [x] Update only current README/run/test/PRD authority surfaces.

## Implementation Steps

1. Replace demo-specific environment validation with boolean flag validation.
2. Remove demo infrastructure and scripted static clients.
3. Document enabling the flag locally and using the desktop app on port 3110.
4. Reconcile the pending rehearsal plan that previously described isolated demo reset.

## Todo

- [x] Unify configuration contract.
- [x] Remove runtime scripts and obsolete clients.
- [x] Reconcile current user documentation and the pending rehearsal plan.

## Success Criteria

No committed command or guide instructs users to create .env.demo or start a
demo database for manual sensor input.

---
title: "Phase 1: Remove scripted simulator surface"
status: completed
---

# Phase 1: Remove scripted simulator surface

## Overview

Remove the persisted scenario/run path while keeping direct desktop-originated
sensor events, realtime updates, readiness calculation and incident scanning.

## Requirements

- [x] Delete SimulationScenario, SimulationRun and their controller routes.
- [x] Keep POST /api/simulator/events and read-only device/timeline routes.
- [x] Remove scenario/run controls and client calls from apps/desktop.
- [x] Remove the scenario definitions workspace package and its remaining test-only dependency.

## Implementation Steps

1. Preserve the direct-event route with a metadata contract test.
2. Remove runner dependencies from backend service, module, gateway, Prisma schema and seed.
3. Remove scenario client state and controls from the desktop app.
4. Remove static/terminal scenario clients and package dependency.

## Todo

- [x] Add and prove the direct-event route contract.
- [x] Remove remaining scenario/run consumers.
- [x] Update workspace package metadata and lockfile.

## Success Criteria

The project has no executable scenario/run path and the direct event contract
is still covered by a focused test.

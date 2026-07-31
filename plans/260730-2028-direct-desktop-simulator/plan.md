---
title: "Direct Desktop Simulator"
description: "Remove scripted simulator scenarios and the separate demo runtime; retain manual sensor input from the desktop app against the configured local backend."
status: completed
priority: P1
effort: "0.5d"
tags: [backend, prisma, desktop, configuration, docs]
created: 2026-07-30
---

# Direct Desktop Simulator

## Overview

The desktop simulator becomes a manual input tool: an administrator moves a
slider and the backend processes the resulting sensor event. Scripted scenarios,
recorded runs, the dedicated demo runtime, and their supporting package are
removed.

## Delivery Contract

- Outcome: one local .env and one backend/database serve both normal
  development and deliberate manual sensor testing from apps/desktop.
- Constraints: preserve VirtualDevice, SensorEvent, readiness and incident
  processing; keep mutation permission-gated; do not delete any existing
  PostgreSQL data or Docker volume in this change.
- Non-goals: fabricated sensor data, automatic scenario playback, database
  reseeding, and a physical schema drop on a populated database.
- Acceptance: the only simulator mutation API is direct event emission; the
  desktop UI contains no scenario/run controls; no runnable demo-runtime or
  scenario package remains; targeted tests and builds verify the changed
  contracts.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Remove scenario/run persistence and API surface while retaining direct sensor events. | P1 |
| 2 | Use the existing .env for a deliberate desktop-slider workflow. | P1 |
| 3 | Remove obsolete scripts and update the owning run/test guidance. | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Remove scripted simulator surface](./phase-01-start.md) | Completed |
| 2 | [Single runtime configuration and docs](./phase-02-single-runtime-configuration-and-docs.md) | Completed |
| 3 | [Verification and cleanup review](./phase-03-verification-and-cleanup-review.md) | Completed |

## Success Criteria

- [ ] Scenario/run API, Prisma models and desktop controls are absent.
- [ ] Direct slider events remain authorized by SIMULATION_MUTATION_ENABLED.
- [ ] The runtime no longer requires .env.demo, a demo database or demo scripts.
- [ ] Existing database tables are not dropped automatically.
- [ ] Source, package graph, docs and checks agree on the direct-slider workflow.

<!-- slug: direct-desktop-simulator -->

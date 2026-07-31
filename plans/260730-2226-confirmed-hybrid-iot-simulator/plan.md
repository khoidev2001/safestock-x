---
title: "Confirmed Hybrid IoT Simulator"
description: "Implement confirmation-only IoT simulator delivery with derived current readings, durable offline delivery, and hybrid LAN/domain connectivity."
status: in-progress
priority: P1
effort: "2d"
tags: [feature, backend, desktop, frontend, database, offline]
created: 2026-07-30
---

# Confirmed Hybrid IoT Simulator

## Overview

Replace per-slider mutation and sensor Socket.IO broadcasting with a confirmation-only
snapshot pipeline. The desktop app persists a local queue before it sends; the backend
persists the accepted sensor history, derives live readings/readiness from that history,
creates incidents, and uses a durable email outbox. The public HTTPS domain and a LAN
backend URL use exactly the same API contract.

## Delivery contract

- **Outcome:** one explicit operator confirmation updates the web on its next API poll,
  rings the local desktop bell when the cached threshold policy is breached, and records
  the server-side incident/email work without creating a DB row for current IoT/readiness.
- **Constraints:** preserve warehouse scope and mutation permission; use canonical server
  policy for incidents/email; do not apply any Prisma schema change to the populated
  database in this worktree; do not configure DNS, Cloudflare, VPN, SMTP, or physical IoT.
- **Non-goals:** scenario/run playback, per-slider event submission, a real ESP32/MQTT
  gateway, physical bell actuation, public deployment, or destructive database migration.
- **Data boundary:** persisted data is master inventory/warehouse data, confirmed sensor
  history, submission/idempotency audit, incidents/actions, and email-delivery history.
  Current device values and readiness are derived at read time from history.

## Acceptance criteria

- [ ] Desktop sends no API request while sliders move; **Xác nhận** queues and submits only dirty readings.
- [ ] A repeated snapshot key produces one submission, one set of sensor events, and no duplicate inventory/email work.
- [ ] API scope prevents a user from reading or mutating another warehouse's devices.
- [ ] Current values/readiness come from sensor history; no simulator path writes `VirtualDevice.currentValue` or `ReadinessScore`.
- [ ] A cached, versioned policy starts the local bell on a confirmed breach; only the visible stop control silences it, and its acknowledgement is retried.
- [ ] Email delivery is durable, retryable, and records observed, received, and sent timestamps without confusing delayed delivery with detection time.
- [ ] `https://ungphonhanh.life` is retained verbatim while LAN host/IP input receives the local HTTP/port default.
- [ ] Web uses REST polling for sensor state; it no longer relies on `sensor_event` Socket.IO delivery.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Persisted sensor history and delivery model | P1 |
| 2 | Confirmed desktop queue, local bell, and web polling | P1 |
| 3 | API/readiness derivation, incident integration, verification | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] Focused backend and desktop tests cover confirmation, retries, idempotency, current-state derivation, and access control.
- [ ] Backend/frontend/desktop compile and lint after Prisma client generation only; physical `db push` is not run.
- [ ] README, PRD, QA, and test guide distinguish implemented behavior from LAN/DNS deployment prerequisites.

## Dependencies

- Phase 2 consumes the snapshot and policy contract from Phase 3.
- A reviewed database SQL diff and backup are required before any operator applies the schema outside this implementation task.

<!-- slug: confirmed-hybrid-iot-simulator -->

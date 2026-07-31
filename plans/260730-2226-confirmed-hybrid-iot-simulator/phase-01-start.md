---
title: "Phase 1: Persisted history and delivery model"
status: in-progress
---

# Phase 1: Persisted history and delivery model

## Overview

Define the additive audit entities that make confirmation retry-safe, then remove the
obsolete persisted current-value/readiness projection from the source schema. No physical
schema command is part of this phase.

## Requirements

- [ ] `SensorSubmission` is a durable idempotency and timestamp boundary for one confirmation.
- [ ] `SensorEvent` records `observedAt` and references its accepted submission.
- [ ] Email outbox rows are durable history with recipients, retry metadata, and `sentAt`.
- [ ] Incident actions can idempotently record a local-bell acknowledgement.
- [ ] Current IoT/readiness models are removed from source code rather than silently kept as a second truth.

## Implementation Steps

1. Add submission, outbox, and acknowledgement relations/indexes to Prisma.
2. Remove `VirtualDevice.currentValue` and the ReadinessScore projection models from the source schema and seed reset.
3. Generate Prisma client only after stopping any backend process; inspect, but do not apply, the SQL diff.

## Todo

- [ ] Schema expresses audit/history grain and uniqueness constraints.
- [ ] Existing seed and typed callers no longer depend on stored current values/scores.

## Success Criteria

`prisma validate` succeeds and schema changes are documented as pending operator approval.

## Risks and rollback

The eventual production SQL includes drops for obsolete current-state/readiness tables.
Do not run it without an approved SQL review and backup. Rolling back the source change
means restoring the prior schema and service code before applying any database change.

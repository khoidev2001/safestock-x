---
title: "Phase 3: Confirmed API, derivation, incidents, and outbox"
status: todo
---

# Phase 3: Confirmed API, derivation, incidents, and outbox

## Overview

Implement the server contract that accepts a confirmed batch, derives current readings and
readiness from history, evaluates the canonical policy, persists incident/email work, and
retries email delivery safely.

## Requirements

- [ ] The API validates timestamps, non-empty unique readings, scope, permission, and idempotency.
- [ ] One transaction persists a submission and its events; loadcell derives its predecessor from history.
- [ ] Incidents are evaluated after an accepted confirmation and point back to the originating submission.
- [ ] Outbox delivery is retried with bounded backoff and does not block incident creation.
- [ ] GET devices/timeline/policy and POST alarm-ack use the same scope enforcement.

## Implementation Steps

1. Replace `/simulator/events` with batch submission, policy, derived-device, and acknowledgement endpoints.
2. Refactor readiness environment lookup and public score reads to calculate from newest events instead of stored projections.
3. Add the email outbox service and make incident creation persist/trigger one delivery job.
4. Write regression tests for duplicate submission, scope rejection, derived state, outbox retry/timestamps, and controller contracts.

## Todo

- [ ] API responses give desktop enough state to clear only accepted queue entries.
- [ ] No client-controlled event type, current value, or readiness score is trusted.
- [ ] Focused test matrix covers online, LAN-only, backend-unreachable, SMTP-unreachable, and replay paths.

## Success Criteria

Backend suite, Prisma validation/client generation, and all relevant application builds/lints pass.

## Security and failure handling

The server derives event types from device masters, checks the authenticated warehouse scope
for every route, clamps client timestamps to a bounded acceptable window, and never exposes
outbox recipient data through the public simulator APIs. The outbox claims one pending row at
a time and recovers stale in-flight work after restart.

---
title: Phase 09 dispatch foundation
date: 2026-07-26
type: technical-journal
---

# Phase 09 dispatch foundation

## Context

Started accepted multi-warehouse AI dispatch/map phase for Đồng Xuân offline demo.

## What happened

- Added configured Hamlet source of truth and deterministic exact resolver.
- Removed random rescue point behavior.
- Added local OSRM contract and failure-safe route snapshot fields.
- Extended Action Plan/UI with warehouse contribution and converging route geometry.
- Independent testing/review found operational gaps beyond the code slice.

## Decisions

- Never draw Haversine as a road route.
- Neighbor communes stay contact suggestions only.
- Keep phase `in_progress`; no completion claim without OSRM runtime, per-warehouse fulfillment and UI/browser acceptance.

## Next

Build deployable OSRM stack, validate mission inbox/deep-link in independent browser contexts, then close interactive Hamlet map selection.

## Update 2026-07-27

Per-warehouse preparation is complete at backend/E2E level. Each participating warehouse has a unique preparation row, exports only its own allocation, can retry safely, and the last warehouse transitions the mission to `READY`. Partial preparation now blocks cancel/reject until stock is reconciled, preventing silent inventory loss. The next P09 blocker is browser-visible inbox/deep-link continuity, followed by the deployable OSRM runtime and interactive Hamlet map acceptance.

Mission inbox/deep-link is now implemented on web: the scoped mission list is rendered with active/closed filters, accent-insensitive search and role-aware action priority; selection uses `?mission=`, invalid/forbidden details render an explicit retry state, and notification clicks open the stable URL. Pure-state tests, frontend typecheck, focused lint, production build and live API list→detail smoke for ADMIN/RESCUE/WAREHOUSE pass. Browser continuity acceptance is still open because Chrome DevTools automation is unavailable in the current environment.

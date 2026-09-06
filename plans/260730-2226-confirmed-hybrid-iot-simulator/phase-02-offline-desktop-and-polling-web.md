---
title: "Phase 2: Desktop queue, bell, and polling web"
status: todo
---

# Phase 2: Desktop queue, bell, and polling web

## Overview

Replace direct slider submission and sensor WebSocket synchronization with a durable local
confirmation queue. Make domain/LAN URL normalization deliberate and update web queries to
poll the REST state contract.

## Requirements

- [ ] Local queue is written before network I/O, tolerates malformed old storage, and preserves idempotency keys.
- [ ] Bell evaluates cached policy at confirmation, never auto-stops, and queues its acknowledgement.
- [ ] `https://ungphonhanh.life` remains HTTPS without an implicit port; LAN host/IP defaults to `http://host:3110`.
- [ ] Web no longer invalidates sensor data from `sensor_event`; timeline and devices poll.

## Implementation Steps

1. Add pure local-storage queue/policy helpers and focused unit coverage where project tooling permits.
2. Refactor the desktop screen around draft values, dirty tracking, confirm/flush feedback, and manual bell stop.
3. Update web device/timeline refresh behavior and client types for derived timestamps.
4. Update operator and judging documentation with the hybrid prerequisite and offline behavior.

## Todo

- [ ] No slider mouse/key event calls the API directly.
- [ ] Pending/sent/error state is clear and cannot discard a confirmation.

## Success Criteria

Desktop and web builds pass; manual behavior can be demonstrated without opening a Socket.IO
sensor channel.

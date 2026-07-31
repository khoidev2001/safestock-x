---
phase: 6
title: "Demo resilience and judge experience"
status: pending
priority: P1
effort: "1d"
dependencies: [3, 4, 5]
---

# Phase 6: Demo resilience and judge experience

## Context Links

- [Desktop simulator](../../apps/desktop/src/renderer/App.tsx)
- [Simulation API](../../apps/backend/src/simulation/simulation.controller.ts)
- [Knowledge corpus](../../docs/knowledge/README.md)

## Overview

Giảm rủi ro sân khấu và làm cho giá trị kỹ thuật nhìn thấy trong 5–7 phút:
desktop slider gửi sự kiện cảm biến trực tiếp, timeline, provenance và boundary
offline rõ ràng. Kịch bản chạy sẵn, runtime demo riêng và reset database không
nằm trong luồng này.

## Requirements

- Preflight checks backend, PostgreSQL, Redis, AI health, Ollama models/index, frontend, WebSocket and selected local map layer.
- Sensor input is deliberate from the desktop app and protected by the
  simulator mutation flag in the single local .env.
- Preflight/reset/seed kết thúc trước judged flow; terminal được đóng và không xuất hiện lại trừ recovery exercise công bố trước.
- Timeline shows report → parse → plan → dispatch → confirm → prepare → complete, with readiness before/after and audit IDs.
- Provenance panel identifies backend/rule/RAG source; LLM cannot alter quantities.
- Offline indicator states exactly what is local and what is unavailable; promised screens require no public CDN/network.

## Related Code Files

- Modify: desktop simulation controls and the backend simulation API.
- Modify: frontend command timeline/provenance components and dashboard banner.
- Modify: map/font loading boundary to make local AI, local tiles and local fonts the default for promised screens.
- Modify: `docs/HUONG-DAN-CAI-DAT-VA-CHAY.md`, `docs/HUONG-DAN-TEST.md`.

## Implementation Steps

1. Keep manual desktop slider input and surface its resulting timeline.
2. Show timeline events from persisted mission/audit state; avoid client-only fabricated progress.
3. Surface RAG citation/source and rule calculation next to AI narrative.
4. Add routing-engine health, graph version/checksum and route-not-found status to preflight/UI evidence.
5. Add explicit topology banner: “Đang chạy local trên private LAN; public Internet đã tắt”.
6. Run all promised web/APK screens, local multi-route map and local AI with Internet disabled; record recovery after LAN/API interruption.

## Todo

- [ ] Desktop input returns actionable authorization and connection errors.
- [ ] Timeline/provenance visible in the main demo path.
- [ ] Offline/local boundary tested and documented.
- [ ] No CDN asset is required for the promised flow, or claim is narrowed.
- [ ] UI banner/preflight xác nhận sẵn sàng trước khi đóng terminal; no mid-flow reset/reseed/restart.
- [ ] Local routing engine and graph pass preflight; engine outage degrades visibly without fabricating a route.

## Success Criteria

- [ ] A desktop slider event produces a traceable sensor, readiness and incident reaction.
- [ ] Judge can trace one quantity to backend/rule and one knowledge answer to RAG citation.
- [ ] Demo still completes after intentionally stopping Internet, within the documented local boundary.

## Risk Assessment

- Full-country offline GIS is outside scope. Mitigation: bundle only Đồng Xuân + sáu xã giáp ranh and keep that claim explicit.
- Direct sensor input can affect local test data. Mitigation: it remains
  permission-gated and runs only when an operator enables the flag deliberately.

## Next Steps

Proceed to freeze only after two clean rehearsals pass.

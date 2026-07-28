---
phase: 9
title: "Release freeze, rehearsal and submission"
status: pending
priority: P1
effort: "1d"
dependencies: [2, 3, 4, 5, 6, 7, 8]
---

# Phase 9: Release freeze, rehearsal and submission

## Context Links

- [Competition readiness report](../../docs/bao-cao-danh-gia-san-sang-du-thi.md)
- [PRD definition of done](../../docs/PRD.md#10-definition-of-done-cho-mvp)
- [Test runbook](../../docs/HUONG-DAN-TEST.md)

## Overview

Đóng scope, chạy rehearsal trên clean checkout/máy thi, tạo artifact nộp và ghi limitations trung thực. Sau freeze chỉ sửa release blocker.

## Requirements

- Freeze branch/commit and record SHA, dependency versions, model/index fingerprints and seed baseline.
- Run full automated gates, web ADMIN/RESCUE/WAREHOUSE browser subgate, APK REPORTER/RESCUE device gate and two complete desktop→APK→web UI repetitions.
- Produce fallback video/slides/one-page architecture when live AI, map or mobile fails.
- Build, install and checksum the Android APK; record target device/OS and fresh-install evidence.
- Submission docs must separate Passed, Failed, Not run and deferred features.
- No secrets, `.env`, tokens, logs, screenshots with PII or local-only absolute paths in deliverables.

## Related Code Files

- Modify: `docs/bao-cao-danh-gia-san-sang-du-thi.md`, `README.md`, `docs/BAN-MO-TA-Y-TUONG.md` only to correct claims.
- Create: `docs/submission/` artifact index, architecture one-pager, demo script, limitations and checksum manifest if accepted by repo cleanup policy.
- Do not modify source after freeze except release blockers with rerun of affected gates.

## Implementation Steps

1. Run clean-checkout install/build/test matrix with isolated DB/Redis.
2. Run simulator → APK REPORTER → web ADMIN review resolved hamlet/multi-kho route map → APK RESCUE → web WAREHOUSE → APK RESCUE twice from demo reset with public Internet disabled; record wall-clock and recovery.
3. Run live AI/RAG smoke with local models if available; if not, mark Not run and use fallback.
4. Check no unresolved P0, no stale docs, no generated cache/log/rubbish in package.
5. Freeze commit, hash artifacts, rehearse handoff and prepare judge narrative.

## Todo

- [ ] Full automated matrix green and recorded.
- [ ] Four role sessions plus desktop simulator pass the full UI-only scenario twice; no copied ID, API/SQL/script or mid-flow reset.
- [ ] Live AI/model smoke result recorded.
- [ ] Submission artifact and fallback video/slide ready.
- [ ] Limitations and unresolved questions appended to report.
- [ ] Freeze SHA and checksum manifest captured.
- [ ] Fresh APK install/device and Internet-off LAN acceptance captured.
- [ ] Local routing preflight, multi-route geometry and dashboard convergence evidence captured without public Internet.

## Success Criteria

- [ ] Core promise is repeatable twice by a fresh operator in ≤7 minutes, từ UI đầu tiên đến status/readiness/audit cuối.
- [ ] Terminal đóng trong judged flow; mỗi role mở lại cùng mission từ owned inbox/notification sau relogin/F5/new tab/APK restart.
- [ ] No known P0 scope bypass; all failures visible and recoverable.
- [ ] A judge can understand value, architecture, evidence and limits without reading historical plans.

## Risk Assessment

- Late feature requests destabilize release. Mitigation: change-control; PM accepts only P0 release blockers.
- Live model/network variance. Mitigation: local model warm-up, cached RAG index, recorded fallback and explicit claim boundary.

## Go/No-Go

Go only if all success criteria pass. Otherwise do not claim APK/offline LAN ready; narrow other claims but keep mandatory deliverable status visible.

## Unresolved Questions

- Target Android model/OS and APK signing/build channel still need release ownership.
- Authoritative legal/contact source for surrounding communes is not yet provided; OSM stays map provenance only.

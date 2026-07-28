---
phase: 1
title: "Evidence baseline and scope cut"
status: in-progress
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Evidence baseline and scope cut

## Context Links

- [PRD](../../docs/PRD.md)
- [Competition readiness report](../../docs/bao-cao-danh-gia-san-sang-du-thi.md)
- [Root runbook](../../README.md)

## Overview

Chốt release boundary, owner, test baseline và claim được phép dùng trước khi mở thêm code. Kết quả là một release board duy nhất cho 7 ngày.

## Requirements

- Functional: một tenant vận hành Đồng Xuân, một incident, bốn vai trò; desktop simulator + web + backend + AI/RAG + Android APK là luồng chính.
- Non-functional: mọi kết quả phải ghi `Passed`, `Failed` hoặc `Not run`; không dùng test lịch sử để thay current evidence.
- Non-goal: full PRD, QR, iOS, offline-write/sync, production hardening hoàn chỉnh và federation nhiều xã.

## Related Code Files

- Modify: `docs/bao-cao-danh-gia-san-sang-du-thi.md` — sửa evidence stale, cut-line và release decision.
- Modify if required: `docs/PRD.md`, `README.md`, app README — chỉ sửa claim/run command đã lỗi thời.
- Read: package manifests, Jest/pytest/infra configs, demo scripts.

## Implementation Steps

1. Dùng 63.1% full deliverables làm baseline; 72% là readiness demo hiện tại nhưng chưa phải go cho tới khi APK/device/LAN evidence pass.
2. Ghi current evidence: backend E2E 50/50 pass khi override DB 15432; AI 62 pass; venv/models/index 21 chunks hiện diện; live model/browser/device/offline scan vẫn Not run.
3. Gắn owner, effort, dependency, exit criteria cho tất cả blocker tuần.
4. Chốt Android APK và real-device test là bắt buộc; demo chạy private LAN khi public Internet tắt; nghiệp vụ chính đi qua UI.
5. Chốt sáu xã giáp ranh là metadata ngoài xã, không phải tenant/kho vận hành.

## Todo

- [x] Correct stale report claims and counts.
- [ ] Publish owner/RACI and daily go/no-go times.
- [x] Record competition promises and explicit defer list.
- [x] Capture current reproducible test environment without exposing secrets; permanent port contract remains in Phase 3.

## Success Criteria

- [x] Report contains no stale “venv missing” or “E2E failed at 55433” current-state claim.
- [ ] Every P0 has owner, effort, dependency, acceptance test and deadline.
- [x] Demo claim fits a 5–7 minute deterministic scenario.

## Risk Assessment

- Scope pressure can reopen QR/iOS/offline-write/full CRUD. Mitigation: any addition must replace an existing item after PM go/no-go.
- Working tree is dirty. Mitigation: preserve user changes; freeze only after diff ownership review.

## Next Steps

Start Phase 2 and Phase 3 after scope cut. No UX polish before isolation gate has tests.

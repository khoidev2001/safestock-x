---
title: "Competition Readiness Week"
description: "Đưa prototype tới competition release candidate trong 7 ngày với APK, private-LAN offline, UI-only workflow và bản đồ AI điều phối đa kho."
status: in-progress
priority: P0
effort: "10.25 person-days / 7 calendar days"
branch: main
tags: [critical, backend, frontend, mobile, offline, geo, security, infra, demo]
blockedBy: []
blocks: []
created: 2026-07-26
---

# Competition Readiness Week

## Overview

Mục tiêu là tạo **competition release candidate**, không tuyên bố full PRD hay production. Cut-line tuần này bắt buộc gồm web + backend + desktop simulator + AI/RAG local + Android APK REPORTER/RESCUE. Demo phải chạy trên private LAN khi Internet công cộng bị ngắt.

### Evidence baseline

- Backend unit: **51 suites / 366 tests — Passed**.
- Backend E2E: **6 suites / 50 tests — Passed** với test PostgreSQL `15432`.
- AI: **62 pytest — Passed**; live HTTP/model smoke chưa chạy trong phiên audit.
- Infrastructure demo guards: **10 tests — Passed**; compose verify — Passed.
- TypeScript backend/frontend/mobile, desktop typecheck, Prisma validate, lint, launcher syntax, `git diff --check`: **Passed**.
- Browser E2E ADMIN/RESCUE/WAREHOUSE là subgate web; full judged UI flow còn gồm desktop simulator và APK REPORTER/RESCUE. APK/device, Internet-off LAN/recovery, dependency scan: **Not run**.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Đóng bypass cross-organization ở mọi raw-ID/mutation path thuộc demo | P0 |
| 2 | Quality gate tái lập được, không phụ thuộc port/máy cá nhân | P0 |
| 3 | Khép desktop simulator → REPORTER → ADMIN → RESCUE → WAREHOUSE → RESCUE → ADMIN bằng UI/inbox/deep-link/error states | P0 |
| 4 | Android APK cài được, dùng API qua LAN, session/cache an toàn | P0 |
| 5 | Preflight/reset/rehearsal và gói nộp giới hạn claim | P1 |
| 6 | Sáu xã giáp ranh hiển thị đúng vai trò metadata ngoài xã | P1 |
| 7 | AI resolve marker thôn đã cấu hình, tự ghép nhiều kho và dashboard vẽ các tuyến đường bộ hội tụ | P0 |

## Phases

| # | Phase | Owner | Status | Effort |
|---|-------|-------|--------|--------|
| 1 | [Evidence baseline and scope cut](./phase-01-start.md) | PM/Tech lead | In progress | 0.5d |
| 2 | [Tenant isolation and data safety](./phase-02-tenant-isolation-and-data-safety.md) | Backend/Security | Pending | 2d |
| 3 | [Deterministic quality gates](./phase-03-deterministic-quality-gates.md) | Backend/Infra/QA | Pending | 1d |
| 4 | [Mission inbox and demo workflow](./phase-04-mission-inbox-and-demo-workflow.md) | Frontend/Backend | Pending | 1.5d |
| 5 | [AI multi-warehouse dispatch map routing](./phase-09-ai-multi-warehouse-dispatch-map-routing.md) | Backend/Geo/Frontend | Pending | 1.5d |
| 6 | [Demo resilience and judge experience](./phase-05-demo-resilience-and-judge-experience.md) | Full stack/UX | Pending | 1d |
| 7 | [Android APK and LAN offline foundation](./phase-07-android-apk-and-lan-offline-foundation.md) | Mobile/Infra | Pending | 1.5d |
| 8 | [Surrounding communes metadata and map](./phase-08-surrounding-communes-metadata-and-map.md) | Backend/Geo/UX | Pending | 0.25d |
| 9 | [Release freeze, rehearsal and submission](./phase-06-release-freeze-rehearsal-and-submission.md) | PM/All | Pending | 1d |

## Decisions and boundaries

- Đồng Xuân là **một tổ chức/tenant vận hành duy nhất** trong demo, với kho trung tâm và kho thôn dùng chung `communeId`.
- ADMIN cấu hình trước danh mục thôn, điểm cứu hộ/tập kết mặc định và marker kho. AI chỉ resolve dữ liệu đã xác minh; không geocode hoặc tự sinh tọa độ.
- ADMIN không chọn kho thay hệ thống. Rule/inventory/readiness tự chọn và ghép các kho nội xã; LLM parse/giải thích, không quyết định số tồn hoặc mutation.
- Nhiều kho cùng tham gia một mission phải hiện nhiều marker và nhiều tuyến đường bộ hội tụ về một điểm cứu hộ. Dashboard là màn xem/duyệt phương án; không làm GPS realtime hoặc turn-by-turn.
- Routing demo chạy local trên private LAN. Haversine phải ghi rõ là ước tính và không được vẽ như tuyến đường bộ.
- Sáu xã giáp ranh trực tiếp theo dữ liệu ranh giới hiện có: **Xuân Thọ, Tuy An Bắc, Tuy An Tây, Xuân Lãnh, Phú Mỡ, Xuân Phước**. Chúng là `NeighborWarehouse` metadata: liên hệ/khả dụng báo thủ công, có provenance và thời điểm cập nhật; không phải `Organization`, không phải `Warehouse` vận hành, không được tính vào allocation/readiness/fulfillment và không đồng bộ DB.
- Offline promise = toàn bộ workflow hứa hẹn chạy trên private LAN với public Internet tắt. Điện thoại mất cả LAN chỉ được read-only/unavailable; tuần này không làm offline-write queue/sync.
- “Qua UI” = người chấm bấm/tap control nhìn thấy để hoàn tất luồng; không curl/Postman, SQL, sửa/copy ID, đổi API URL hay script ẩn. Terminal/launcher chỉ dùng startup, preflight, reset/seed trước lúc chấm; đóng terminal khi core flow bắt đầu, không reset/reseed/restart giữa luồng trừ recovery test được công bố. Desktop simulator là UI vận hành được phép.
- Cắt tuần này: QR handover, iOS, offline mutation queue, full multi-commune federation, full inventory CRUD, weather-demand join, restore RPO/RTO pilot.

## Seven-day operating cadence

| Day | Gate | Deliverable |
|---|---|---|
| 1 | Baseline/go-no-go | Chốt APK, LAN topology, UI-only acceptance, tenant boundary |
| 2 | P0 isolation | Actor organization scope + raw-ID/transition/loan tests |
| 3 | APK + routing spike | Hello APK gọi LAN; local routing engine trả một tuyến mẫu khi Internet tắt |
| 4 | Workflow + location config | Mission inbox/deep-link; ADMIN cấu hình/resolve thôn và marker kho qua UI |
| 5 | AI dispatch map | Multi-kho allocation; nhiều tuyến hội tụ, ETA/khoảng cách/vật tư; local AI/map/font |
| 6 | Rehearsal | Simulator → REPORTER → ADMIN → RESCUE → WAREHOUSE → RESCUE → ADMIN qua UI, hai lần trên LAN |
| 7 | Freeze | Fresh APK install, checksum, clean-checkout gate, video/slides |

## Success criteria

- [ ] Không có cross-organization read/mutation qua inventory, readiness, insights, mission, loan, notification, admin hoặc report upload.
- [ ] Full backend unit/E2E, AI/infra/type/lint/build/Prisma gates pass với môi trường ghi rõ.
- [ ] APK Android cài trên fresh device, gọi backend qua LAN khi Internet tắt, hydrate session sau restart và hiển thị trạng thái stale/offline rõ ràng.
- [ ] REPORTER gửi report; ADMIN mở từ inbox rồi tạo/dispatch; RESCUE discover/confirm/reject/complete; WAREHOUSE discover/prepare; ADMIN thấy status/readiness/audit cuối; refresh/relogin/app restart giữ continuity.
- [ ] Terminal chỉ dùng trước demo cho startup/preflight/reset; core flow không copy ID, API/SQL/script hoặc mid-flow reset/reseed/restart.
- [ ] Core flow chạy hai lần trong 5–7 phút từ preflight/reset, không SQL/API thủ công.
- [ ] Sáu xã giáp ranh chỉ xuất hiện như gợi ý liên hệ ngoài xã và không làm thay đổi quantity/readiness.
- [ ] Nhập `Tân Bình cô lập 100 người` resolve marker Tân Bình đã cấu hình, không tạo điểm ngẫu nhiên; hệ thống tự chọn/ghép kho.
- [ ] Action Plan hiển thị marker từng kho tham gia, nhiều tuyến đường bộ hội tụ, khoảng cách/ETA và vật tư từng kho khi public Internet tắt.
- [ ] Thiếu nội xã chỉ tạo gợi ý ngoài xã có trạng thái chờ liên hệ; không làm tăng fulfillment hoặc tự xuất kho.
- [ ] Submission tách Passed, Failed, Not run và deferred; không claim peer-tenant federation hay điện thoại hoàn toàn không có LAN.

## Go/no-go rule

Không freeze hoặc claim “ready to demo with APK/offline LAN” nếu APK không cài/gọi LAN, P0 scope test fail, local route không trả/vẽ được tuyến, full E2E environment-failed hoặc core flow không lặp lại hai lần từ reset.

<!-- slug: competition-readiness-week -->

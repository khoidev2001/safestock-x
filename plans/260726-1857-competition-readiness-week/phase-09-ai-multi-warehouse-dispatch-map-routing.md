---
phase: 5
title: "AI multi-warehouse dispatch map routing"
status: in_progress
priority: P0
effort: "1.5d"
dependencies: [2, 3, 4]
---

# Phase 5: AI multi-warehouse dispatch map routing

## Context Links

- [PRD AI dispatch contract](../../docs/PRD.md#47-ai-điều-phối-đa-kho-và-bản-đồ-tuyến-cứu-hộ)
- [Mission allocation](../../apps/backend/src/mission/mission.service.ts)
- [Action Plan map](../../apps/frontend/src/components/mission/action-plan-view.tsx)
- [Admin warehouse map](../../apps/frontend/src/components/dashboard/map-view.tsx)

## Overview

Biến Action Plan thành bản đồ điều phối: AI resolve thôn đã được ADMIN cấu hình; rule/inventory/readiness tự ghép một hoặc nhiều kho; dashboard vẽ từng tuyến đường bộ từ các kho tham gia cùng hội tụ về điểm cứu hộ. Chạy trên private LAN khi public Internet tắt.

## Requirements

- Functional: ADMIN cấu hình trước danh mục thôn, marker cứu hộ/tập kết và marker kho qua UI; `Tân Bình cô lập 100 người` resolve đúng một thôn, không sinh tọa độ.
- Allocation: chỉ kho nội xã khả dụng được phân bổ chính thức; ưu tiên khả dụng/readiness, khoảng cách đường bộ và FEFO; ghép kho tiếp theo đến khi đủ.
- Map: một marker sự cố, N marker kho tham gia, N polyline hội tụ; mỗi tuyến có tên kho, màu, khoảng cách, ETA và popup vật tư kho đóng góp.
- Shortage: kho ngoài xã chỉ là đề xuất liên hệ. Chỉ vẽ nét đứt nếu có tọa độ và nguồn đã xác minh; không tăng fulfillment, allocation hoặc mutation.
- Offline: routing engine, graph đường và tiles của vùng Đồng Xuân/vùng đệm chạy local. Không gọi public OSRM/Google/CDN trong acceptance.
- Non-goal: GPS realtime, reroute liên tục, turn-by-turn, voice navigation và traffic realtime.

## Architecture

```text
Mô tả sự cố
  -> AI parse { locationName, incidentType, affectedPeople, ... }
  -> Hamlet resolver tra dữ liệu ADMIN đã xác minh
  -> rule engine tính requirements
  -> inventory/readiness + local route table xếp kho
  -> deterministic allocation chọn/ghép kho
  -> local route service trả GeoJSON LineString + distance + ETA từng kho
  -> ActionPlan snapshot lưu warehouse contribution + route provenance/version
  -> dashboard render marker + polyline hội tụ
```

LLM không gọi routing, không tự bịa địa điểm, tồn hoặc số cấp. Backend sở hữu resolution, allocation, route contract và snapshot. Nếu routing lỗi, giữ bảng phân bổ nhưng hiện `Chưa tính được tuyến`; không vẽ Haversine thành tuyến đường.

## Related Code Files

- Modify: `apps/backend/prisma/schema.prisma` và migration — entity thôn/điểm cứu hộ, liên kết kho/thôn, snapshot location trên Mission.
- Modify/create: `apps/backend/src/admin/` — CRUD/config marker thôn, validation scope, audit người sửa.
- Modify: `apps/backend/src/ai/ai-client.service.ts`, `apps/backend/src/mission/dto.ts`, `mission.compute.ts`, `mission.service.ts`, `action-plan.ts` — giữ `location`, resolve thôn, multi-kho và route snapshot.
- Create: `apps/backend/src/geo/local-routing.service.ts` và internal API — route table + route geometry qua engine local.
- Modify/create: `infrastructure/` — OSRM local, extract đường Đồng Xuân + buffer, graph build/checksum, health/preflight.
- Modify: `apps/frontend/src/components/dashboard/map-view.tsx` — ADMIN cấu hình marker thôn/kho.
- Modify: `apps/frontend/src/components/mission/incident-map.tsx`, `action-plan-view.tsx`, `apps/frontend/src/lib/mission-api.ts` — multi-route map và contribution popup.
- Modify/create: mission, resolver, admin scope, routing adapter và browser acceptance tests.

## Implementation Steps

1. Tests first: khóa multi-warehouse allocation; thêm ca một kho đủ, hai kho ghép đủ, toàn xã thiếu, kho blocker và retry ổn định.
2. Tạo dữ liệu thôn có tên chuẩn/alias, response point, verification và audit. ADMIN cấu hình qua UI; kho giữ marker riêng.
3. Mở rộng parse contract với `location`; normalize Unicode/case nhưng chỉ resolve alias trong đúng organization/commune. Không khớp hoặc nhiều kết quả phải yêu cầu ADMIN xác nhận.
4. Xóa `randomIncidentPoint`; Mission lưu `hamletId` và snapshot lat/lng/name khi ADMIN duyệt.
5. Dựng routing engine local từ OSM road extract có buffer 10–20 km. Thêm health/preflight, graph version/checksum và timeout.
6. Dùng local route table tính distance/ETA. Allocation giữ readiness/eligibility là gate, sau đó ưu tiên route distance rồi FEFO.
7. Lấy route geometry cho các kho thực sự được phân bổ; gộp contribution theo kho và persist Action Plan để F5/relogin giữ phương án.
8. Render nhiều marker/polyline hội tụ. Màu/nét/label ổn định; popup hiện SKU/số lượng, distance, ETA, readiness.
9. Nếu thiếu, hiển thị đề xuất ngoài xã tách biệt. Không có tọa độ verified thì chỉ hiện panel, không vẽ tuyến giả.
10. Chạy Internet-off acceptance với Tân Bình và ít nhất hai kho; thử engine down, thôn mơ hồ và route-not-found.

## Todo

- [ ] ADMIN tạo/sửa/xác minh thôn và điểm cứu hộ qua UI; scope/audit test pass.
- [x] Backend có entity Hamlet, chuẩn hóa alias exact, API ADMIN list/create/update, verification guard và audit entry; focused normalization/resolution tests pass.
- [ ] Kho và điểm thôn là hai marker độc lập; không mặc định cùng tọa độ.
- [x] `Tân Bình cô lập 100 người` giữ `location` từ AI, resolve alias exact trong đúng org+xã, snapshot hamlet/lat/lng; frontend đã bỏ random point fallback. Focused resolver tests pass.
- [x] Allocation tự ghép ít nhất hai kho và giải thích vật tư từng kho.
- [x] Mỗi WAREHOUSE chỉ prepare allocation của kho mình; state lưu từng kho, retry không xuất trùng và mission chỉ READY sau kho cuối.
- [x] Có adapter local OSRM trả GeoJSON/status/distance/ETA và test engine-down/NoRoute/no-fake-line; cần wiring hạ tầng OSRM + acceptance LAN trước khi tick production criterion.
- [x] Action Plan contract/frontend đã có per-warehouse id, contribution, route status/geometry và map Polyline local tiles; cần browser acceptance với route engine thật.
- [x] Web Mission có inbox thật, filter/tìm kiếm, ưu tiên theo role, URL `?mission=` và notification deep-link; unit/type/lint/build + API smoke ba role pass.
- [ ] Route snapshot sống qua F5, logout/login và tab mới (hiện JSON actionPlan vẫn sinh qua endpoint và cần test reload end-to-end).
- [ ] External suggestion không đi vào allocation/readiness/fulfillment/mutation.
- [ ] Route failure/ambiguous location hiển thị rõ, không false success hoặc đường thẳng giả.

## Success Criteria

- [ ] ADMIN nhập `Tân Bình cô lập 100 người`; không chọn kho bằng tay; hệ thống tạo nhu cầu/phân bổ đúng tồn và readiness.
- [ ] Seed buộc dùng từ hai kho; dashboard hiện đúng số marker/tuyến hội tụ và contribution khớp backend.
- [ ] Khoảng cách/ETA đến từ local routing; màn hứa hẹn hoạt động với public Internet tắt.
- [x] Tổng cấp không vượt tồn khả dụng; thiếu nội xã giữ fulfillment thật và chỉ tạo external contact suggestion.
- [ ] Contract/integration test đã khóa backend; browser/manual UI acceptance toàn luồng còn thiếu.

## Risk Assessment

- OSM thiếu đường thôn: kiểm định extract, route-not-found rõ; không giả đường chim bay.
- Route engine tăng boot/dung lượng: giới hạn extract Đồng Xuân + buffer, prebuild graph và checksum.
- Tên thôn gần giống: alias do ADMIN quản lý, exact normalized match, xác nhận khi mơ hồ.
- Tuyến trùng khó đọc: màu ổn định theo kho, outline/offset hợp lý và legend/popup.

## Security Considerations

- Chỉ ADMIN đúng organization sửa marker; backend kiểm tra point trong boundary hoặc override có audit.
- Routing service chỉ bind mạng nội bộ; frontend gọi qua backend.
- Không nhận routing URL tùy ý; validate lat/lng, giới hạn origin, timeout và response size.

## Next Steps

Phase 6 thêm preflight/recovery/presentation. Phase 8 làm giàu xã ngoài xã nhưng không đổi tenant boundary.

## Implementation checkpoint 2026-07-27

Đã xong lát cắt nền: entity/API thôn, exact resolver + Mission snapshot, bỏ tọa độ ngẫu nhiên, tenant-scoped batch pool, local-OSRM adapter không vẽ tuyến giả, contribution theo warehouse ID và UI Polyline dùng local tiles.

Prepare đa kho cũng đã khép ở backend và nối UI: `MissionWarehousePreparation` lưu tiến độ từng kho; kho tham gia đọc/list được mission; mỗi kho chỉ xuất batch của mình; retry và hai kho chạy đồng thời không double-export; kho cuối mới chuyển `READY`. Schema thật đã được push không reset/seed và 10 mission `PENDING_WAREHOUSE` hiện hữu đã backfill idempotent thành 20 preparation rows.

Bằng chứng mới: 13 mission unit suites / 106 tests pass; mission workflow E2E 12/12 pass, gồm multi-warehouse sequential, retry, concurrent và guard huỷ/rút sau khi một kho đã xuất; backend build và frontend TypeScript pass.

Chưa được gọi Phase hoàn tất:

- Dựng OSRM local + graph Đồng Xuân/buffer + checksum/health/preflight; chạy Internet-off acceptance thật.
- Cho ADMIN ghim/render marker thôn trực tiếp trên map; manual mission phải chọn thôn đã verified.
- Bắt buộc route/action-plan snapshot trước dispatch và test F5/logout/new tab.
- Scope report warehouse resolution theo actor organization.
- Chạy browser acceptance thật cho progress prepare đa kho và continuity inbox/deep-link qua F5, tab mới, logout/login.

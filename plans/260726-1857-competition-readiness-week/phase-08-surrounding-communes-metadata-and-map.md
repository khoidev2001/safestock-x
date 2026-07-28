---
phase: 8
title: "Surrounding communes metadata and map"
status: pending
priority: P1
effort: "0.25d"
dependencies: [1, 5]
---

# Phase 8: Surrounding communes metadata and map

## Overview

Làm giàu gợi ý liên hệ ngoài xã quanh Đồng Xuân mà không phá tenant/inventory boundary. Bản đồ offline hiển thị sáu polygon giáp ranh đã có provenance OSM; dữ liệu liên hệ/tồn chỉ là thủ công, chưa xác minh.

## Requirements

- Functional: hiển thị Xuân Thọ, Tuy An Bắc, Tuy An Tây, Xuân Lãnh, Phú Mỡ, Xuân Phước trên map/suggestion panel.
- Data boundary: giữ một Organization và operational Warehouse cluster của Đồng Xuân; không seed peer tenant/warehouse, không đưa neighbor vào `loadClusterBatches`/allocation/readiness.
- Provenance: hiển thị `manual/unverified`, source/last-updated; không suy diễn stock, số điện thoại, khoảng cách đường hoặc pháp lý từ polygon.
- Offline: polygon/tile asset dùng local package; không gọi CDN trong promised screens.

## Architecture

`NeighborWarehouse` là metadata ngoài operational graph, gắn với kho Đồng Xuân qua `warehouseId` nhưng không có FK tới DB xã ngoài. Mission chỉ đọc summary để đề xuất liên hệ; mọi quantity/fulfillment vẫn lấy cluster `communeId=dong-xuan`.

## Related Code Files

- Modify: `apps/backend/prisma/seed.ts` (neighbor metadata only), related seed tests.
- Modify: `apps/frontend/public/geo/communes.geojson` and `verify-gis.mjs` only if local package must include all six.
- Modify: frontend neighbor/suggestion/map components for source disclaimer and external-only styling.
- Add/modify: tests proving no allocation/readiness mutation from NeighborWarehouse.

## Implementation Steps

1. Replace unverified stale labels only with names backed by boundary fixture; keep contact/stock blank or clearly simulated/manual.
2. Add immutable adjacency fixture/relation IDs: 19392091, 19392102, 19392099, 19392094, 19392110, 19392092; retain OSM provenance/license note.
3. Extend local map package to six neighbors; ensure Xuân Đài is not labelled directly adjacent.
4. Add seed/mission tests for one tenant, 17 internal hamlets, no neighbor allocation and external-only UI copy.

## Todo

- [ ] Six names and OSM relation provenance render in local map/suggestions.
- [ ] Neighbor rows remain metadata-only and marked manual/unverified.
- [ ] Allocation/readiness/fulfillment ignore all neighbor metadata.
- [ ] No stale “Xuân Sơn/Sông Cầu” claim remains without source.

## Success Criteria

- [ ] Judge sees six surrounding communes as contact suggestions, not warehouses in stock totals.
- [ ] Tests prove only `communeId=dong-xuan` operational rows enter cluster allocation.
- [ ] Local map works with public Internet disabled and source disclaimer is visible.

## Risk Assessment

`sapnhap.bando.com.vn` là ứng viên nguồn hành chính hậu sáp nhập; chỉ đóng gói lại geometry/metadata sau khi xác nhận quyền tái sử dụng offline và lưu provenance/checksum. OSM vẫn là nguồn mạng đường cho routing, không phải căn cứ pháp lý hành chính. Không biến xã lân cận thành tenant vận hành.

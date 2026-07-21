# Plan: MapView trên Dashboard + Dev mode pin toạ độ kho

> **Trạng thái 2026-07-21:** chức năng pin tọa độ đã triển khai. Seed hiện có 1 kho trung tâm + 17 kho thôn; tọa độ kho thôn để `null` để ADMIN pin vị trí thực. Các mô tả “3 kho/toạ độ ước lượng” bên dưới được giữ làm lịch sử trước triển khai.

> Hiển thị bản đồ thật (Leaflet + OSM) trên dashboard với vị trí các kho trong xã. Bật "chế độ dev" cho ADMIN kéo/pin lại toạ độ từng kho rồi lưu DB — để user tự tool vị trí kho chính xác thay cho toạ độ seed ước lượng.

## Context — vì sao

Phase 2/3 điều phối (bán kính, OSRM, liên xã) cần **toạ độ kho chính xác**. Hiện seed chỉ có 3 kho toạ độ ước lượng, và **chưa có cách sửa toạ độ** qua UI (phải sửa seed + reseed). Cần: (1) map hiển thị kho trực quan trên dashboard, (2) dev mode để ADMIN pin/kéo marker → lưu toạ độ thật vào DB. Đây là bước chuẩn bị dữ liệu cho điều phối.

## Đã có (tái dùng)
- **Leaflet + react-leaflet** cài sẵn; `incident-map.tsx` = mẫu hoàn chỉnh (TileLayer OSM/CARTO, pinIcon SVG, FitBounds, ClickPicker click→toạ độ, marker draggable→dragend, CoordInputs nhập tay, dark mode).
- `GET /api/missions/:warehouseId/warehouses` (`listClusterWarehouses`) → trả `{id, name, kind, lat, lng}` các kho cùng xã có toạ độ. FE: `getClusterWarehouses`.
- 3 kho seed đã có lat/lng (CENTRAL + 2 HAMLET).
- Dynamic import pattern SSR-false cho Leaflet (mission-view dùng `dynamic(() => import(...), { ssr: false })`).

## Thiếu (làm mới)
1. **BE endpoint cập nhật toạ độ kho** — chưa có.
2. **MapView component** trên dashboard (khác warehouse-map.tsx = grid kệ, không phải map địa lý).
3. **Dev mode**: ADMIN bật → marker kho kéo được → lưu.

## Thiết kế

### 1. BE — endpoint cập nhật toạ độ kho
- **Endpoint**: `PATCH /api/admin/warehouses/:id/location` body `{lat, lng}` → cập nhật `Warehouse.lat/lng`. Quyền `ADMIN_USERS` (hoặc thêm `WAREHOUSE_MANAGE`) — chỉ ADMIN pin toạ độ.
- Đặt trong **AdminModule** (đã có) — thêm `AdminWarehouseController` + service, hoặc gộp vào admin-user service thành `AdminService`. Đề xuất: file mới `admin-warehouse.controller.ts` + `admin-warehouse.service.ts` cạnh admin-user.
- Validate lat ∈ [-90,90], lng ∈ [-180,180].
- Trả về kho đã cập nhật.
- **Cũng cần** endpoint list kho toàn xã cho map (kể cả kho CHƯA có toạ độ — để pin lần đầu). `listClusterWarehouses` hiện LỌC BỎ kho thiếu lat/lng → cần thêm `GET /api/admin/warehouses` trả TẤT CẢ kho (lat/lng nullable) cho dev mode.

### 2. FE — MapView component (`map-view.tsx` mới)
- Dựa `incident-map.tsx`: MapContainer + TileLayer + FitBounds + pinIcon (CENTRAL xanh, HAMLET xám).
- Marker mỗi kho, popup tên + loại + toạ độ.
- **Không có dev mode** (mặc định): chỉ xem, marker cố định.
- Kho chưa có toạ độ → hiện danh sách "chưa ghim" bên cạnh (không lên map được cho tới khi pin).

### 3. Dev mode (chỉ ADMIN)
- Toggle "Chế độ ghim toạ độ" (chỉ hiện với `role === ADMIN`).
- Bật → marker kho **draggable**; kéo → `dragend` cập nhật toạ độ tạm (state) → nút "Lưu" gọi PATCH.
- Kho chưa có toạ độ → click bản đồ để đặt marker lần đầu (ClickPicker + chọn kho đang pin từ dropdown).
- Nhập tay toạ độ (CoordInputs) cho chính xác.
- Lưu → invalidate query → marker chốt vị trí mới.
- **Persist thật vào DB** (không chỉ state) — đây là điểm khác incident-map (chỉ tạm trong form).

### 4. Nối vào dashboard
- Thêm view `"map"` vào `DashboardView` + nav ("Bản đồ kho", icon Map/MapPinned).
- `page.tsx`: render `<MapView warehouseId={warehouseId} />`.
- Dynamic import ssr:false (Leaflet cần window).

## File đụng
- **BE mới**: `src/admin/admin-warehouse.controller.ts`, `admin-warehouse.service.ts`; sửa `admin.module.ts` thêm controller/service.
- **FE mới**: `src/components/dashboard/map-view.tsx`, `src/lib/warehouse-api.ts` (getAllWarehouses + updateWarehouseLocation).
- **FE sửa**: `dashboard-shell.tsx` (+view "map"), `app/page.tsx` (+render), có thể tái dùng phần lớn `incident-map.tsx`.

## Quyết định ĐÃ CHỐT (2026-07-18)
1. ✅ Quyền pin: **chỉ ADMIN xã**.
2. ✅ Kho chưa toạ độ: **chọn kho từ dropdown + click map** đặt marker lần đầu.
3. ✅ **KÈM ranh giới xã GeoJSON từ OpenStreetMap** — vẽ ranh giới 5 xã/phường cụm Đồng Xuân lên map.
4. Tile offline: MapTiler style OpenStreetMap raster 256px, cùng lưới XYZ chuẩn với Leaflet.

## Ranh giới xã GeoJSON (cập nhật 2026-07-20)
- Nguồn trực tiếp: relation `boundary=administrative`, `admin_level=6` của OpenStreetMap; license ODbL 1.0.
- Relation đã khóa trong `scripts/download-osm-communes.mjs`: Đồng Xuân `19392118`, Xuân Lãnh `19392094`, Xuân Phước `19392092`, Xuân Thọ `19392091`, Xuân Đài `19392095`.
- Script tải kiểm tra tên/cấp hành chính/geometry trước khi ghi `apps/frontend/public/geo/communes.geojson`; `scripts/verify-gis.mjs` kiểm lại provenance, relation ID, toạ độ và tile 256px.
- FE dùng Leaflet `GeoJSON`, tô nhẹ để không che marker kho. Chuyển lớp nền không làm thay đổi hình polygon.
- Đồng Xuân bbox xấp xỉ [108.996, 13.318, 109.192, 13.470].

## Verify
- BE: `PATCH /admin/warehouses/:id/location` → DB lat/lng đổi; validate toạ độ ngoài range → 400; non-admin → 403.
- FE: mở view Bản đồ → thấy 3 kho trên map OSM; bật dev mode → kéo marker kho → Lưu → reload vẫn đúng vị trí mới (persist DB thật).
- Build BE+FE sạch, test không regression.

## Phạm vi — CHỈ MapView + dev pin (chưa điều phối)
KHÔNG làm trong đợt này: bán kính sự cố, OSRM, liên xã. Đây chỉ là bước **chuẩn bị toạ độ** — user pin xong toạ độ chuẩn thì mới làm điều phối (Phase 2/3 thật) sau.

---

## ✅ ĐÃ XONG (2026-07-18) — MapView + dev pin + ranh giới xã

**Đã làm + verify:**
- ✅ GeoJSON hiện gồm 5 relation OSM bản hành chính mới (Đồng Xuân/Xuân Lãnh/Xuân Phước/Xuân Thọ/Xuân Đài), gộp tại `apps/frontend/public/geo/communes.geojson` và có script tái tạo/kiểm chứng.
- ✅ BE: `GET /api/admin/warehouses` (toàn bộ kho kể cả chưa toạ độ) + `PATCH /api/admin/warehouses/:id/location` (validate range, quyền ADMIN_USERS). Verify HTTP thật: list OK; PATCH cập nhật DB; lat=999 → 400; trưởng thôn PATCH → 403.
- ✅ FE: `map-canvas.tsx` (Leaflet + CARTO tile + GeoJSON ranh giới + marker kho draggable) + `map-view.tsx` (dev toggle chỉ ADMIN + chọn kho + click map pin + list kho chưa toạ độ + Lưu) + `warehouse-api.ts`.
- ✅ Nav "Bản đồ kho" + page render. Build BE+FE sạch, 141 test pass.

**File:** `src/admin/admin-warehouse.{controller,service}.ts`, `apps/frontend/src/{lib/warehouse-api.ts,components/dashboard/map-canvas.tsx,map-view.tsx,dashboard-shell.tsx,app/page.tsx}`, `public/geo/communes.geojson`.

**Chưa verify (cần chạy FE thật trong browser):** kéo marker/click pin trên UI → lưu → reload. BE persist đã verify; UI logic build sạch nhưng chưa chạy browser.

**➡️ Kế tiếp:** user pin toạ độ kho chuẩn qua dev mode → rồi làm điều phối Phase 2 (bán kính sự cố + OSRM).

# Kế hoạch: sửa ranh giới 5 xã bằng dữ liệu OSM

## Context

Người dùng xác nhận hình ranh giới xã đang hiển thị sai và yêu cầu ưu tiên GIS có sẵn trên OpenStreetMap (OSM). Cần tách hai lớp độc lập: tile nền và polygon ranh giới. Tile offline hiện phải được kiểm chứng đúng lưới XYZ 256px; polygon phải được đối chiếu theo đúng quan hệ hành chính cấp xã sau sắp xếp năm 2025, không suy luận từ kết quả Nominatim dạng điểm.

## Các bước

1. Kiểm kê cấu hình Leaflet trong `apps/frontend/src/components/dashboard/map-canvas.tsx`, dải tile và file thực tế trong `apps/frontend/public/tiles/`.
2. Kiểm tra `apps/frontend/public/geo/communes.geojson`: tên, mã, bbox, số điểm, tính hợp lệ cơ bản và nguồn dữ liệu hiện tại.
3. Tra OSM theo quan hệ `boundary=administrative` bằng Overpass/OSM API cho 5 xã, xác minh relation ID, tên, cấp hành chính và geometry polygon/multipolygon. Không dùng kết quả Nominatim dạng `node` làm bằng chứng rằng OSM không có ranh giới.
4. Nếu OSM có đủ ranh giới đúng bản 2025, thay `communes.geojson` bằng FeatureCollection sinh trực tiếp từ các relation OSM; giữ attribution/provenance và relation ID trong properties. Nếu thiếu relation nào, dừng và báo rõ thay vì trộn nguồn âm thầm.
5. Sửa chú thích/cấu hình tile sai lệch nếu có; thêm script kiểm tra tự động để khóa các điều kiện: đúng 5 xã, geometry polygon, bbox hợp lý, toạ độ WGS84, tile 256x256 và không thiếu ô trong dải tải.
6. Build frontend và chạy kiểm tra; sau đó mở app thật, chuyển qua lớp OSM trực tuyến và offline để đối chiếu polygon ở cùng zoom/center, kiểm tra console/network và chụp xác nhận nếu công cụ browser cho phép.

## File dự kiến

- `apps/frontend/public/geo/communes.geojson`
- `apps/frontend/src/components/dashboard/map-canvas.tsx`
- `apps/frontend/scripts/download-tiles.mjs`
- Script kiểm tra GIS mới trong `apps/frontend/scripts/` và lệnh tương ứng trong `apps/frontend/package.json` (chỉ thêm nếu cần để chống tái diễn)
- Tài liệu nguồn/provenance liên quan trong `docs/`

## Xác minh

- Kiểm tra cấu trúc và bbox từng feature bằng script Node.
- So sánh relation ID/geometry với dữ liệu OSM vừa tải.
- Kiểm tra toàn bộ tile offline là PNG 256x256 và đủ tập `{z}/{x}/{y}` theo BBOX/zoom.
- Chạy `pnpm --filter @safestock/frontend build` và kiểm tra GIS riêng.
- Chạy frontend thật, hard refresh, xem ranh giới trên cả nền OSM online và nền offline; xác nhận hình không đổi khi chuyển lớp nền.

## Kết quả thực hiện (2026-07-20)

- Đã thay GeoJSON suy đoán bằng đúng 5 relation `boundary=administrative`, `admin_level=6` từ OSM: Đồng Xuân `19392118`, Xuân Lãnh `19392094`, Xuân Phước `19392092`, Xuân Thọ `19392091`, Xuân Đài `19392095`.
- Đã cấu hình Leaflet dùng tile XYZ raster 256px đúng chuẩn, lớp offline mặc định và `errorTileUrl` chỉ còn là lớp phòng vệ ngoài BBOX/zoom đã tải.
- Kiểm tra đầu tiên phát hiện bộ tile chỉ có 1.326/1.486 ô: thiếu 20 ô zoom 14 và 140 ô zoom 15. Nguyên nhân là script cũ bỏ file dưới 200 byte nhưng vẫn tính là hoàn thành, còn script verify cũ chỉ đếm ít nhất một tile mỗi zoom nên không bắt được lỗ hổng.
- Đã sửa script tải để kiểm signature/dimension PNG, không âm thầm bỏ tile và trả mã lỗi nếu tải chưa đủ; script tự đọc `NEXT_PUBLIC_MAPTILER_KEY` từ môi trường hoặc `.env.local` mà không ghi lộ giá trị.
- Đã sửa script verify để duyệt chính xác mọi `{z}/{x}/{y}` trong BBOX. Sau khi tải bù: đủ 1.486/1.486 PNG 256x256 ở zoom 10–15.
- Chromium headless xác nhận có đúng 5 path ranh giới; hình polygon không đổi khi chuyển nền offline sang OSM online; console không có lỗi. Các request offline bị `ERR_ABORTED` trong lần chuyển lớp là request Leaflet chủ động huỷ khi tile layer bị tháo, không phải lỗi tile.
- Ảnh Playwright chỉ dùng để xác minh tạm thời và đã được xóa khỏi workspace sau khi kiểm tra.
- Build production ban đầu bị `EPERM` ở `.next/trace` vì dev server cổng 3200 giữ thư mục `.next`. Sau khi dừng đúng tiến trình frontend, `pnpm --filter @safestock/frontend build` đã hoàn tất sạch: compile, type-check và sinh 5/5 static page thành công.
- Lần xác minh Chromium cuối sau khi tải bù vẫn có đúng 5 path, polygon không đổi khi chuyển lớp và console sạch. Dev server không ghi nhận HTTP 404 tile; các `ERR_ABORTED` là request còn bay bị trình duyệt huỷ đúng lúc Leaflet tháo lớp offline để bật lớp online.

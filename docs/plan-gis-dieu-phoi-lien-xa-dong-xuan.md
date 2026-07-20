# Best-fit plan: GIS láng giềng và điều phối mượn kho cho Xã Đồng Xuân

## Đánh giá sau ba vòng review

Kế hoạch trước **chưa phải phương án tốt nhất** vì có ba điểm cần sửa:

1. Mở rộng gần 2.900 tile MapTiler rồi đóng gói vào repo là không phù hợp điều khoản tiêu chuẩn: bulk download, persistent cache và redistribution cần chấp thuận bằng văn bản. Phương án cuối **loại bỏ bộ tile MapTiler tải sẵn**, không tiếp tục tải thêm.
2. Thêm tọa độ/routing động cho kho xã bên ngoài khi chưa có vị trí kho thật là overengineering và dễ tạo dữ liệu giả. Phương án cuối chỉ dùng khoảng cách nhập tay có nhãn “dữ liệu mô phỏng”; routing kho liên xã để giai đoạn sau khi có tọa độ khảo sát thật.
3. Tạo record “kho” giả cho cả 6 xã sẽ khiến dữ liệu trông có vẻ thật. Phương án cuối tách rõ:
   - GIS hiển thị đủ 6 xã giáp;
   - `NeighborWarehouse` chỉ lưu những đầu mối thật hoặc fixture demo được đánh dấu rõ;
   - không tạo Organization/Warehouse/Batch giả cho xã khác.

Sau các chỉnh sửa này, đây là **best-fit plan cho phạm vi hiện tại**: đủ chặt để chứng minh GIS và điều phối liên xã khi thi, nhưng không biến task thành hệ thống GIS/PostGIS hoặc liên thông đa xã quá mức.

---

## Context và kết luận topology

Dự án **vẫn phục vụ Xã Đồng Xuân**. Không đổi organization, kho tổng, hai kho thôn, dữ liệu tồn kho hoặc thư quan tâm Đồng Xuân. Mục đích của GIS là xác định đúng các xã có **chung một đoạn biên đất liền** với Đồng Xuân, rồi chỉ cho phép gợi ý mượn vật tư từ các xã hợp lệ đó.

Bản đồ hiện có 5 relation OSM: Đồng Xuân, Xuân Lãnh, Xuân Phước, Xuân Thọ, Xuân Đài. Tập này sai vì Xuân Đài không giáp Đồng Xuân, đồng thời thiếu Phú Mỡ, Tuy An Bắc và Tuy An Tây. `MapCanvas` còn `fitBounds` theo marker kho thay vì toàn bộ polygon nên ranh giới dễ bị cắt khỏi viewport.

Đối chiếu topology trên đủ 102 đơn vị cấp xã tỉnh Đắk Lắk tại cùng một snapshot xác nhận Xã Đồng Xuân (`22081`) có đúng 6 láng giềng chung đoạn biên đất liền:

| Mã | Đơn vị | Biên chung xấp xỉ |
|---|---|---:|
| `22075` | Xã Xuân Thọ | 24,461 km |
| `22090` | Xã Xuân Lãnh | 18,366 km |
| `22096` | Xã Phú Mỡ | 10,402 km |
| `22111` | Xã Xuân Phước | 17,529 km |
| `22114` | Xã Tuy An Bắc | 9,266 km |
| `22132` | Xã Tuy An Tây | 6,067 km |

Không có đơn vị nào chỉ chạm Đồng Xuân tại một điểm. Trong danh sách người dùng nêu ban đầu, chỉ Xuân Thọ, Tuy An Bắc và Tuy An Tây thực sự giáp; các đơn vị còn lại cách polygon Đồng Xuân trên 3 km.

Geometry sẽ dùng thống nhất từ `thanglequoc/vietnamese-provinces-database`, pin commit `c5b60bfa831f00651c66fb494d06c1b411b40b44`, đối chiếu mã/tên/`gisServerId` với metadata của NARENCA/Bản đồ.com.vn. Không trộn OSM hiện tại với snapshot mới vì biên có thể lệch vài mét, tạo khe/chồng và làm adjacency sai.

---

## Phase 0 — Bảo vệ working tree

1. Chụp `git status --short` và diff các file sẽ sửa. Working tree hiện có rất nhiều thay đổi và các file GIS/tile đang untracked; không được reset, checkout hoặc ghi đè thay đổi của người dùng.
2. Chia triển khai thành bốn checkpoint có thể kiểm chứng độc lập: data → map → backend neighbor → UI/docs.

---

## Phase 1 — Một nguồn sự thật cho danh sách xã giáp

### File

- `packages/shared-types/src/adjacent-communes.ts` (mới)
- `packages/shared-types/src/index.ts`

### Thiết kế

1. Tạo constant dùng chung, chỉ chứa dữ liệu nghiệp vụ ổn định:
   - `HOME_COMMUNE_CODE = "22081"`;
   - `DONG_XUAN_DIRECT_NEIGHBORS` gồm đúng 6 `{ code, fullName }`;
   - helper `isDongXuanDirectNeighbor(code)`.
2. Không đưa checksum, geometry hoặc metadata bản đồ vào shared types; những phần đó thuộc manifest GIS của frontend.
3. Backend dùng constant này để lọc neighbor records; frontend dùng để style/legend; Jest đã map `@safestock/shared-types` về source nên không cần cấu hình test mới.

### Acceptance criteria

- Set mã đúng `{22075,22090,22096,22111,22114,22132}`.
- Không có Xuân Đài, Tuy An Đông, Ô Loan, Tuy An Nam, Xuân Cảnh, Xuân Lộc hoặc Phường Sông Cầu.
- Không có khái niệm/mã huyện.

---

## Phase 2 — Vendor đúng 7 GeoJSON từ một snapshot

### File

- `apps/frontend/public/geo/communes.geojson`
- `apps/frontend/public/geo/communes.manifest.json` (mới)
- `apps/frontend/scripts/vendor-adjacent-communes.mjs` (mới)
- `apps/frontend/scripts/download-osm-communes.mjs` (xóa sau khi thay thế)
- `apps/frontend/package.json`

### Thiết kế dữ liệu

FeatureCollection phải có đúng:

- `22081_dong_xuan.geojson`;
- `22075_xuan_tho.geojson`;
- `22090_xuan_lanh.geojson`;
- `22096_phu_mo.geojson`;
- `22111_xuan_phuoc.geojson`;
- `22114_tuy_an_bac.geojson`;
- `22132_tuy_an_tay.geojson`.

Giữ nguyên `Polygon`/`MultiPolygon`, EPSG:4326 và thứ tự `[longitude, latitude]`. Không simplify ở patch đầu.

Manifest lưu:

- dataset ID/version, province code `66`, CRS và coordinate order;
- source repo + commit đầy đủ;
- upstream path và blob SHA/checksum mỗi feature;
- `code`, `fullName`, `gisServerId`, `areaKm2`;
- expected geometry type, polygon-part count, point count và bounds;
- ngày vendor, attribution và disclaimer.

### Script vendor deterministic

1. Chỉ tải URL raw gắn commit bất biến, không dùng `master`.
2. Timeout/retry hữu hạn; fail nếu HTTP/schema/mã/tên/`gisServerId` sai.
3. Sắp feature theo mã và serialize deterministic.
4. Ghi file tạm rồi atomic rename; không để output nửa vời.
5. Không ghi lại khi byte không đổi.
6. Runtime chỉ fetch `/geo/communes.geojson` cục bộ; không gọi GitHub, TinhThanhVN, Bản đồ.com.vn hoặc WMS.

### Provenance

Hiển thị và tài liệu hóa: dataset cộng đồng “as is”, geometry dẫn xuất từ bản đồ tham chiếu NARENCA, không thay thế hồ sơ địa giới pháp lý. Dùng được cho prototype/cuộc thi kèm attribution; production cần xác nhận quyền nguồn geometry nếu yêu cầu pháp lý/thương mại cao hơn.

---

## Phase 3 — Verification GIS kiểm cả topology

### File

- `apps/frontend/scripts/verify-gis.mjs`
- `apps/frontend/scripts/lib/geo-validation.mjs` (mới nếu cần tách hàm thuần)
- `apps/frontend/scripts/geo-validation.test.mjs` (mới)
- `apps/frontend/package.json`

### Kiểm tra bắt buộc

1. Đúng 7 feature, không trùng/thừa/thiếu; Đồng Xuân đúng một lần.
2. `code/fullName/gisServerId`, source commit và checksum khớp manifest.
3. Geometry không rỗng; chỉ `Polygon`/`MultiPolygon`; ring đóng; tọa độ hữu hạn; lon/lat nằm trong vùng hợp lý và không bị đảo.
4. Tính bounds từ mọi coordinate thay vì tin metadata. Khóa bounds từng feature và combined bounds bằng tolerance.
5. Khóa polygon-part count và point count để phát hiện cắt mất phần `MultiPolygon`.
6. Chuẩn hóa segment không phụ thuộc chiều và tính tổng đoạn biên chung:
   - mỗi trong 6 xã phải có shared-boundary > 1 km với Đồng Xuân;
   - baseline phải nằm trong tolerance đã ghi ở manifest;
   - không chấp nhận chỉ chạm một điểm;
   - không có gap/overlap do trộn nguồn.
7. Cross-check set mã trong manifest/GeoJSON với shared allowlist.
8. Fixture test phải bắt được: thiếu Phú Mỡ, thêm Xuân Đài, duplicate code, ring hở, đảo lon/lat, mất polygon part và checksum lệch.
9. `gis:verify` trả exit code khác 0 và báo rõ phần `metadata`, `geometry`, `topology` nào lỗi.

### Acceptance criteria

- Kết quả xác nhận “1 xã trung tâm + 6 xã giáp”.
- Không còn assertion OSM `relation/adminLevel` của bộ dữ liệu cũ.
- Script có thể chạy offline sau khi asset đã vendor.

---

## Phase 4 — Sửa MapView và viewport

### File

- `apps/frontend/src/components/dashboard/map-canvas.tsx`
- `apps/frontend/src/components/dashboard/map-view.tsx`

### Thiết kế

1. Tái dùng Leaflet/React Leaflet hiện có.
2. Sau khi GeoJSON load:
   - lấy ref của toàn `GeoJSON` layer;
   - gọi `layer.getBounds()`;
   - fit lần đầu theo toàn bộ 7 feature với padding responsive.
3. Không để `FitBounds` marker hiện tại ghi đè fit polygon. Viewport controller có luật:
   - mở view → fit 7 ranh giới;
   - “Xem toàn bộ vùng giáp ranh” → fit 7 ranh giới;
   - “Xem các kho” → chỉ fit marker khi người dùng chủ động;
   - kéo/ghim marker không tự đổi viewport sang một vùng nhỏ.
4. Style Đồng Xuân nổi bật; 6 xã giáp dùng tone thứ cấp. Tooltip/popup có tên đầy đủ + mã xã.
5. Legend/list ghi “Xã Đồng Xuân” và “6 xã giáp ranh”; bỏ mọi câu “5 xã cụm Đồng Xuân”.
6. Có loading/error/retry. Nếu GeoJSON lỗi, marker kho vẫn dùng được nhưng phải có cảnh báo rõ, không âm thầm coi GIS hợp lệ.
7. Control là button thật, có focus/aria-label; danh sách tên xã giúp người dùng không phải phân biệt chỉ bằng màu.
8. Giữ dynamic import `ssr:false`; kiểm chuyển view/React Strict Mode không tạo duplicate layer/map.
9. `IncidentMap` vẫn chuyên cho kho + điểm nạn; không nhân đôi boundary overlay trong patch này.

---

## Phase 5 — Loại bỏ tile MapTiler tải sẵn không hợp lệ

### File

- `apps/frontend/src/components/dashboard/map-canvas.tsx`
- `apps/frontend/scripts/download-tiles.mjs` (xóa)
- `apps/frontend/scripts/verify-gis.mjs`
- `apps/frontend/package.json`
- `apps/frontend/public/tiles/` (xóa 1.486 file untracked sau khi xác nhận đúng target)
- `.gitignore`

### Quyết định cuối

Không mở rộng bộ tile hiện tại. MapTiler Cloud Terms giới hạn cache ở temporary personal cache cho một end-user; bulk download, export và server-side redistribution cần chấp thuận bằng văn bản. Bộ 1.486 tile hiện tại là untracked, khoảng 9,1 MB; BBOX 7 xã sẽ cần khoảng 2.907 tile ở zoom 10–15, nên tiếp tục tải/đóng gói vừa sai hướng vừa tăng artifact gần gấp đôi.

### Thực hiện

1. Xóa layer “Offline (5 xã)” và script `gis:download-tiles`/`download-tiles.mjs`.
2. Sau khi kiểm tra target chính xác, xóa cache tile untracked khỏi `public/tiles`; thêm ignore để không tái commit cache tải cá nhân.
3. Bản đồ dùng:
   - một nền trung tính local/self-authored làm fallback ngoại tuyến để boundary + marker vẫn xem được;
   - OSM/OpenTopoMap/Esri online là lớp tùy chọn, giữ attribution tương ứng.
4. Không tuyên bố “offline basemap đầy đủ”. Nếu sau này cần bản đồ nền offline thật, làm task riêng bằng dữ liệu/MBTiles có giấy phép rõ hoặc self-hosted tile server.
5. `gis:verify` chỉ kiểm local vector boundary; không còn fail vì tile cache cá nhân.

---

## Phase 6 — Chuẩn hóa NeighborWarehouse, không tạo kho giả

### File

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/seed.ts`

### Schema tối thiểu

Bổ sung:

- quan hệ thật `NeighborWarehouse.warehouse -> Warehouse` với `onDelete: Cascade`;
- `communeCode String`;
- `isDemo Boolean @default(false)`;
- `@@unique([warehouseId, communeCode])`;
- `Warehouse.neighborWarehouses` relation field.

Giữ `distanceKm`, `contactInfo`, `summary`, `updatedAt`. Không thêm lat/lng/routing hoặc PostGIS khi chưa có vị trí kho thật. `distanceKm` được định nghĩa là khoảng cách ước tính nhập tay giữa điểm liên hệ/kho đại diện và Đồng Xuân/điểm tác chiến, **không phải chiều dài biên chung**.

### Seed

1. Giữ nguyên organization và ba kho Đồng Xuân.
2. Xóa hai neighbor sai:
   - “Kho cứu trợ xã Xuân Sơn” vì Xuân Sơn cũ đã thuộc chính Xã Đồng Xuân;
   - “Kho huyện (xa)” vì mô hình hành chính hai cấp không có huyện.
3. Không seed 6 kho giả. Chỉ seed **hai đầu mối demo** thuộc allowlist (ví dụ Xuân Thọ và Tuy An Bắc) để flow thiếu vật tư có dữ liệu trình diễn.
4. Tên phải thể hiện rõ là đầu mối/fixture demo, không khẳng định có kho thật; không bịa số điện thoại. `isDemo: true`, contact ghi kênh mô phỏng, distance/summary ghi rõ trong docs là fixture.
5. Bốn xã còn lại vẫn xuất hiện đầy đủ trên GIS nhưng không có suggestion tồn kho nếu chưa nhập dữ liệu đầu mối.
6. Seed fail-fast nếu `communeCode` không thuộc 6 mã hoặc bị trùng.
7. Vì seed gọi `resetDatabase()` và xóa dữ liệu, chỉ chạy trên DB demo sau xác nhận; không chạy âm thầm trên DB cần giữ dữ liệu.

---

## Phase 7 — Sửa logic suggestion cho central và hamlet

### File

- `apps/backend/src/mission/neighbor-suggestions.ts` (mới, logic thuần)
- `apps/backend/src/mission/mission.service.ts`
- `apps/backend/src/mission/__tests__/neighbor-suggestions.spec.ts` (mới)
- `apps/backend/src/mission/__tests__/mission.neighbors.spec.ts` (mới)

### Thiết kế

1. Khi lập mission từ bất kỳ warehouse:
   - lấy warehouse đầu vào;
   - tìm đúng kho `CENTRAL` cùng `organizationId + communeId`;
   - lấy neighbor records của central warehouse;
   - nếu không có/hoặc có nhiều central, trả hành vi xác định + warn thay vì âm thầm dùng sai kho.
2. Các query cụm trong `MissionService` (`loadClusterBatches`, `listClusterWarehouses`, `warehouseEtas`) phải scope bằng `organizationId + communeId`, không chỉ `communeId`.
3. Tách hàm thuần xây suggestion:
   - chỉ nhận `communeCode` trong allowlist 6 xã;
   - dedupe theo `communeCode` dù DB đã có unique guard;
   - parse `summary` an toàn;
   - gộp SKU trùng deterministic;
   - bỏ quantity không hữu hạn hoặc `<= 0`;
   - `available = min(totalAvailable, shortage)`;
   - shortage `<= 0` trả rỗng;
   - sort `distanceKm`, rồi `communeCode` để ổn định;
   - tính `isStale` từ `updatedAt` theo ngưỡng cấu hình/tài liệu;
   - mang theo `isDemo` để UI không trình bày fixture như dữ liệu thật.
4. Không tự động chuyển/xuất hàng; suggestion là snapshot JSON lưu cùng Mission Requirement.
5. Warn khi gặp mã không giáp, duplicate hoặc summary hỏng; không log contact nguyên văn.

### Tests bắt buộc

- chỉ 6 mã hợp lệ; Xuân Đài/Tuy An Đông/mã lạ bị loại;
- mission từ central và hai hamlet cho cùng tập suggestion;
- không lấy neighbor của organization khác có cùng `communeId`;
- multiple/missing central có hành vi rõ;
- duplicate record/SKU không spam;
- malformed JSON, quantity âm/0/NaN không crash hoặc tạo lượng giả;
- shortage 0 không gợi ý; available không vượt shortage;
- stale/demo flags đúng;
- sort deterministic khi cùng khoảng cách;
- allocation nội xã, FEFO, fulfillment và Action Plan không regression.

---

## Phase 8 — Hiển thị gợi ý mượn kho liên xã

### File

- `apps/frontend/src/lib/mission-api.ts`
- `apps/frontend/src/components/mission/neighbor-suggestions.tsx` (mới)
- `apps/frontend/src/components/mission/mission-view.tsx`

### Contract/UI

Mở rộng suggestion snapshot với:

- `communeCode`, `name`, `available`, `distanceKm`;
- `sourceUpdatedAt`, `isStale`, `isDemo`.

Hiển thị sau khi Mission có requirement thiếu:

1. Nhóm theo SKU/vật tư, dedupe theo commune.
2. Tên + mã xã, lượng có thể hỗ trợ, khoảng cách ước tính, mốc cập nhật.
3. Badge “Dữ liệu mô phỏng” và “Dữ liệu cũ” khi phù hợp.
4. Cảnh báo: “Chỉ là gợi ý liên hệ; không tự động chuyển hoặc xuất hàng”.
5. Empty states tách biệt:
   - có xã giáp nhưng chưa có đầu mối/tồn cập nhật;
   - có dữ liệu nhưng không còn SKU cần;
   - dữ liệu stale.
6. Không trả/hiển thị contact nhạy cảm trong patch này; chỉ mở sau khi có phân quyền và dữ liệu thật.

---

## Phase 9 — Tài liệu và provenance

### File

- `docs/GIS-DATA-SOURCES.md` (mới)
- `docs/plan-fix-gis-osm.md`
- `docs/plan-mapview-dev-pin.md`
- `docs/plan-kho-thon-dieu-phoi.md`
- `apps/backend/ROADMAP.md`
- `apps/frontend/ROADMAP.md`
- `docs/qa/phase-d-mission.md`

### Cập nhật

1. Ghi phương pháp adjacency: đủ 102 polygon, cùng snapshot, chung đoạn biên >0; baseline length chỉ dùng QA, không phải số liệu địa giới pháp lý.
2. Ghi commit/checksum, EPSG:4326, bounds, part counts, license/disclaimer và quy trình update.
3. Sửa mọi câu cũ “5 xã”, “Xuân Sơn 8 km”, “kho huyện 35 km”.
4. Nêu rõ map có 6 xã giáp nhưng DB chỉ gợi ý những đầu mối đã được nhập; hai record seed là fixture demo.
5. Ghi quyết định loại bỏ tile MapTiler tải sẵn vì điều khoản bulk/cache; nền offline chỉ là neutral fallback.
6. Giữ nguyên `docs/BAN-MO-TA-Y-TUONG.md` và `docs/thu-quan-tam-CTD-DongXuan.md`; địa bàn thí điểm vẫn là Đồng Xuân.

---

## Thứ tự triển khai và checkpoint

### Checkpoint A — Data

1. Shared allowlist.
2. Vendor 7 GeoJSON + manifest.
3. Topology/checksum tests.

**Gate:** đúng 7 feature, đúng 6 biên chung, không Xuân Đài, không trộn nguồn.

### Checkpoint B — Map

4. Boundary-fit controller, style, legend, error state.
5. Loại bỏ MapTiler tile cache/downloader; thêm neutral offline fallback.
6. Browser verify MapView.

**Gate:** mở map thấy đủ 7 vùng; reset đúng; marker kho vẫn ghim/lưu được.

### Checkpoint C — Backend neighbor

7. Schema relation + communeCode/isDemo.
8. Prisma generate/db push trên DB demo.
9. Seed hai đầu mối demo hợp lệ, giữ kho Đồng Xuân.
10. Logic central/hamlet + tests.

**Gate:** central và hamlet cho cùng suggestion; chỉ mã giáp được nhận; không duplicate/stale ambiguity.

### Checkpoint D — UI/docs

11. Panel suggestion/empty states.
12. Docs/provenance/roadmap.
13. Full build/test/runtime QA và review diff.

---

## Xác minh end-to-end

### Static/data

- `pnpm --filter @safestock/shared-types build`
- `pnpm --filter @safestock/frontend gis:verify`
- `node --test apps/frontend/scripts/geo-validation.test.mjs` hoặc script package tương ứng.
- Chạy vendor vào thư mục tạm và so byte/checksum với asset repo.
- Xác nhận runtime không request geometry từ GitHub/TinhThanhVN/Bản đồ.com.vn.

### Backend

- `pnpm --filter @safestock/backend prisma:generate`
- `pnpm --filter @safestock/backend prisma:push` trên DB demo.
- `pnpm --filter @safestock/backend test -- --runInBand`
- `pnpm --filter @safestock/backend build`
- Chỉ sau khi xác nhận DB demo có thể reset: `pnpm --filter @safestock/backend seed`.
- Gọi API generate-plan từ central + hai hamlet với tình huống cố ý thiếu vật tư; xác nhận cùng suggestion, không “Xuân Sơn/kho huyện”, không duplicate.

### Frontend/browser

- `pnpm --filter @safestock/frontend build`
- Chạy app thật bằng skill `run`/browser tooling.
- Desktop 1440×900, 1280×720 và mobile 390×844:
  - đủ 7 mã/tên; Phú Mỡ/Tuy An Tây không bị cắt;
  - Xuân Đài không thuộc lớp giáp ranh;
  - reset bounds sau pan/zoom;
  - kéo/click ghim kho, lưu, reload không regression;
  - online base layer lỗi thì boundary + marker vẫn hiện trên neutral fallback;
  - suggestion fresh/stale/demo/empty đúng;
  - console không có hydration, duplicate-map, tile 404 hoặc geometry error.

### Review cuối

- Không ghi đè thay đổi user trong working tree bẩn.
- Không có từ “huyện” mới trong runtime/docs mới.
- Không có mã ngoài allowlist, tọa độ đảo hoặc external geometry fetch.
- Không bịa contact/tồn thật, không log API key/contact.
- Không còn 1.486 tile MapTiler untracked hoặc script bulk downloader.
- Report rõ mọi test/build bị skip hoặc fail; không chỉ nói “pass”.

---

## Không làm trong đợt này

- Không chuyển dự án/kho ra khỏi Đồng Xuân.
- Không bao các xã không chung biên chỉ vì cùng vùng lịch sử hoặc ở gần.
- Không tạo organization/kho/tồn kho nội bộ giả cho 6 xã.
- Không thêm lat/lng/routing kho liên xã khi chưa có tọa độ khảo sát thật.
- Không triển khai PostGIS, WMS, iframe hoặc API GIS runtime.
- Không tự động chuyển/xuất vật tư liên xã.
- Không sửa thư quan tâm hoặc đổi địa bàn thí điểm.
- Không commit/push nếu người dùng chưa yêu cầu.

---

## Nguồn đã kiểm

- [Metadata sáp nhập NARENCA/Bản đồ.com.vn](https://cosodulieu.bando.com.vn/static/map/data/sapnhap.json)
- [Cơ sở dữ liệu bản đồ NARENCA](https://cosodulieu.bando.com.vn/)
- [Snapshot GeoJSON đã pin](https://github.com/thanglequoc/vietnamese-provinces-database/tree/c5b60bfa831f00651c66fb494d06c1b411b40b44/json/geojson/66_dak_lak/wards)
- [Tài liệu GIS của bộ dữ liệu](https://github.com/thanglequoc/vietnamese-provinces-database/blob/c5b60bfa831f00651c66fb494d06c1b411b40b44/docs/gis/gis_readme.md)
- [License repository nguồn](https://github.com/thanglequoc/vietnamese-provinces-database/blob/c5b60bfa831f00651c66fb494d06c1b411b40b44/LICENSE)
- [Trang Xuân Cảnh dùng để đối chiếu ban đầu](https://tinhthanhvn.com/bando/dak-lak/xa-xuan-canh)
- [MapTiler Cloud Terms — §§5.7, 6.2, 6.3, 7.2](https://www.maptiler.com/cloud/terms/)
- [MapTiler Cloud pricing/quota](https://www.maptiler.com/cloud/pricing/)

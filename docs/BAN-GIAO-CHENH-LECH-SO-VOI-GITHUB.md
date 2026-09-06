# Bàn giao phần đã hoàn thành so với GitHub

- Ngày lập: 2026-07-27
- Repository: `https://github.com/khoidev2001/safestock-x.git`
- Nhánh đối chiếu: `origin/main`

## 1. Mốc đối chiếu

Đã chạy `git fetch origin main --prune` ngay trước khi lập tài liệu. GitHub và
HEAD local cùng ở commit:

- Commit: `601d945b0da1df8360205eda958e767ba2f4f02a`
- Thời gian commit: `2026-07-25T08:23:26+07:00`
- Nội dung: `Merge PR #11: update raw map, rescue flow (fix/rescue-noti)`

Toàn bộ phần mô tả dưới đây là thay đổi chưa commit trong working tree so với
commit trên. Tại thời điểm chụp số liệu, phần tracked có 192 file thay đổi
(114 modified, 78 deleted), `+8.477/-11.283` dòng; có thêm 144 file untracked
sau khi tính cả tài liệu bàn giao này. Phần xóa lớn chủ yếu là tài liệu
archive/plan/evidence cũ, không phải xóa source nghiệp vụ.

> Không được dùng `git reset --hard`, `git checkout -- .` hoặc clean working
> tree trước khi tạo branch/commit bàn giao; làm vậy sẽ mất toàn bộ phần dưới.

## 2. Phạm vi được xem là hoàn thành

Phạm vi “quản lý kho ngày thường” được hoàn thiện ở mức source code, automated
test, typecheck và build; không bao gồm WMS mở rộng như nhà cung cấp, đơn mua,
giá vốn/nguồn vốn, lịch bảo trì thiết bị, phiếu giấy/PDF, CRUD tùy ý cấu trúc
kho và quản lý người mượn/hạn trả chi tiết.

Kiểm thử thực tế trên browser, Samsung Galaxy S23 Ultra, private LAN, database
triển khai mới và luồng demo nhiều tài khoản được chủ dự án chủ động để lại làm
sau. Vì vậy “100%” trong tài liệu này nghĩa là hoàn tất phạm vi code đã chốt,
không có nghĩa là đã nghiệm thu production.

## 3. Quản lý kho ngày thường

| Nhóm | Khác với GitHub `origin/main` | Điểm vào chính |
|---|---|---|
| Đọc tồn | Workspace theo kho, danh sách lô/SKU, tồn khả dụng, hạn dùng, tình trạng, lưu hành, kệ và nguồn dữ liệu | `inventory.service.ts`, `inventory-workspace.tsx`, `InventoryScreen.tsx` |
| Nhận hàng | Tạo SKU/catalog mới hoặc dùng vật tư có sẵn; tạo lô, hạn dùng, tình trạng, vị trí kệ; validation organization/warehouse; audit và idempotency | `inventory.service.ts`, `inventory-receiving-dialog.tsx`, mobile inventory |
| Nhập/xuất | Nhập, xuất một lô, xuất nhiều lô; CAS chống âm tồn; khóa đồng thời với mượn/hoàn; lý do và nguồn ghi nhận | `inventory.service.ts`, `inventory-bulk-export-dialog.tsx` |
| Điều chỉnh | Đặt tồn tuyệt đối, bắt buộc lý do, không được thấp hơn lượng đang mượn; audit before/after | `inventory-adjustment.service.ts`, `inventory-action-dialog.tsx` |
| Kiểm kê | Nhập số đếm thực tế, lưu `InventoryCount`, chọn chỉ ghi nhận hoặc áp chênh lệch; bảo vệ snapshot đồng thời | `inventory-adjustment.service.ts`, `stocktake-view.tsx`, mobile |
| Tình trạng | Báo NEW/USED/NEEDS_CHECK/DAMAGED, bắt buộc ghi chú; recalc readiness | `inventory-adjustment.service.ts` |
| Điều chuyển | Chuyển toàn bộ hoặc tách một phần lô; giữ lineage; WAREHOUSE chỉ lấy từ kho được giao nhưng chọn được kệ đích ở kho cùng organization/commune | `inventory-transfer.ts`, transfer destinations API, web/mobile |
| Mượn/hoàn | Tạo phiếu mượn; hoàn từng phần tốt/hỏng/mất; hàng hỏng tách batch `NEEDS_CHECK`; chống âm và race với xuất kho | `loan.service.ts`, `loan-view.tsx`, mobile |
| QR | Sinh/in nhãn QR; camera Android và nhập mã tay; parse payload SKU/JSON/URL có kiểm soát, giữ chính xác batch code | `inventory-qr-dialog.tsx`, `InventoryScreen.tsx`, `inventory-state.ts` |
| Semantic search | Tìm vật tư theo công dụng bằng embedding local; fallback từ khóa có nhãn; giữ scope kho | `inventory-semantic.service.ts`, `semantic-inventory-tools.tsx` |
| Nhật ký | Nhật ký nhập/xuất/chuyển/hoàn/điều chỉnh/kiểm kê/tình trạng, người thao tác, ghi chú; giới hạn 200 bản ghi | `inventory.service.ts`, `inventory-history.tsx` |
| Báo cáo tháng | WAREHOUSE nhập số đếm thực tế từng lô/kệ; ADMIN xem từng dòng, duyệt/áp tồn hoặc từ chối có lý do; audit và idempotency | `report.service.ts`, `report-review-dialog.tsx`, `MonthlyReportScreen.tsx` |

### 3.1. Các lỗi toàn vẹn vừa được khép

1. `InventoryTransaction` có snapshot `warehouseId`, `fromWarehouseId`,
   `toWarehouseId`. Lịch sử kho nguồn và kho đích không còn đổi theo vị trí
   hiện tại của batch sau điều chuyển.
2. Giao dịch mới ở các luồng import/export/adjust/return/transfer/count/condition
   đều ghi snapshot kho.
3. Có script backfill dữ liệu cũ:
   `pnpm --filter @safestock/backend prisma:backfill-inventory-transactions`.
4. Danh sách kho đích không còn bị thu hẹp sai về chính kho nguồn. Quyền vẫn
   được enforce ở nguồn; đích phải cùng tổ chức và cùng xã.
5. Báo cáo tháng lấy advisory transaction lock theo `warehouseId + period` và
   từ chối bản thứ hai nếu đã có `PENDING` hoặc `APPROVED`. Báo cáo `REJECTED`
   không khóa việc nộp lại.
6. APK không còn tự gửi snapshot tồn hệ thống như số kiểm kê. Người dùng phải
   nhập số đếm thực tế cho từng lô/kệ; tồn khả dụng chỉ hiển thị để đối chiếu.
7. Mã idempotency có fingerprint payload; cùng request ID nhưng dữ liệu khác
   trả conflict thay vì phát lại response sai.
8. Readiness, transfer, nhận/nhập hàng, expiry và period report đã được khóa
   invariant ở backend; không phụ thuộc filter hoặc validation UI.
9. Ledger có `beforeQuantity`, `afterQuantity`, `quantityDelta`; audit có
   organization/warehouse/correlation snapshot và backfill.
10. Batch list dùng cursor ổn định; catalog/open-loan không còn hard cap làm mất
    dữ liệu âm thầm.

## 4. Mobile Android/APK

So với GitHub, mobile đã chuyển từ lát cắt rescue/report ban đầu thành app theo
role có:

- SecureStore cho access/refresh token; cache tách theo user/kho và được mã hóa
  AES-256-GCM bằng khóa Android Keystore.
- Dashboard, readiness, cảnh báo, mưa 72 giờ và bản tin đầu ngày.
- Toàn bộ nghiệp vụ kho nêu ở mục 3, QR camera và semantic search.
- ADMIN chọn kho rõ ràng trên dashboard/inventory; lựa chọn lưu theo tài khoản.
- Mượn/hoàn một phần tốt/hỏng/mất.
- Báo cáo kiểm kê tháng nhập số đếm thực tế, xem chi tiết, duyệt/từ chối theo
  quyền.
- Offline-read có timestamp/stale badge; mutation fail-closed khi mất LAN.
- Native Android voice recorder bằng Kotlin; audio gửi backend/PhoWhisper của
  VinAI để điền trước văn bản, người dùng vẫn xác nhận trước khi gửi.
- Android project native và cấu hình release signing.

Artifact đã build lại sau lát cắt cuối:

- `apps/mobile/android/app/build/outputs/apk/release/SafeStock-0.5.0-release.apk`
- SHA-256:
  `378B1CB5E8954B921679779469D958FEF492ED7CCECA7B8075C7A186598CC3AD`
- Kích thước: `83.090.062` byte.
- `apksigner verify`: passed; APK Signature Scheme v2, một signer
  `CN=SafeStock X, OU=Mobile, O=Ung Pho Nhanh, L=Dak Lak, ST=Dak Lak, C=VN`.

APK chưa được cài/chạy trên thiết bị thật; checksum trên chỉ xác nhận đúng artifact
đã build và ký từ source hiện tại.

## 5. AI và vận hành bình thường

| Feature bắt buộc | Phần đã làm |
|---|---|
| Dự báo theo mưa 72 giờ | EWMA tiêu thụ + Open-Meteo 72 giờ + hệ số nhóm vật tư, confidence guard, cảnh báo thiếu và fallback khi weather lỗi |
| Semantic search vật tư | Embedding local qua Ollama, cache vector catalog, scope kho và fallback từ khóa |
| Bản tin AI đầu ngày | Tổng hợp fact readiness/forecast/incident/weather; AI chỉ ưu tiên/diễn giải, backend giữ số liệu và có template fallback |
| Chuẩn hóa nhập liệu | Embedding gợi ý SKU/catalog gần nhất, `reviewRequired=true`, không tự mutation |
| RAG kiến thức | Corpus local về nước, dinh dưỡng, vệ sinh, nơi ở khẩn cấp; citation validation và từ chối ngoài corpus |

Các file chính: `apps/ai-service/semantic.py`, `main.py`,
`apps/backend/src/insights/`, `inventory-semantic.service.ts`,
`apps/frontend/src/components/dashboard/semantic-inventory-tools.tsx`,
`apps/mobile/DashboardScreen.tsx`.

## 6. IoT simulator và cảnh báo

- Kho thôn không yêu cầu IoT.
- Electron desktop là công cụ giả lập/demo, không phải màn production để sửa
  sensor.
- Simulator điều chỉnh loadcell/nhiệt độ/độ ẩm/khói/cửa/RFID/camera/power/
  gateway; backend cập nhật realtime và scan rule có debounce.
- Qua ngưỡng tạo incident rule-based; AI diễn giải nền; có notification/chat
  assistant và email SMTP theo organization/warehouse.
- Simulator mutation có permission riêng và có thể khóa hoàn toàn ngoài demo
  runtime.
- Contract phần cứng thật chưa bị giả định thành MQTT hay webhook; cần adapter
  riêng khi nhà cung cấp phần cứng chốt giao thức.

## 7. P09, GIS và điều phối đa kho

- OSRM local/offline có fetch/build/manifest/checksum/preflight/status và test
  artifact/runtime.
- Mission lưu route snapshot/provenance; engine down/NoRoute không được giả
  thành đường thẳng hợp lệ.
- ADMIN cấu hình marker thôn/kho; tên thôn được chuẩn hóa và resolve từ dữ liệu
  đã xác minh.
- Allocation chọn nhiều kho nội xã theo khả dụng/readiness/khoảng cách/FEFO.
- Action plan và map có nền tảng marker/tuyến nhiều kho hội tụ.
- Sáu xã lân cận chỉ là metadata liên hệ, không tham gia tồn/readiness/
  fulfillment. Số điện thoại đã xác minh được seed như liên hệ công khai.
- Mission inbox/deep link, tiến độ prepare theo từng kho, fulfillment atomic và
  idempotent đã được bổ sung.

### Cập nhật 2026-07-29 sau review PR #13

- Local tiếp tục là nền chính; không merge/pull toàn bộ PR #13.
- `RESCUE`/Đội cứu hộ đã chuyển về đúng phạm vi chỉ đọc phương án,
  nhận thông báo và gửi cập nhật text/voice đã tự xác nhận. Public route/UI
  confirm, reject, defer, resend và complete không còn thuộc workflow mới.
- Bản đồ dùng một bộ nhãn semantic có ưu tiên/chống va chạm cho kho, xã và POI;
  lưu marker theo từng warehouse chống nhấn lặp và không xóa draft mới hơn response.
- APK REPORTER có lịch sử/chi tiết báo cáo text của chính tài khoản, scope theo
  user + organization; không lưu audio thô.
- Mission mới có yêu cầu chuẩn bị theo từng SKU. Web/APK WAREHOUSE tiếp nhận,
  báo chênh lệch và xác nhận xuất từng dòng; ADMIN được giảm lượng chưa xuất.
- Race của PR #13 đã được khép bằng claim token + transaction ở prepare và CAS
  `status + claimToken + updatedAt` ở ADMIN review. Stale review không thể reset
  `PREPARED`.
- Chi tiết quyết định: `docs/adr/ADR-004-per-sku-warehouse-preparation.md`.

## 8. Security và tính đúng đã bổ sung

- Organization/warehouse scope cho các đường inventory, loan, report, audit và
  nhiều mission/readiness path.
- Socket.IO handshake dùng access JWT; server tự suy role/warehouse room từ DB.
- Conditional update/CAS, transaction lock, advisory lock và mutation receipt
  cho các write path nhạy cảm.
- Lỗi query/mutation hiển thị riêng, không đổi lỗi 403/5xx thành danh sách rỗng
  hoặc báo thành công.
- Upload báo cáo có validation/giới hạn; approve/reject lưu audit actor thật.

Production hardening toàn hệ thống vẫn còn các gate được ghi rõ trong
`docs/PRD.md`: auth session rotation/revocation, scope tập trung toàn REST/AI,
notification partition tuyệt đối, backup/restore, CI và live recovery.

## 9. Thay đổi schema và thứ tự triển khai

Working tree có thay đổi Prisma. Trên database hiện hữu, thực hiện theo thứ tự:

```powershell
pnpm be:generate
pnpm be:schema:diff
pnpm be:schema
pnpm --filter @safestock/backend prisma:backfill-inventory-transactions
pnpm --filter @safestock/backend prisma:backfill-audit-scope
pnpm --filter @safestock/backend prisma:backfill-hamlets
pnpm --filter @safestock/backend prisma:backfill-mission-preparations
```

Trước khi deploy source 2026-07-29, áp dụng thêm migration additive:

```powershell
# Chạy trên database clone/đã backup trước, rồi xác minh schema.
psql $env:DATABASE_URL -f apps/backend/prisma/sql/20260729_mission_warehouse_requests.sql
pnpm --filter @safestock/backend prisma:generate
```

Không chạy endpoint phát hành/prepare SKU trước khi bảng
`MissionWarehouseRequest` và ba giá trị enum notification mới đã tồn tại.

Sau `db push`, script inventory backfill lấy kho hiện tại của batch cho các
transaction legacy chưa có snapshot. Đây là backfill tương thích tốt nhất với
dữ liệu cũ; không thể tái tạo chắc chắn kho lịch sử nếu database cũ đã di chuyển
batch nhưng không còn audit lineage.

Không chạy `seed` trên database cần giữ dữ liệu thật nếu chưa backup và chưa
đọc kỹ hành vi seed hiện tại.

## 10. Kiểm tra đã có bằng chứng

Quality gate cuối trên source sau PM remediation:

- Backend full suite: 77/77 suites, 475/475 tests passed.
- Backend/frontend/mobile typecheck: passed.
- Backend production build: passed.
- Frontend production build: passed, 19/19 static pages generated.
- Mobile state: 12/12 passed.
- Prisma schema validation: passed.
- Android release build: passed với JDK 17 và Android SDK local.
- APK signature v2 verified, RSA 4096.
- APK `0.5.0`: 83.093.418 byte, SHA-256
  `6044088DC6F07C6A749F60CD0AE3DB7D0241DB369AF93041423CBA2CC64986B2`.
- Targeted diff whitespace check: passed.

Chi tiết finding trước/sau và cách hiểu điểm 100/100 nằm tại
`docs/PM-REVIEW-QUAN-LY-KHO-NGAY-THUONG.md`.

Dev nhận bàn giao vẫn phải chạy lại các gate sau khi sync schema trên database
của môi trường đích và build lại APK vì chưa có device acceptance cho source mới.

## 11. Chưa nghiệm thu theo yêu cầu chủ dự án

Các mục dưới đây không phải code bị bỏ quên; chúng được chủ dự án để test thực
tế sau:

1. Browser acceptance ở các breakpoint và nhiều phiên role độc lập.
2. Fresh install/restart/QR/voice trên Samsung Galaxy S23 Ultra bản cập nhật
   mới nhất.
3. Private-LAN acceptance khi tắt public Internet.
4. SMTP/chat alert với simulator chạy thật trong môi trường demo.
5. Clean database schema push + backfill + seed/preserve-data rehearsal.
6. Cài APK mới và xác minh behavior trên thiết bị.
7. Full judged flow chạy liên tiếp hai lần.

## 12. Lưu ý về file bị xóa

Working tree đang xóa 78 file tracked, phần lớn ở:

- `docs/archive/`
- các `docs/plan-*.md` và báo cáo/evidence cũ
- `plans/260724-*`, `plans/journals/`, `plans/reports/`
- `scripts/dev-all.sh`

Source runtime chính không nằm trong nhóm xóa lớn này. Trước khi commit, dev nên
review riêng:

```powershell
git diff --name-status origin/main --diff-filter=D
```

Nếu cần giữ lịch sử, phục hồi có chọn lọc từ `origin/main`; không hoàn tác toàn
working tree.

## 13. Cách nhận bàn giao an toàn

1. Tạo branch mới ngay từ working tree hiện tại.
2. Chụp `git status --short` và lưu patch dự phòng.
3. Chia commit theo nhóm: schema/backfill, backend integrity, web warehouse,
   mobile/native APK, AI, P09/GIS, docs/cleanup.
4. Không trộn 78 file xóa archive với commit source nghiệp vụ.
5. Sync schema trên database clone trước, chạy backfill, sau đó test.
6. Chạy full backend tests, typecheck ba app và production build.
7. Build APK mới, cài S23 Ultra và thực hiện checklist trong
   `docs/HUONG-DAN-TEST.md`.

Lệnh xem lại toàn bộ khác biệt:

```powershell
git diff --stat origin/main
git diff --name-status origin/main
git ls-files --others --exclude-standard
```

`docs/PRD.md` là nguồn phạm vi hiện tại; `tasks/plan.md`, `tasks/spec.md` và
`tasks/todo.md` là checkpoint thực thi. Không dùng các plan archive cũ làm nguồn
trạng thái.

## 14. Bổ sung sau đợt QA High/Medium/Low ngày 2026-07-28

Toàn bộ finding đã xác nhận trong đợt chạy thử web, APK và demo Windows đã được
xử lý:

1. **High — APK/Metro/React:** Metro dùng đúng workspace root khi chạy dev và
   mobile root khi Gradle embed release. `@react-native-community/netinfo` và
   ứng dụng resolve cùng React 18, không còn lỗi duplicate React hoặc entry
   `apps/mobile/apps/mobile/index`.
2. **High — địa điểm nhiệm vụ:** backend từ chối lập phương án khi không có thôn
   đã xác minh và cũng không có tọa độ thật. Nhiệm vụ legacy thiếu điểm ứng phó
   không thể sinh action plan hoặc dispatch. Web bắt nhập địa điểm, khóa đúng
   nút nghiệp vụ và không còn hiển thị sai rằng vị trí đã được ghi nhận.
3. **Medium — ledger điều chuyển:** khi tách lô, giao dịch của lô đích ghi đúng
   `beforeQuantity = 0`, `afterQuantity = quantity` và
   `quantityDelta = quantity`; chuyển toàn bộ lô vẫn giữ delta bằng 0.
4. **Low — công cụ Windows:** launcher demo không spawn trực tiếp `pnpm.cmd`;
   Prisma client đã tồn tại không bị generate lại làm khóa DLL engine trên
   Windows. Override `minimatch`/`brace-expansion`, root TypeScript config và
   desktop lint/build đã được chuẩn hóa.

Bằng chứng bổ sung:

- BrowserOS/CDP: màn Mission phản hồi HTTP 200, console không lỗi; nút tính nhu
  cầu bị khóa khi thiếu địa điểm và mở khi nhập thôn.
- Android release và debug APK: build thành công; release vào dashboard sau đăng
  nhập, debug tải bundle từ Metro 8081 thành công, không có ReactNativeJS crash.
- Mobile dependency resolution: 2/2 passed; mobile state: 12/12 passed; mobile
  lint passed.
- Mission targeted: 31/31 passed; transfer targeted: 16/16 passed.
- Backend full suite: 77/77 suites, 475/475 tests passed.
- Frontend production build: passed, 19 routes; desktop typecheck, lint và
  production build: passed.
- Demo Windows unit tests: 13/13 passed; demo isolated reset/schema/seed chạy
  thành công rồi đã xóa container, volume và `.env.demo` tạm.
- `git diff --check`: passed.

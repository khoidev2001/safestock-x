# Rà soát hệ thống và kế hoạch tối ưu

**Vai trò rà soát:** quản lý hệ thống (senior) · **Ngày:** 01/09/2026 · **Nhánh:** `main` @ `f49f9cd`

**Phạm vi:** toàn bộ 5 ứng dụng (`backend`, `frontend`, `mobile`, `desktop`, `ai-service`) + `packages` + lược đồ dữ liệu.

**Phương pháp:** đọc mã nguồn trực tiếp và đếm bằng máy. Mọi con số trong tài liệu này đều đo được từ repo, không lấy từ tài liệu tự khai. Chưa chạy hệ thống — các nhận định về hiệu năng là **phân tích tĩnh dựa trên hình dạng truy vấn và chỉ mục**, cần đo thực tế trước khi coi là kết luận cuối (xem §9).

**Tài liệu đã qua hai lượt rà soát.** Lượt một (§1–§9) đi theo trục hiệu năng, kiến trúc và giao diện. Lượt hai (§10) đi vào xác thực, xử lý lỗi phía người dùng, hành vi ngoại tuyến, vòng đời dữ liệu và mô hình thông báo — và **đính chính một kết luận sai của lượt một**, ghi ở §10.1.

---

## 1. Kết luận điều hành

Đây là một hệ thống **được xây dựng tốt hơn mức thường thấy** ở sản phẩm dự thi. Phần lõi nghiệp vụ — giao dịch kho, phân quyền, chống trùng lặp, nhật ký hậu kiểm — làm chắc, có test khóa các tình huống hỏng thật, và các bảng tăng trưởng nhanh đều đã có chỉ mục đúng. Không có lỗi kiến trúc nào ở mức phải đập đi làm lại.

Vấn đề của hệ thống này **không phải là thiếu chức năng — mà là thiếu lớp nền dùng chung.** Ba biểu hiện:

| | Hiện trạng đo được | Hệ quả |
|---|---|---|
| Web không có lớp component nguyên thủy | 1.237 `className` viết tay, cùng một cái nút được viết theo **hơn 10 kiểu khác nhau** | Làm lại UI/UX sẽ phải sửa tay hàng trăm chỗ thay vì sửa một file |
| App điện thoại không có thư viện điều hướng và biểu tượng | Chuyển tab bằng `useState`, biểu tượng là ký tự Unicode `◉ ✓ ▦ ☑ ➤ ! ✎` | Nút Back của Android thoát thẳng app; biểu tượng hiển thị khác nhau tùy máy |
| Đã có WebSocket nhưng vẫn hỏi liên tục (polling) | **18 bộ đếm polling** (nhanh nhất 5 giây) trong khi WebSocket **chỉ chuyển đúng 1 loại sự kiện** | Máy chủ xã gánh tải lặp lại vô ích, tranh GPU với Ollama |

**Ưu tiên số một trước khi làm lại UI/UX:** dựng lớp nền (design system + điều hướng) trước, rồi mới vẽ lại màn hình. Làm ngược lại thì công vẽ lại sẽ phải làm hai lần.

---

## 2. Bản đồ hệ thống hiện tại

### 2.1. Quy mô mã nguồn (chỉ tính file được Git theo dõi)

| Thành phần | Số file | Số dòng | Ghi chú |
|---|---:|---:|---|
| `apps/backend` | 300 | 40.099 | NestJS 11 + Prisma 5 + PostgreSQL + Redis |
| `apps/frontend` | 117 | 16.928 | Next 15 + React 19 + Tailwind 4 |
| `apps/mobile` | 24 | 8.255 | Expo SDK 52 / RN 0.76 |
| `apps/ai-service` | 31 | 5.743 | FastAPI + Ollama + PhoWhisper |
| `apps/desktop` | 17 | 1.769 | Electron + Vite |
| `packages` | 4 | 1.200 | shared-types, scenario-definitions |
| **Tổng** | **493** | **~74.000** | |

### 2.2. Bề mặt hệ thống

- **111 endpoint** trên **20 controller**; controller lớn nhất là `mission` (29 endpoint).
- **34 model**, 22 enum, 36 `@@index`, 14 `@@unique`.
- **16 trang web** / **13 mục điều hướng** chia 3 nhóm (Điều hành · Nghiệp vụ kho · Quản trị).
- **7 tab điện thoại**, gán theo vai: `WAREHOUSE` 6 tab · `RESCUE` 3 tab · `ADMIN` 1 tab.
- **15 endpoint AI** trên FastAPI.
- **128 file test TypeScript** + **14 file test Python**; 1 workflow CI (`competition-quality.yml`) với 2 job.

### 2.3. Điểm mạnh cần giữ nguyên, không đụng vào

Những chỗ này đã đúng. Việc làm lại UI/UX **không được** phá:

1. **Chỉ mục trên các bảng tăng trưởng nhanh đã đúng.** `SensorEvent`, `InventoryTransaction`, `AuditLog` đều có chỉ mục ghép `[warehouseId, createdAt]`. Đây là chỗ hầu hết dự án cùng quy mô làm sai.
2. **Truy vấn nặng đã giới hạn theo cửa sổ thời gian.** `incident.scanWarehouse` và `insights.recentExports` đều lọc `createdAt >= since`, không quét cả bảng.
3. **`dashboard-nav.ts` là nguồn sự thật duy nhất cho điều hướng** — mỗi mục có `requiredPermission`, và các quyết định khó (vì sao tab "Điều phối cứu hộ" dùng `MISSION_CREATE` chứ không phải `MISSION_VIEW`) đều được ghi lý do ngay tại chỗ. Giữ mô hình này khi làm lại giao diện.
4. **Bộ token thiết kế trong `globals.css` dùng `oklch` và đặt tên theo nghĩa** (`--color-ready`, `--color-attention`, `--color-degraded`, `--color-critical`), không đặt theo màu. Đây đã là nửa cái design system.
5. **Trợ năng khá tốt:** 145 thuộc tính `aria-*` và 45 `role=` trong 117 file. Không được để tụt khi vẽ lại.
6. **`ValidationPipe({ whitelist: true })`** chặn client tự gửi `createdAt` — máy chủ là nguồn thời gian duy nhất.

---

## 3. Đánh giá chức năng: giữ · sửa · bỏ · thêm

### 3.1. Chức năng nên GỘP hoặc BỎ

| # | Chức năng | Vấn đề | Đề xuất |
|---|---|---|---|
| G1 | Route `/mission` và `/missions` | Hai đường dẫn **khác nhau đúng một chữ cái `s`**. `/mission` chỉ chứa form khai tình huống; `/missions` là danh sách. Người dùng gõ nhầm, lập trình viên đọc nhầm, `getNavItem` phải xử lý tiền tố dài nhất để phân biệt. | Đổi thành `/dispatch` (khai tình huống) và `/missions` (danh sách + chi tiết). Hoặc gộp form vào `/missions` dưới dạng nút "Khai tình huống mới" — bớt được một mục điều hướng. |
| G2 | Trường `ItemBatch.status` | Lược đồ tự ghi chú: *"giữ tương thích; sẽ dùng condition+circulation"*. Đang tồn tại **ba nguồn sự thật** cho cùng một trạng thái lô hàng. | Xóa hẳn `status` và enum `ItemStatus`. Đây là nợ kỹ thuật đang chờ gây ra một lỗi lệch số liệu. |
| G3 | Tab `home` và `readiness` trên điện thoại | Cùng render từ `DashboardScreen` (972 dòng) chỉ khác tham số `view`. Người dùng thấy hai tab, thực chất là một màn hình. | Gộp thành một tab "Tổng quan" có phần cuộn xuống là chi tiết sẵn sàng. `WAREHOUSE` giảm từ 6 xuống 5 tab — đúng giới hạn thiết kế của thanh tab. |
| G4 | Thanh tab điện thoại cho vai `ADMIN` | `tabsForRole("ADMIN")` trả về **đúng một tab** (`inventory`). Một thanh tab có một tab là giao diện thừa. | Ẩn hẳn thanh tab khi chỉ có một mục. |
| G5 | Mục điều hướng "Cảm biến thử nghiệm" | Là công cụ mô phỏng, nhưng đứng ngang hàng với chức năng nghiệp vụ thật trong menu. Khi bàn giao cho xã dùng thật, sự có mặt của nó làm giảm độ tin cậy của số liệu cảm biến. | Giữ cho demo dự thi, nhưng đặt sau cờ môi trường `SIMULATION_UI_ENABLED`. Bản triển khai thật không hiện mục này. |

### 3.2. Chức năng nên THÊM — xếp theo giá trị

| # | Chức năng | Vì sao cần | Ước lượng |
|---|---|---|---|
| **T1** | **Phiếu xuất kho in được (có chữ ký)** | Đây là **lỗ hổng nghiệp vụ thật, không phải kỹ thuật**. Cấp xã cấp phát vật tư cứu trợ phải có chứng từ giấy có chữ ký người giao – người nhận để quyết toán. Hiện `globals.css` **không có một dòng `@media print` nào**. Không in được nghĩa là cán bộ vẫn phải viết tay song song — và như vậy hệ thống chưa thay được sổ. | 2–3 ngày |
| **T2** | **Xuất dữ liệu CSV/Excel** | Không có đường xuất dữ liệu nào. (`inventory-bulk-export-dialog` là *xuất kho hàng loạt*, không phải xuất tệp.) Xã cần gửi số liệu lên huyện/tỉnh bằng bảng tính. **Đối thủ trực tiếp có chức năng này.** | 1–2 ngày |
| **T3** | **Màn hình "Việc của tôi"** | Hệ thống có 13 màn hình nhưng **không có một hàng đợi hành động gộp**. Người trực lúc lũ phải tự đi qua từng tab để biết còn việc gì. Trong hệ thống ứng phó khẩn cấp, đây thường là màn hình giá trị nhất. Dữ liệu đã có sẵn (nhiệm vụ chờ, sự cố mở, báo cáo chờ duyệt, yêu cầu mượn chờ trả lời) — chỉ cần gom. | 3–4 ngày |
| **T4** | **Chế độ tối (dark mode)** | `globals.css` khai `color-scheme: light` cứng; `styles.ts` của mobile chỉ có bảng màu sáng. Thiên tai đỉnh điểm thường vào ban đêm; màn hình trắng toát trong phòng trực tối là vấn đề vận hành thật, không phải sở thích. Nên làm **cùng lúc** với việc làm lại UI — làm sau sẽ đắt gấp đôi. | Gộp vào công việc UI |
| **T5** | **Giao diện sao lưu / phục hồi** | `BackupController` chỉ có `POST /backup/run`, **không có màn hình nào gọi tới**. Quản trị xã không thấy được lần sao lưu gần nhất, không tự chạy được, không phục hồi được. "Diễn tập khôi phục sao lưu" đang nằm trong danh sách việc còn lại — không có UI thì không diễn tập được. | 2 ngày |
| **T6** | **Tìm kiếm toàn cục (Ctrl+K)** | 13 màn hình, không có cách nhảy nhanh tới một lô hàng / nhiệm vụ / kho cụ thể. Đã có sẵn `inventory-semantic.service` để dùng lại. | 2 ngày |
| **T7** | **Lịch sử di trú CSDL (Prisma migrations)** | Thư mục `apps/backend/prisma/migrations` **không tồn tại**. Toàn hệ thống chạy bằng `prisma db push`. Nghĩa là: không rollback được, không nâng cấp được bản đã cài ở xã mà không mất dữ liệu, và 5 script `backfill-*.ts` đang thay thế cho di trú thật. **Đây là chốt chặn bắt buộc trước khi có dữ liệu thật.** | 2–3 ngày |
| **T8** | **Tài liệu API (Swagger/OpenAPI)** | 111 endpoint, **không có `@nestjs/swagger`**. Người tiếp nhận phải đọc 20 controller để biết hệ thống có gì. Với NestJS thì đây là việc gần như miễn phí. | 1 ngày |

---

## 4. Hiệu năng — các phát hiện cụ thể

> Đây là phân tích tĩnh. Cần đo bằng `EXPLAIN ANALYZE` trên dữ liệu thật trước khi sửa (xem §9).

### P1 — `communeStock` đọc toàn bộ lô hàng của cả xã vào RAM mỗi lần mở màn hình

[`inventory.service.ts:224`](../apps/backend/src/inventory/inventory.service.ts#L224)

Truy vấn lọc `circulation: "IN_STOCK"` qua đường quan hệ `shelf → zone → warehouse → organizationId`, kèm `select` ba tầng và một truy vấn con `loans` — **không có `take`, không gom nhóm ở tầng CSDL, không cache**. Kết quả được gom nhóm bằng JavaScript sau đó.

Nghĩa là mỗi lần mở màn hình tồn kho toàn xã, **mọi lô hàng của cả 18 kho** đi qua mạng và qua bộ nhớ Node. Với dữ liệu demo thì nhanh; với 18 kho × vài trăm lô thì đây là vài nghìn dòng cho một màn hình chỉ hiển thị bảng tổng hợp.

**Sửa:** gom nhóm bằng SQL (`groupBy` của Prisma hoặc `$queryRaw` với `GROUP BY`) thay vì gom trong JS. Đây là màn hình chỉ đọc — thêm cache Redis TTL 30–60 giây, xóa cache khi có giao dịch kho, là đủ.

### P2 — Thiếu chỉ mục trên `ItemBatch.shelfId`

**Prisma không tự tạo chỉ mục cho khóa ngoại trên PostgreSQL.** `ItemBatch` chỉ có `@@unique([itemId, batchCode])` — không có chỉ mục nào trên `shelfId`.

Toàn bộ hệ thống lọc lô hàng theo đường `shelf → zone → warehouse`: riêng `inventory.service.ts` có **20 chỗ**. Mọi truy vấn đó đều phải quét `ItemBatch` để lọc theo `shelfId`.

**Sửa (một dòng, tỉ lệ lợi trên công cao nhất trong toàn bộ tài liệu này):**

```prisma
@@index([shelfId])
@@index([shelfId, circulation])   // phục vụ đúng bộ lọc phổ biến nhất
```

Các model khác cũng thiếu chỉ mục khóa ngoại: `User.warehouseId`, `User.organizationId`, `Warehouse`, `WarehouseZone`, `Shelf`, `Item`, `ItemCategory`. Ảnh hưởng nhỏ hơn vì bảng nhỏ, nhưng nên thêm cùng lượt.

### P3 — Không dùng chỉ mục đã có sẵn

[`insights.service.ts:216`](../apps/backend/src/insights/insights.service.ts#L216) lọc giao dịch qua quan hệ lồng `batch → shelf → zone → warehouseId` (join ba tầng).

Trong khi `InventoryTransaction` **đã có sẵn cột `warehouseId` phi chuẩn hóa và chỉ mục `@@index([warehouseId, createdAt])`** — đúng chỉ mục cho truy vấn này. Script `backfill-inventory-transaction-warehouses.ts` đã điền dữ liệu cho cột đó rồi.

**Sửa:** đổi điều kiện thành `{ type, createdAt: { gte: since }, warehouseId }`. Sửa một dòng, đổi từ join ba tầng sang index scan.

### P4 — 18 bộ polling trong khi WebSocket chỉ chuyển một loại sự kiện

Backend chỉ phát đúng ba tên sự kiện: `join`, `join-role`, `notification`. Mọi thứ khác đều do trình duyệt hỏi lại theo chu kỳ:

| Trang | Số bộ đếm chạy song song | Chu kỳ |
|---|---:|---|
| `/readiness` | 5 | 10s · 10s · 10s · 15s · 12s |
| `mission-view` | 2 | 5s · 5s |
| `layout` + `dashboard-shell` | 2 | 12s · 15s |
| Còn lại | 9 | 8s – 30s |

Một tab mở trang `/readiness` tạo khoảng **30 lượt gọi API mỗi phút** dù không có gì thay đổi. Ba trình duyệt trong kịch bản demo là khoảng 90 lượt/phút, trên đúng cái máy đang chạy Ollama.

**Sửa:** mở rộng WebSocket sang các sự kiện vốn đã mang bản chất đẩy: `readiness:changed`, `mission:updated`, `incident:opened`, `report:submitted`. Giữ polling làm phương án dự phòng nhưng nới lên 60 giây — mô hình `notification-bell.tsx` đã làm đúng như vậy, chỉ cần nhân rộng.

### P5 — Mở hai kết nối WebSocket cho mỗi tab trình duyệt

[`layout.tsx:108`](<../apps/frontend/src/app/(dashboard)/layout.tsx#L108>) và [`notification-bell.tsx:39`](../apps/frontend/src/components/mission/notification-bell.tsx#L39) mỗi chỗ tự gọi `io(BASE, ...)`.

Hai kết nối, hai lần xác thực, hai lần vào phòng, cho cùng một luồng sự kiện.

**Sửa:** một `SocketProvider` ở tầng layout, các component dùng qua context. Việc nhỏ, làm luôn.

### P6 — Không có hàng đợi ưu tiên cho suy luận AI

Chú thích trong [`main.py:91`](../apps/ai-service/main.py#L91) đã tự chỉ ra vấn đề:

> *"Ollama sinh văn bản MỖI LẦN MỘT YÊU CẦU trên một GPU. Trang theo dõi đang mở sẽ đều đặn gọi bản tin và phân tích ở nền; người dùng bấm 'Phân tích bằng AI' đúng lúc đó là xếp hàng phía sau, và có thể chờ quá hạn 90 giây."*

Đây là chẩn đoán đúng, nhưng cách xử lý hiện tại mới chỉ là **đổi thông báo lỗi cho dễ hiểu**, chưa xử lý nguyên nhân. Trong buổi demo trước ban giám khảo, việc bấm "Phân tích bằng AI" rồi chờ 90 giây và nhận lỗi là rủi ro có thật.

**Sửa, theo thứ tự lợi trên công:**

1. Dừng gọi bản tin nền khi tab không hiển thị (`document.visibilityState`) — rẻ nhất, hiệu quả ngay.
2. Hàng đợi hai mức: yêu cầu do người bấm luôn được phục vụ trước việc chạy nền.
3. Hiển thị vị trí trong hàng đợi thay vì quay vòng vô định.

---

## 5. Kiến trúc và khả năng bảo trì

### K1 — Bốn tệp quá lớn, cần tách trước khi làm lại giao diện

| Tệp | Dòng | Vấn đề |
|---|---:|---|
| [`InventoryScreen.tsx`](../apps/mobile/InventoryScreen.tsx) | **1.886** | Bảy nghiệp vụ kho trong một component, một `StyleSheet.create` |
| [`mission.service.ts`](../apps/backend/src/mission/mission.service.ts) | **1.854** | Phân tích tình huống + tính nhu cầu + phân bổ + tuyến đường + trạng thái |
| [`mission-view.tsx`](../apps/frontend/src/components/mission/mission-view.tsx) | **1.344** | Form khai + ghi âm + bản đồ + kết quả phân tích |
| [`main.py`](../apps/ai-service/main.py) | **1.176** | 15 endpoint trong một tệp |

`InventoryScreen.tsx` là **ưu tiên cao nhất** vì nó nằm ngay trên đường làm lại UI/UX điện thoại. Không tách trước thì mọi thay đổi giao diện đều phải mò trong 1.886 dòng.

### K2 — App điện thoại không có thư viện điều hướng

`package.json` của mobile **không có `@react-navigation/*` hay `expo-router`**. Việc chuyển màn hình làm bằng `useState<MobileTab>` trong `App.tsx`.

Hệ quả thực tế, không phải lý thuyết:

- **Nút Back cứng của Android thoát thẳng app** thay vì quay lại màn trước. Không có `BackHandler` ở đâu trong mã nguồn. Đây là lỗi UX mà mọi người dùng Android sẽ gặp trong 30 giây đầu.
- Không có deep link, nên thông báo đẩy không mở được đúng nhiệm vụ.
- Không có lịch sử điều hướng, không có hiệu ứng chuyển màn.
- Mở chi tiết nhiệm vụ phải truyền tay qua state `missionFromList`.

**Sửa:** chuyển sang `expo-router`. Đây là **điều kiện tiên quyết của việc làm lại UI/UX điện thoại**, không phải việc làm sau.

### K3 — Không có `react-native-safe-area-context`

[`App.tsx:53`](../apps/mobile/App.tsx#L53) tự tính chiều cao thanh trạng thái vì `SafeAreaView` của RN chỉ có tác dụng trên iOS. Chú thích ghi nhận đúng vấn đề, nhưng cách xử lý là một hằng số tự tính.

Trên Android dùng điều hướng cử chỉ, **thanh tab dưới cùng nhiều khả năng bị thanh cử chỉ che**. Cần kiểm chứng trên máy thật (xem §9).

**Sửa:** thêm `react-native-safe-area-context` — thư viện chuẩn, xử lý đúng cả tai thỏ lẫn thanh cử chỉ.

### K4 — Biểu tượng tab là ký tự Unicode

[`App.tsx:292`](../apps/mobile/App.tsx#L292) dùng `◉ ✓ ▦ ☑ ➤ ! ✎`.

Chú thích lý giải việc tránh dùng ảnh (phải có bản @2x @3x, tải chậm làm giật thanh tab) — lý do đúng, nhưng kết luận sai. Cách đúng là **thư viện biểu tượng vector dạng font**: `@expo/vector-icons` đã có sẵn trong Expo, không thêm tệp ảnh nào, không có vấn đề @2x/@3x, và hiển thị **giống nhau trên mọi máy**.

Các ký tự hiện tại rơi vào font hệ thống của từng hãng: cùng một mã, Samsung One UI, Pixel và Xiaomi vẽ ra ba hình khác nhau — có máy vẽ ra ô vuông rỗng. Với sản phẩm đang được chấm về giao diện, đây là rủi ro nhìn thấy được ngay trên ảnh chụp màn hình.

### K5 — Web không có lớp component nguyên thủy

Đây là **phát hiện quan trọng nhất đối với công việc sắp tới**.

- **1.237** thuộc tính `className` viết tay.
- Thư mục `components/shared/` chỉ có 5 tệp, và **không có tệp nào là `Button`, `Card`, `Input`, `Badge`, `Table` hay `Dialog`**.
- Cùng một cái nút được viết theo hơn 10 biến thể:

```
27 lần  rounded-md border bg-[var(--surface)] px-3 py-2 text-sm
 6 lần  rounded-md border px-3 py-1.5 text-sm
 6 lần  rounded-md border bg-transparent px-3 py-2
 5 lần  rounded-md border bg-[var(--surface)] px-3 py-2
 4 lần  rounded-md bg-[var(--color-accent)] px-4 py-2 font-semibold ...
 3 lần  rounded-md border px-4 py-2
 ... và 8 biến thể nữa
```

Nghĩa là: **đổi bo góc của nút = sửa tay hơn 60 chỗ.** Đổi khoảng đệm còn nhiều hơn. Và cứ mỗi lần sửa lại sinh thêm một biến thể mới.

**Đây là lý do phải dựng design system trước khi vẽ lại giao diện.** Nếu vẽ lại trước, kết quả chỉ là tạo ra biến thể thứ 11 đến thứ 20.

### K6 — Web không có bộ chạy test

`apps/frontend/package.json` có **9 script `test:*` riêng biệt**, mỗi cái tự gọi `tsc` biên dịch thủ công rồi chạy `node --test` trên tệp đã biên dịch:

```
test:mission-inbox · test:map-marker-state · test:map-labels ·
test:workflow-progress · test:audio-wav · test:session-marker ·
test:warehouse-progress · test:notification-routing · test:inter-commune-loan
```

Mỗi bài test mới là thêm một dòng script dài vào `package.json`, và phải nhớ khai thêm vào CI. Không có `vitest`/`jest`, không đo được độ phủ, và **không test được component React** — chỉ test được hàm thuần.

**Hệ quả trực tiếp cho việc làm lại UI:** không có cách nào kiểm thử component giao diện. Vẽ lại 16 màn hình mà không có lưới an toàn.

**Sửa:** thay bằng `vitest` + `@testing-library/react`. Gộp 9 script thành 1. Việc làm một lần, khoảng nửa ngày.

### K7 — Định danh tiếng Việt còn sót trong mã nguồn

Đo được **78 lượt** trên **62 tên khác nhau**, tập trung ở:

| Tệp | Số lượt |
|---|---:|
| `loan/__tests__/inter-commune-loan.workflow.spec.ts` | 11 |
| `inventory/bottle-units.ts` | 8 |
| `loan/inter-commune-loan.service.ts` | 8 |
| `dashboard/inter-commune-loan-panel.tsx` | 8 |

Ví dụ: `quyDoiChai`, `chaiTuLit`, `soChai`, `chaiCanCho`, `CHAI_MOI_LOC`, `LIT_MOI_CHAI_MAC_DINH`, `tenXaGui`, `theoKho`, `duLieu`, `laChoMuon`, `laBuocTra`, `beRongThanhCuon`, `banGhiGoc`, `moTaQuyDoi`, `ThanhTrangThaiHeDieuHanh`, `DangKhoiPhucPhien`, `thongBaoDangNhapLoi`.

Bên Python: `_ham_nong_nhan_dang_giong_noi`, `_mo_hinh_qua_han`, `chay`.

Ngoài ra một tệp có **tên tệp** tiếng Việt: [`prisma/sua-don-vi-nuoc.ts`](../apps/backend/prisma/sua-don-vi-nuoc.ts).

Việc này trái với chuẩn đặt tên của chính dự án. Quy mô có giới hạn (62 tên), nên gom vào **một lượt đổi tên duy nhất** — làm rải rác sẽ không bao giờ xong.

### K8 — Không có bộ lọc lỗi toàn cục

Backend không có `ExceptionFilter`, không có `NestInterceptor` nào. Nghĩa là:

- Lỗi Prisma (`P2002` trùng khóa, `P2025` không tìm thấy) trồi thẳng lên client dưới dạng 500 kèm thông điệp nội bộ.
- Không có định dạng lỗi thống nhất, nên mỗi màn hình tự đoán cách đọc lỗi.
- Không có `correlationId` ở tầng HTTP (chỉ có ở tầng nghiệp vụ trong `AuditLog`), nên không lần được một yêu cầu qua các tầng khi gỡ lỗi.

---

## 6. Bảo mật

### B1 — Dịch vụ AI không có xác thực (mức: cao)

[`main.py`](../apps/ai-service/main.py) khai `FastAPI(...)` và **không có một `Depends`, một kiểm tra header, hay một middleware xác thực nào**. 15 endpoint mở hoàn toàn, gồm `/transcribe`, `/situation-analysis`, `/assistant`, `/action-plan`.

Bất kỳ ai chạm được cổng 8000 đều có thể:

- chạy suy luận LLM miễn phí trên máy chủ xã, làm cạn GPU và khiến người dùng thật hết giờ chờ;
- gọi `/assistant` để lấy ngữ cảnh RAG mà tầng phân quyền của backend đang bảo vệ.

Cách phòng vệ hiện tại **chỉ là cách ly mạng** — và chính tài liệu dự thi đã liệt kê "kiểm chứng dịch vụ AI không truy cập được từ Internet" vào diện **chưa nghiệm thu**. Nghĩa là hiện chưa có lớp bảo vệ nào được xác nhận.

**Sửa:** một khóa dùng chung giữa backend và ai-service (`X-Internal-Key`), kiểm ở middleware. Nửa ngày công, đóng lại toàn bộ bề mặt này.

### B2 — Không có giới hạn tần suất ngoài đường đăng nhập (mức: trung bình – cao)

> *Đính chính lượt rà soát 2 (xem §11.1): bản đầu của tài liệu này viết "không có giới hạn tần suất" là nói quá. Đường đăng nhập **có** bảo vệ; các đường còn lại thì không.*

`AuthRateLimitService` bảo vệ `/auth/login`: khóa theo cặp (email, IP), 5 lần sai trong cửa sổ 15 phút thì chặn 15 phút. Đây là thiết kế đúng và có test riêng.

Nhưng **không có `@nestjs/throttler`, và 110 endpoint còn lại không có giới hạn nào.**

Đáng lo nhất là `POST /missions/transcribe`: [`main.ts:26`](../apps/backend/src/main.ts#L26) nâng giới hạn thân yêu cầu lên **25 MB** để nhận audio base64. Không giới hạn tần suất, cộng thân 25 MB, cộng mỗi yêu cầu khởi chạy PhoWhisper — một máy trong LAN có thể làm nghẽn máy chủ xã bằng vài dòng lệnh.

Bản thân `AuthRateLimitService` cũng còn hai điểm yếu, xem N6 ở §11.

**Sửa:** `ThrottlerModule` toàn cục, siết riêng `/missions/transcribe` và các endpoint gọi AI.

### B3 — Không dùng `helmet`, có bản tự viết thay thế

`applyApiSecurityHeaders` trong `config/http-security.ts` là bản tự viết, có test riêng. Không sai, nhưng nghĩa là mỗi khuyến nghị bảo mật mới của trình duyệt phải tự theo dõi và tự cập nhật.

**Đề xuất:** cân nhắc `helmet` cho phần chuẩn, giữ phần tự viết cho những gì đặc thù. Ưu tiên thấp — chỗ này đang không hỏng.

### B4 — Phụ thuộc đã lạc hậu một thế hệ

| | Hiện tại | Mới hơn | Ghi chú |
|---|---|---|---|
| Prisma | 5.20 | 6.x | Prisma 6 cải thiện đáng kể tốc độ truy vấn quan hệ lồng — đúng dạng truy vấn dự án đang dùng nhiều |
| Expo SDK | 52 | 54+ | RN 0.76 lên 0.81+; ảnh hưởng trực tiếp việc dựng APK về sau |

Không phải việc khẩn, nhưng nên làm **trước** khi vẽ lại giao diện, để không phải vẽ hai lần trên hai nền tảng khác nhau.

---

## 7. Nền móng cho việc làm lại UI/UX

Phần này phục vụ trực tiếp việc làm tiếp theo. **Thứ tự dưới đây quan trọng hơn nội dung** — làm sai thứ tự sẽ phải làm lại.

### Giai đoạn 0 — Dọn nền (làm TRƯỚC khi vẽ bất cứ thứ gì)

| Việc | Vì sao phải làm trước | Ước lượng |
|---|---|---|
| Dựng lớp component nguyên thủy web: `Button` `Input` `Select` `Card` `Badge` `Table` `Dialog` `Tabs` `EmptyState` `Skeleton` | 1.237 `className` là chi phí phải trả cho **mọi** lần đổi giao diện, lặp lại mãi mãi | 3–4 ngày |
| Bổ sung token còn thiếu vào `globals.css`: thang khoảng cách, thang đổ bóng, thang bo góc, **và bảng màu tối** | Thêm chế độ tối sau khi vẽ xong là vẽ lại lần hai | 1 ngày |
| Thay 9 script `test:*` bằng `vitest` + Testing Library | Không có lưới an toàn thì không dám vẽ lại 16 màn hình | 0,5 ngày |
| Chuyển mobile sang `expo-router` + `react-native-safe-area-context` + `@expo/vector-icons` | Cả ba đều **đổi cấu trúc màn hình**. Làm sau khi vẽ là vẽ lại | 2–3 ngày |
| Tách `InventoryScreen.tsx` (1.886 dòng) thành các màn theo nghiệp vụ | Nằm chắn ngay giữa đường làm lại UI điện thoại | 2 ngày |

**Tổng giai đoạn 0: khoảng 9–11 ngày công.** Nghe như trì hoãn việc chính, nhưng nó cắt thời gian của giai đoạn vẽ lại xuống ít nhất một nửa, và làm cho lần đổi giao diện thứ hai gần như miễn phí.

### Giai đoạn 1 — Vẽ lại, theo thứ tự ưu tiên

Xếp theo **tần suất sử dụng thật lúc có tình huống**, không theo thứ tự trong menu:

1. `/readiness` — Tổng quan (màn mở đầu của mọi phiên làm việc)
2. `/missions` và trang chi tiết nhiệm vụ (màn dùng nhiều nhất lúc khẩn cấp)
3. `/inventory` (màn dùng nhiều nhất ngày thường)
4. Điện thoại: Kho, rồi Nhiệm vụ, rồi Kiểm kê
5. Phần còn lại

### Ba việc UI/UX nên xử lý ngay trong lúc vẽ lại

- **Bảng chưa cuộn ngang được.** Có 6 bảng `<table>`, và chỉ 95 trên 1.237 class có điểm ngắt responsive (**khoảng 8%**). Bảng vật tư trên máy tính bảng hoặc màn hình hẹp sẽ tràn. Mỗi bảng cần một khung `overflow-x: auto`.
- **Chưa có trang in.** Không có `@media print` — liên quan trực tiếp tới chức năng T1.
- **Giữ nguyên mức trợ năng.** 145 `aria-*` và 45 `role=` hiện có là tài sản. Đưa chúng **vào bên trong** component nguyên thủy để không mất khi vẽ lại.

---

## 8. Danh sách việc theo ưu tiên

### P0 — Làm trước khi có dữ liệu thật, hoặc trước vòng chấm tiếp theo

| | Việc | Mục | Công |
|---|---|---|---|
| 1 | Thêm `@@index([shelfId])` và `@@index([shelfId, circulation])` cho `ItemBatch` | P2 | 1 giờ |
| 2 | Xác thực nội bộ cho ai-service | B1 | 0,5 ngày |
| 3 | Giới hạn tần suất; siết `/auth/*` và `/missions/transcribe` | B2 | 0,5 ngày |
| 4 | Dừng gọi AI nền khi tab ẩn | P6 | 2 giờ |
| 5 | Lịch sử di trú Prisma, bỏ `db push` | T7 | 2–3 ngày |

### P1 — Nền móng cho việc làm lại UI/UX (đang chặn công việc sắp tới)

| | Việc | Mục | Công |
|---|---|---|---|
| 6 | Lớp component nguyên thủy web | K5 | 3–4 ngày |
| 7 | Token thiết kế đầy đủ + bảng màu tối | T4 | 1 ngày |
| 8 | `expo-router` + safe-area + biểu tượng vector | K2, K3, K4 | 2–3 ngày |
| 9 | Tách `InventoryScreen.tsx` | K1 | 2 ngày |
| 10 | `vitest` cho web | K6 | 0,5 ngày |

### P2 — Hiệu năng và chức năng còn thiếu

| | Việc | Mục | Công |
|---|---|---|---|
| 11 | Gom nhóm `communeStock` bằng SQL + cache | P1 | 1–2 ngày |
| 12 | Dùng cột `warehouseId` có sẵn trong `insights` | P3 | 1 giờ |
| 13 | Gộp hai kết nối WebSocket thành một | P5 | 2 giờ |
| 14 | Mở rộng sự kiện WebSocket, hạ polling xuống vai trò dự phòng | P4 | 2 ngày |
| 15 | Phiếu xuất kho in được | T1 | 2–3 ngày |
| 16 | Xuất CSV/Excel | T2 | 1–2 ngày |
| 17 | Màn hình "Việc của tôi" | T3 | 3–4 ngày |
| 18 | Giao diện sao lưu/phục hồi | T5 | 2 ngày |

### P3 — Dọn dẹp, gộp làm một lượt

| | Việc | Mục | Công |
|---|---|---|---|
| 19 | Đổi 62 định danh tiếng Việt + đổi tên `sua-don-vi-nuoc.ts` | K7 | 1 ngày |
| 20 | Bỏ `ItemBatch.status` và enum `ItemStatus` | G2 | 0,5 ngày |
| 21 | Đổi tên route `/mission` thành `/dispatch` | G1 | 2 giờ |
| 22 | Gộp tab `home` và `readiness`; ẩn thanh tab khi chỉ có một mục | G3, G4 | 0,5 ngày |
| 23 | Bộ lọc lỗi toàn cục + correlationId tầng HTTP | K8 | 1 ngày |
| 24 | Swagger | T8 | 1 ngày |
| 25 | Nâng Prisma 6, Expo SDK 54 | B4 | 1–2 ngày |
| 26 | Đặt màn "Cảm biến thử nghiệm" sau cờ môi trường | G5 | 1 giờ |
| 27 | Tách `mission.service.ts` và `main.py` | K1 | 2–3 ngày |

---

## 9. Việc kiểm chứng còn thiếu — nói rõ giới hạn của bản rà soát này

Bản rà soát này **đọc mã nguồn, không chạy hệ thống**. Trước khi coi phần hiệu năng là kết luận, cần bốn phép đo sau:

1. **Chạy `EXPLAIN ANALYZE`** trên `communeStock` và trên truy vấn `insights.recentExports`, với dữ liệu ở quy mô thật (18 kho, vài trăm lô mỗi kho). Đây là điều kiện để xác nhận P1, P2, P3.
2. **Đo tải máy chủ khi mở ba trình duyệt** đúng như kịch bản demo, đếm số lượt gọi API mỗi phút. Xác nhận P4.
3. **Cài APK lên máy Android thật dùng điều hướng cử chỉ**, kiểm tra: nút Back làm gì, thanh tab có bị che không, các ký tự Unicode hiển thị ra hình gì. Xác nhận K2, K3, K4.
4. **Gọi thẳng `http://<máy-chủ>:8000/assistant`** từ một máy khác trong LAN, không kèm token. Xác nhận B1.

Bốn phép thử này mất khoảng nửa ngày và biến toàn bộ phần §4–§6 từ "phân tích" thành "đo được".

**Bổ sung sau lượt rà soát 2** — ba phép thử nữa, mỗi cái vài phút:

5. **Đăng nhập hai tài khoản trưởng thôn khác nhau trên hai máy**, để một người mở thông báo, rồi xem huy hiệu chưa đọc của người kia. Xác nhận N2 — đây là phép thử quan trọng nhất trong danh sách vì nó là lỗi ảnh hưởng người dùng thật.
6. **Đăng nhập bằng tài khoản trưởng thôn và xem danh sách thông báo**, kiểm xem có thông báo nào nói về kho của thôn khác không. Xác nhận N3.
7. **Tắt ai-service rồi gọi `GET /api/health`.** Nếu vẫn trả `status: "ok"` thì xác nhận N5.

---

## 10. Rà soát lượt hai — phát hiện bổ sung

Lượt hai đi vào các vùng lượt một mới lướt qua: luồng xác thực, xử lý lỗi phía người dùng, hành vi ngoại tuyến, app máy tính, tầng AI, vòng đời dữ liệu và mô hình thông báo.

### 10.1. Đính chính lượt một

| Chỗ | Lượt một viết | Thực tế |
|---|---|---|
| B2 | "Không có giới hạn tần suất" | Sai. `AuthRateLimitService` bảo vệ `/auth/login` theo cặp (email, IP): 5 lần sai / 15 phút thì chặn 15 phút, có test riêng. Phần còn lại của kết luận vẫn đúng — 110 endpoint khác không có giới hạn. Đã sửa tại §6/B2. |

Ngoài ra, lượt hai kiểm chứng lại hai điều và **xác nhận hệ thống làm đúng**, nên không có việc phải làm:

- **Đường hoàn kho khi giao thất bại đã có và làm chuẩn.** `completeByRescue` với kết quả `FAILED` tự nhập lại 100% phần đã xuất về đúng lô cũ, gói trong cùng một transaction với việc đổi trạng thái nên bấm hai lần không hoàn kho trùng. Trường hợp `PARTIAL` **cố ý không tự đoán số** mà gắn cảnh báo để người đối soát. Đây là xử lý đúng cho tình huống "đã xuất hàng nhưng đường bị cắt phải quay về".
- **Bộ 29 quyền là có thật và gần như không có quyền thừa.** Đếm lại đúng 29, và chỉ **một** quyền chưa được dùng để bảo vệ endpoint nào (`MISSION_REQUEST`).

### 10.2. N1 — Một nhánh workflow đã chết nhưng code vẫn còn nguyên (mức: cao, nhưng là dọn dẹp chứ không phải lỗi đang chạy)

Đây là phát hiện lớn nhất của lượt hai.

`mission.workflow.ts` định nghĩa luồng hiện hành: `DRAFT → PENDING_WAREHOUSE → READY → COMPLETED`, cộng `CANCELLED`. Chú thích đầu tệp nói rõ: *"ADMIN phát hành phương án trực tiếp tới các kho; lực lượng hiện trường không tham gia bước phát hành."*

Nhưng `mission.service.ts` **vẫn còn nguyên năm phương thức của luồng cũ**: `dispatch`, `confirmByRescue`, `rejectByRescue`, `deferByAdmin`, `resendByAdmin`. Cả năm đều gọi `guardTransition` tới các trạng thái **không có trong bảng chuyển tiếp**:

| Phương thức | Chuyển tiếp yêu cầu | Bảng cho phép | Kết quả |
|---|---|---|---|
| `dispatch` | `DRAFT → PENDING_RESCUE` | `DRAFT → [PENDING_WAREHOUSE, CANCELLED]` | luôn ném lỗi |
| `rejectByRescue` | `PENDING_RESCUE → REJECTED` | `PENDING_RESCUE → [CANCELLED]` | luôn ném lỗi |
| `deferByAdmin` | `REJECTED → DEFERRED` | `REJECTED → [CANCELLED]` | luôn ném lỗi |
| `resendByAdmin` | `DEFERRED → PENDING_RESCUE` | `DEFERRED → [CANCELLED]` | luôn ném lỗi |

**Không có endpoint nào trong `mission.controller.ts` gọi tới chúng, và web lẫn điện thoại cũng không gọi.** Nơi duy nhất còn tham chiếu là các tệp test — và các test đó **kiểm tra rằng chúng ném lỗi**, nên chúng luôn xanh và không ai phát hiện ra rằng năm phương thức này không thể chạy thành công trong bất kỳ hoàn cảnh nào.

Đây không phải lỗi đang gây hại cho người dùng (không có đường nào gọi tới), nhưng nó là **khối lượng chết đáng kể** nằm đúng trong hai tệp đã bị đánh dấu là quá lớn ở §5/K1:

- Backend: 5 phương thức service kèm dây thông báo, 4 giá trị enum (`PENDING_RESCUE`, `RESCUE_CONFIRMED`, `REJECTED`, `DEFERRED`) và 2 giá trị enum chưa từng được gán (`APPROVED`, `IN_PROGRESS`), 1 quyền chết (`MISSION_REQUEST`).
- Frontend: nhãn trạng thái trong `mission-inbox.tsx`, ba nhánh `if` trong `mission-view.tsx`, và bốn thành viên trong union kiểu của `workflow-progress.ts` — nơi đã có sẵn chú thích thừa nhận *"là trạng thái của luồng cũ"*.

**Vì sao đáng làm sớm:** gỡ nhánh này làm nhỏ `mission.service.ts` (1.854 dòng) và `mission-view.tsx` (1.344 dòng) — hai tệp đang chắn ngay trên đường làm lại UI. Dọn trước khi vẽ lại thì đỡ được công vẽ lại giao diện cho những trạng thái không bao giờ xuất hiện.

**Lưu ý khi làm:** phải kiểm dữ liệu hiện có trước khi bỏ giá trị enum — nếu CSDL đang có bản ghi mang các trạng thái đó thì cần một bước chuyển về `CANCELLED`. Việc này lại phụ thuộc T7 (lịch sử di trú), nên xếp sau T7.

### 10.3. N2 — Thông báo dùng chung một cờ "đã đọc" cho toàn bộ một vai (mức: cao — lỗi thật, ảnh hưởng người dùng)

`Notification` gửi theo `recipientRole`, không theo người, và mang **một cột `read` duy nhất**.

`markRead` thực hiện `updateMany({ where: { id, organizationId, recipientRole }, data: { read: true } })`.

Nghĩa là: xã có 17 trưởng thôn cùng vai `WAREHOUSE`. **Ai mở thông báo trước thì thông báo đó thành "đã đọc" với cả 16 người còn lại.** `markAllRead` còn xóa sạch huy hiệu chưa đọc của tất cả cùng lúc.

Trong vận hành thường ngày thì đây là phiền toái. Lúc có lũ, đây là **thông báo bị mất**: trưởng thôn A mở điện thoại xem, 16 người kia không bao giờ thấy dấu chưa đọc nữa.

**Sửa:** tách bảng `NotificationRead(notificationId, userId, readAt)` với khóa chính ghép. Thông báo giữ nguyên mô hình phát theo vai; trạng thái đọc thành theo người. Khoảng 1 ngày, gồm cả di trú dữ liệu cũ.

### 10.4. N3 — Thông báo không lọc theo phạm vi kho (mức: trung bình)

`notification.list` lọc bằng `{ organizationId, recipientRole }` — **không có `warehouseId`**, dù bảng `Notification` có sẵn cột đó.

Nên một trưởng thôn nhìn thấy thông báo về hoạt động kho của các thôn khác, trong khi cùng hệ thống đó lại chặn rất chặt ở đường tồn kho (`assertActorCanAccessWarehouse`). Tài liệu dự thi nêu nguyên tắc *"Trưởng thôn Long Châu... không xem được tồn kho thôn bên cạnh — đó là chủ ý, không phải thiếu sót"* — nhưng nội dung thông báo đang rò đúng loại thông tin ấy ra ngoài phạm vi.

**Sửa:** thêm điều kiện `OR: [{ warehouseId: null }, { warehouseId: scopeWarehouseId }]` cho người có phạm vi kho. Vài giờ.

### 10.5. N4 — Không có chính sách lưu giữ dữ liệu (mức: cao đối với vận hành dài hạn)

Toàn hệ thống có **đúng một tác vụ định kỳ**: sao lưu 17:00 hằng ngày qua BullMQ. Không có `@nestjs/schedule`, không có job dọn dẹp, không có lưu trữ lịch sử, không có ngưỡng cảnh báo dung lượng.

Các bảng tăng vĩnh viễn, không bao giờ được dọn:

| Bảng | Tốc độ tăng |
|---|---|
| `SensorEvent` | Nhanh nhất — một dòng cho mỗi thông số cảm biến đổi, app máy tính gửi liên tục |
| `Notification` | Một dòng cho mỗi sự kiện, nhân với số vai nhận |
| `InventoryTransaction` | Một dòng cho mỗi thao tác kho |
| `AuditLog` | Một dòng cho mỗi thao tác nhạy cảm — **đúng ra là không được xóa**, nhưng cần kế hoạch lưu trữ |
| `MissionAnalysisSnapshot`, `MissionFieldUpdate` | Theo số lần phân tích và cập nhật hiện trường |

Sản phẩm được thiết kế để chạy **không người trực trên một máy tính đặt ở xã, trong nhiều năm**. Với thiết kế hiện tại, đĩa đầy dần, PostgreSQL chậm dần, và không có ai hay cái gì đang theo dõi việc đó. Đây là chỗ khác biệt giữa "chạy được khi demo" và "chạy được sau 18 tháng".

**Sửa:**
1. Thêm `@nestjs/schedule`, một job dọn hằng đêm.
2. Đặt thời hạn theo bảng: `SensorEvent` gộp thành số liệu theo giờ sau 30 ngày; `Notification` xóa sau 90 ngày; `AuditLog` **không xóa** mà chuyển sang bảng lưu trữ sau 12 tháng.
3. Thêm cảnh báo dung lượng đĩa vào phần kiểm tra sức khỏe (xem N5).

### 10.6. N5 — Kiểm tra sức khỏe không nhìn tới AI, Ollama hay OSRM (mức: trung bình – cao)

`/api/health` kiểm PostgreSQL và Redis, viết chuẩn (có timeout, bắt lỗi, không ném). Nhưng **không kiểm ai-service, không kiểm Ollama, không kiểm PhoWhisper, không kiểm OSRM.**

Nghĩa là hệ thống báo `status: "ok"` trong khi:

- dịch vụ AI đã chết → không phân tích được tình huống, không có trợ lý;
- Ollama chưa nạp model → mọi câu hỏi hết giờ chờ;
- OSRM chưa chạy → không có tuyến đường.

Cả ba đều là chức năng trọng tâm của sản phẩm, và cả ba đều là thứ **dễ hỏng nhất** sau khi khởi động lại máy. Với một hệ thống bán tự trị đặt ở xã, một đèn báo "ok" sai là tệ hơn không có đèn báo.

**Sửa:** mở rộng health thành ba mức — `ok` / `degraded` (dịch vụ phụ chết, lõi vẫn chạy) / `down`, liệt kê từng thành phần. Rồi làm **trang trạng thái hệ thống** cho quản trị xã (ghép chung với T5 giao diện sao lưu — cùng một màn hình "sức khỏe hệ thống"). Đây cũng là thứ nên có mặt trong video demo: chứng minh được hệ thống tự biết mình đang thiếu gì.

### 10.7. N6 — Bộ đếm chặn đăng nhập nằm trong bộ nhớ và không bao giờ được dọn (mức: trung bình)

`AuthRateLimitService` giữ trạng thái trong một `Map` của tiến trình. Ba hệ quả:

1. **Mất sạch khi khởi động lại backend** — kẻ dò mật khẩu chỉ cần chờ một lần restart.
2. **Không có dọn rác.** Một khóa chỉ bị xóa khi **chính khóa đó** được truy vấn lại và đã hết hạn. Khóa của những cặp (email, IP) không bao giờ quay lại thì nằm trong `Map` mãi mãi. Gửi đăng nhập với email ngẫu nhiên là làm `Map` phình vô hạn — vừa là rò rỉ bộ nhớ, vừa là một đường tấn công làm cạn RAM.
3. **Khóa theo cặp (email, IP) không chặn được dò rải:** một IP thử 1000 email khác nhau, mỗi email một lần, thì không có cặp nào chạm ngưỡng 5.

**Sửa:** chuyển trạng thái sang Redis (đã có sẵn trong hệ thống) với TTL tự hết hạn, và thêm một ngưỡng thứ hai tính **theo IP** bất kể email.

### 10.8. N7 — Không có trang lỗi, trang không tìm thấy hay trang tải cho App Router (mức: trung bình)

Thư mục `apps/frontend/src/app` **không có `error.tsx`, `global-error.tsx`, `not-found.tsx` hay `loading.tsx`** ở bất kỳ cấp nào.

Nghĩa là một lỗi kết xuất chưa bắt được sẽ cho ra màn hình lỗi mặc định của Next.js — ở bản chạy thật là một trang gần như trắng, không có nút thử lại, không có đường quay về. Với công cụ trực ban lúc khẩn cấp, màn trắng không lối thoát là kịch bản tệ nhất.

Liên quan: có **90 lệnh `useQuery`** nhưng chỉ khoảng **40 chỗ xử lý `isError`**. Nhiều truy vấn hỏng sẽ hiện ra dưới dạng bảng trống hoặc số 0 — tức là **hiển thị sai chứ không báo lỗi**. Trong hệ thống mà nguyên tắc số một là "không bịa số", một bảng tồn kho trống vì lỗi mạng nhưng trông y hệt "kho hết hàng" là đúng loại lỗi nguy hiểm nhất.

**Sửa:** thêm `error.tsx` + `not-found.tsx`, và quy ước bắt buộc trong lớp component nguyên thủy: mọi bảng và thẻ số liệu phải nhận ba trạng thái `loading / error / empty` và **phân biệt rõ "không có dữ liệu" với "không lấy được dữ liệu"**. Đưa vào ngay giai đoạn 0 ở §7.

### 10.9. N8 — Bão tải lại khi chuyển cửa sổ (mức: trung bình, ảnh hưởng trực tiếp buổi demo)

`QueryClient` được khai với `{ retry: 1, staleTime: 10_000 }`. `refetchOnWindowFocus` **không được đặt**, nên nhận mặc định là `true`.

Cộng với 18 bộ polling ở §4/P4: mỗi lần người trình bày chuyển qua lại giữa ba cửa sổ trình duyệt trong kịch bản demo, **toàn bộ truy vấn đang gắn trên trang đó tải lại cùng lúc** — vì `staleTime` chỉ 10 giây nên gần như luôn đã quá hạn. Đây đúng là thao tác diễn ra liên tục trong buổi demo, và đúng lúc máy đang bận chạy Ollama.

**Sửa:** đặt `refetchOnWindowFocus: false` ở cấu hình chung và nâng `staleTime` cho các truy vấn ít đổi. Sửa một dòng, có hiệu quả ngay trong buổi demo.

### 10.10. N9 — Ô nhập liệu không nằm trong thẻ `form` (mức: trung bình, thuộc phần UI sắp làm)

Toàn bộ web có **55 ô nhập** (`36 input`, `12 select`, `7 textarea`) nhưng chỉ **6 thẻ `<form>`**.

Hệ quả: ở phần lớn hộp thoại và bộ lọc, **nhấn Enter không gửi được** — người dùng phải rời bàn phím đi tìm chuột. Với người trực nhập liệu nhanh lúc đang vội, đây là ma sát lặp lại hàng trăm lần mỗi ca.

Kèm theo: chỉ **một tệp duy nhất** trong toàn bộ 117 tệp dùng `aria-invalid`, nên lỗi kiểm tra dữ liệu không được gắn với ô nhập tương ứng — vừa là vấn đề trợ năng, vừa là dấu hiệu cho thấy cách hiển thị lỗi nhập liệu chưa nhất quán giữa các màn hình.

Và có **một chỗ dùng `window.confirm()`** ([`map-view.tsx:253`](../apps/frontend/src/components/dashboard/map-view.tsx#L253)) — hộp thoại mặc định của trình duyệt nằm giữa một ứng dụng tự tạo kiểu hoàn toàn, trông như lỗi.

**Sửa:** gói cả ba vào giai đoạn 0 — component `Form` xử lý Enter và trạng thái gửi, component `Field` gắn nhãn + lỗi + `aria-invalid`, component `ConfirmDialog` thay `window.confirm`.

### 10.11. N10 — Không có ghi log có cấu trúc, không có số đo (mức: trung bình đối với vận hành dài hạn)

19 chỗ dùng `Logger` của NestJS (tốt — chỉ còn 1 chỗ dùng `console` trong toàn bộ backend). Nhưng:

- Log là văn bản thuần, không phải JSON → không lọc, không thống kê được.
- Không có `correlationId` ở tầng HTTP nên không lần được một yêu cầu qua các tầng (đã nêu ở K8).
- **Không có ghi ra tệp và không có xoay vòng tệp log.** Trên máy Windows ở xã chạy nền, log đi vào `stdout` rồi mất.
- Không có số đo nào: không biết endpoint nào chậm, hàng đợi AI dài bao nhiêu, sao lưu lần cuối lúc nào.

Không cần dựng Prometheus cho quy mô một xã. Nhưng **ghi log ra tệp có xoay vòng** và **vài số đo cơ bản hiện trên trang trạng thái hệ thống** (N5) là mức tối thiểu để người tiếp nhận chẩn đoán được khi có sự cố mà không cần gọi cho nhóm phát triển.

### 10.12. Ghi nhận thêm — những chỗ lượt hai kiểm tra và thấy làm tốt

Nêu ra để khỏi đụng vào khi làm lại:

- **App máy tính cấu hình bảo mật Electron đúng chuẩn:** `sandbox: true`, `contextIsolation: true`, có preload, không bật `nodeIntegration`. Đây là chỗ rất hay bị làm sai.
- **Bộ nhớ đệm ngoại tuyến trên điện thoại được mã hóa và thất bại theo hướng an toàn:** dùng module mã hóa native, và khi không mã hóa được thì **xóa cache** thay vì ghi bản rõ.
- **Lớp neo số liệu của AI là công trình thật.** `parse_grounding.py` không tin con số do mô hình khai mà tự đọc lại mô tả gốc để lấy số, có kèm nhận diện mưu toan tiêm lệnh, và chú thích ghi rõ vì sao cách "dặn mô hình kỹ hơn" đã thất bại. Đây là điểm mạnh kỹ thuật nổi bật nhất của sản phẩm.
- **Không có endpoint seed hay reset nào bị lộ ra HTTP**, và đường ghi dữ liệu mô phỏng bị chặn sau cờ môi trường `SIMULATION_MUTATION_ENABLED`.
- **`ADMIN` nhận quyền bằng `Object.values(Permission)`** — tiện, nhưng nghĩa là mọi quyền mới thêm sau này **tự động được cấp cho quản trị xã** mà không ai phải quyết định. Nên đổi thành danh sách liệt kê tường minh khi có dịp; ưu tiên thấp.

### 10.13. Bổ sung danh mục chức năng thêm/bớt

**Thêm:**

| # | Chức năng | Vì sao | Ước lượng |
|---|---|---|---|
| T9 | **Trạng thái đọc theo từng người** cho thông báo | Sửa N2 — hiện 17 trưởng thôn dùng chung một cờ | 1 ngày |
| T10 | **Trang trạng thái hệ thống** cho quản trị xã: sức khỏe từng thành phần (CSDL, Redis, AI, Ollama, OSRM), lần sao lưu gần nhất, dung lượng đĩa | Sửa N5 + T5 gộp làm một màn hình. Là thứ nên quay vào video demo — chứng minh hệ thống tự biết mình thiếu gì | 2 ngày (gộp với T5) |
| T11 | **Job dọn dữ liệu theo thời hạn** | Sửa N4 — điều kiện để chạy được nhiều năm không người trực | 2 ngày |
| T12 | **Kiểm kê ngoại tuyến trên điện thoại** (hàng chờ bền vững, chỉ cho nghiệp vụ đếm kiểm kê) | App máy tính đã có hàng chờ bền vững, điện thoại thì không. Kho thôn hay nằm chỗ sóng yếu, mà **đếm kiểm kê không đụng tới tồn cho tới lúc gửi** — nên đây là nghiệp vụ duy nhất mở ngoại tuyến được mà không phá nguyên tắc "mất mạng thì từ chối ghi". Giá trị cao, rủi ro thấp | 3 ngày |

**Bớt:**

| # | Bỏ | Vì sao |
|---|---|---|
| G6 | Nhánh workflow cũ: 5 phương thức service, 6 giá trị enum, quyền `MISSION_REQUEST`, và phần giao diện tương ứng ở 3 tệp frontend | N1 — không có đường nào gọi tới, và nếu gọi thì luôn ném lỗi. Làm nhỏ đúng hai tệp đang chắn đường làm lại UI |

### 10.14. Cập nhật danh sách ưu tiên

Chèn vào các nhóm ở §8:

**Thêm vào P0:**

| | Việc | Mục | Công |
|---|---|---|---|
| 28 | `refetchOnWindowFocus: false` + nâng `staleTime` | N8 | 15 phút |
| 29 | Lọc thông báo theo phạm vi kho | N3 | 2 giờ |
| 30 | Chuyển bộ đếm chặn đăng nhập sang Redis, thêm ngưỡng theo IP | N6 | 0,5 ngày |

**Thêm vào P1 (giai đoạn 0, làm cùng lớp component):**

| | Việc | Mục | Công |
|---|---|---|---|
| 31 | `error.tsx` + `not-found.tsx`; quy ước ba trạng thái `loading/error/empty` cho mọi bảng và thẻ số liệu | N7 | 1 ngày |
| 32 | Component `Form` / `Field` / `ConfirmDialog`; bỏ `window.confirm` | N9 | Gộp vào việc số 6 |

**Thêm vào P2:**

| | Việc | Mục | Công |
|---|---|---|---|
| 33 | Trạng thái đọc theo người cho thông báo | T9, N2 | 1 ngày |
| 34 | Kiểm tra sức khỏe mở rộng + trang trạng thái hệ thống | T10, N5 | 2 ngày |
| 35 | Job dọn dữ liệu theo thời hạn | T11, N4 | 2 ngày |
| 36 | Ghi log ra tệp có xoay vòng | N10 | 0,5 ngày |
| 37 | Kiểm kê ngoại tuyến trên điện thoại | T12 | 3 ngày |

**Thêm vào P3 (xếp SAU việc số 5 — lịch sử di trú):**

| | Việc | Mục | Công |
|---|---|---|---|
| 38 | Gỡ nhánh workflow cũ ở backend và frontend | G6, N1 | 1–2 ngày |

---

## 11. Những việc KHÔNG nên làm

Nêu rõ để khỏi mất công:

- **Đừng đập đi làm lại backend.** Phần lõi nghiệp vụ đúng, có test khóa các tình huống hỏng thật, chỉ mục trên bảng nóng đã chuẩn. Vấn đề là bổ sung, không phải thay thế.
- **Đừng thêm màn hình mới trước khi có lớp component.** Mỗi màn mới bây giờ là thêm khoảng 80 `className` viết tay vào món nợ 1.237.
- **Đừng bỏ polling hoàn toàn.** Giữ làm phương án dự phòng khi WebSocket rớt — `notification-bell.tsx` đã ghi đúng lý do này trong chú thích.
- **Đừng chuyển sang kiến trúc microservice.** "Mỗi xã một hệ thống độc lập" là quyết định kiến trúc đúng cho bài toán này. Tách nhỏ hơn nữa chỉ thêm điểm hỏng trên một máy chủ đặt ở xã.
- **Đừng đuổi theo độ phủ test 100%.** 128 tệp test đang khóa đúng những chỗ đáng khóa (tranh chấp đồng thời, tồn âm, thứ tự khóa, cách ly tổ chức). Chỗ thiếu là **test component giao diện**, và nó sẽ đến cùng với `vitest`.

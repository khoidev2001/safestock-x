# Toàn bộ chức năng và luồng nghiệp vụ — Ứng phó nhanh

_Tài liệu tham chiếu đầy đủ · cập nhật 07/08/2026_

Tài liệu này liệt kê **toàn bộ** chức năng, luồng nghiệp vụ, thao tác và trạng thái
có trong dự án, trên cả bốn bề mặt: web vận hành, ứng dụng điện thoại, ứng dụng
desktop và dịch vụ AI.

Mọi nội dung dưới đây được đọc trực tiếp từ mã nguồn — controller, state machine,
bảng phân quyền, schema cơ sở dữ liệu — chứ không chép lại từ tài liệu cũ. Chỗ nào
tài liệu cũ mâu thuẫn với mã nguồn thì **mã nguồn là chuẩn**, và những mâu thuẫn đã
phát hiện được ghi rõ ở [§18](#18-những-điểm-tài-liệu-cũ-ghi-sai).

**Tài liệu liên quan:**
[Hướng dẫn dùng thử và cài đặt](../HUONG-DAN-DUNG-THU-VA-CAI-DAT.md) ·
[PRD](PRD.md) ·
[Bộ dữ liệu mẫu](SEED-DATASET.md) ·
[Kịch bản test theo luồng](../Cachtest/)

---

## Mục lục

| § | Nội dung |
|---|---|
| [1](#1-cách-đọc-tài-liệu-này) | Cách đọc tài liệu này |
| [2](#2-vai-trò-và-ma-trận-phân-quyền) | Vai trò và ma trận phân quyền |
| [3](#3-xác-thực-phiên-làm-việc-và-hồ-sơ-cá-nhân) | Xác thực, phiên làm việc và hồ sơ cá nhân |
| [4](#4-mức-sẵn-sàng-vận-hành) | Mức sẵn sàng vận hành |
| [5](#5-điều-phối-cứu-hộ--luồng-đầy-đủ) | **Điều phối cứu hộ — luồng đầy đủ** |
| [6](#6-nghiệp-vụ-kho-ngày-thường) | **Nghiệp vụ kho ngày thường** |
| [7](#7-mượn-và-trả-vật-tư) | Mượn và trả vật tư (trong xã và liên xã) |
| [8](#8-báo-cáo-kiểm-kê-tháng) | Báo cáo kiểm kê tháng |
| [9](#9-cảm-biến-sự-cố-và-cảnh-báo) | **Cảm biến, sự cố và cảnh báo** |
| [10](#10-theo-dõi-và-dự-báo) | Theo dõi và dự báo |
| [11](#11-trí-tuệ-nhân-tạo) | Trí tuệ nhân tạo |
| [12](#12-bản-đồ-tọa-độ-và-định-tuyến) | Bản đồ, tọa độ và định tuyến |
| [13](#13-quản-trị-hệ-thống) | Quản trị hệ thống |
| [14](#14-thông-báo-thời-gian-thực) | Thông báo thời gian thực |
| [15](#15-ứng-dụng-điện-thoại) | Ứng dụng điện thoại |
| [16](#16-ứng-dụng-desktop--thiết-bị-iot-tại-kho) | Ứng dụng desktop — thiết bị IoT tại kho |
| [17](#17-bảng-tra-cứu) | Bảng tra cứu: toàn bộ API và toàn bộ trạng thái |
| [18](#18-những-điểm-tài-liệu-cũ-ghi-sai) | Những điểm tài liệu cũ ghi sai |

---

## 1. Cách đọc tài liệu này

Mỗi chức năng được trình bày theo cùng một khuôn:

> **Ai làm · Ở đâu · Các bước · Quy tắc hệ thống ép buộc · API tương ứng**

Ba ký hiệu dùng xuyên suốt:

| Ký hiệu | Nghĩa |
|---|---|
| 🖥️ | Làm trên web vận hành |
| 📱 | Làm trên ứng dụng điện thoại |
| 🖲️ | Làm trên ứng dụng desktop |

Mọi đường dẫn API viết tắt bỏ tiền tố `/api`. Ví dụ `POST missions/report` nghĩa là
`POST /api/missions/report`.

---

## 2. Vai trò và ma trận phân quyền

Hệ thống có **đúng ba vai**. Người giữ kho thôn kiêm luôn việc báo tình huống của
thôn mình — vai "trưởng thôn" riêng đã bị bỏ vì tách hai tài khoản chỉ thêm việc
đăng nhập chứ không thêm quyền kiểm soát nào.

| Vai | Mã | Ai dùng |
|---|---|---|
| Quản trị xã | `ADMIN` | Cán bộ xã điều hành toàn bộ |
| Phụ trách kho | `WAREHOUSE` | Người giữ kho trung tâm và 17 kho thôn |
| Lực lượng hiện trường | `RESCUE` | Đội đi giao hàng, ứng cứu tại chỗ |

### 2.1. Ma trận quyền đầy đủ

Bảng phân quyền là **hằng số trong mã nguồn** ([`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts)),
dùng chung cho cả backend lẫn web — một nguồn sự thật duy nhất, không có bảng quyền
động trong cơ sở dữ liệu.

| Quyền | Mã | ADMIN | WAREHOUSE | RESCUE |
|---|---|:---:|:---:|:---:|
| Xem tồn kho | `inventory:read` | ✅ | ✅ | — |
| Nhập kho | `inventory:import` | ✅ | ✅ | — |
| Xuất kho | `inventory:export` | ✅ | ✅ | — |
| Xuất nhiều lô | `inventory:bulk_export` | ✅ | ✅ | — |
| Điều chỉnh tồn | `inventory:adjust` | ✅ | ✅ | — |
| Kiểm kê, đối chiếu | `inventory:reconcile` | ✅ | ✅ | — |
| Xem nhiệm vụ | `mission:view` | ✅ | ✅ | ✅ |
| Lập phương án | `mission:create` | ✅ | — | — |
| Yêu cầu vật tư | `mission:request` | ✅ | — | — |
| Phát hành, duyệt | `mission:approve` | ✅ | — | — |
| Chạy phân tích AI | `mission:analyze` | ✅ | — | — |
| Chạy mô phỏng What-if | `mission:simulate` | ✅ | — | — |
| Đóng nhiệm vụ, báo kết quả giao | `mission:confirm` | ✅ | — | ✅ |
| Gửi ghi nhận hiện trường | `mission:field_update` | ✅ | — | ✅ |
| Chuẩn bị và xuất theo phương án | `mission:fulfill` | ✅ | ✅ | — |
| Xem thông báo | `notification:view` | ✅ | ✅ | ✅ |
| Báo tình huống khẩn cấp | `incident:report_submit` | ✅ | ✅ | ✅ |
| Xem lại báo cáo của chính mình | `incident:report_view_own` | ✅ | ✅ | ✅ |
| Xem mức sẵn sàng | `readiness:view` | ✅ | ✅ | — |
| Xem dữ liệu cảm biến | `simulation:view` | ✅ | ✅ | — |
| Gửi số liệu cảm biến mô phỏng | `simulation:mutate` | ✅ | — | — |
| Tắt chuông báo động | `incident:alarm_ack` | ✅ | ✅ | — |
| Quản lý mượn–trả | `loan:manage` | ✅ | ✅ | — |
| Quản lý kho | `warehouse:manage` | ✅ | ✅ | — |
| Xem nhật ký hoạt động | `audit:view` | ✅ | — | — |
| Quản lý tài khoản | `admin:users` | ✅ | — | — |
| Gửi báo cáo tháng | `report:submit` | ✅ | ✅ | — |
| Xem báo cáo tháng | `report:view` | ✅ | ✅ | — |
| Duyệt báo cáo tháng | `report:approve` | ✅ | — | — |

### 2.2. Hai quyết định phân quyền đáng chú ý

**Tắt chuông (`incident:alarm_ack`) tách riêng khỏi gửi số liệu mô phỏng
(`simulation:mutate`).** Chuông có thể do cảm biến **thật** kích hoạt, nên người
trực kho phải tắt được dù họ không có quyền bơm số liệu mô phỏng. Gộp hai quyền này
làm một sẽ dẫn tới cảnh chuông kêu mà người đứng ngay cạnh không tắt được.

**Lực lượng hiện trường có quyền báo tình huống.** Người đứng tại chỗ xảy ra sự việc
phải báo được ngay, không phải gọi điện nhờ người khác nhập hộ.

### 2.3. Phạm vi kho (scope)

Ngoài vai, mỗi tài khoản còn có **phạm vi kho**:

| `warehouseId` của tài khoản | Nghĩa |
|---|---|
| `null` | Phụ trách toàn xã — thấy mọi kho |
| Có giá trị | Chỉ quản đúng kho đó |

Phạm vi được kiểm ở **tầng máy chủ**, không phải chỉ ẩn nút trên giao diện. Người
giữ kho thôn Phú Sơn gọi thẳng API để đọc tồn kho thôn Long Châu vẫn bị chặn.

---

## 3. Xác thực, phiên làm việc và hồ sơ cá nhân

### 3.1. Đăng nhập

| Mục | Chi tiết |
|---|---|
| Ai | Mọi vai · 🖥️ 📱 🖲️ |
| API | `POST auth/login` |
| Đầu vào | `email` (với quản trị là chuỗi `admin`, không phải email), `password` |
| Trả về | Access token (dùng trong header) và refresh token |

**Quy tắc hệ thống ép buộc:**

- Refresh token được đặt trong cookie **HttpOnly** — JavaScript của trình duyệt không
  đọc được. Trên HTTPS thì bật thêm cờ `Secure` qua biến `AUTH_COOKIE_SECURE`.
- Mật khẩu băm bằng `bcrypt`. Độ dài tối thiểu 8 ký tự.
- Mỗi lần đăng nhập, làm mới hoặc đăng xuất đều **tăng `tokenVersion`** của tài khoản
  → toàn bộ token cũ của tài khoản đó bị thu hồi ngay.

> **Hệ quả cần biết:** `tokenVersion` là **một số duy nhất cho mỗi tài khoản**, không
> phải cho mỗi thiết bị. Hai máy dùng chung một tài khoản sẽ đá nhau — máy đăng nhập
> sau làm máy trước rớt phiên. Đây là lý do ứng dụng desktop phải có tài khoản riêng
> `iot` thay vì dùng chung `admin`.

### 3.2. Duy trì và kết thúc phiên

| Thao tác | API | Ghi chú |
|---|---|---|
| Làm mới phiên | `POST auth/refresh` | Đọc refresh token từ cookie HttpOnly |
| Đăng xuất | `POST auth/logout` | Tăng `tokenVersion`, xóa cookie |
| Xem hồ sơ đang đăng nhập | `GET auth/me` | Trả vai, phạm vi kho, quyền |

### 3.3. Hồ sơ cá nhân 🖥️

| Mục | Chi tiết |
|---|---|
| API | `PATCH auth/me` |
| Sửa được | Họ tên, số điện thoại, email nhận thông báo, ảnh đại diện, mật khẩu |

Trường **email nhận thông báo** tách riêng khỏi tên đăng nhập: tên đăng nhập của kho
thôn là `phuson` — một định danh nội bộ, không phải hộp thư có thật.
Muốn nhận cảnh báo qua email thì khai địa chỉ thật ở trường riêng này.

---

## 4. Mức sẵn sàng vận hành

**Ai:** ADMIN, WAREHOUSE · **Ở đâu:** 🖥️ *Tổng quan* (`/readiness`), 📱 tab *Sẵn sàng*

Đây là màn hình trả lời một câu hỏi: **kho này có đáp ứng được không, và nếu không
thì vướng ở đâu.**

### 4.1. Sáu mặt đánh giá và trọng số

| Mặt đánh giá | Trọng số | Đo cái gì |
|---|---:|---|
| Đủ số lượng | 0.28 | Tồn thực tế so với định mức cần có |
| Tình trạng vật tư | 0.22 | Tỷ lệ lô hỏng, cần kiểm tra, đã qua sử dụng |
| Hạn dùng | 0.15 | Lô hết hạn và sắp hết hạn |
| Khả năng tiếp cận | 0.15 | Kho có vào lấy hàng được không |
| Môi trường bảo quản | 0.10 | Nhiệt độ, độ ẩm, khói theo số đọc cảm biến |
| Độ tin cậy dữ liệu | 0.10 | Dữ liệu có mới không, cảm biến có im lặng không |

Tổng trọng số = 1.0. Mỗi mặt có công thức riêng, đặt trong
[`apps/backend/src/readiness/formulas/`](../apps/backend/src/readiness/formulas/) và
**khóa bằng unit test** — công thức đổi thì test đỏ.

### 4.2. Blocker — điểm cao vẫn có thể bị chặn điều phối

Đây là quy tắc quan trọng nhất của màn hình này. Ba blocker có **quyền ưu tiên tuyệt
đối**, không bị điểm số cao ghi đè:

| Mã blocker | Kích hoạt khi |
|---|---|
| `CRITICAL_FIRE_RISK` | Đang có sự cố nguy cơ cháy mức nghiêm trọng |
| `ACCESS_UNAVAILABLE` | Không tiếp cận được kho |
| `UNSAFE_ENVIRONMENT` | Môi trường bảo quản vượt ngưỡng an toàn |

Có blocker thì hệ thống **chặn điều phối** kể cả khi điểm tổng đạt 95/100. Lý do:
một kho đầy hàng nhưng đang cháy thì con số 95 không có nghĩa gì cả.

Trên web, blocker hiện thành dải cảnh báo riêng ở đầu trang
([`dispatch-blockers-banner.tsx`](../apps/frontend/src/components/dashboard/dispatch-blockers-banner.tsx)),
không lẫn vào danh sách gợi ý thường.

### 4.3. Các thao tác

| Thao tác | API | Ai |
|---|---|---|
| Xem mức sẵn sàng của kho | `GET readiness/warehouses/:id` | ADMIN, WAREHOUSE |
| Xem theo khu | `GET readiness/zones/:id` | ADMIN, WAREHOUSE |
| Xem theo kệ | `GET readiness/shelves/:id` | ADMIN, WAREHOUSE |
| Xem gợi ý việc cần làm | `GET readiness/warehouses/:id/recommendations` | ADMIN, WAREHOUSE |
| Tính lại ngay | `POST readiness/warehouses/:id/recalculate` | ADMIN, WAREHOUSE |

Mỗi mặt đánh giá đều kèm **lý do bằng lời** chứ không chỉ con số — người dùng phải
biết vì sao mặt đó bị trừ điểm để còn xử lý.

---

## 5. Điều phối cứu hộ — luồng đầy đủ

Đây là luồng dài nhất của hệ thống, đi qua cả ba vai. Vòng đời:

```
   ┌──── ADMIN lập ────┐   ┌── ADMIN phát hành ──┐   ┌─ kho chuẩn bị ─┐   ┌ hiện trường ┐
   │                   ▼   │                     ▼   │                ▼   │             ▼
 [ báo tình huống ] → DRAFT ──────────→ PENDING_WAREHOUSE ──────────→ READY ────→ COMPLETED
                       │                          │
                       └──────────→ CANCELLED ◄───┘   (ADMIN huỷ, kèm lý do)
```

Chuyển tiếp hợp lệ được khóa bằng hàm thuần trong
[`mission.workflow.ts`](../apps/backend/src/mission/mission.workflow.ts) và có unit
test riêng. Gọi sai trạng thái hoặc sai vai đều bị chặn ở máy chủ, trả **403** hoặc
lỗi *"Không thể chuyển X → Y"*.

> **Lưu ý quan trọng:** các trạng thái `PENDING_RESCUE`, `RESCUE_CONFIRMED`,
> `REJECTED`, `DEFERRED`, `APPROVED`, `IN_PROGRESS` **vẫn còn trong schema nhưng không
> còn được tạo mới**. Chúng là dấu vết của phiên bản trước, khi lực lượng hiện trường
> phải bấm chấp nhận/từ chối trước lúc kho chuẩn bị. Luồng hiện tại: xã phát hành
> phương án **thẳng tới kho**, hiện trường không tham gia bước phát hành nhưng vẫn là
> người **đóng** nhiệm vụ. ADMIN vẫn huỷ được các bản ghi lịch sử đang ở trạng thái cũ.

### 5.1. Bước ① — Báo tình huống

**Ai:** ADMIN, WAREHOUSE (kho thôn báo cho thôn mình), RESCUE
**Ở đâu:** 📱 tab *Báo cáo* — cho cả ba vai · 🖥️ *Điều phối cứu hộ* — **chỉ ADMIN**

> Trên web, tab *Điều phối cứu hộ* lọc theo quyền `mission:create` chứ không phải
> `mission:view`. Trang đó chỉ chứa form khai tình huống, mà form ấy chỉ dựng cho
> người lập được phương án. Vai kho có `mission:view` nên trước đây vẫn thấy tab,
> bấm vào lại ra một trang trắng chỉ có tiêu đề — tệ hơn hẳn việc không có tab.
> Quyền gọi API `incident:report_submit` thì **cả ba vai vẫn có**: kho thôn và lực
> lượng hiện trường báo tình huống từ điện thoại.

Ba cách nhập, cùng đi vào một chỗ:

| Cách | API | Mô tả |
|---|---|---|
| Gõ tay | `POST missions/report` | Mô tả bằng lời thường |
| Bóc tách trước khi gửi | `POST missions/parse` | Máy đọc mô tả, tách ra loại tình huống, số người, địa điểm |
| Nói bằng giọng nói | `POST missions/transcribe` | Gửi WAV → PhoWhisper → chữ, rồi điền vào ô mô tả |

Ví dụ mô tả: *"Ngập tại thôn Phú Sơn, khoảng 40 hộ bị cô lập, cần nước uống và áo phao."*

**Quy tắc hệ thống ép buộc:**

- **Nhận dạng giọng nói không tự gửi báo cáo.** Chữ nhận ra được điền vào ô mô tả để
  người dùng đọc lại, sửa hoặc gõ tay. Nhận dạng sai một con số mà gửi thẳng thì cả
  phương án vật tư sai theo.
- **Tên thôn được chuẩn hóa và đối chiếu danh mục.** Người báo gõ "Phú Sơn", "thôn Phú
  Sơn" hay tên kho đều khớp về đúng một thôn — mỗi thôn có danh sách bí danh riêng.
- Sáu loại tình huống: `FLOOD` lũ lụt · `STORM` bão · `LANDSLIDE` sạt lở · `FIRE`
  cháy · `ISOLATION` cô lập · `OTHER` khác.
- Người báo xem lại được báo cáo của **chính mình**: `GET missions/reports/own` và
  `GET missions/reports/own/:id`.

### 5.2. Bước ② — Lập phương án vật tư

**Ai:** ADMIN · 🖥️ *Điều phối cứu hộ*

| Thao tác | API |
|---|---|
| Lập phương án từ đầu | `POST missions/generate-plan` |
| Lập phương án từ một báo cáo đã gửi | `POST missions/:id/plan-from-report` |

**Hệ thống làm gì:**

1. Từ loại tình huống và số người ảnh hưởng, tra **định mức** ra nhu cầu từng mã vật tư.
2. Đối chiếu tồn kho thực tế, phân bổ theo thuật toán greedy ưu tiên kho **gần điểm
   sự cố nhất**, có tính khoảng cách và thời gian di chuyển.
3. Lọc lô đủ điều kiện cấp phát ([`batch-eligibility.ts`](../apps/backend/src/mission/batch-eligibility.ts)):
   lô hỏng, hết hạn hoặc đang cho mượn không được đưa vào phương án.
4. Ghi ra ba con số cho từng mã: **cần** (`required`) · **cấp được** (`allocated`) ·
   **thiếu** (`shortage`), kèm chi tiết phân bổ tới từng lô.

**Quy tắc hệ thống ép buộc:**

- **Số liệu do máy chủ tính, AI chỉ diễn giải bằng lời.** Không có chuyện mô hình ngôn
  ngữ tự nghĩ ra số lượng vật tư.
- Thiếu thì nói rõ thiếu bao nhiêu, **không làm tròn cho đẹp**.
- Một nhiệm vụ thường trải trên **nhiều kho** — kho trung tâm và một hoặc vài kho thôn.

### 5.3. Bước ③ — Phân tích, mô phỏng, diễn giải *(tùy chọn, chỉ ADMIN)*

Trước khi phát hành, ADMIN chạy được ba công cụ hỗ trợ quyết định:

| Công cụ | API | Làm gì |
|---|---|---|
| Phân tích điều phối | `POST missions/:id/analyses` | Chấm phương án theo nhiều mặt, sinh ảnh chụp `BASELINE` |
| Xem phân tích mới nhất | `GET missions/:id/analyses/latest` | |
| Danh sách ảnh chụp phân tích | `GET missions/:id/analysis-snapshots` | |
| Mô phỏng What-if | `POST missions/:id/simulations` | Đổi giả định (thêm người, mất một kho…) rồi so với `BASELINE` |
| Xem kết quả mô phỏng | `GET missions/:id/simulations/:simulationId` | |
| Kế hoạch hành động | `POST missions/:id/action-plan` | Sinh danh sách việc phải làm theo thứ tự |
| Diễn giải bằng lời | `POST missions/:id/explain` | AI viết lại phương án thành đoạn văn tiếng Việt |

Mỗi lần chạy đều lưu thành **ảnh chụp có mốc thời gian và người thực hiện** — sau này
đối chiếu được ai quyết định gì, dựa trên dữ liệu nào.

### 5.4. Bước ④ — Phát hành

**Ai:** ADMIN · 🖥️ · API `POST missions/:id/approve`

`DRAFT → PENDING_WAREHOUSE`. Hệ thống tách phương án thành **nhiều phiếu yêu cầu, mỗi
kho một phiếu**, và gửi thông báo thời gian thực tới đúng người phụ trách từng kho.

Huỷ: `POST missions/:id/cancel` kèm lý do, chỉ ADMIN, và **chỉ trước khi có kho nào
xuất vật tư**.

### 5.5. Bước ⑤ — Kho chuẩn bị theo từng mã vật tư

**Ai:** WAREHOUSE · 🖥️ *Nhiệm vụ* → phiếu của kho mình

Mỗi phiếu yêu cầu có vòng đời riêng, **chi tiết tới từng mã vật tư**:

```
PENDING ──accept──▶ ACCEPTED ──prepare──▶ PREPARED ──pickup──▶ PICKED_UP
   │                                          
   └──discrepancy──▶ (báo thiếu / báo thay thế, chờ ADMIN duyệt)
```

| Thao tác | API | Ai | Nghĩa |
|---|---|---|---|
| Xem phiếu của kho mình | `GET missions/warehouse-requests/own` | WAREHOUSE | |
| Tiếp nhận | `POST missions/warehouse-requests/:id/accept` | WAREHOUSE | Nhận việc |
| Báo chênh lệch | `POST missions/warehouse-requests/:id/discrepancy` | WAREHOUSE | Không đủ, hoặc đề xuất thay bằng mã khác |
| Báo đã soạn xong | `POST missions/warehouse-requests/:id/prepare` | WAREHOUSE | Hàng đã ra khỏi kệ |
| Ký nhận | `POST missions/warehouse-requests/:id/pickup` | WAREHOUSE | Người đi lấy đã mang đi |
| Duyệt chênh lệch | `POST missions/warehouse-requests/:id/review` | ADMIN | Chấp nhận hoặc bác đề xuất của kho |

**Vì sao `PICKED_UP` tách khỏi `PREPARED`:** "kho đã soạn" và "hàng đã rời kho" là hai
việc khác nhau, và **khoảng giữa hai việc đó chính là nơi hàng bị thiếu**. Gộp làm một
thì điều phối tưởng việc đã xong trong khi hàng còn nằm ở sân kho, và họ thôi không
gọi nhắc nữa.

Giao diện theo dõi tiến độ tách theo **từng kho** chứ không gộp một con số
([`warehouse-request-progress.ts`](../apps/frontend/src/components/mission/warehouse-request-progress.ts)),
với ba mốc: chưa xuất xong → đã xuất, chờ đội tới lấy → đội đã ký nhận đủ. Kho chưa
xong xếp lên trước, vì đó mới là việc phải làm.

Khi **mọi kho** đã xong: `POST missions/:id/prepare` chuyển `PENDING_WAREHOUSE → READY`.

> Đây là chỗ hay vấp nhất khi trình diễn: chỉ đăng nhập một tài khoản kho thì nhiệm vụ
> đứng mãi ở *Chờ kho chuẩn bị*.

### 5.6. Bước ⑥ — Ghi nhận tại hiện trường

**Ai:** RESCUE (và ADMIN) · 📱 · API `POST missions/:id/field-updates`

Đội đang ở hiện trường gửi cập nhật tình hình: nước rút chưa, đường vào thế nào, số
người thực tế khác ước tính không. Nhập bằng **gõ tay** (`TEXT`) hoặc **giọng nói**
(`VOICE_TRANSCRIPT`).

Xem dòng thời gian: `GET missions/:id/field-updates`.

Mỗi ghi nhận lưu kèm ý định đã bóc tách (`structuredIntent`) và **nguồn gốc của ý
định đó** (`intentProvenance`) — biết được con số này do người gõ hay do máy đoán ra
từ lời nói.

### 5.7. Bước ⑦ — Đóng nhiệm vụ

**Ai:** RESCUE · 📱 · API `POST missions/:id/complete`

`READY → COMPLETED`. Người đi giao báo **kết quả thực tế**, một trong ba:

| Kết quả | Mã | Hệ thống làm gì |
|---|---|---|
| Giao đủ theo phương án | `DELIVERED` | Đóng nhiệm vụ |
| Giao được một phần | `PARTIAL` | Đóng nhiệm vụ, ghi phần chưa giao |
| Không giao được | `FAILED` | **Tự hoàn vật tư về kho trong cùng một giao dịch** |

**Vì sao bắt buộc có bước đóng:** không có nó thì nhiệm vụ nằm mãi ở `READY` — vật tư
đã trừ khỏi kho mà không ai biết hàng tới nơi hay chưa, và hàng giao hỏng cũng không
có đường hoàn về.

### 5.8. Xem và tra cứu

| Thao tác | API |
|---|---|
| Danh sách nhiệm vụ | `GET missions` |
| Chi tiết một nhiệm vụ | `GET missions/:id` |
| Nhiệm vụ liên quan tới một kho | `GET missions/:warehouseId/warehouses` |

---

## 6. Nghiệp vụ kho ngày thường

**Ai:** ADMIN, WAREHOUSE · 🖥️ *Vật tư* (`/inventory`) · 📱 tab *Kho*

Đây là phần dùng hằng ngày, không phụ thuộc có thiên tai hay không.

### 6.1. Cấu trúc lưu trữ

```
Kho ──▶ Khu (Zone) ──▶ Kệ (Shelf) ──▶ Lô hàng (Batch) ──▶ thuộc một Mã vật tư (SKU)
```

Dữ liệu mẫu có 3 khu ở kho trung tâm: **A** nước sạch và lương thực · **B** cứu sinh
và che chắn · **C** y tế, điện và liên lạc.

| Thao tác | API |
|---|---|
| Xem cây kho (khu → kệ) | `GET inventory/warehouses/:id/tree` |
| Danh sách lô | `GET inventory/warehouses/:id/batches` |
| Danh sách lô có phân trang, lọc | `GET inventory/warehouses/:id/batches-page` |
| Danh mục mã vật tư | `GET inventory/catalog` |
| Tồn toàn xã (gộp 18 kho) | `GET inventory/warehouses/:id/commune-stock` |

### 6.2. Tình trạng và trạng thái lưu thông của lô

Hai trục **độc lập nhau**, đừng nhầm:

| Tình trạng (`ItemCondition`) | Nghĩa |
|---|---|
| `NEW` | Mới |
| `USED` | Cũ, đã dùng |
| `NEEDS_CHECK` | Cần kiểm tra |
| `DAMAGED` | Hư hỏng |

| Trạng thái lưu thông (`CirculationStatus`) | Nghĩa |
|---|---|
| `IN_STOCK` | Trong kho |
| `ON_LOAN` | Đang cho mượn — **vẫn thuộc kho, không tính là mất** |
| `RETURNED` | Vừa hoàn, chờ kiểm tra |

Ngoài ra `ItemStatus` mô tả tình trạng vận hành ở mức mã vật tư: `AVAILABLE`,
`IN_USE`, `MAINTENANCE`, `DAMAGED`, `EXPIRING_SOON`, `INSPECTION_OVERDUE`,
`MISPLACED`, `UNKNOWN`, `INACCESSIBLE`.

### 6.3. Các thao tác ghi

| Thao tác | API | Quyền | Ghi chú |
|---|---|---|---|
| Tạo lô mới | `POST inventory/batches` | `inventory:import` | |
| Nhập kho | `POST inventory/import` | `inventory:import` | Tăng tồn |
| Xuất kho | `POST inventory/export` | `inventory:export` | Giảm tồn |
| Chuyển kệ / chuyển kho | `POST inventory/transfer` | `inventory:export` | |
| Xuất nhiều lô một lượt | `POST inventory/bulk-export` | `inventory:bulk_export` | Cho tình huống cấp phát gấp |
| Điều chỉnh số lượng | `POST inventory/adjust` | `inventory:adjust` | Bắt buộc ghi lý do |
| Báo đổi tình trạng | `POST inventory/condition` | `inventory:adjust` | Ví dụ phát hiện lô bị ẩm |
| Kiểm kê, ghi đè chênh lệch | `POST inventory/reconcile` | `inventory:reconcile` | Có hậu kiểm trong nhật ký |
| Xem đích chuyển được | `GET inventory/warehouses/:id/transfer-destinations` | `inventory:export` | |

**Quy tắc hệ thống ép buộc:**

- **Chống ghi trùng (idempotency).** Mọi thao tác ghi đều mang khóa chống trùng
  ([`mutation-idempotency.ts`](../apps/backend/src/inventory/mutation-idempotency.ts)).
  Mạng chập chờn khiến điện thoại gửi lại hai lần thì kho **chỉ bị trừ một lần**.
- **Mọi thao tác đều ghi giao dịch**, không có đường sửa tồn mà không để lại vết.
- Chín loại giao dịch: `IMPORT`, `EXPORT`, `TRANSFER`, `RETURN`, `ADJUST`, `COUNT`,
  `CONDITION`, `LOAN_OUT_INTERXA`, `LOAN_IN`.
- Năm nguồn thao tác: `SCAN` quét QR · `BULK` xuất hàng loạt · `LOADCELL` cân · `RFID` ·
  `MANUAL` gõ tay. Biết thao tác đến từ đâu là biết mức tin cậy của nó.

### 6.4. Mã QR theo lô

| Thao tác | API / Ở đâu |
|---|---|
| Sinh mã QR của một lô | `GET inventory/batches/:id/qr` |
| Tra lô bằng mã đã quét | `GET inventory/scan` |
| In nhãn | 🖥️ hộp thoại QR trong màn hình Vật tư |
| Quét bằng camera | 📱 tab *Kho* |

Quét xong ra thẳng màn hình lô: nhập, xuất, chuyển kệ, báo tình trạng — không phải gõ
lại mã lô.

### 6.5. Tìm kiếm và chuẩn hóa cách gõ

| Thao tác | API | Mô tả |
|---|---|---|
| Tìm theo ngữ nghĩa | `GET inventory/warehouses/:id/semantic-search` | Gõ "đồ chống nước" vẫn ra áo phao, áo mưa |
| Chuẩn hóa đầu vào | `POST inventory/normalize-input` | Người nhập gõ "20 thùng nước" → hiểu ra mã và đơn vị |
| Lịch sử giao dịch | `GET inventory/warehouses/:id/transactions` | Lọc theo thời gian, loại, người thực hiện |

Có xử lý riêng cho **đơn vị chai/thùng** ([`bottle-units.ts`](../apps/backend/src/inventory/bottle-units.ts)):
người ta nói "20 thùng" nhưng tồn kho ghi theo chai, quy đổi phải nhất quán, nếu không
số liệu kiểm kê lệch mà không ai biết vì sao.

---

## 7. Mượn và trả vật tư

### 7.1. Mượn trong xã

**Ai:** ADMIN, WAREHOUSE · 🖥️ *Mượn, trả* (`/loan`)

| Thao tác | API |
|---|---|
| Xem phiếu đang mở | `GET loans/warehouses/:id/open` |
| Cho mượn | `POST loans` |
| Ghi nhận hoàn trả | `POST loans/:id/return` |

Khi hoàn trả, ghi **ba con số tách bạch**: hoàn tốt (`returnedOk`), hoàn hỏng
(`returnedDamaged`), mất (`lost`).

**Quy tắc hệ thống ép buộc:**

- Số còn nợ = `quantity − returnedOk − returnedDamaged − lost`, khóa bằng hàm thuần có
  unit test ([`loan-math.ts`](../apps/backend/src/inventory/loan-math.ts)).
- Tổng hoàn + hỏng + mất **không được vượt** số đã mượn.
- **Mất làm giảm tồn thực**; hỏng thì vẫn còn hiện vật nhưng đổi tình trạng. Gộp hai
  cái này làm một thì sổ sách không khớp hiện vật.
- Vật tư đang cho mượn giữ trạng thái `ON_LOAN` — **vẫn thuộc kho**, không bị tính là
  mất, nhưng cũng không được đưa vào phương án cấp phát.

Trạng thái phiếu: `ON_LOAN` → `PARTIALLY_RETURNED` → `CLOSED`.

### 7.2. Mượn liên xã

**Ai:** ADMIN, WAREHOUSE · 🖥️ *Mượn, trả* → khối liên xã

Đây là phần khó nhất về mặt kỹ thuật: **mỗi xã chạy một cơ sở dữ liệu riêng**, không
có cơ sở dữ liệu dùng chung. Một khoản mượn vì thế tồn tại thành **hai bản ghi** — một
ở mỗi xã, chiều ngược nhau.

| Chiều (`direction`) | Nghĩa |
|---|---|
| `OUTGOING` | Xã mình cho xã khác mượn |
| `INCOMING` | Xã mình đi mượn của xã khác |

Vòng đời:

```
REQUESTED ──▶ APPROVED ──▶ ACTIVE ──▶ PARTIALLY_RETURNED ──▶ RETURNED
    │              (bên cho mượn      (bên mượn đã
    │               đã trừ kho)        nhận hàng)
    ├──▶ REJECTED      (bên cho mượn từ chối)
    └──▶ CANCELLED     (bên yêu cầu tự huỷ trước khi có quyết định)
```

| Thao tác | API |
|---|---|
| Xem danh sách khoản mượn liên xã | `GET loans/inter-commune` |
| Xem danh sách xã lân cận | `GET loans/inter-commune/peers` |
| Xem vật tư có thể cho mượn | `GET loans/inter-commune/available-items` |
| Xem dấu tồn đã đánh dấu | `GET loans/inter-commune/stock-marks` |
| Gửi yêu cầu mượn | `POST loans/inter-commune/request` |
| Ghi tay khoản mượn (khi mất mạng) | `POST loans/inter-commune/manual` |
| Đẩy trạng thái | `POST loans/inter-commune/:id/advance` |
| **Nhận yêu cầu từ xã khác** | `POST loans/inter-commune/inbound` |
| Kiểm tra xã bên kia còn sống | `POST loans/inter-commune/peer-status` |

**Quy tắc hệ thống ép buộc:**

- **Khóa chia sẻ để trong biến môi trường, không lưu trong cơ sở dữ liệu.** Nằm trong
  bảng thì nó đi theo mọi bản sao lưu và mọi lần xuất dữ liệu. Hai xã phải khai **cùng
  một khóa**.
- Thiếu bất kỳ mảnh nào trong cấu hình (tên xã, địa chỉ máy chủ, khóa) thì **cả dòng bị
  bỏ qua** — gửi tới địa chỉ rỗng hoặc gửi mà không kèm khóa còn tệ hơn không gửi.
- **Khóa chống nhận trùng `inboundKey`, ràng buộc duy nhất ở tầng cơ sở dữ liệu.**
  Đường truyền giữa hai xã là thứ hay đứt nhất trong cả hệ thống nên xã gửi sẽ gửi lại;
  không có khóa này thì mỗi lần gửi lại là một khoản mượn mới và kho bên cho mượn bị
  trừ nhiều lần cho cùng một yêu cầu.
- `peerLoanId` cũng ràng buộc duy nhất: hai bản ghi cùng trỏ về một khoản bên kia
  nghĩa là đã nhân đôi khoản nợ.
- **Không được trỏ cấu hình về chính máy chủ này** — yêu cầu vừa gửi đi sẽ quay về và
  sinh ra một bản ghi "xã kia xin mượn" ma; duyệt nhầm là tự trừ kho của mình. Máy chủ
  có chặn, nhưng chặn xong thì tin cũng không tới được xã nào.
- Ghi theo **mã vật tư và số lượng**, không trỏ tới lô cụ thể: lô là chuyện nội bộ của
  mỗi kho, xã bên kia không biết và cũng không cần biết.
- Mất mạng thì hai bên **ghi tay theo thỏa thuận qua điện thoại** — đúng cách hai xã
  vẫn làm với nhau từ trước, chỉ khác là nay có sổ.

---

## 8. Báo cáo kiểm kê tháng

**Ai gửi:** WAREHOUSE (kho thôn) · 📱 tab *Kiểm kê* hoặc 🖥️
**Ai duyệt:** ADMIN · 🖥️ *Báo cáo tháng* (`/report`)

```
[kho thôn gửi] ──▶ PENDING ──duyệt──▶ APPROVED ──▶ áp reconcile vào tồn
                      │
                      └──từ chối──▶ REJECTED
```

| Thao tác | API | Quyền |
|---|---|---|
| Gửi báo cáo (nhập tay) | `POST reports` | `report:submit` |
| Gửi báo cáo (tải file Excel) | `POST reports/upload` | `report:submit` |
| Danh sách báo cáo | `GET reports` | `report:view` |
| Chi tiết một báo cáo | `GET reports/:id` | `report:view` |
| Duyệt | `POST reports/:id/approve` | `report:approve` |
| Từ chối | `POST reports/:id/reject` | `report:approve` |

**Quy tắc hệ thống ép buộc:**

- Kỳ báo cáo theo định dạng `YYYY-MM`.
- Nội dung Excel được bóc tách và **lưu lại nguyên trạng** dưới dạng ảnh chụp
  (`rows`) — sau này đối chiếu được kho thôn khai gì, khác gì với số hệ thống đang ghi.
- **Chỉ khi duyệt mới áp vào tồn kho.** Báo cáo còn ở `PENDING` không làm đổi một con
  số nào — nếu không thì một kho thôn gõ nhầm là tồn toàn xã sai theo ngay.
- Từ chối phải kèm lý do.

---

## 9. Cảm biến, sự cố và cảnh báo

### 9.1. Hai đường số liệu vào hệ thống

Đây là điểm thiết kế then chốt, đừng nhầm hai đường:

| Đường | API | Nguồn | Cờ chi phối |
|---|---|---|---|
| Người vận hành xác nhận trên desktop | `POST simulator/snapshots` | `OPERATOR` | `SIMULATION_MUTATION_ENABLED` |
| Thiết bị phần cứng tự gửi | `POST telemetry/snapshots` | `HARDWARE` | **không bị cờ nào làm câm** |

> **Vì sao tách:** cờ `SIMULATION_MUTATION_ENABLED` chỉ chặn luồng mô phỏng. Một
> gateway phần cứng đã xác thực **không bao giờ** bị nó làm câm — nếu không thì có
> ngày ai đó tắt cờ vì lý do khác và cả hệ thống cảm biến thật im lặng mà không ai hay.

Đường phần cứng có bộ máy an toàn riêng: cấp khóa thiết bị
([`device-credential.service.ts`](../apps/backend/src/simulation/device-credential.service.ts)),
xác thực thiết bị (`device-auth.guard.ts`), giới hạn tần suất (`device-rate-limit.ts`).
Cấp và thu hồi khóa bằng lệnh:

```powershell
pnpm --filter @safestock/backend device:issue
pnpm --filter @safestock/backend device:revoke
pnpm --filter @safestock/backend device:monitor
```

### 9.2. Chín loại thiết bị

`LOADCELL` cân · `TEMPERATURE` nhiệt độ · `HUMIDITY` độ ẩm · `SMOKE` khói ·
`DOOR` cửa · `RFID_GATEWAY` · `CAMERA_AI` · `POWER` nguồn điện · `GATEWAY` cổng thu.

| Thao tác | API |
|---|---|
| Danh sách thiết bị của kho | `GET simulator/warehouses/:id/devices` |
| Dòng thời gian số đọc | `GET simulator/warehouses/:id/timeline` |
| Chính sách ngưỡng chuông | `GET simulator/warehouses/:id/alarm-policy` |
| Kho đầu tiên trong phạm vi | `GET simulator/first-warehouse` |

### 9.3. Bộ quy tắc phát hiện sự cố

Số đọc được hợp nhất rồi chạy qua bộ quy tắc
([`incident.rules.ts`](../apps/backend/src/incident/incident.rules.ts),
[`anomaly.rules.ts`](../apps/backend/src/incident/anomaly.rules.ts)). Các loại sự cố
phát hiện được:

| Mã sự cố | Nghĩa |
|---|---|
| `SUSPECTED_LOSS` | Nghi thất thoát — cân giảm mà không có phiếu xuất |
| `SENSOR_FAULT` | Cảm biến hỏng, số đọc vô lý |
| `BAD_STORAGE` | Điều kiện bảo quản sai (nhiệt độ, độ ẩm) |
| `FIRE_RISK` | Nguy cơ cháy |
| `POWER_OUTAGE` / `POWER_OFF` | Mất điện |
| `MISPLACED_ITEM` | Hàng để sai vị trí |
| `DOOR_OPEN` | Cửa mở bất thường |
| `GATEWAY_OFFLINE` | Cổng thu mất kết nối |
| `DEVICE_SILENT` | **Thiết bị im lặng quá lâu** |
| `STAT_ANOMALY` | Bất thường thống kê so với nền |
| `PREDICTIVE_WARNING` | Cảnh báo sớm theo xu hướng |

Bốn mức nghiêm trọng: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Mỗi sự cố kèm **độ tin cậy**
(`confidence`, 0..1) và **bằng chứng** dẫn tới kết luận.

> **`DEVICE_SILENT` là loại tinh tế nhất.** Một cảm biến chết thì **không gửi gì cả**,
> nên không có sự kiện nào để phát hiện ra nó. Phải có một tiến trình canh riêng
> ([`incident-watchdog.service.ts`](../apps/backend/src/incident/incident-watchdog.service.ts))
> định kỳ hỏi ngược lại "thiết bị nào đã im lặng?". Chu kỳ đặt bằng
> `INCIDENT_WATCHDOG_INTERVAL_SECONDS` (mặc định 60 giây); giá trị sai định dạng thì
> **giữ mặc định** thay vì âm thầm bỏ canh.

### 9.4. Vòng đời sự cố

```
OPEN ──tiếp nhận──▶ ACKNOWLEDGED ──phân công──▶ ASSIGNED ──xử lý xong──▶ RESOLVED
```

**Ai:** ADMIN, WAREHOUSE · 🖥️ *Sự cố* (`/incident`)

| Thao tác | API |
|---|---|
| Danh sách sự cố của kho | `GET incidents/warehouses/:id` |
| Dòng thời gian một sự cố | `GET incidents/:id/timeline` |
| Quét phát hiện ngay | `POST incidents/scan/:warehouseId` |
| Tiếp nhận | `POST incidents/:id/acknowledge` |
| Phân công | `POST incidents/:id/assign` |
| Đánh dấu đã xử lý | `POST incidents/:id/resolve` |
| Nhờ AI diễn giải | `POST incidents/:id/explain` |
| Tắt chuông | `POST simulator/alarm-acks` |

AI **chỉ diễn giải bằng tiếng Việt**, không tự kết luận số — trường `explanation` tách
riêng khỏi dữ liệu bằng chứng.

### 9.5. Chuông báo động

Chuông kêu **tại chỗ trên máy desktop**, theo chính sách ngưỡng đã lưu sẵn trong máy,
**ngay khi người vận hành xác nhận** — kể cả khi việc gửi lên máy chủ còn đang chờ.

Chuông chỉ dừng khi bấm **Tắt chuông**. Thao tác tắt được xếp hàng và ghi vào lịch sử
sự cố khi máy chủ nhận được. Quyền tắt chuông (`incident:alarm_ack`) tách riêng, xem §2.2.

### 9.6. Email cảnh báo và hàng chờ bền vững

Khi một sự cố **mới** bật lên, backend tạo bản ghi trong hàng chờ email
(`AlertEmailOutbox`) — đường mã: `IncidentService.enrichNewIncident` →
`AlertMailService.sendIncidentAlert`.

| Cấu hình | Biến môi trường |
|---|---|
| Bật/tắt email | `ALERT_EMAIL_ENABLED` (mặc định `false`) |
| Máy chủ gửi | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` |
| Người gửi / người nhận | `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` |

**Quy tắc hệ thống ép buộc:**

- Thiếu cấu hình SMTP hoặc mất Internet → email giữ trạng thái **chờ/thử lại**, sự cố
  **không bị mất**.
- Email lưu **ba mốc thời gian tách bạch**: `observedAt` lúc người vận hành phát hiện ·
  `receivedAt` lúc máy chủ nhận · `sentAt` lúc email thực sự đi.

> **Vì sao ba mốc:** một email cảnh báo đến muộn hai giờ mà chỉ ghi giờ gửi thì rất dễ
> bị hiểu nhầm là sự cố vừa mới xảy ra, và người trực sẽ chạy đi xử lý một việc đã cũ.

---

## 10. Theo dõi và dự báo

**Ai:** ADMIN, WAREHOUSE · 🖥️ *Theo dõi, dự báo* (`/insights`)

| Chức năng | Tệp | Làm gì |
|---|---|---|
| Dự báo cạn kho | `forecast.ts` | EWMA + độ lệch chuẩn nhu cầu ngày + safety-stock |
| Cảnh báo hạn dùng | `expiry-alert.ts` | Lô hết hạn và sắp hết hạn |
| Gợi ý điều chuyển | `rebalance.ts` | Kho nào thừa, kho nào thiếu |
| Xu hướng tiêu thụ | `trends.ts` | Nhìn lại lịch sử xuất nhập |
| Thời tiết | `weather.ts` | Mưa 72 giờ từ Open-Meteo, chia theo mốc giờ |
| Nhu cầu theo thời tiết | `weather-demand.ts` | Mưa lớn kéo theo nhu cầu vật tư nào |
| Bản tin đầu ngày | `daily-briefing.ts` | Tóm tắt việc cần chú ý hôm nay |

| Thao tác | API |
|---|---|
| Tổng hợp theo dõi | `GET insights/warehouses/:id` |
| Số liệu báo cáo tháng | `GET insights/warehouses/:id/monthly-report` |
| Bản tin đầu ngày | `GET insights/warehouses/:id/daily-briefing` |

**Về dự báo cạn kho** — gọi đúng tên là **dự báo thống kê**, không phóng đại thành học
sâu: trung bình trượt trọng số mũ để làm mượt tốc độ tiêu thụ gần đây, độ lệch chuẩn
nhu cầu ngày để ra khoảng tin cậy số ngày còn lại, và safety-stock chuẩn ngành để ra
điểm đặt hàng lại. **Chạy hoàn toàn offline**, công thức khóa bằng unit test.

**Về thời tiết:** chỉ biết tổng mưa 72 giờ thì không đủ để quyết định — 100 mm rơi đều
trong ba ngày khác hẳn 100 mm dồn vào sáu tiếng tới. Hệ thống chia theo mốc giờ vì mỗi
mốc dẫn tới một quyết định khác. Lỗi gọi dịch vụ thời tiết **không làm sập trang**.

---

## 11. Trí tuệ nhân tạo

### 11.1. Kiến trúc

```
Web / Điện thoại ──▶ Backend (NestJS) ──▶ AI Service (FastAPI) ──▶ Ollama (chạy tại máy)
                                                │
                                                └──▶ Gemini / Claude (tuỳ chọn, cấu hình)
```

Nhà cung cấp thay được qua biến `AI_PROVIDER`: `ollama` (mặc định, chạy tại chỗ, không
tốn phí) · `gemini` · `claude`.

Riêng phần truy hồi tri thức (RAG) **tách khỏi** nhà cung cấp chat qua biến
`EMBEDDING_PROVIDER` — đặt `AI_PROVIDER=gemini` thì vẫn truy hồi tri thức tại chỗ bằng
Ollama, dữ liệu kho không phải rời khỏi máy.

Hai model dùng với Ollama: `qwen3.5:4b` sinh câu trả lời, `nomic-embed-text` vector hóa.

### 11.2. Trợ lý hỏi–đáp

**Ai:** ADMIN, WAREHOUSE · 🖥️ nút trợ lý nổi ở mọi trang

| Thao tác | API |
|---|---|
| Hỏi một câu | `POST assistant/warehouses/:id/ask` |
| Hỏi, nhận trả lời theo dòng chảy | `POST assistant/warehouses/:id/ask/stream` |

**Quy tắc hệ thống ép buộc:**

- Trợ lý trả lời **dựa trên dữ liệu thật của kho**, không bịa số.
- Câu hỏi **ngoài phạm vi bị từ chối** — hỏi thủ đô nước Pháp thì trợ lý báo ngoài
  phạm vi chứ không trả lời.
- Ngưỡng điểm truy hồi `KNOWLEDGE_MIN_SCORE` (mặc định 0.65): đoạn tri thức có điểm
  thấp hơn ngưỡng **không được đưa cho mô hình**, tránh trả lời dựa trên đoạn không liên quan.

### 11.3. Toàn bộ điểm cuối của dịch vụ AI

| Đường dẫn | Làm gì |
|---|---|
| `GET /health` | Kiểm tra sống, trả nhà cung cấp đang dùng |
| `GET /keep-warm` · `POST /keep-warm/start` · `POST /keep-warm/stop` | Giữ mô hình nóng trong bộ nhớ |
| `POST /parse` | Bóc tách mô tả tình huống thành dữ liệu có cấu trúc |
| `POST /situation-analysis` | Phân tích tình huống |
| `POST /field-update-intent` | Hiểu ý định trong ghi nhận hiện trường |
| `POST /explain` | Diễn giải số liệu thành lời |
| `POST /assistant` · `POST /assistant/stream` | Trợ lý hỏi–đáp |
| `POST /knowledge/search` | Truy hồi tri thức (RAG) |
| `POST /semantic/rank` | Xếp hạng theo ngữ nghĩa |
| `POST /briefing/select` | Chọn nội dung cho bản tin đầu ngày |
| `POST /transcribe` | Nhận dạng giọng nói tiếng Việt (PhoWhisper) |
| `POST /action-plan` | Sinh kế hoạch hành động |

### 11.4. Điều cần biết khi trình diễn

Mô hình chạy ngay trên máy. **Lần gọi đầu sau khi nguội mất hơn 15 giây**, vượt thời
gian chờ của máy chủ nên trả `503` hoặc rơi về bản mẫu. Từ lần thứ hai chỉ khoảng 6
giây. Có sẵn cơ chế giữ nóng (`/keep-warm/start`), nhưng cách chắc nhất vẫn là **hỏi
một câu bất kỳ trước buổi trình diễn**.

Chỉ mục tri thức `knowledge_index.json` **đã commit sẵn** trong repository, không cần
vector hóa lại corpus khi cài máy mới. Kiểm tra chỉ mục có cũ so với corpus không:

```powershell
.\.venv\Scripts\python.exe scripts\build_knowledge_index.py --check
```

---

## 12. Bản đồ, tọa độ và định tuyến

**Ai:** ADMIN, WAREHOUSE · 🖥️ *Bản đồ kho* (`/map`)

| Thao tác | API |
|---|---|
| Danh sách thôn | `GET admin/hamlets` |
| Thêm thôn | `POST admin/hamlets` |
| Sửa thôn, ghim tọa độ | `PATCH admin/hamlets/:id` |
| Danh sách kho | `GET admin/warehouses` |
| Ghim tọa độ kho | `PATCH admin/warehouses/:id/location` |

**Quy tắc hệ thống ép buộc:**

- Trong 17 kho thôn, dữ liệu mẫu **chỉ gán tọa độ đã xác minh cho 5 thôn** (Kỳ Đu,
  Phước Huệ, Tân Bình, Phú Sơn, Triêm Đức). **12 thôn còn lại để trống có chủ ý** —
  seed không gán tọa độ suy đoán, ADMIN ghim tay sau.
- Thôn chưa có tọa độ thì **không lập được phương án** cho thôn đó. Thà chặn còn hơn
  điều xe tới một điểm đoán mò.
- Mỗi tọa độ lưu kèm cờ `verified` và mốc `verifiedAt` — biết được số này đã ai kiểm chưa.
- Ghim xong tải lại trang vẫn còn.

**Khoảng cách và thời gian di chuyển** ([`geo`](../apps/backend/src/geo/)):

| Cấu hình | Hành vi |
|---|---|
| Không có `GOOGLE_MAPS_API_KEY` | Luôn dùng Haversine — chạy offline, đủ dùng |
| Có key | Dùng thêm Google Routes, **tự chặn ở `GEO_MONTHLY_CAP`** để không vượt hạn mức miễn phí |
| `GEO_ASSUMED_SPEED_KMH` | Tốc độ giả định khi quy đổi ra thời gian |

**Định tuyến offline (OSRM)** — chạy trong mạng nội bộ, cấu hình `LOCAL_ROUTING_URL`:

```powershell
pnpm osrm:fetch          # tải dữ liệu bản đồ Đồng Xuân
pnpm osrm:build          # extract → partition → customize, sinh manifest + checksum
pnpm osrm:up             # luôn chạy tiền kiểm trước
pnpm osrm:verify-live
pnpm osrm:verify-offline # nghiệm thu với Docker --network none
pnpm osrm:status ; pnpm osrm:logs ; pnpm osrm:down
```

**Quy tắc:** `osrm:up` **không khởi động** nếu artifact thiếu hoặc sai checksum. Bỏ
trống `LOCAL_ROUTING_URL` thì giao diện **hiển thị rõ là chưa tính được tuyến** chứ
không vẽ một đường thẳng giả.

Ô bản đồ (map tiles) có bản cache trong `apps/frontend/public/tiles` để dùng khi mất
Internet, kèm ranh giới xã trong `public/geo`.

---

## 13. Quản trị hệ thống

**Ai:** chỉ ADMIN · 🖥️ nhóm *Quản trị*

### 13.1. Quản lý tài khoản (`/users`)

| Thao tác | API |
|---|---|
| Danh sách | `GET admin/users` |
| Tạo tài khoản | `POST admin/users` |
| Sửa (vai, phạm vi kho, thông tin) | `PATCH admin/users/:id` |
| Xóa | `DELETE admin/users/:id` |

Đây cũng là chỗ **đổi mật khẩu demo trước khi mở ra Internet**.

### 13.2. Nhật ký hoạt động (`/audit`)

`GET audit` — tra cứu mọi thay đổi quan trọng: ai làm, làm gì, trên bản ghi nào, lúc
nào. Nhật ký có phân theo phạm vi kho nên kho thôn chỉ thấy phần của mình.

### 13.3. Sao lưu cơ sở dữ liệu

| Thao tác | API / Cấu hình |
|---|---|
| Chạy sao lưu ngay | `POST backup/run` (quyền `audit:view`) |
| Lịch tự động | 17:00 hằng ngày → Supabase Storage, giữ 3 bản |
| Cấu hình | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BACKUP_BUCKET` |

Thiếu hai biến Supabase thì hệ thống **bỏ qua lịch sao lưu, không báo lỗi** — sao lưu
là tính năng thêm, không được làm sập ứng dụng vì thiếu cấu hình.

### 13.4. Danh bạ liên hệ xã

`GET public/commune-contacts` — điểm cuối **công khai**, không cần đăng nhập. Trả số
điện thoại liên hệ của xã Đồng Xuân và các xã lân cận, khai trong biến môi trường
`COMMUNE_CONTACT_*` và `NEIGHBOR_CONTACT_*`.

### 13.5. Kiểm tra sức khỏe

`GET health` — điểm cuối công khai, trả trạng thái PostgreSQL và Redis:

```json
{"status":"ok","services":{"database":"up","redis":"up"},"timestamp":"..."}
```

---

## 14. Thông báo thời gian thực

Kênh Socket.IO, xác thực bằng token lúc bắt tay.

**Cách chia phòng:** mỗi kết nối tự vào phòng theo cặp **(tổ chức, vai)** —
`notificationRoom(organizationId, role)`. Thông báo phát tới đúng phòng đó, nên một
người thuộc vai RESCUE của xã Đồng Xuân không nhận được thông báo của xã khác hay của
vai khác.

| Thao tác | API |
|---|---|
| Danh sách thông báo | `GET notifications` |
| Đánh dấu đã đọc | `POST notifications/:id/read` |
| Đánh dấu đã đọc tất cả | `POST notifications/read-all` |

Trên web: chuông thông báo ở thanh trên
([`notification-bell.tsx`](../apps/frontend/src/components/mission/notification-bell.tsx))
và thông báo nổi ([`notification-toasts.tsx`](../apps/frontend/src/components/shared/notification-toasts.tsx)).
Trên điện thoại: tab *Thông báo*, có chấm xanh báo **"Đã kết nối"** và chuyển xám khi
mất kết nối — người dùng phải biết mình đang xem dữ liệu sống hay dữ liệu cũ.

---

## 15. Ứng dụng điện thoại

`vn.ungphonhanh.safestock` · React Native + Expo · APK `0.5.0`

### 15.1. Giao diện đổi theo vai

App có **đúng hai giao diện**, chọn tự động lúc đăng nhập:

| Vai | Các tab |
|---|---|
| `WAREHOUSE` (kho trung tâm và kho thôn) | Tổng quan · Sẵn sàng · Kho · Kiểm kê · Báo cáo · Thông báo |
| `RESCUE` (lực lượng hiện trường) | Lệnh · Báo cáo · Thông báo — **không có nghiệp vụ kho** |
| `ADMIN` | Chỉ tab Kho |

**Vì sao ADMIN trên điện thoại chỉ có tab Kho:** quản trị làm việc trên web; nếu đăng
nhập điện thoại thì chỉ để quét QR nhập/xuất ngay tại kệ, không mang cả bảng điều hành
lên màn hình nhỏ.

**Vì sao hiện trường không có nghiệp vụ kho:** họ xem xét tình hình thực tế rồi gửi yêu
cầu; việc đối chiếu tồn và quyết định cấp phát là của người giữ kho.

### 15.2. Chức năng theo tab

| Tab | Làm được gì |
|---|---|
| **Tổng quan** | Tóm tắt kho: số lô, số mã, tổng lượng, lô hỏng, lô sắp hết hạn (ngưỡng 30 ngày) |
| **Sẵn sàng** | Mức sẵn sàng, vướng mắc, mưa 72 giờ Open-Meteo, bản tin AI đầu ngày (tải nền để không chặn màn hình) |
| **Kho** | Quét QR hoặc nhập tay · tìm thường và tìm ngữ nghĩa tại chỗ · nhập · xuất · chuyển kệ · kiểm kê · điều chỉnh · báo tình trạng · xuất nhiều lô · mượn và hoàn (tốt/hỏng/mất) |
| **Kiểm kê** | Lập và gửi báo cáo kiểm kê tháng |
| **Lệnh** | Nhận nhiệm vụ thời gian thực, xem chi tiết vật tư cần/cấp/thiếu, **đóng nhiệm vụ** với ba kết quả giao |
| **Báo cáo** | Báo tình huống bằng gõ tay hoặc giọng nói |
| **Thông báo** | Danh sách thông báo, trạng thái kết nối |

Nút thao tác **chỉ hiện khi vai có quyền** — và quyền vẫn được kiểm lại ở máy chủ.

### 15.3. Bảo mật và hoạt động khi mất mạng

| Cơ chế | Chi tiết |
|---|---|
| Lưu phiên | Expo SecureStore; đăng xuất xóa cả phiên lẫn bản lưu theo tài khoản |
| Mã hóa bản lưu | **AES-256-GCM**, khóa nằm trong Android Keystore, không xuất sang JavaScript |
| Bản cũ chưa mã hóa | Bị loại bỏ theo cơ chế fail-closed |
| Đọc offline | Có bản lưu cho thông báo, nhiệm vụ, tổng quan và kho |
| Ghi offline | **Không có.** Mất mạng thì khóa toàn bộ thao tác ghi |

**Vì sao không có ghi offline:** thà nói thẳng "số liệu này cũ, chưa ghi được" còn hơn
báo thành công giả trên một thao tác chưa tới được máy chủ. Khi mất mạng, app hiển thị
**dấu thời gian của bản lưu** để người dùng tự đánh giá độ cũ.

### 15.4. Nhận dạng giọng nói

Ghi âm bằng `AudioRecord` native Android → WAV PCM 16-bit, mono, 16 kHz → gửi lên
PhoWhisper. Giới hạn **60 giây mỗi lần ghi**. Chỉ xin quyền micro khi người dùng bấm
nút ghi. Chữ nhận ra được **điền vào ô mô tả**, app **không tự gửi báo cáo**.

### 15.5. Địa chỉ máy chủ

App **luôn gọi `https://ungphonhanh.life`**, không có ô nhập địa chỉ. Còn Internet thì
đi đường công cộng; mất Internet mà còn mạng nội bộ thì DNS nội bộ trả về máy chủ kho —
cùng một địa chỉ. APK mang sẵn chứng chỉ gốc nội bộ **chỉ dành riêng cho tên miền này**.

---

## 16. Ứng dụng desktop — thiết bị IoT tại kho

Electron · chạy bằng `pnpm desktop:dev` · tài khoản riêng `iot`

### 16.1. Luồng thao tác

1. **Đăng nhập** — nhập địa chỉ máy chủ (`localhost:3100`, `ungphonhanh.life`, hoặc
   tên máy/IP trong mạng nội bộ) và tài khoản thiết bị.
2. **Kéo thanh trượt** nhiệt độ, độ ẩm, khói, loadcell.
   → Chỉ sửa **bản nháp cục bộ**. Máy chủ và cơ sở dữ liệu chưa có gì thay đổi. Giao
   diện hiện nhãn *"đã chỉnh, chưa gửi"*.
3. **Bấm Xác nhận và gửi** — mới tạo một bản ghi `SensorSubmission` idempotent cùng các
   `SensorEvent` lịch sử của **những thông số đã đổi**.
4. **Chuông kêu tại chỗ ngay** nếu vượt ngưỡng theo chính sách đã lưu sẵn, kể cả khi
   việc gửi còn đang chờ. Bấm **Tắt chuông** để dừng.

### 16.2. Hàng chờ và chống trùng

Snapshot được **lưu vào hàng chờ cục bộ trước khi gọi API**
([`simulator-queue.ts`](../apps/desktop/src/renderer/lib/simulator-queue.ts)). Desktop
tạm không tới được máy chủ thì lần xác nhận vẫn được giữ và gửi lại **idempotent** khi
kết nối trở lại — nối lại mạng thì xuất hiện **đúng một** bản ghi, không nhân đôi.

Thao tác tắt chuông cũng được xếp hàng để ghi vào lịch sử sự cố khi máy chủ nhận được.

### 16.3. Điều kiện bật

Cần `SIMULATION_MUTATION_ENABLED=true` trong `.env` rồi khởi động lại backend.

> ⚠️ Không có runtime, cơ sở dữ liệu hay kịch bản demo riêng cho desktop. Nó dùng
> **chính cơ sở dữ liệu đang cấu hình**. Không có lệnh đặt lại riêng — đừng dùng luồng
> này trên dữ liệu bạn không muốn thay đổi. Đặt cờ về `false` và khởi động lại backend
> khi xong.

### 16.4. Đóng gói

```powershell
pnpm --filter @safestock/desktop package   # electron-builder --win portable → apps/desktop/dist
```

---

## 17. Bảng tra cứu

### 17.1. Toàn bộ điểm cuối API

Tiền tố `/api` được lược bỏ. Cột "Quyền" ghi quyền tối thiểu cần có.

**Xác thực**

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| POST | `auth/login` | công khai |
| POST | `auth/refresh` | cookie phiên |
| POST | `auth/logout` | đã đăng nhập |
| GET | `auth/me` | đã đăng nhập |
| PATCH | `auth/me` | đã đăng nhập |

**Công khai**

| Phương thức | Đường dẫn |
|---|---|
| GET | `health` |
| GET | `public/commune-contacts` |

**Mức sẵn sàng**

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| GET | `readiness/warehouses/:id` | `readiness:view` |
| GET | `readiness/zones/:id` | `readiness:view` |
| GET | `readiness/shelves/:id` | `readiness:view` |
| GET | `readiness/warehouses/:id/recommendations` | `readiness:view` |
| POST | `readiness/warehouses/:id/recalculate` | `readiness:view` |

**Điều phối cứu hộ**

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| POST | `missions/parse` | `incident:report_submit` |
| POST | `missions/transcribe` | `incident:report_submit` |
| POST | `missions/report` | `incident:report_submit` |
| GET | `missions/reports/own` | `incident:report_view_own` |
| GET | `missions/reports/own/:id` | `incident:report_view_own` |
| POST | `missions/generate-plan` | `mission:create` |
| POST | `missions/:id/plan-from-report` | `mission:create` |
| POST | `missions/:id/cancel` | `mission:create` |
| GET | `missions` | `mission:view` |
| GET | `missions/:id` | `mission:view` |
| GET | `missions/:warehouseId/warehouses` | `mission:view` |
| GET | `missions/:id/field-updates` | `mission:view` |
| POST | `missions/:id/field-updates` | `mission:field_update` |
| GET | `missions/:id/analysis-snapshots` | `mission:analyze` |
| POST | `missions/:id/analyses` | `mission:analyze` |
| GET | `missions/:id/analyses/latest` | `mission:analyze` |
| POST | `missions/:id/simulations` | `mission:simulate` |
| GET | `missions/:id/simulations/:simulationId` | `mission:analyze` |
| POST | `missions/:id/action-plan` | `mission:analyze` |
| POST | `missions/:id/explain` | `mission:analyze` |
| POST | `missions/:id/approve` | `mission:approve` |
| POST | `missions/:id/prepare` | `mission:fulfill` |
| POST | `missions/:id/complete` | `mission:confirm` |
| GET | `missions/warehouse-requests/own` | `mission:fulfill` |
| POST | `missions/warehouse-requests/:id/accept` | `mission:fulfill` |
| POST | `missions/warehouse-requests/:id/discrepancy` | `mission:fulfill` |
| POST | `missions/warehouse-requests/:id/prepare` | `mission:fulfill` |
| POST | `missions/warehouse-requests/:id/pickup` | `mission:fulfill` |
| POST | `missions/warehouse-requests/:id/review` | `mission:approve` |

**Kho vật tư**

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| GET | `inventory/catalog` | `inventory:read` |
| GET | `inventory/scan` | `inventory:read` |
| GET | `inventory/batches/:id/qr` | `inventory:read` |
| GET | `inventory/warehouses/:id/tree` | `inventory:read` |
| GET | `inventory/warehouses/:id/batches` | `inventory:read` |
| GET | `inventory/warehouses/:id/batches-page` | `inventory:read` |
| GET | `inventory/warehouses/:id/commune-stock` | `inventory:read` |
| GET | `inventory/warehouses/:id/transactions` | `inventory:read` |
| GET | `inventory/warehouses/:id/semantic-search` | `inventory:read` |
| GET | `inventory/warehouses/:id/transfer-destinations` | `inventory:export` |
| POST | `inventory/normalize-input` | `inventory:import` |
| POST | `inventory/batches` | `inventory:import` |
| POST | `inventory/import` | `inventory:import` |
| POST | `inventory/export` | `inventory:export` |
| POST | `inventory/transfer` | `inventory:export` |
| POST | `inventory/bulk-export` | `inventory:bulk_export` |
| POST | `inventory/adjust` | `inventory:adjust` |
| POST | `inventory/condition` | `inventory:adjust` |
| POST | `inventory/reconcile` | `inventory:reconcile` |

**Mượn – trả**

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| GET | `loans/warehouses/:id/open` | `loan:manage` |
| POST | `loans` | `loan:manage` |
| POST | `loans/:id/return` | `loan:manage` |
| GET | `loans/inter-commune` | `loan:manage` |
| GET | `loans/inter-commune/peers` | `loan:manage` |
| GET | `loans/inter-commune/available-items` | `loan:manage` |
| GET | `loans/inter-commune/stock-marks` | `loan:manage` |
| POST | `loans/inter-commune/request` | `loan:manage` |
| POST | `loans/inter-commune/manual` | `loan:manage` |
| POST | `loans/inter-commune/:id/advance` | `loan:manage` |
| POST | `loans/inter-commune/inbound` | khóa chia sẻ giữa hai xã |
| POST | `loans/inter-commune/peer-status` | khóa chia sẻ giữa hai xã |

**Sự cố · cảm biến · báo cáo · thông báo · quản trị**

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| GET | `incidents/warehouses/:id` | `readiness:view` |
| GET | `incidents/:id/timeline` | `readiness:view` |
| POST | `incidents/scan/:warehouseId` | `readiness:view` |
| POST | `incidents/:id/acknowledge` | `readiness:view` |
| POST | `incidents/:id/assign` | `readiness:view` |
| POST | `incidents/:id/resolve` | `readiness:view` |
| POST | `incidents/:id/explain` | `readiness:view` |
| GET | `simulator/first-warehouse` | `simulation:view` |
| GET | `simulator/warehouses/:id/devices` | `simulation:view` |
| GET | `simulator/warehouses/:id/timeline` | `simulation:view` |
| GET | `simulator/warehouses/:id/alarm-policy` | `simulation:view` |
| POST | `simulator/snapshots` | `simulation:mutate` |
| POST | `simulator/alarm-acks` | `incident:alarm_ack` |
| POST | `telemetry/snapshots` | khóa thiết bị phần cứng |
| GET | `insights/warehouses/:id` | `readiness:view` |
| GET | `insights/warehouses/:id/monthly-report` | `readiness:view` |
| GET | `insights/warehouses/:id/daily-briefing` | `readiness:view` |
| POST | `assistant/warehouses/:id/ask` | `readiness:view` |
| POST | `assistant/warehouses/:id/ask/stream` | `readiness:view` |
| POST | `reports` · `reports/upload` | `report:submit` |
| GET | `reports` · `reports/:id` | `report:view` |
| POST | `reports/:id/approve` · `reports/:id/reject` | `report:approve` |
| GET | `notifications` | `notification:view` |
| POST | `notifications/:id/read` · `notifications/read-all` | `notification:view` |
| GET/POST | `admin/users` | `admin:users` |
| PATCH/DELETE | `admin/users/:id` | `admin:users` |
| GET/POST | `admin/hamlets` · PATCH `admin/hamlets/:id` | `admin:users` |
| GET | `admin/warehouses` · PATCH `admin/warehouses/:id/location` | `admin:users` |
| GET | `audit` | `audit:view` |
| POST | `backup/run` | `audit:view` |

### 17.2. Toàn bộ trạng thái

| Nhóm | Các giá trị |
|---|---|
| Vai (`UserRole`) | `WAREHOUSE` · `RESCUE` · `ADMIN` |
| Loại kho (`WarehouseKind`) | `CENTRAL` · `HAMLET` |
| Nhiệm vụ (`MissionStatus`) | `DRAFT` · `PENDING_WAREHOUSE` · `READY` · `COMPLETED` · `CANCELLED` — cộng các trạng thái lịch sử `PENDING_RESCUE`, `RESCUE_CONFIRMED`, `APPROVED`, `IN_PROGRESS`, `REJECTED`, `DEFERRED` |
| Phiếu yêu cầu kho | `PENDING` · `ACCEPTED` · `PREPARED` · `PICKED_UP` |
| Kết quả giao | `DELIVERED` · `PARTIAL` · `FAILED` |
| Ảnh chụp phân tích | `BASELINE` · `WHAT_IF` |
| Cách nhập ghi nhận hiện trường | `TEXT` · `VOICE_TRANSCRIPT` |
| Loại tình huống | `FLOOD` · `STORM` · `LANDSLIDE` · `FIRE` · `ISOLATION` · `OTHER` |
| Mức ưu tiên | `LOW` · `MEDIUM` · `HIGH` · `CRITICAL` |
| Tình trạng vật tư | `NEW` · `USED` · `NEEDS_CHECK` · `DAMAGED` |
| Lưu thông | `IN_STOCK` · `ON_LOAN` · `RETURNED` |
| Trạng thái mã vật tư | `AVAILABLE` · `IN_USE` · `MAINTENANCE` · `DAMAGED` · `EXPIRING_SOON` · `INSPECTION_OVERDUE` · `MISPLACED` · `UNKNOWN` · `INACCESSIBLE` |
| Loại giao dịch | `IMPORT` · `EXPORT` · `TRANSFER` · `RETURN` · `ADJUST` · `COUNT` · `CONDITION` · `LOAN_OUT_INTERXA` · `LOAN_IN` |
| Nguồn giao dịch | `SCAN` · `BULK` · `LOADCELL` · `RFID` · `MANUAL` |
| Phiếu mượn trong xã | `ON_LOAN` · `PARTIALLY_RETURNED` · `CLOSED` |
| Mượn liên xã — chiều | `OUTGOING` · `INCOMING` |
| Mượn liên xã — trạng thái | `REQUESTED` · `REJECTED` · `APPROVED` · `ACTIVE` · `PARTIALLY_RETURNED` · `RETURNED` · `CANCELLED` |
| Báo cáo tháng | `PENDING` · `APPROVED` · `REJECTED` |
| Sự cố — mức | `LOW` · `MEDIUM` · `HIGH` · `CRITICAL` |
| Sự cố — trạng thái | `OPEN` · `ACKNOWLEDGED` · `ASSIGNED` · `RESOLVED` |
| Loại thiết bị | `LOADCELL` · `TEMPERATURE` · `HUMIDITY` · `SMOKE` · `DOOR` · `RFID_GATEWAY` · `CAMERA_AI` · `POWER` · `GATEWAY` |
| Nguồn số đọc | `OPERATOR` · `HARDWARE` |

---

## 18. Những điểm tài liệu cũ ghi sai

Ghi lại để người đọc không bị dẫn sai khi mở các file cũ.

| Nơi ghi sai | Nội dung sai | Đúng là |
|---|---|---|
| [`apps/mobile/README.md`](../apps/mobile/README.md) §Kiến trúc và §Test realtime | Mô tả luồng `POST /api/missions/:id/dispatch`, `/confirm`, `/reject` với nút **Chấp nhận** / **Từ chối** trên điện thoại | Ba điểm cuối này **không còn tồn tại**. Xã phát hành thẳng tới kho bằng `POST missions/:id/approve`. Điện thoại chỉ gọi `POST missions/:id/complete` để đóng nhiệm vụ. Xem [§5](#5-điều-phối-cứu-hộ--luồng-đầy-đủ) |
| [`docs/HUONG-DAN-TEST-TOAN-DIEN.md`](HUONG-DAN-TEST-TOAN-DIEN.md) §5 ca S08 | "17 kho thôn hiển thị *chưa ghim*" | **12** kho thôn chưa ghim; dữ liệu mẫu đã gán tọa độ đã xác minh cho 5 thôn |
| [`docs/HUONG-DAN-TEST-TOAN-DIEN.md`](HUONG-DAN-TEST-TOAN-DIEN.md) §2.4 và §5 ca S10 | "20 tài khoản" / "Người dùng 20" | Seed tạo **20** tài khoản; tài khoản thứ **21** là `iot`, do script riêng `prisma/create-iot-account.ts` tạo, **không** nằm trong seed và **bị mất mỗi lần seed lại** |
| [`docs/HUONG-DAN-TEST-3-UNG-DUNG.md`](HUONG-DAN-TEST-3-UNG-DUNG.md) §1.1 | "21 người dùng, 19 thiết bị" | Seed in ra **20** người dùng và **68** thiết bị ảo. Con số 21 chỉ đúng sau khi chạy thêm script tạo tài khoản IoT |

Nguyên tắc chung khi hai tài liệu mâu thuẫn: **mã nguồn là chuẩn**, sau đó tới tài liệu
có ngày cập nhật mới hơn.

# Danh mục vị trí kho xã và kho thôn

## 1. Quyết định nghiệp vụ

- Kho vận hành cấp xã Đồng Xuân đặt tại **trụ sở UBND xã Đồng Xuân**.
- Điểm kho/liên hệ tham chiếu của sáu xã lân cận đặt tại **UBND của chính xã đó**.
  Đây chỉ là metadata liên xã, không phải kho vận hành trong tenant Đồng Xuân và
  luôn có availability `UNKNOWN`.
- Mỗi kho thôn đặt tại **Nhà văn hóa** hoặc **Nhà sinh hoạt cộng đồng** của đúng
  thôn tương ứng.
- Chỉ dùng tọa độ khi Google Maps trả đúng tên địa điểm và đúng khu vực. Kết quả gần
  giống, trùng tên ở xã khác hoặc tên thôn khác không được dùng.
- Kho chưa xác minh phải giữ `lat/lng = null` và để ADMIN ghim thủ công sau; entity
  điểm thôn (`Hamlet`) tiếp tục giữ `verified = false` cho tới khi được xác nhận
  riêng. Không lấy tâm thôn, nhà riêng, trường học hoặc UBND xã làm tọa độ thay.

Danh mục được tra cứu thủ công trên Google Maps ngày 28/07/2026.

## 2. Kho và điểm tham chiếu cấp xã

### 2.1. Kho vận hành xã Đồng Xuân

| Thuộc tính | Giá trị đã xác minh |
|---|---|
| Tên kho nghiệp vụ | Kho cứu trợ trung tâm Đồng Xuân |
| Địa điểm đặt kho | UBND Xã Đồng Xuân |
| Loại địa điểm | Local government office |
| Địa chỉ Google Maps | `94H3+7PR, La Hai, Đồng Xuân, Đắk Lắk, Việt Nam` |
| Tọa độ | `13.3782428, 109.1042590` |
| Điện thoại công khai hiển thị trên Maps | `0257 387 2145` |
| Trạng thái | `MAP_VERIFIED` |
| Nguồn | [Google Maps](https://www.google.com/maps?q=13.3782428,109.104259) |

Điểm này thay cho giả định cũ “kho tại 68 Trần Phú”. Khi triển khai runtime, tên
địa điểm và tọa độ seed kho trung tâm phải đổi đồng thời; không chỉ sửa tọa độ nhưng
giữ địa chỉ cũ.

### 2.2. Điểm kho/liên hệ của sáu xã lân cận

| Xã | Địa điểm | Địa chỉ/plus code trên Google Maps | Tọa độ `lat, lng` | Số điện thoại công khai đã có | Trạng thái | Nguồn |
|---|---|---|---|---|---|---|
| Xuân Thọ | UBND Xã Xuân Thọ | `C687+H84, Xuân Thọ, Đắk Lắk` | `13.4163942, 109.2133158` | Chưa có | `MAP_VERIFIED` | [Maps](https://www.google.com/maps?q=13.4163942,109.2133158) |
| Tuy An Bắc | UBND Xã Tuy An Bắc | `8658+93M, Tuy An Bắc, Đắk Lắk` | `13.3084738, 109.2151581` | `0393158933` | `MAP_VERIFIED` | [Maps](https://www.google.com/maps?q=13.3084738,109.2151581) |
| Tuy An Tây | UBND Xã Tuy An Tây | `8526+V8G, Tuy An Tây, Đắk Lắk` | `13.3021866, 109.1608402` | `0889439444` | `MAP_VERIFIED` | [Maps](https://www.google.com/maps?q=13.3021866,109.1608402) |
| Xuân Lãnh | UBND Xã Xuân Lãnh | `F2QJ+J73, Xuân Lãnh, Đắk Lắk` | `13.4890203, 109.0306681` | Chưa có | `MAP_VERIFIED` | [Maps](https://www.google.com/maps?q=13.4890203,109.0306681) |
| Phú Mỡ | UBND Xã Phú Mỡ | `9X4J+CWM, Phú Mỡ, Đắk Lắk` | `13.3560758, 108.9823087` | Chưa có | `MAP_VERIFIED` | [Maps](https://www.google.com/maps?q=13.3560758,108.9823087) |
| Xuân Phước | UBND Xã Xuân Phước | `73W7+VXW, Xuân Phước, Đắk Lắk` | `13.2972273, 109.0649619` | `0945297456` | `MAP_VERIFIED` | [Maps](https://www.google.com/maps?q=13.2972273,109.0649619) |

Các điểm này chỉ phục vụ xếp hạng vị trí/tuyến và hiển thị nơi con người có thể liên
hệ khi toàn bộ nguồn nội xã đủ điều kiện vẫn thiếu. Hệ thống không kiểm tra tồn kho,
không cộng các điểm này vào fulfillment, không tự gọi điện và không tạo giao dịch
ngoài xã.

## 3. Kho thôn

### 3.1. Tổng hợp

- Tổng số thôn trong seed: `17`.
- Tìm được đúng Nhà văn hóa/nhà sinh hoạt cộng đồng và đúng khu vực: `5/17`.
- Chưa đủ điều kiện dùng làm tọa độ runtime: `12/17`.

### 3.2. Danh mục chi tiết

| STT | Thôn | Địa điểm Google Maps | Tọa độ `lat, lng` | Trạng thái | Ghi chú |
|---:|---|---|---|---|---|
| 1 | Long Châu | — | — | `NOT_FOUND` | Truy vấn trả Nhà văn hóa thôn Tân Long/Xuân Long, không phải Long Châu |
| 2 | Long Thăng | — | — | `NOT_FOUND` | Truy vấn trả Xuân Long/Tân Long, không đúng tên thôn |
| 3 | Long Hà | — | — | `NOT_FOUND` | Chỉ thấy Trung tâm Văn hóa Thể thao huyện, không phải Nhà văn hóa thôn Long Hà |
| 4 | Long Bình | Nhà văn hoá thôn Long Bình | `13.3006541, 109.2145655` | `WRONG_REGION` | Google Maps ghi địa chỉ Tuy An Bắc; không dùng cho kho thôn Long Bình của xã Đồng Xuân |
| 5 | Long Mỹ | — | — | `NOT_FOUND` | Không có kết quả đúng tên/đúng xã |
| 6 | Long Thạch | — | — | `NOT_FOUND` | Kết quả trả Nhà văn hóa khu phố Thạch Chẩm ở nơi khác |
| 7 | Long Hòa | — | — | `NOT_FOUND` | Không có kết quả đúng tên/đúng xã |
| 8 | Kỳ Đu | Nhà Văn hóa thôn Kỳ Đu | `13.3636977, 109.0623180` | `MAP_VERIFIED` | Địa chỉ `9376+FWG, Thôn Kỳ Đu, Đồng Xuân` — [Maps](https://www.google.com/maps?q=13.3636977,109.062318) |
| 9 | Phước Huệ | Nhà Văn hoá thôn Phước Huệ | `13.3698758, 109.0787774` | `MAP_VERIFIED` | Địa chỉ `939H+XG2, Đồng Xuân` — [Maps](https://www.google.com/maps?q=13.3698758,109.0787774) |
| 10 | Tân Bình | Nhà sinh hoạt cộng đồng thôn Tân Bình | `13.3656860, 109.1446980` | `MAP_VERIFIED` | Địa chỉ `948V+5R8, Đồng Xuân` — [Maps](https://www.google.com/maps?q=13.365686,109.144698) |
| 11 | Tân An | Nhà văn hoá thôn Tân An | `12.9755231, 108.7775532` | `WRONG_REGION` | Kết quả trùng tên ở khu vực khác, cách xa cụm Đồng Xuân; không dùng |
| 12 | Tân Hòa | — | — | `NOT_FOUND` | Truy vấn bị quy về Tân Long/Tân Bình, không đúng tên |
| 13 | Tân Phước | — | — | `NOT_FOUND` | Truy vấn bị quy về Tân Long/Tân Bình, không đúng tên |
| 14 | Tân Phú | Nhà Văn Hóa Cộng Đồng Thôn Tân Phú | `13.0720265, 108.9850128` | `WRONG_REGION` | Kết quả trùng tên ngoài khu vực xã Đồng Xuân; không dùng |
| 15 | Tân Vinh | — | — | `WRONG_RESULT` | Google Maps trả Nhà văn hóa thôn **Vĩnh Xuân**, không phải Tân Vinh |
| 16 | Phú Sơn | Nhà Văn hóa thôn Phú Sơn | `13.3504381, 109.0451656` | `MAP_VERIFIED` | Địa chỉ `922W+53F, Thôn Phú Sơn, Đồng Xuân` — [Maps](https://www.google.com/maps?q=13.3504381,109.0451656) |
| 17 | Triêm Đức | Nhà Văn hóa thôn Triêm Đức | `13.3615575, 109.0703455` | `MAP_VERIFIED` | Địa chỉ `936C+J4H, Đồng Xuân` — [Maps](https://www.google.com/maps?q=13.3615575,109.0703455) |

## 4. Quy tắc đưa vào runtime

1. Seed môi trường mới được phép điền tọa độ cho UBND xã Đồng Xuân và năm kho thôn
   có trạng thái `MAP_VERIFIED`.
2. Sáu UBND xã lân cận được lưu dưới dạng external contact/reference metadata,
   availability `UNKNOWN`; không tạo Organization/Warehouse vận hành hoặc tồn kho giả.
3. Mười hai kho thôn còn lại giữ `null/false`; UI phải hiện nhãn `Chưa xác minh vị
   trí Nhà văn hóa thôn` và cho ADMIN ghim trên bản đồ.
4. ADMIN chỉ được xác nhận sau khi đối chiếu tên thôn và thực địa/đầu mối địa phương.
5. Mọi thay đổi tọa độ phải lưu actor, thời gian và nguồn xác minh; mission tiếp tục
   snapshot tọa độ tại thời điểm lập phương án.
6. Không tự động cập nhật database đang chạy bằng seed/reset. Dữ liệu hiện hữu chỉ
   cập nhật qua UI ADMIN hoặc migration/script một lần đã được review.
7. Kho không có tọa độ vẫn tham gia nghiệp vụ tồn kho ngày thường, nhưng không được
   tuyên bố khoảng cách/ETA hoặc ưu tiên “gần nhất” trong điều phối.

## 5. Trạng thái triển khai

- Registry runtime version `2026-07-28`:
  `apps/backend/prisma/verified-warehouse-location.ts`.
- Shared API contract: `PublicCommuneContact` trong `packages/shared-types`.
- Seed môi trường mới: UBND Đồng Xuân + năm kho thôn đã xác minh; đúng 12 kho thôn
  còn `null`.
- Trang `/contacts`: hiển thị UBND, link Maps, số công khai và availability
  `UNKNOWN` cho xã lân cận.
- Màn hình bản đồ ADMIN: liệt kê kho chờ xác minh và cho ghim thủ công; cập nhật có
  audit actor/thời gian/nguồn `ADMIN_MAP_PIN`.
- Dữ liệu database đang chạy không tự thay đổi. Không chạy seed/reset chỉ để cập
  nhật tọa độ.

## 6. Việc cần xác minh tiếp

Các Nhà văn hóa thôn Long Châu, Long Thăng, Long Hà, Long Bình, Long Mỹ, Long Thạch,
Long Hòa, Tân An, Tân Hòa, Tân Phước, Tân Phú và Tân Vinh cần một trong các bằng
chứng sau:

- ADMIN ghim trực tiếp sau khi xác nhận với địa phương;
- link Google Maps đúng địa điểm do người dùng cung cấp;
- tọa độ/sơ đồ từ UBND xã hoặc danh mục cơ sở công cộng chính thức.

Cho tới khi có bằng chứng, hệ thống không được tự suy ra vị trí từ tên thôn.

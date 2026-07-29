# Danh mục tham chiếu địa danh/tuyến cho AI What-if

## 1. Mục đích và phạm vi

Tài liệu này khóa danh mục V1 để AI What-if có thể nhận diện tên cầu, đường và điểm
tham chiếu quanh xã Đồng Xuân. Kết quả được tra cứu thủ công trên Google Maps ngày
28/07/2026 và đối chiếu thêm với nguồn địa phương công khai.

`Đã xác minh trên bản đồ` trong tài liệu này chỉ có nghĩa:

- tên địa danh hoặc tên tuyến có kết quả phù hợp trên Google Maps;
- tọa độ là điểm/anchor Google Maps trả về tại thời điểm tra cứu;
- nguồn và ngày tra cứu được lưu để hậu kiểm.

Nó **không** có nghĩa địa điểm đang ngập, sạt lở, hư hỏng hoặc không thể đi qua.
Trạng thái rủi ro mặc định của mọi mục là `REFERENCE_ONLY`. Một trạng thái
`HYPOTHETICAL`, `REPORTED` hoặc `VERIFIED` chỉ được tạo trong từng tình huống từ giả
định What-if, báo cáo hiện trường hoặc xác nhận của ADMIN.

## 2. Danh mục V1 đã xác minh trên Google Maps

### 2.1. Điểm và cầu

| ID đề xuất | Tên chuẩn | Alias được phép | Loại | Tọa độ `lat, lng` | Phạm vi sử dụng V1 | Nguồn |
|---|---|---|---|---|---|---|
| `dx-warehouse-ubnd` | UBND Xã Đồng Xuân | `ubnd dong xuan`, `ủy ban nhân dân xã đồng xuân` | `WAREHOUSE_ANCHOR` | `13.3782428, 109.1042590` | Vị trí kho cấp xã theo quyết định nghiệp vụ; không phải điểm rủi ro | [Google Maps](https://www.google.com/maps?q=13.3782428,109.104259) |
| `dx-bridge-la-hai` | Cầu La Hai | `la hai bridge`, `cau la hai` | `BRIDGE` | `13.3721288, 109.1122399` | Có thể nhận diện trong What-if; Google Maps ghi địa chỉ trên ĐT641, Đồng Xuân | [Google Maps](https://www.google.com/maps?q=13.3721288,109.1122399) |
| `xl-bridge-da-chat` | Cầu Đá Chát | `da chat bridge`, `cau da chat` | `BRIDGE` | `13.4771939, 109.0363351` | Điểm tham chiếu hành lang ĐT641 phía Xuân Lãnh | [Google Maps](https://www.google.com/maps?q=13.4771939,109.0363351) |
| `ext-bridge-tam-giang` | Cầu Tam Giang | `cau tam giang` | `BRIDGE` | `13.4483714, 109.2168327` | Điểm tham chiếu hành lang phía đông/bắc; chỉ tác động nếu route snapshot đi qua buffer điểm | [Google Maps](https://www.google.com/maps?q=13.4483714,109.2168327) |
| `tab-bridge-song-cai` | Cầu Sông Cái Phú Yên | `cau song cai`, `cau song cai phu yen` | `BRIDGE` | `13.3308304, 109.1983194` | Điểm tham chiếu phía Tuy An Bắc; không đồng nhất với “Cầu Sông Cô” | [Google Maps](https://www.google.com/maps?q=13.3308304,109.1983194) |
| `tab-water-ky-lo` | Sông Kỳ Lộ | `song ky lo` | `WATERWAY` | `13.3264250, 109.1906062` | Chỉ dùng làm ngữ cảnh địa lý; không được trực tiếp loại route vì đây không phải một điểm cắt đường | [Google Maps](https://www.google.com/maps?q=13.326425,109.1906062) |

Sáu điểm kho/liên hệ liên xã dùng vị trí UBND Xuân Thọ, Tuy An Bắc, Tuy An Tây,
Xuân Lãnh, Phú Mỡ và Xuân Phước. ID/tọa độ/điện thoại công khai nằm trong
[`DANH-MUC-VI-TRI-KHO-XA-VA-KHO-THON.md`](DANH-MUC-VI-TRI-KHO-XA-VA-KHO-THON.md);
availability của các điểm này luôn `UNKNOWN`.

### 2.2. Tuyến đường

Tọa độ trong bảng dưới là **anchor do Google Maps trả về**, không phải toàn bộ hình
học của tuyến. Khi triển khai, backend phải đối chiếu `ref/name` trên graph OSRM/OSM
hoặc route snapshot; không được dùng một anchor để giả làm toàn tuyến.

| ID đề xuất | Tên chuẩn | Alias được phép | Anchor `lat, lng` | Ghi chú | Nguồn |
|---|---|---|---|---|---|
| `road-dt641` | ĐT641 | `dt641`, `đường tỉnh 641`, `duong tinh 641` | Cầu La Hai và Cầu Đá Chát | Google Maps ghi cả hai cầu trên ĐT641; cần map-match với graph trước khi mô phỏng ảnh hưởng | [Cầu La Hai](https://www.google.com/maps?q=13.3721288,109.1122399), [Cầu Đá Chát](https://www.google.com/maps?q=13.4771939,109.0363351) |
| `road-tl642` | TL 642 | `tl642`, `đt642`, `dt642`, `tỉnh lộ 642` | `13.3640671, 109.1629888` | Giữ cả alias TL/ĐT vì nguồn công khai dùng hai cách gọi; backend phải lưu tên chuẩn và alias riêng | [Google Maps](https://www.google.com/maps?q=13.3640671,109.1629888) |
| `road-ql19c` | QL19C | `quốc lộ 19c`, `quoc lo 19c` | `13.1995677, 108.9697857` | Anchor chỉ chứng minh tên tuyến; tác động chỉ hợp lệ khi route snapshot chứa ref tương ứng | [Google Maps](https://www.google.com/maps?q=13.1995677,108.9697857) |
| `road-dt644` | ĐT644 | `dt644`, `đường tỉnh 644`, `duong tinh 644` | `13.5316285, 109.1109610` | Tuyến liên kết khu vực Sông Cầu–Đồng Xuân và giao với ĐT641 theo nguồn địa phương | [Google Maps](https://www.google.com/maps?q=13.5316285,109.110961), [nguồn địa phương](https://phuyen.baodaklak.vn/82/58118/nang-cap-tuyen-duong-tu-song-cau-di-dong-xuan.html) |
| `road-dt647` | Đường tỉnh 647 | `đt647`, `dt647`, `duong tinh 647` | `13.3405649, 109.0706920` | Google Maps nhận diện tên tuyến; nguồn địa phương từng mô tả hành lang Xuân Phước–Xuân Quang 1–Phú Mỡ | [Google Maps](https://www.google.com/maps?q=13.3405649,109.070692), [nguồn địa phương](https://phuyen.baodaklak.vn/141/189070/mua-lon-nhieu-tuyen-giao-thong-o-dong-xuan-bi-chia-cat.html) |

## 3. Tên có nguồn nhưng chưa đủ điều kiện resolve tự động

Nguồn địa phương ngày 24/11/2017 có nhắc `Cầu Sông Cô`, `Cầu Cây Sung`, đoạn đường
Phước Lộc–Xuân Quang 1 qua khu vực sông Trà Bương, `cầu sắt La Hai` và các tuyến
ĐT641/ĐT642/ĐT647. Tuy nhiên lần tra Google Maps này không xác định được một POI/tọa
độ duy nhất, đúng khu vực cho các tên dưới đây:

| Cụm từ | Trạng thái V1 | Lý do |
|---|---|---|
| `Cầu Sông Cô` | `UNRESOLVED` | Google Maps không trả một POI riêng phù hợp; không được tự đồng nhất với Cầu La Hai hoặc Cầu Sông Cái |
| `Cầu Cây Sung` | `UNRESOLVED` | Kết quả POI Google Maps trả về ở khu vực khác, không phù hợp địa bàn Đồng Xuân |
| `cầu sắt La Hai`, `Cầu La Hai cũ` | `AMBIGUOUS` | Truy vấn Google Maps quy về Cầu La Hai hiện có, không đủ bằng chứng phân biệt cầu cũ/cầu mới |
| `đường Phước Lộc–Xuân Quang 1`, `khu vực sông Trà Bương` | `UNRESOLVED` | Có mô tả lịch sử nhưng chưa có điểm/đoạn hình học đã xác minh |

Nguồn đối chiếu: [Mưa lớn, nhiều tuyến giao thông ở Đồng Xuân bị chia
cắt](https://phuyen.baodaklak.vn/141/189070/mua-lon-nhieu-tuyen-giao-thong-o-dong-xuan-bi-chia-cat.html).
Đây là bằng chứng lịch sử về tên gọi và sự kiện năm 2017, không phải trạng thái giao
thông hiện tại.

## 4. Quy tắc resolve và mô phỏng bắt buộc

1. AI chỉ trích xuất `rawText`, `normalizedName`, `kind` dự kiến và confidence; backend
   mới resolve `referenceId`.
2. Exact canonical name/alias trong registry có thể resolve tự động. Fuzzy match chỉ
   tạo candidate để ADMIN chọn, không tự áp giả định.
3. Với cầu/điểm đã resolve, backend kiểm tra route geometry hiện hữu có đi qua buffer
   cấu hình của điểm hay không. Không giao nhau thì trả `NO_MATCHING_ROUTE`, không
   được báo route đã bị chặn.
4. Với tên đường đã resolve, route snapshot/graph phải chứa `roadRef`/`roadName` tương
   ứng. Chỉ giống chuỗi trong lời người dùng là chưa đủ để loại route.
5. V1 chỉ loại và xếp hạng lại các route option đã có. Nếu chưa có topology để tính
   đường vòng, kết quả phải ghi `không có tuyến thay thế đã xác minh`, không vẽ hoặc
   bịa một đường vòng.
6. `HYPOTHETICAL` chỉ tồn tại trong snapshot What-if. `REPORTED` từ Lực lượng hiện
   trường là evidence cần ADMIN xác minh; không tự ghi trạng thái đóng đường thật.
7. Tên không có trong registry hoặc mục `AMBIGUOUS/UNRESOLVED` phải trả
   `UNRESOLVED_ASSUMPTION` kèm cụm từ gốc và gợi ý ADMIN ghim/xác nhận.

## 5. Phát hiện dữ liệu cần sửa trước AI-3

Quyết định nghiệp vụ mới khóa kho cấp xã tại UBND Xã Đồng Xuân. Google Maps trả UBND
tại `13.3782428, 109.1042590`; seed hiện tại vẫn ghi địa chỉ `68 Trần Phú` và tọa độ
`13.3667, 109.0333`. Vì vậy phải đổi đồng thời **loại địa điểm, location string và
tọa độ**, không tiếp tục coi 68 Trần Phú là vị trí kho.

Trước khi dùng dữ liệu này để tính tuyến hoặc What-if:

- sửa seed kho trung tâm sang UBND xã cho môi trường tạo mới sau khi review diff/test;
- database đã tồn tại phải được ADMIN ghim/xác minh lại hoặc cập nhật bằng migration/
  script được duyệt, không tự reset/seed;
- thêm test ngăn địa chỉ kho trung tâm và tọa độ seed trôi lại;
- vị trí kho thôn tuân theo
  [`DANH-MUC-VI-TRI-KHO-XA-VA-KHO-THON.md`](DANH-MUC-VI-TRI-KHO-XA-VA-KHO-THON.md):
  chỉ năm Nhà văn hóa/nhà sinh hoạt cộng đồng đã xác minh được phép seed tọa độ;
  mười hai điểm còn lại giữ `null` cho tới khi ADMIN xác nhận.

## 6. Version và tiêu chí cập nhật

- Registry nguồn: `dong-xuan-geo-reference-2026.07.28`.
- Mỗi mục runtime phải có `id`, `canonicalName`, `aliases`, `kind`, `lat/lng` nếu là
  điểm, `sourceUrl`, `verifiedAt`, `verificationStatus` và `riskState`.
- Thay đổi tên, alias, tọa độ hoặc phạm vi sử dụng phải tăng version và có diff review.
- Google Maps có thể thay đổi nhãn hoặc dữ liệu; trước demo chính thức cần chạy lại
  smoke tra cứu các mục dùng trong kịch bản chấm thi.

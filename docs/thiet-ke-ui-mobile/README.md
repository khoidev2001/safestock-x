# Bộ thiết kế UI/UX — Ứng dụng Android "Ứng phó nhanh"

Tài liệu thiết kế cho việc làm lại toàn bộ giao diện ứng dụng điện thoại (APK `0.5.0` → bản kế tiếp).

**Ngày lập:** 01/09/2026 · **Cơ sở:** mã nguồn `apps/mobile` tại `main@f49f9cd` và [bản rà soát hệ thống](../RA-SOAT-HE-THONG-VA-KE-HOACH-TOI-UU.md).

---

## Cách dùng bộ tài liệu này

Đọc theo đúng thứ tự này. Hai file đầu là **bắt buộc đọc trước** — chúng quyết định mọi thứ trong các file sau. Bỏ qua chúng rồi vẽ thẳng từng màn là cách chắc chắn nhất để mười màn hình ra mười phong cách.

| # | File | Nội dung |
|---|---|---|
| 00 | [Hệ thống thiết kế](00-HE-THONG-THIET-KE.md) | Màu, chữ, khoảng cách, bo góc, đổ bóng, biểu tượng, chuyển động, trợ năng. **Nguồn sự thật cho mọi màn.** |
| 01 | [Thư viện thành phần](01-THU-VIEN-THANH-PHAN.md) | 24 thành phần dùng chung, kèm biến thể và trạng thái |
| 02 | [Khung ứng dụng và điều hướng](02-KHUNG-UNG-DUNG-VA-DIEU-HUONG.md) | Thanh tab, thanh tiêu đề, vùng an toàn, nút Back, chuyển màn |
| 03 | [Trạng thái chung](03-TRANG-THAI-CHUNG.md) | Đang tải · trống · lỗi · ngoại tuyến · không có quyền. Áp cho mọi màn. |

Sau đó là từng màn, mỗi file một màn:

| # | Màn hình | Vai dùng | File |
|---|---|---|---|
| 04 | Đăng nhập | tất cả | [04-DANG-NHAP.md](04-DANG-NHAP.md) |
| 05 | Tổng quan | Phụ trách kho | [05-TONG-QUAN.md](05-TONG-QUAN.md) |
| 06 | Kho vật tư | Phụ trách kho, Quản trị xã | [06-KHO-VAT-TU.md](06-KHO-VAT-TU.md) |
| 07 | Thao tác kho (7 phiếu) | Phụ trách kho, Quản trị xã | [07-THAO-TAC-KHO.md](07-THAO-TAC-KHO.md) |
| 08 | Quét mã QR | Phụ trách kho, Quản trị xã | [08-QUET-MA-QR.md](08-QUET-MA-QR.md) |
| 09 | Kiểm kê tháng | Phụ trách kho | [09-KIEM-KE-THANG.md](09-KIEM-KE-THANG.md) |
| 10 | Danh sách lệnh | Lực lượng hiện trường | [10-DANH-SACH-LENH.md](10-DANH-SACH-LENH.md) |
| 11 | Chi tiết lệnh | Lực lượng hiện trường, Phụ trách kho | [11-CHI-TIET-LENH.md](11-CHI-TIET-LENH.md) |
| 12 | Báo tình huống | Phụ trách kho, Lực lượng hiện trường | [12-BAO-TINH-HUONG.md](12-BAO-TINH-HUONG.md) |
| 13 | Thông báo | tất cả | [13-THONG-BAO.md](13-THONG-BAO.md) |
| 14 | Hồ sơ và cài đặt | tất cả | [14-HO-SO-VA-CAI-DAT.md](14-HO-SO-VA-CAI-DAT.md) |

---

## Bối cảnh sử dụng — điều quyết định mọi lựa chọn thiết kế

Đây không phải một ứng dụng văn phòng. Mọi quyết định trong bộ tài liệu này đều truy về năm điều kiện thực tế sau. Khi phân vân giữa hai phương án, chọn phương án phục vụ những điều kiện này tốt hơn — kể cả khi nó xấu hơn trên ảnh chụp màn hình.

**1. Người dùng đang đứng, một tay, ngoài trời, có thể đang mưa.**
Trưởng thôn cầm điện thoại giữa kho; đội hiện trường đứng cạnh xe. Tay còn lại đang giữ hàng, giữ ô, hoặc bám. Hệ quả: mọi thao tác chính phải nằm trong **vùng ngón cái ở nửa dưới màn hình**, vùng chạm tối thiểu **48×48 dp**, và không có thao tác quan trọng nào chỉ thực hiện được bằng cử chỉ ẩn.

**2. Ánh sáng cực đoan ở cả hai đầu.**
Ban ngày là nắng gắt ngoài sân kho; ban đêm là phòng trực tối lúc 2 giờ sáng. Hệ quả: **tương phản tối thiểu 4.5:1** cho mọi chữ, và **bắt buộc có chế độ tối** — không phải tính năng phụ.

**3. Sóng yếu, và có lúc mất hẳn.**
Kho thôn nằm rải trên địa bàn miền núi. Hệ quả: mọi màn phải phân biệt rõ ba tình huống — *chưa có dữ liệu*, *không lấy được dữ liệu*, và *đang xem dữ liệu đã lưu*. Ba thứ này trông giống nhau là lỗi nguy hiểm nhất của ứng dụng này.

**4. Người dùng không rành công nghệ, và không được đào tạo dài.**
Trưởng thôn phần lớn ở tuổi trung niên trở lên. Hệ quả: **biểu tượng luôn đi kèm chữ**, không có menu ẩn cho việc chính, thuật ngữ dùng đúng từ nghiệp vụ chứ không dùng từ phần mềm.

**5. Sai số ở đây là mất mát thật.**
Một con số tồn kho sai dẫn tới một phương án cứu trợ sai. Hệ quả: thao tác ghi phải có **xác nhận rõ ràng trước khi thực hiện** và **phản hồi rõ ràng sau khi thực hiện**; không bao giờ hiển thị số liệu mà người dùng không biết nó đến từ đâu và lúc nào.

---

## Bốn nguyên tắc thiết kế

Rút ra từ năm điều kiện trên. Mỗi màn trong bộ tài liệu này đều tự kiểm lại theo bốn nguyên tắc này ở cuối file.

### Nguyên tắc 1 — Mỗi màn trả lời đúng một câu hỏi

| Màn | Câu hỏi nó trả lời |
|---|---|
| Tổng quan | *Kho của tôi hôm nay có ổn không, và nếu không thì vướng ở đâu?* |
| Kho vật tư | *Món này còn bao nhiêu, nằm ở đâu, dùng được không?* |
| Kiểm kê tháng | *Số đếm thực tế có khớp sổ không?* |
| Danh sách lệnh | *Tôi đang có việc gì phải làm?* |
| Chi tiết lệnh | *Việc này là gì, lấy hàng ở đâu, và tôi phải bấm gì?* |
| Báo tình huống | *Làm sao báo nhanh nhất cái tôi vừa thấy?* |
| Thông báo | *Có gì mới cần tôi biết?* |

Thông tin không phục vụ câu hỏi chính của màn thì đẩy xuống dưới hoặc bỏ hẳn.

### Nguyên tắc 2 — Trạng thái phải nói thật

Không bao giờ hiển thị một bảng trống trông giống hệt nhau cho ba tình huống khác nhau. Xem [03-TRANG-THAI-CHUNG.md](03-TRANG-THAI-CHUNG.md).

### Nguyên tắc 3 — Chỉ hiện nút khi bấm được

Nút hiện ra rồi bấm vào báo lỗi còn tệ hơn không có nút — nhất là với người đang đứng ngoài mưa. Nguyên tắc này đã có trong mã nguồn hiện tại (`fieldForceActionsFor` chỉ trả về hành động khi trạng thái cho phép) và **phải được giữ**.

Khi buộc phải hiện nút bị vô hiệu hóa, luôn kèm một dòng nói **vì sao** và **cần gì để mở khóa**.

### Nguyên tắc 4 — Màu mang nghĩa, không trang trí

Bảng nghĩa màu ở [00-HE-THONG-THIET-KE.md](00-HE-THONG-THIET-KE.md#3-màu-theo-nghĩa) là bắt buộc. Không dùng đỏ cho thứ không nguy hiểm, không dùng xanh lá cho thứ chưa xong.

---

## Những thay đổi cấu trúc so với bản hiện tại

Bộ thiết kế này không chỉ vẽ lại giao diện — nó sửa bốn vấn đề cấu trúc đã nêu trong bản rà soát. Người thiết kế cần biết để không vẽ lại cái cũ.

| Thay đổi | Hiện tại | Bản mới | Lý do |
|---|---|---|---|
| **Gộp tab Tổng quan và Sẵn sàng** | 2 tab, cùng render từ một component chỉ khác tham số | 1 tab "Tổng quan", phần sẵn sàng chi tiết nằm bên dưới | Người dùng thấy hai tab nhưng thực chất là một màn. Phụ trách kho giảm từ 6 xuống **5 tab** — đúng giới hạn thanh tab |
| **Bỏ thanh tab cho Quản trị xã** | Thanh tab có đúng 1 mục | Không có thanh tab, vào thẳng màn Kho | Thanh tab một mục là giao diện thừa |
| **Biểu tượng vector thay ký tự Unicode** | `◉ ✓ ▦ ☑ ➤ ! ✎` | `@expo/vector-icons` (Feather + MaterialCommunityIcons) | Ký tự Unicode rơi vào font hệ thống từng hãng — Samsung, Pixel, Xiaomi vẽ ra ba hình khác nhau, có máy vẽ ô vuông rỗng |
| **Điều hướng thật thay `useState`** | Chuyển tab bằng state, không xử lý nút Back | `expo-router` + `react-native-safe-area-context` | Nút Back cứng của Android đang thoát thẳng app; thanh tab dưới có nguy cơ bị thanh cử chỉ che |

---

## Ranh giới — những gì bộ thiết kế này KHÔNG đụng tới

Nêu rõ để tránh mở rộng phạm vi ngoài ý muốn:

- **Không đổi nghiệp vụ.** Mọi màn giữ nguyên đúng các thao tác, trạng thái và quyền hiện có. Đây là việc làm lại lớp trình bày.
- **Không thêm quyền mới cho vai nào.** Bảng phân quyền giữ nguyên: Lực lượng hiện trường không có nghiệp vụ kho, Quản trị xã trên điện thoại chỉ nhập/xuất tại kệ.
- **Không mở ghi dữ liệu khi ngoại tuyến**, trừ một trường hợp duy nhất được đề xuất riêng ở [09-KIEM-KE-THANG.md](09-KIEM-KE-THANG.md) (đếm kiểm kê không đụng tồn cho tới lúc gửi).
- **Không thiết kế cho iOS.** Bản phát hành hiện tại là Android. Tài liệu ghi chú chỗ nào cần điều chỉnh nếu sau này làm iOS, nhưng không thiết kế song song.

---

## Quy ước đọc bản vẽ trong tài liệu

Các màn được mô tả bằng sơ đồ khối chữ. Quy ước:

```
┌─────────────────────────────┐   khung màn hình (360 dp rộng, mốc thiết kế)
│ ▸ Nội dung                  │   ▸ = phần tử bấm được
│   Chữ phụ                   │   thụt lề = quan hệ cha–con
├─────────────────────────────┤   đường kẻ = ranh giới vùng
│ [ NÚT CHÍNH             ]   │   [ ] = nút
│ ( tùy chọn )                │   ( ) = nút phụ / chip
│ ◻ ô nhập                    │   ◻ = trường nhập liệu
└─────────────────────────────┘
```

Mọi kích thước ghi bằng **dp** (density-independent pixels). Mốc thiết kế: **360 × 800 dp** (máy Android phổ thông). Mỗi màn có ghi chú riêng cho màn hẹp 320 dp và màn rộng 412 dp.

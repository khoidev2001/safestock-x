# 13 · Màn Thông báo

**Câu hỏi màn này trả lời:** *Có gì mới cần tôi biết?*

**Vai dùng:** tất cả · **Tệp hiện tại:** `App.tsx` (`NotificationsScreen`, dòng 399–560)

---

## 1. Một lỗi phải sửa trước khi vẽ

Bản rà soát hệ thống phát hiện (mục N2): **thông báo gửi theo vai nhưng chỉ có một cột `read` duy nhất.**

Xã có 17 trưởng thôn cùng vai `WAREHOUSE`. **Ai mở thông báo trước thì thông báo đó thành "đã đọc" với cả 16 người còn lại.** Nút "Đánh dấu đã đọc tất cả" xóa sạch huy hiệu chưa đọc của tất cả cùng lúc.

Ngày thường là phiền toái. Lúc có lũ, đây là **thông báo bị mất**.

Cùng mục đó còn nêu N3: danh sách thông báo lọc theo `organizationId + recipientRole` nhưng **không lọc theo phạm vi kho**, nên trưởng thôn thấy thông báo về hoạt động kho của thôn khác.

**Cả hai phải sửa ở backend trước.** Vẽ lại giao diện trên nền này chỉ làm cái lỗi đó đẹp hơn.

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│  Thông báo                    ⬤  ●Kết nối│
│  3 chưa đọc                              │
├──────────────────────────────────────────┤
│  ( Tất cả 24 )( Chưa đọc 3 )( Cần làm 1 )│
├──────────────────────────────────────────┤
│  HÔM NAY                                 │
│  ┌────────────────────────────────────┐  │
│  │ ●│🤝 Xã Xuân Thọ đề nghị mượn      │  │  ← có hành động
│  │  │   30 áo phao người lớn          │  │
│  │  │   14:05 · 12 phút trước         │  │
│  │  │  ┌──────────┐ ┌──────────┐      │  │
│  │  │  │ Đồng ý   │ │ Từ chối  │      │  │
│  │  │  └──────────┘ └──────────┘      │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ●│➤ Nhiệm vụ cứu hộ mới            │  │  ← mở được
│  │  │   Lũ lụt — 150 người. Xác nhận  │  │
│  │  │   để lấy vật tư.            ›   │  │
│  │  │   13:40 · 37 phút trước         │  │
│  └────────────────────────────────────┘  │
│                                          │
│  HÔM QUA                                 │
│  ┌────────────────────────────────────┐  │
│  │  │⚠ Sự cố kho: nhiệt độ vượt ngưỡng│  │  ← đã đọc, không đậm
│  │  │   Kho thôn Long Châu · 22:15    │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  ⌂     ▤     ☑     ✎     🔔              │
└──────────────────────────────────────────┘
```

---

## 3. Hàng thông báo (`NotificationRow`)

### 3.1. Cấu trúc

```
●│ 🤝  Tiêu đề thông báo
 │     Nội dung, tối đa 2 dòng
 │     14:05 · 12 phút trước           ›
 │     [ nút hành động nếu có ]
```

| Phần | Chi tiết |
|---|---|
| Chấm chưa đọc | 8 dp màu `primary`, cột trái 16 dp |
| Biểu tượng loại | 24 dp, màu theo loại thông báo |
| Tiêu đề | `subtitle`; **đậm khi chưa đọc**, thường khi đã đọc |
| Nội dung | `body`, tối đa 2 dòng, cắt bằng `…` |
| Thời gian | `caption`; tương đối trong 24 giờ, tuyệt đối sau đó |
| Mũi tên | Chỉ hiện khi mở được màn khác |

**Chưa đọc có hai tín hiệu:** chấm màu **và** chữ đậm. Không dựa riêng vào màu.

### 3.2. Biểu tượng và màu theo loại

| Loại | Biểu tượng | Màu |
|---|---|---|
| Nhiệm vụ mới | `feather:navigation` | `primary` |
| Yêu cầu vật tư cho kho | `feather:package` | `attention` |
| Sự cố kho | `feather:alert-triangle` | `critical` |
| Đề nghị mượn liên xã | `feather:share-2` | `attention` |
| Báo cáo tháng bị trả lại | `feather:corner-down-left` | `critical` |
| Báo cáo tháng đã duyệt | `feather:check-circle` | `ready` |
| Cập nhật hiện trường | `feather:message-square` | `primary` |

### 3.3. Thông báo mang hành động

Một số thông báo dựng được hành động ngay trên thẻ — quan trọng nhất là **đề nghị mượn liên xã**, vốn đã có `loanId` trong mô hình dữ liệu.

Chú thích trong lược đồ đã nêu đúng lý do và vẫn giữ nguyên giá trị: *"thông báo MANG THEO HÀNH ĐỘNG: màn hình dựng được hai nút Đồng ý / Từ chối ngay trên thẻ, người trực không phải mở tab Mượn trả rồi tìm lại đúng dòng. Lúc đang bão, mỗi bước phải đi tìm là một bước bị bỏ."*

Hai nút chia đôi bề ngang, cao 44 dp. "Từ chối" mở phiếu nhập lý do.

Sau khi xử lý, thẻ **không biến mất** — đổi sang trạng thái đã xử lý kèm kết quả:

> ✓ Đã đồng ý cho mượn 30 áo phao · 14:07

Thẻ biến mất ngay sau khi bấm khiến người dùng không chắc mình vừa bấm gì.

---

## 4. Nhóm theo ngày

Tiêu đề nhóm: **Hôm nay · Hôm qua · Thứ Hai 26/08 · …**

Thông báo trong ngày sắp mới nhất trước.

Nhóm theo ngày quan trọng ở màn này: thông báo tích lại nhanh, và người dùng cần biết cái mình đang đọc là chuyện lúc nào — nhất là sau một đợt ngoại tuyến dài.

---

## 5. Chip lọc

| Chip | Lọc |
|---|---|
| Tất cả | không lọc |
| Chưa đọc | `read === false` |
| Cần làm | thông báo có hành động chưa xử lý |

Chip "Cần làm" là chip quan trọng nhất: nó là hàng đợi việc thật sự của người dùng. Khi có mục, chip mang nền `attention`.

---

## 6. Đánh dấu đã đọc

| Thao tác | Cách làm |
|---|---|
| Chạm thẻ | Đánh dấu đã đọc + mở màn tương ứng |
| Thẻ hiện trên màn hơn 2 giây | **Tự đánh dấu đã đọc** |
| Nút "Đọc tất cả" | Trong menu `⋯` trên thanh tiêu đề, **có hộp thoại xác nhận** |

Tự đánh dấu sau 2 giây là hành vi đúng cho hàng thông báo: người dùng đã đọc bằng mắt rồi, bắt họ chạm thêm là việc thừa.

**"Đọc tất cả" phải có xác nhận** — với người dùng chưa quen, đây là nút xóa mất việc cần làm.

Sau khi sửa lỗi N2 ở backend, hai thao tác này chỉ ảnh hưởng tài khoản của chính người dùng.

---

## 7. Chỉ báo kết nối thời gian thực

Ở thanh tiêu đề, giữ đúng cách làm hiện tại nhưng gọn hơn:

```
● Kết nối       chấm ready
● Mất kết nối   chấm text-muted
● Đang nối lại  chấm attention, nhấp nháy
```

Chỉ báo này thật sự có ích ở màn này: người dùng cần biết mình có đang nhận thông báo tức thời hay không. Khi mất kết nối, thêm dòng dưới danh sách:

> Đang thử kết nối lại… Kéo xuống để tải thủ công.

---

## 8. Thông báo mới đến

```
┌──────────────────────────────────────────┐
│  ↑ 1 thông báo mới                       │  ← dải, chạm để cuộn lên
├──────────────────────────────────────────┤
```

Khi người dùng **đang ở đầu danh sách**: thẻ mới trượt vào từ trên, 180 ms, nền `primary-soft` nhạt dần trong 2 giây.

Khi người dùng **đã cuộn xuống**: hiện dải "1 thông báo mới" ở đầu vùng nhìn thấy, chạm vào thì cuộn lên. **Không tự cuộn** — người dùng đang đọc thứ khác.

Rung nhẹ chỉ với thông báo mức `critical` (sự cố kho, nhiệm vụ mới). Rung cho mọi thông báo là cách nhanh nhất khiến người dùng tắt thông báo.

---

## 9. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Đang tải | 3 khung xương hình hàng thông báo |
| Trống | `bell-off` + "Chưa có thông báo nào" |
| Trống do lọc "Chưa đọc" | `check-circle` màu `ready` + "Bạn đã đọc hết thông báo" |
| Lỗi | `ErrorState` + Thử lại |
| Ngoại tuyến | Dải báo + danh sách từ bản lưu; nút hành động vô hiệu kèm lý do |
| Chưa cấu hình địa chỉ máy chủ | Thẻ lỗi rõ ràng + hướng dẫn liên hệ cán bộ phụ trách |

Trường hợp cuối giữ lại xử lý đã có trong bản hiện tại, nhưng thông điệp phải dễ hiểu chứ không phải chuỗi lỗi kỹ thuật.

---

## 10. Tương tác

| Thao tác | Kết quả |
|---|---|
| Chạm thẻ | Đánh dấu đã đọc + mở màn tương ứng |
| Chạm nút hành động | Xử lý ngay, **không mở màn khác** |
| Kéo xuống | Tải lại |
| Cuộn tới cuối | Tải thêm trang |
| Nút Back cứng | Về tab gốc của vai |

**Không dùng vuốt để xóa thông báo.** Thông báo ở đây là bản ghi nghiệp vụ, không phải rác cần dọn — và vuốt nhầm làm mất việc cần làm.

---

## 11. Deep link

Chạm thẻ mở đúng nơi, với ngăn xếp điều hướng hợp lệ (nút Back đưa về màn Thông báo):

| Loại | Mở tới |
|---|---|
| Nhiệm vụ mới | Chi tiết lệnh |
| Yêu cầu vật tư | Chi tiết lệnh, cuộn tới phần yêu cầu của kho mình |
| Sự cố kho | Tổng quan, cuộn tới mục cảnh báo |
| Báo cáo bị trả lại | Chi tiết kỳ báo cáo |
| Đề nghị mượn | Xử lý ngay trên thẻ, không chuyển màn |

---

## 12. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Hàng thông báo | Nhãn gộp gồm trạng thái đọc: *"Chưa đọc. Nhiệm vụ cứu hộ mới. Lũ lụt, 150 người. 37 phút trước."* |
| Nút hành động | Nhãn đầy đủ: *"Đồng ý cho xã Xuân Thọ mượn 30 áo phao người lớn"* |
| Tiêu đề nhóm ngày | `accessibilityRole="header"` |
| Chỉ báo kết nối | Nhãn đọc trạng thái, cập nhật khi đổi |
| Thông báo mới đến | `accessibilityLiveRegion="polite"` |
| Số chưa đọc | Nằm trong nhãn của thanh tiêu đề |

---

## 13. Danh mục kiểm tra

- [ ] **Backend đã sửa N2** — trạng thái đọc theo từng người, không dùng chung theo vai
- [ ] **Backend đã sửa N3** — danh sách lọc theo phạm vi kho
- [ ] Chưa đọc có **hai** tín hiệu: chấm màu và chữ đậm
- [ ] Nhóm theo ngày, có tiêu đề nhóm
- [ ] Chip "Cần làm" nổi bật khi có mục
- [ ] Đề nghị mượn liên xã có hai nút ngay trên thẻ
- [ ] Sau khi xử lý, thẻ **không biến mất** mà đổi sang trạng thái đã xử lý
- [ ] Thẻ hiện trên màn 2 giây thì tự đánh dấu đã đọc
- [ ] "Đọc tất cả" có hộp thoại xác nhận
- [ ] Chỉ báo kết nối thời gian thực hiện đúng ba trạng thái
- [ ] Thông báo mới **không tự cuộn** khi người dùng đang cuộn ở dưới
- [ ] Chỉ rung với thông báo mức nghiêm trọng
- [ ] Trống do lọc "Chưa đọc" khác trống thật
- [ ] Không có cử chỉ vuốt xóa
- [ ] Deep link dựng ngăn xếp có nút Back hợp lệ
- [ ] Lỗi chưa cấu hình máy chủ hiện thông điệp dễ hiểu, không phải chuỗi kỹ thuật

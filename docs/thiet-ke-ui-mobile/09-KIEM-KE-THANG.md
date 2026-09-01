# 09 · Màn Kiểm kê tháng

**Câu hỏi màn này trả lời:** *Số đếm thực tế có khớp sổ không, và tôi nộp báo cáo thế nào?*

**Vai dùng:** Phụ trách kho (lập và gửi), Quản trị xã (duyệt) · **Tệp hiện tại:** `MonthlyReportScreen.tsx`

---

## 1. Bối cảnh

Đây là **nghiệp vụ dài nhất** trong ứng dụng: trưởng thôn đi dọc kệ, đếm từng lô, nhập số vào điện thoại. Một kho thôn có thể có vài chục lô, và việc này mất 30–60 phút.

Ba điều kiện riêng của màn này:

1. **Người dùng đi lại trong kho, không ngồi.** Một tay cầm máy, một tay chạm hàng.
2. **Phiên làm việc dài và dễ bị ngắt.** Có người gọi, có xe tới, máy hết pin.
3. **Kho thôn hay ở chỗ sóng yếu.** Mất mạng giữa chừng là chuyện thường.

Điều kiện 2 và 3 dẫn tới yêu cầu quan trọng nhất của màn này: **bản nháp phải sống sót**.

---

## 2. Đề xuất: đây là nghiệp vụ duy nhất mở ngoại tuyến

Nguyên tắc chung của hệ thống là *mất mạng thì từ chối ghi*. Màn này là ngoại lệ được đề xuất, và lý do rất cụ thể:

**Đếm kiểm kê không đụng tới tồn kho cho tới lúc gửi.** Người dùng nhập số đếm vào bản nháp cục bộ; tồn kho chỉ thay đổi khi Quản trị xã duyệt báo cáo. Nên cho phép nhập ngoại tuyến **không phá nguyên tắc nào** — nó chỉ hoãn bước gửi.

| Việc | Ngoại tuyến |
|---|---|
| Tải danh sách lô để đếm | Dùng bản đã lưu, có mốc thời gian |
| Nhập số đếm vào nháp | ✅ Được — lưu vào bộ nhớ máy đã mã hóa |
| Gửi báo cáo | ❌ Không — vào hàng chờ, gửi khi có mạng |
| Duyệt báo cáo | ❌ Không |

Đây là mục T12 trong [bản rà soát hệ thống](../RA-SOAT-HE-THONG-VA-KE-HOACH-TOI-UU.md).

---

## 3. Ba màn con

```
Danh sách kỳ báo cáo          ← màn gốc của tab
   ├── Đang đếm (nháp)        ← phiên đếm
   └── Chi tiết kỳ báo cáo    ← xem lại / duyệt
```

---

## 4. Màn gốc — Danh sách kỳ báo cáo

```
┌──────────────────────────────────────────┐
│  Kiểm kê tháng               ⬤  🔔       │
│  Kho thôn Long Châu                      │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │ ⏵ Đang đếm dở — kỳ 09/2026         │  │  ← thẻ nháp (nếu có)
│  │   Đã nhập 18/42 lô                 │  │     nền attention-soft
│  │   Lưu lúc 09:15 hôm nay            │  │
│  │   [ Tiếp tục đếm ]     ( Bỏ nháp ) │  │
│  └────────────────────────────────────┘  │
│                                          │
│  CÁC KỲ ĐÃ GỬI                           │
│  ┌────────────────────────────────────┐  │
│  │ Kỳ 08/2026                 Đã duyệt│  │
│  │ 42 lô · gửi 02/09 · duyệt 03/09    │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ Kỳ 07/2026              ▌Bị trả lại│  │  viền trái critical
│  │ 40 lô · gửi 03/08                  │  │
│  │ ⚠ Kiểm tra lại WATER-01 và RICE-01 │  │  lý do trả lại
│  │ [ Sửa và gửi lại ]                 │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│         ( + Bắt đầu kỳ mới )             │
└──────────────────────────────────────────┘
```

### 4.1. Thẻ nháp đứng đầu

Nếu có bản nháp dở, nó luôn ở trên cùng với nền `attention-soft`. Đây là việc đang treo của người dùng, không được để lẫn vào danh sách lịch sử.

### 4.2. Trạng thái kỳ báo cáo

| Trạng thái | Nhãn | Màu |
|---|---|---|
| `PENDING` | Chờ duyệt | `attention` |
| `APPROVED` | Đã duyệt | `ready` |
| `REJECTED` | Bị trả lại | `critical` |

Kỳ bị trả lại phải hiện **lý do trả lại ngay trên thẻ**, không giấu trong chi tiết. Đây là việc người dùng phải làm lại, và họ cần biết ngay phải sửa gì.

---

## 5. Màn đếm — phần khó nhất

```
┌──────────────────────────────────────────┐
│  ‹  Đếm kỳ 09/2026                   ⋯   │
├──────────────────────────────────────────┤
│  ▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░  18/42            │  thanh tiến độ
│  Đã lệch: 3 lô                           │
├──────────────────────────────────────────┤
│  ( Chưa đếm 24 )( Đã đếm 18 )( Lệch 3 )  │  chip lọc
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │ 💧 WATER-01 · Lô L-0142            │  │  ← hàng đếm
│  │    Kệ A2-03                        │  │
│  │    Sổ ghi: 120 chai                │  │
│  │    ┌─────┐ ┌────────┐ ┌─────┐      │  │
│  │    │  −  │ │  120   │ │  +  │      │  │
│  │    └─────┘ └────────┘ └─────┘      │  │
│  │    ✓ Khớp sổ                       │  │  ← phản hồi tức thì
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🦺 LIFE-ADULT · Lô L-0087          │  │
│  │    Kệ B1-01                        │  │
│  │    Sổ ghi: 48 cái                  │  │
│  │    ┌─────┐ ┌────────┐ ┌─────┐      │  │
│  │    │  −  │ │   45   │ │  +  │      │  │
│  │    └─────┘ └────────┘ └─────┘      │  │
│  │    ⚠ Thiếu 3 cái                   │  │  attention
│  │    ┌──────────────────────────────┐│  │
│  │    │ Lý do chênh lệch             ││  │  hiện khi lệch
│  │    └──────────────────────────────┘│  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  [ Gửi báo cáo (18/42) ]        ▣        │  nút neo + quét QR
└──────────────────────────────────────────┘
```

### 5.1. Thanh tiến độ luôn nhìn thấy

Đây là phiên làm việc dài; người dùng cần biết còn bao xa. Thanh tiến độ và số `18/42` ghim ngay dưới thanh tiêu đề, không cuộn mất.

Kèm số lô đang lệch — người dùng biết mình sẽ phải giải thích bao nhiêu dòng.

### 5.2. Nhập số bằng `NumberStepper`, không bằng bàn phím

Bàn phím ảo che nửa màn hình, và người dùng đang đi lại trong kho với một tay. Số đếm thường lệch sổ vài đơn vị, nên nút ± phục vụ đúng trường hợp phổ biến nhất.

Ô giữa vẫn gõ thẳng được cho trường hợp lệch nhiều. Có `selectTextOnFocus`.

**Điền sẵn số của sổ.** Bản hiện tại để trống ô `countedQuantity`. Điền sẵn số sổ giúp: đa số lô khớp sổ nên người dùng chỉ cần xác nhận; và người dùng luôn nhìn thấy số cần đối chiếu.

Đi kèm: mỗi hàng có công tắc **"Đã đếm"**. Số điền sẵn chưa tính là đã đếm cho tới khi người dùng chạm — nếu không, hệ thống không phân biệt được "đã đếm và khớp" với "chưa đếm".

### 5.3. Phản hồi tức thì khi lệch

Ngay khi số đổi:

| Tình huống | Thể hiện |
|---|---|
| Khớp sổ | `✓ Khớp sổ` màu `ready` |
| Thiếu | `⚠ Thiếu 3 cái` màu `attention` + hiện ô lý do |
| Thừa | `⚠ Thừa 2 cái` màu `attention` + hiện ô lý do |

Ô lý do chỉ xuất hiện khi có lệch — biểu mẫu không nên hiện trường mà đa số trường hợp bỏ trống.

### 5.4. Chip lọc

Ba chip: **Chưa đếm · Đã đếm · Lệch**. Mặc định chọn "Chưa đếm" — người dùng đang đếm dở quay lại thì muốn thấy phần còn lại, không muốn cuộn qua phần đã xong.

### 5.5. Quét QR để nhảy tới lô

Nút quét ở góc phải vùng neo đáy. Quét mã trên kệ thì danh sách nhảy tới đúng hàng đó và mở bàn phím số.

Đây là cách dùng tự nhiên nhất: người dùng đi dọc kệ theo thứ tự vật lý, không theo thứ tự trong danh sách.

### 5.6. Lưu nháp

| Thời điểm lưu | Cách |
|---|---|
| Mỗi lần đổi số | Tự lưu sau 800 ms ngừng thao tác |
| Rời màn | Lưu ngay |
| App vào nền | Lưu ngay |

Lưu vào bộ nhớ máy đã mã hóa, dùng đúng cơ chế `writeOfflineCache` hiện có.

Dải nhỏ ở đáy: `Đã lưu nháp lúc 09:15` — người dùng cần thấy bằng chứng công sức không mất.

**Nháp không bao giờ tự xóa.** Chỉ xóa khi gửi thành công hoặc người dùng chủ động bỏ (có hộp thoại xác nhận).

---

## 6. Gửi báo cáo

### 6.1. Kiểm tra trước khi gửi

Nút gửi hiện tiến độ: `Gửi báo cáo (18/42)`.

Bấm khi chưa đếm hết thì hiện hộp thoại:

> **Còn 24 lô chưa đếm**
> Báo cáo gửi đi sẽ thiếu 24 lô. Quản trị xã có thể trả lại.
> `[ Tiếp tục đếm ]` `[ Vẫn gửi ]`

Không chặn hẳn — có thể xã cho phép báo cáo từng phần — nhưng phải nói rõ hệ quả.

### 6.2. Màn xem lại

Trước khi gửi, hiện màn tóm tắt:

```
Kỳ 09/2026 · Kho thôn Long Châu

Tổng số lô đã đếm      42
Khớp sổ                39
Lệch                    3
  ⚠ LIFE-ADULT L-0087   thiếu 3
  ⚠ RICE-01    L-0210   thừa 5
  ⚠ TORCH-01   L-0033   thiếu 1

[ Xác nhận gửi báo cáo ]
```

Đây là lần duy nhất người dùng nhìn được toàn cảnh trước khi con số vào hệ thống.

### 6.3. Gửi khi ngoại tuyến

```
┌────────────────────────────────────┐
│ ⚡ Chưa gửi được — đang ngoại tuyến │
│                                    │
│ Báo cáo đã lưu đầy đủ trên máy.    │
│ Sẽ tự gửi khi có kết nối trở lại.  │
│                                    │
│ [ Thử gửi lại ]                    │
└────────────────────────────────────┘
```

Báo cáo vào hàng chờ. Khi có mạng, tự gửi và báo bằng `Toast`:

> ✓ Đã gửi báo cáo kỳ 09/2026

Hàng chờ dùng cùng `requestId` nên gửi lại nhiều lần không tạo hai báo cáo.

---

## 7. Màn chi tiết kỳ báo cáo

Xem lại một kỳ đã gửi. Với Quản trị xã, đây cũng là màn duyệt.

```
┌──────────────────────────────────────────┐
│  ‹  Kỳ 08/2026                           │
├──────────────────────────────────────────┤
│  Kho thôn Long Châu                      │
│  Gửi 02/09 bởi Nguyễn Văn A     Chờ duyệt│
├──────────────────────────────────────────┤
│  ( Tất cả 42 )( Lệch 3 )                 │
│                                          │
│  💧 WATER-01 · Lô L-0142                 │
│     Sổ 120 → Đếm 120        ✓ Khớp       │
│                                          │
│  🦺 LIFE-ADULT · Lô L-0087               │
│     Sổ 48 → Đếm 45          ⚠ Thiếu 3    │
│     "Phát hiện 3 cái rách khi kiểm tra"  │
├──────────────────────────────────────────┤
│  [ Duyệt báo cáo ]  [ Trả lại ]          │  chỉ Quản trị xã
└──────────────────────────────────────────┘
```

Mặc định mở với chip **"Lệch"** đang chọn — người duyệt quan tâm phần lệch trước.

### 7.1. Duyệt

Hộp thoại xác nhận nêu hệ quả:

> **Duyệt báo cáo kỳ 08/2026?**
> Tồn kho của 3 lô có chênh lệch sẽ được cập nhật theo số đếm thực tế. Thao tác ghi vào sổ kho.
> `[ Xem lại ]` `[ Duyệt ]`

### 7.2. Trả lại

Bắt buộc nhập lý do, tối thiểu 10 ký tự. Gợi ý mẫu: *"Nêu rõ mã vật tư hoặc số liệu cần kiểm tra lại"*.

Lý do này hiện thẳng trên thẻ kỳ báo cáo của trưởng thôn — nên nó phải cụ thể và hành động được.

---

## 8. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Chưa có kỳ nào | "Chưa có báo cáo kiểm kê nào" + nút Bắt đầu kỳ mới |
| Kho không có lô để đếm | "Kho chưa có lô hàng nào để kiểm kê" |
| Đang tải danh sách đếm | Khung xương 3 hàng đếm |
| Ngoại tuyến khi đang đếm | Dải báo, nhưng **việc đếm vẫn chạy bình thường** — đây là ngoại lệ được thiết kế |
| Ngoại tuyến khi gửi | Vào hàng chờ (§6.3) |
| Lỗi khi gửi | Giữ nguyên nháp, hiện lỗi, có nút Thử lại |

---

## 9. Tương tác

| Thao tác | Kết quả |
|---|---|
| Nút Back cứng trong màn đếm | Lưu nháp rồi quay lại (**không hỏi** — nháp đã an toàn) |
| "Bỏ nháp" | Hộp thoại xác nhận nêu rõ mất bao nhiêu lô đã đếm |
| Quét QR | Nhảy tới hàng tương ứng, mở bàn phím số |
| Chạm số trong ô | Chọn toàn bộ để gõ đè |
| Giữ nút ± | Tăng/giảm nhanh sau 600 ms |

---

## 10. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Thanh tiến độ | `accessibilityValue={{ min: 0, max: 42, now: 18 }}`, nhãn "Đã đếm 18 trên 42 lô" |
| Hàng đếm | Nhãn gộp: "Nước uống đóng chai, lô L-0142, kệ A2-03, sổ ghi 120 chai" |
| `NumberStepper` | `accessibilityRole="adjustable"` |
| Phản hồi lệch | `accessibilityLiveRegion="polite"`: "Thiếu 3 cái so với sổ" |
| Ô lý do xuất hiện | Thông báo cho trình đọc màn hình rằng có trường mới cần điền |
| Dải lưu nháp | `accessibilityLiveRegion="polite"`, không đọc lại quá 1 lần/phút |

---

## 11. Danh mục kiểm tra

- [ ] Nhập số đếm chạy được khi ngoại tuyến
- [ ] Nháp tự lưu và **không bao giờ tự mất**
- [ ] Có dải hiện thời điểm lưu nháp gần nhất
- [ ] Thẻ nháp dở luôn đứng đầu danh sách
- [ ] Thanh tiến độ ghim, không cuộn mất
- [ ] Ô đếm điền sẵn số sổ, kèm công tắc "Đã đếm" riêng
- [ ] Phản hồi lệch/khớp hiện ngay khi số đổi
- [ ] Ô lý do chỉ hiện khi có lệch
- [ ] Chip lọc mặc định là "Chưa đếm"
- [ ] Quét QR nhảy tới đúng hàng
- [ ] Gửi thiếu lô có cảnh báo nhưng không chặn hẳn
- [ ] Có màn xem lại trước khi gửi
- [ ] Gửi ngoại tuyến vào hàng chờ, tự gửi khi có mạng, không tạo bản trùng
- [ ] Nút Back trong màn đếm không hỏi (nháp đã an toàn)
- [ ] Kỳ bị trả lại hiện lý do ngay trên thẻ
- [ ] Màn duyệt mặc định lọc "Lệch"
- [ ] Duyệt có hộp thoại nêu hệ quả với tồn kho
- [ ] Trả lại bắt buộc lý do tối thiểu 10 ký tự

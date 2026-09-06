# 12 · Màn Báo tình huống

**Câu hỏi màn này trả lời:** *Làm sao báo nhanh nhất cái tôi vừa thấy?*

**Vai dùng:** Phụ trách kho (kiêm trưởng thôn), Đội cứu hộ · **Tệp hiện tại:** `ReportScreen.tsx`

---

## 1. Bối cảnh

Đây là **điểm khởi đầu của toàn bộ vòng nghiệp vụ**: một câu nói của trưởng thôn — *"Thôn Long Châu ngập nặng, khoảng một trăm năm mươi người mắc kẹt, cần nước uống và áo phao gấp"* — biến thành phân tích, phương án, lệnh xuất kho.

Người dùng lúc này đang ở tình huống tệ nhất trong toàn ứng dụng: **vừa chứng kiến sự việc, đang vội, có thể đang sợ, tay ướt, và không muốn gõ chữ.**

Nên màn này có một mục tiêu duy nhất: **từ lúc mở app tới lúc gửi xong, ít bước nhất có thể.**

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│  Báo tình huống               ⬤  🔔      │
│  Trần Đình A · Thôn Long Châu            │
├──────────────────────────────────────────┤
│                                          │
│  Mô tả những gì bạn đang thấy.           │
│  Nói cũng được, không cần gõ.            │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Lũ quét tại thôn Long Châu, khoảng │  │  TextArea
│  │ 200 người mắc kẹt, cần nước sạch   │  │  cao 140 dp
│  │ và áo phao gấp.                    │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│           ╭──────────────╮               │
│           │      🎤      │               │  ← NÚT GHI ÂM
│           │  Giữ để nói  │               │    88 dp, canh giữa
│           ╰──────────────╯               │
│                                          │
│  Nhận dạng ngay trên máy chủ của xã,     │
│  không gửi ra ngoài.                     │
│                                          │
├──────────────────────────────────────────┤
│  [ Gửi báo cáo ]                         │  ← nút neo
├──────────────────────────────────────────┤
│  BÁO CÁO ĐÃ GỬI                     ↻    │
│  ┌────────────────────────────────────┐  │
│  │ Lũ quét tại thôn Long Châu...      │  │
│  │ 14:05 hôm nay · Đã tiếp nhận       │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  ⌂     ▤     ☑     ✎     🔔              │
└──────────────────────────────────────────┘
```

---

## 3. Nút ghi âm — phần tử quan trọng nhất

### 3.1. Kích thước và vị trí

**88 dp đường kính, canh giữa màn, ngay dưới ô nhập.** Đây là phần tử lớn nhất và dễ chạm nhất trong toàn ứng dụng.

Lý do: người dùng đang vội, có thể tay ướt hoặc run. Nút 88 dp chạm trúng được cả khi không nhìn kỹ.

### 3.2. Giữ để nói, thả để dừng

Không dùng kiểu bấm-bật rồi bấm-tắt. Người vội hay quên bấm lần hai, và một bản ghi 5 phút toàn tiếng gió là vô dụng.

```
Nghỉ        ╭──────────╮   nền primary-soft, biểu tượng primary
            │    🎤    │   "Giữ để nói"
            ╰──────────╯

Đang ghi    ╭──────────╮   nền critical, biểu tượng trắng
            │    ⏺  0:12│  vòng sóng âm lan ra theo âm lượng thật
            ╰──────────╯   "Thả để dừng"

Đang nhận   ╭──────────╮   nền attention
dạng        │    ◌     │   "Đang nhận dạng…"
            ╰──────────╯

Xong        chữ chèn vào ô nhập, nút về trạng thái nghỉ
```

**Vòng sóng âm phải phản ứng theo âm lượng thật của micro**, không phải hoạt ảnh lặp. Đây là cách duy nhất người dùng biết máy đang thực sự nghe được tiếng mình — trong môi trường ồn (mưa, nước chảy, gió) đó là câu hỏi thật.

### 3.3. Chữ nhận dạng được CHÈN vào ô, không gửi thẳng

Quy tắc tuyệt đối. Nhận dạng giọng nói có thể sai, và một con số sai trong mô tả tình huống lan thẳng vào phương án cấp phát.

Chữ nhận dạng nối vào cuối nội dung đang có (cho phép nói nhiều lần), con trỏ đặt ở cuối, và ô nhập cuộn tới đó để người dùng đọc lại ngay.

### 3.4. Khi ghi âm không dùng được

Ba trường hợp, ba cách xử lý khác nhau:

| Trường hợp | Cách xử lý |
|---|---|
| Chưa cấp quyền micro | Màn giải thích trước, rồi mới xin quyền (giống mẫu ở [08](08-QUET-MA-QR.md)) |
| Bị từ chối vĩnh viễn | Hướng dẫn mở Cài đặt + nút mở Cài đặt |
| Máy không hỗ trợ (Expo Web, iOS) | **Ẩn hẳn nút**, hiện dòng: *"Máy này chưa hỗ trợ ghi âm. Gõ mô tả vào ô trên."* |

Trường hợp thứ ba giữ đúng cách làm hiện tại: iOS chưa có recorder native nên rơi về nhập tay.

**Ngoại tuyến:** nhận dạng chạy trên máy chủ của xã nên cần kết nối. Khi ngoại tuyến, nút chuyển sang vô hiệu kèm lý do — *"Nhận dạng giọng nói cần kết nối tới máy chủ xã. Bạn vẫn gõ được mô tả."*

---

## 4. Ô mô tả

| Thuộc tính | Giá trị |
|---|---|
| Chiều cao | 140 dp, tự giãn tới 240 dp |
| Gợi ý | *"Ví dụ: Lũ quét tại thôn Long Châu, khoảng 200 người mắc kẹt, cần nước sạch và áo phao gấp."* |
| Tối thiểu | 10 ký tự để bật nút gửi |
| Tự lưu nháp | Sau 800 ms ngừng gõ |

Gợi ý mẫu quan trọng hơn vẻ ngoài của nó: nó dạy người dùng **cần nói những gì** — địa điểm, số người, nhu cầu. Giữ nguyên câu mẫu hiện có, nó đã đúng.

### 4.1. Gợi ý bổ sung khi mô tả thiếu ý

Sau khi ngừng gõ 1,5 giây, nếu mô tả thiếu một trong ba yếu tố chính, hiện chip gợi ý dưới ô nhập:

```
Có thể bổ sung:  ( Số người )  ( Địa điểm )  ( Cần gì gấp )
```

Chạm chip thì chèn một câu mở đầu vào ô (`"Khoảng ... người "`). Không bắt buộc, không chặn gửi — chỉ nhắc.

Nhận biết bằng biểu thức chính quy đơn giản ngay trên máy, không gọi AI: có chữ số đi kèm "người" hay chưa, có tên thôn hay chưa, có động từ nhu cầu hay chưa.

---

## 5. Gửi báo cáo

### 5.1. Nút gửi

`Button primary lg` neo đáy, trên danh sách lịch sử. Vô hiệu khi mô tả dưới 10 ký tự.

**Không có hộp thoại xác nhận.** Đây là hành động khẩn cấp và thêm một bước nữa là thêm vài giây ở đúng lúc không nên chậm. Báo nhầm còn sửa được; báo chậm thì không.

### 5.2. Sau khi gửi thành công

```
┌────────────────────────────────────┐
│  ✓  Đã gửi tới cơ quan điều phối   │
│                                    │
│  Quản trị xã sẽ phân tích và lập   │
│  phương án. Bạn sẽ nhận thông báo  │
│  khi có lệnh.                      │
│                                    │
│  [ Báo tình huống khác ]           │
└────────────────────────------------┘
```

Kèm rung `Success`. Ô nhập được xóa và nháp bị xóa.

Câu *"Bạn sẽ nhận thông báo khi có lệnh"* quan trọng: người vừa báo tình huống khẩn đang lo lắng và cần biết **chuyện gì xảy ra tiếp theo**. Không có câu này họ sẽ báo lại lần hai vì tưởng chưa gửi được.

### 5.3. Gửi thất bại

**Không xóa nội dung.** Hiện lỗi kèm nút Gửi lại, dùng đúng `requestId` cũ.

Khi ngoại tuyến:

```
┌────────────────────────────────────┐
│ ⚡ Chưa gửi được — đang ngoại tuyến │
│ Nội dung đã lưu trên máy.          │
│ Bấm gửi lại khi có sóng.           │
│ [ Gửi lại ]                        │
└────────────────────────────────────┘
```

Nội dung nằm trong nháp đã mã hóa. Khi có mạng trở lại, hiện nhắc — nhưng **không tự gửi**: người dùng cần đọc lại xem tình hình có còn đúng như lúc viết không.

---

## 6. Lịch sử báo cáo đã gửi

Phía dưới biểu mẫu. Đây là cách người dùng biết báo cáo của mình đã đi tới đâu.

```
┌────────────────────────────────────┐
│ Lũ quét tại thôn Long Châu, khoảng │  2 dòng
│ 200 người mắc kẹt...               │
│ 14:05 hôm nay        Đã tiếp nhận  │
└────────────────────────────────────┘
```

| Trạng thái | Nhãn | Màu |
|---|---|---|
| Vừa gửi | Đã gửi | `text-muted` |
| Xã đã xem | Đã tiếp nhận | `primary` |
| Đã lập phương án | Đã có phương án | `ready` |

Trạng thái "Đã có phương án" bấm được, mở thẳng chi tiết lệnh tương ứng. Đây là chỗ vòng nghiệp vụ khép lại với người báo — họ thấy việc mình báo đã thành hành động.

Chỉ hiện **5 báo cáo gần nhất**, kèm nút "Xem tất cả".

---

## 7. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Biểu mẫu trống | Nút gửi vô hiệu |
| Có nháp cũ | Khôi phục nội dung + dải *"Đã khôi phục nội dung chưa gửi lúc 09:15"* + nút Bỏ |
| Đang ghi âm | Nút đỏ, đồng hồ, sóng âm |
| Đang nhận dạng | Nút cam, ô nhập khóa tạm |
| Đang gửi | Nút "Đang gửi…", ô nhập khóa |
| Gửi xong | Thẻ thành công |
| Lịch sử đang tải | 2 khung xương |
| Lịch sử lỗi | Dòng lỗi nhỏ + nút Thử lại — **không chặn biểu mẫu** |

Điểm cuối quan trọng: lỗi tải lịch sử **không được cản việc gửi báo cáo mới**. Lịch sử là phần phụ.

---

## 8. Tương tác

| Thao tác | Kết quả |
|---|---|
| Giữ nút micro | Bắt đầu ghi |
| Thả | Dừng, nhận dạng, chèn chữ |
| Kéo ngón ra ngoài nút rồi thả | **Hủy bản ghi** — mẫu quen thuộc từ ứng dụng nhắn tin |
| Chạm chip gợi ý | Chèn câu mở đầu |
| `done` trên bàn phím | Đóng bàn phím (không gửi — mô tả nhiều dòng) |
| Chạm thẻ lịch sử | Mở chi tiết báo cáo |
| Nút Back cứng | Có nội dung chưa gửi thì hỏi trước |

Hủy bằng cách kéo ra ngoài là chi tiết đáng làm: người dùng lỡ bấm hoặc nói nhầm cần một đường thoát không phải xóa chữ thủ công.

---

## 9. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Nút micro | `accessibilityLabel="Ghi âm mô tả tình huống"`, `accessibilityHint="Giữ để nói, thả để dừng"` |
| Đang ghi | `accessibilityLiveRegion="polite"` báo mốc 10 giây một lần, không báo từng giây |
| Chữ nhận dạng xong | Thông báo: *"Đã nhận dạng, đã chèn vào ô mô tả. Đọc lại trước khi gửi."* |
| Ô mô tả | Nhãn rõ, gợi ý đọc được |
| Chip gợi ý | Nhãn: *"Bổ sung số người vào mô tả"* |
| Thẻ thành công | `accessibilityRole="alert"`, `accessibilityLiveRegion="assertive"` |
| Thẻ lịch sử | Nhãn gộp gồm trạng thái |

**Người dùng trình đọc màn hình phải gửi được báo cáo hoàn toàn bằng gõ**, không phụ thuộc ghi âm — vì cử chỉ giữ-nút xung đột với cử chỉ của trình đọc màn hình. Đảm bảo luồng gõ tay luôn đầy đủ.

---

## 10. Danh mục kiểm tra

- [ ] Nút ghi âm 88 dp, canh giữa, là phần tử lớn nhất màn
- [ ] Giữ để nói, thả để dừng — không phải bấm-bật-bấm-tắt
- [ ] Vòng sóng âm phản ứng theo âm lượng **thật**
- [ ] Kéo ra ngoài rồi thả thì hủy bản ghi
- [ ] Chữ nhận dạng **chèn vào ô để sửa**, không gửi thẳng
- [ ] Nói nhiều lần thì nối tiếp, không ghi đè
- [ ] Máy không hỗ trợ ghi âm thì ẩn nút và hướng dẫn gõ tay
- [ ] Ngoại tuyến: nút micro vô hiệu kèm lý do, ô gõ vẫn dùng được
- [ ] Ô mô tả có câu gợi ý mẫu dạy người dùng cần nói gì
- [ ] Chip gợi ý bổ sung ý còn thiếu, không chặn gửi
- [ ] **Không có hộp thoại xác nhận** trước khi gửi
- [ ] Thẻ thành công nói rõ chuyện gì xảy ra tiếp theo
- [ ] Gửi thất bại giữ nguyên nội dung, gửi lại dùng `requestId` cũ
- [ ] Ngoại tuyến lưu nháp nhưng **không tự gửi** khi có mạng lại
- [ ] Lịch sử hiện trạng thái, "Đã có phương án" mở được lệnh
- [ ] Lỗi tải lịch sử không cản việc gửi mới
- [ ] Gửi được hoàn toàn bằng gõ, không phụ thuộc ghi âm

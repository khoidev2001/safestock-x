# 01 · Thư viện thành phần

24 thành phần dùng chung. Mọi màn phải dựng từ những thứ trong tệp này — không tự viết biến thể mới.

Đây là lớp giải quyết đúng vấn đề đã nêu ở bản rà soát: bản web có **1.237 `className` viết tay và hơn 10 kiểu nút khác nhau**. Bản điện thoại phải không lặp lại chuyện đó.

Vị trí triển khai: `apps/mobile/components/`.

---

## Nhóm A — Nền tảng

### A1. `Button`

Nút hành động. Đây là thành phần được dùng nhiều nhất — làm đúng nó là làm đúng nửa giao diện.

| Biến thể | Nền | Chữ | Dùng cho |
|---|---|---|---|
| `primary` | `primary` | `text-inverse` | Hành động chính của màn. **Tối đa một nút primary hiển thị cùng lúc** |
| `secondary` | `surface` + viền `border` | `text` | Hành động phụ |
| `ghost` | trong suốt | `primary` | Hành động ít quan trọng, hủy |
| `danger` | `critical` | `text-inverse` | Thao tác không hoàn tác được |

| Cỡ | Cao | Đệm ngang | Cỡ chữ | Dùng cho |
|---|---:|---:|---:|---|
| `lg` | 52 | 20 | `body-strong` | Nút chính neo đáy màn |
| `md` | 48 | 16 | `body-strong` | Mặc định |
| `sm` | 40 | 12 | `label` | Trong thẻ, trong hàng |

Bo góc `radius-md` (12). Biểu tượng tùy chọn bên trái, cách chữ 8 dp.

**Năm trạng thái — tất cả đều bắt buộc:**

```
mặc định   nền đầy, chữ rõ
nhấn       độ mờ 0.85 + thu nhỏ 0.98, chuyển 120 ms
vô hiệu    độ mờ 0.4, không nhận chạm, accessibilityState.disabled
đang chạy  vòng xoay 18 dp thay biểu tượng + chữ đổi thành thể tiếp diễn
           ("Gửi báo cáo" → "Đang gửi…"), nút vẫn giữ nguyên bề rộng
thành công 700 ms hiện dấu ✓ rồi trở lại — chỉ dùng khi không rời màn
```

**Nút không được đổi bề rộng khi vào trạng thái đang chạy.** Nút co lại làm bố cục nhảy và người dùng chạm hụt.

**Nút vô hiệu luôn kèm lý do.** Đặt một dòng `caption` ngay dưới nút nói cần gì để mở khóa. Nút xám không lời giải thích là ngõ cụt.

### A2. `IconButton`

Nút chỉ có biểu tượng. Chỉ dùng cho: Đóng, Quay lại, Tải lại, Quét QR.

Vùng nhìn thấy 40×40, vùng chạm 48×48 bằng `hitSlop`. Bo `radius-full`. Bắt buộc có `accessibilityLabel`.

### A3. `TextField`

Trường nhập một dòng.

```
Nhãn                          ← label, text-muted, cách ô 8 dp
┌───────────────────────────┐
│ Giá trị đang nhập          │ ← cao 52, đệm ngang 16, radius-md
└───────────────────────────┘   nền surface-sunken, viền border
Chữ gợi ý hoặc lỗi            ← caption, cách ô 6 dp
```

| Trạng thái | Thể hiện |
|---|---|
| mặc định | viền `border` |
| đang nhập | viền `primary` 2 dp, nền `surface` |
| lỗi | viền `critical` 2 dp + chữ lỗi màu `critical` + `accessibilityState.invalid` |
| vô hiệu | nền `surface-sunken`, độ mờ 0.5 |

**Bắt buộc:**
- `keyboardType` đúng loại: `numeric` cho số lượng, `email-address` cho email
- `returnKeyType="next"` cho trường giữa chuỗi, `"done"` cho trường cuối; nhấn xong tự nhảy trường sau
- Trường số lượng có `selectTextOnFocus` — người dùng sửa số thì muốn thay cả, không muốn xóa từng chữ
- Chiều cao 52 dp (không phải 44) vì người dùng có thể đeo găng

### A4. `TextArea`

Nhiều dòng. Cao tối thiểu 96 dp, tự giãn tới 200 dp rồi cuộn trong. Có bộ đếm ký tự khi có giới hạn.

### A5. `NumberStepper`

Ô nhập số kèm hai nút − và +. **Dùng cho mọi trường số lượng trong nghiệp vụ kho.**

```
┌─────┐ ┌─────────────┐ ┌─────┐
│  −  │ │     120     │ │  +  │      mỗi nút 52×52
└─────┘ └─────────────┘ └─────┘
        đơn vị: chai
```

Lý do tồn tại: nhập số bằng bàn phím ảo khi tay ướt hoặc đeo găng là nguồn lỗi thật. Người dùng vẫn gõ thẳng vào ô giữa được, nhưng nút ± phục vụ trường hợp chỉnh một vài đơn vị.

Giữ nút để tăng nhanh: sau 600 ms thì lặp 8 lần/giây.

### A6. `Chip`

Nhãn nhỏ bấm được hoặc chỉ đọc. Cao 36, đệm ngang 12, `radius-sm`, chữ `label`.

Biến thể: `filter` (bấm được, có trạng thái chọn) · `status` (chỉ đọc, mang màu nghĩa) · `action` (bấm được, dùng trong thẻ vật tư).

### A7. `Badge`

Huy hiệu số trên biểu tượng tab và chuông. Đường kính tối thiểu 18, nền `critical`, chữ trắng 11 dp đậm. Trên 99 hiện `99+`.

---

## Nhóm B — Chứa nội dung

### B1. `Card`

Khối nội dung cơ bản. Nền `surface`, `radius-lg` (16), đệm 16, đổ bóng `shadow-card`. Ở chế độ tối bỏ bóng, dùng `surface-raised`.

Biến thể `pressable`: thêm phản hồi nhấn và mũi tên `chevron-right` bên phải.

### B2. `StatusCard`

Thẻ mang màu trạng thái — dùng cho những khối mà trạng thái là thông tin chính.

Cấu trúc: viền trái 4 dp màu trạng thái + nền `*-soft` + biểu tượng trạng thái + nội dung.

### B3. `Section`

Nhóm nội dung có tiêu đề.

```
TIÊU ĐỀ MỤC                    ( Xem tất cả )    ← overline + hành động tùy chọn
                                                    24 dp trên, 12 dp dưới
[ nội dung ]
```

### B4. `MetricTile`

Ô số liệu trong lưới 2 cột.

```
┌────────────────────┐
│ Mã vật tư          │  ← label, text-muted
│ 42                 │  ← number 32 dp, tabular-nums
│ 118 lô             │  ← caption, text-muted
└────────────────────┘
```

Có cờ `tone` (`neutral` / `attention` / `critical`) đổi màu con số. Khi `tone` khác `neutral`, thêm chấm màu 8 dp trước nhãn — để không phụ thuộc màu chữ.

### B5. `ProgressBar`

Thanh tiến độ ngang. Cao 8 dp, `radius-full`, rãnh `surface-sunken`, phần đầy mang màu nghĩa.

**Luôn kèm số bên cạnh hoặc bên dưới.** Thanh không có số thì người dùng phải ước lượng bằng mắt.

### B6. `ScoreRing`

Vòng tròn điểm cho chỉ số sẵn sàng. Đường kính 96, nét 10 dp, số ở giữa cỡ `display`.

Màu vòng theo trạng thái vận hành, **không theo điểm số** — vì điểm không được quyền ghi đè điểm chặn. Kho 95 điểm nhưng đang có điểm chặn thì vòng màu `critical`, không phải xanh lá.

### B7. `Timeline`

Dòng thời gian dọc cho lịch sử nhiệm vụ và cập nhật hiện trường. Cột trái 24 dp chứa chấm và đường nối; nội dung bên phải.

---

## Nhóm C — Thông tin nghiệp vụ

### C1. `BatchCard` — thẻ lô hàng

Thành phần dày đặc nhất của ứng dụng. Xem chi tiết ở [06-KHO-VAT-TU.md](06-KHO-VAT-TU.md).

### C2. `SupplyRow` — hàng vật tư trong lệnh

Ô biểu tượng nhóm + tên + thanh tiến độ cấp phát + số cấp/số cần. Xem [11-CHI-TIET-LENH.md](11-CHI-TIET-LENH.md).

### C3. `MissionCard` — thẻ lệnh

Xem [10-DANH-SACH-LENH.md](10-DANH-SACH-LENH.md).

### C4. `NotificationRow` — hàng thông báo

Xem [13-THONG-BAO.md](13-THONG-BAO.md).

### C5. `ConditionPill` — nhãn tình trạng lô

Bốn giá trị cố định, mỗi giá trị một màu **và** một biểu tượng:

| Giá trị | Nhãn | Màu | Biểu tượng |
|---|---|---|---|
| `NEW` | Mới | `ready` | `check-circle` |
| `USED` | Đã dùng | `text-muted` | `circle` |
| `NEEDS_CHECK` | Cần kiểm tra | `attention` | `help-circle` |
| `DAMAGED` | Hỏng | `critical` | `x-circle` |

### C6. `CirculationPill` — nhãn lưu hành

| Giá trị | Nhãn | Màu |
|---|---|---|
| `IN_STOCK` | Trong kho | `ready` |
| `ON_LOAN` | Đang cho mượn | `attention` |
| `ISSUED` | Đã xuất | `text-muted` |

**Hai nhãn này luôn hiện cùng nhau và không bao giờ gộp.** Đây là chỗ phần mềm kho thông thường hay đếm nhầm: một lô còn tốt nhưng đang cho mượn thì **không khả dụng**. Giao diện phải làm hai chiều đó nhìn thấy được.

---

## Nhóm D — Phản hồi và lớp phủ

### D1. `BottomSheet`

Phiếu trượt lên từ đáy. **Đây là cách trình bày mặc định cho mọi biểu mẫu thao tác kho** — thay cho `Modal` giữa màn của bản hiện tại.

```
                              ← nền tối 40%, chạm ra ngoài để đóng
┌─────────────────────────────┐
│         ▬▬▬▬                │ ← tay nắm 36×4, kéo xuống để đóng
│ Xuất kho                 ✕  │ ← tiêu đề + nút đóng
├─────────────────────────────┤
│ nội dung cuộn được          │
├─────────────────────────────┤
│ [ Xác nhận xuất kho     ]   │ ← nút neo, không cuộn theo
└─────────────────────────────┘
```

Lý do dùng phiếu đáy thay hộp thoại giữa màn: nút xác nhận rơi vào vùng dễ với, và bàn phím ảo đẩy phiếu lên tự nhiên thay vì che mất nút.

Bắt buộc: bẫy tiêu điểm khi mở, trả tiêu điểm về nút đã mở nó khi đóng, nút Back cứng đóng phiếu chứ không thoát màn.

### D2. `ConfirmDialog`

Hộp thoại xác nhận cho thao tác không hoàn tác được. Tiêu đề nêu **hậu quả**, không nêu hành động.

```
Sai:   "Bạn có chắc không?"
Đúng:  "Xuất 120 chai nước khỏi kho Long Châu?
        Thao tác này ghi vào sổ kho và không hoàn tác được."
```

Nút xác nhận dùng biến thể `danger` và đặt **bên phải**; nút hủy bên trái.

### D3. `Toast`

Thông báo ngắn ở đáy, trên thanh tab 16 dp. Hiện 3 giây (thành công) hoặc 5 giây (lỗi, kèm nút "Thử lại").

Ba loại: `success` (biểu tượng `check-circle`, nền `ready-soft`) · `error` (`alert-circle`, `critical-soft`) · `info` (`info`, `surface-raised`).

Dùng `accessibilityLiveRegion="polite"`.

### D4. `OfflineBanner`

Dải ngang cố định ngay dưới thanh tiêu đề khi ngoại tuyến. Xem [03-TRANG-THAI-CHUNG.md](03-TRANG-THAI-CHUNG.md).

### D5. `Skeleton`

Khối xám bo góc nhấp nháy nhẹ lúc đang tải. **Hình dạng phải giống nội dung sắp hiện ra** — skeleton của thẻ lô hàng phải trông như thẻ lô hàng.

Nhấp nháy 1200 ms; tắt khi hệ thống bật giảm chuyển động.

### D6. `EmptyState`

```
        ⃝           ← biểu tượng 32 dp trong vòng tròn 64 dp nền surface-sunken
   Chưa có lô hàng nào     ← subtitle
  Bấm Nhập kho để thêm     ← caption, text-muted
      lô đầu tiên
   [ Nhập kho ]            ← hành động gợi ý, tùy chọn
```

### D7. `ErrorState`

Trông **khác hẳn** `EmptyState`: biểu tượng `alert-circle` màu `critical`, và **luôn có nút Thử lại**.

---

## Nhóm E — Khung màn

### E1. `Screen`

Khung ngoài của mọi màn. Xử lý: vùng an toàn, màu nền, `StatusBar` theo chế độ sáng/tối, `KeyboardAvoidingView`.

### E2. `AppBar`

Thanh tiêu đề. Cao 56 + `insets.top`. Xem [02-KHUNG-UNG-DUNG-VA-DIEU-HUONG.md](02-KHUNG-UNG-DUNG-VA-DIEU-HUONG.md).

### E3. `TabBar`

Thanh tab đáy. Xem [02-KHUNG-UNG-DUNG-VA-DIEU-HUONG.md](02-KHUNG-UNG-DUNG-VA-DIEU-HUONG.md).

### E4. `StickyFooter`

Vùng neo đáy chứa nút hành động chính. Nền `surface`, viền trên `border`, đệm 16, cộng thêm `insets.bottom`.

**Khi bàn phím mở, vùng này bám lên trên bàn phím** — không bị che.

---

## Quy tắc dùng thư viện

1. **Không viết `StyleSheet` mới trong tệp màn hình** cho thứ đã có thành phần. Thiếu biến thể thì thêm vào thành phần, không tự dựng bên ngoài.
2. **Không dùng màu gốc trực tiếp.** Chỉ dùng token ngữ nghĩa.
3. **Không dùng số khoảng cách ngoài thang 4 dp.**
4. **Mọi thành phần nhận `testID`** để test tự động bám vào được.
5. **Mọi thành phần bấm được nhận `accessibilityLabel` bắt buộc** — khai kiểu TypeScript để quên là lỗi biên dịch, không phải lỗi lúc chạy.

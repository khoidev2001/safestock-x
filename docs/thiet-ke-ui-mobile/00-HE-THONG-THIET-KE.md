# 00 · Hệ thống thiết kế

Nguồn sự thật cho toàn bộ giao diện điện thoại. Mọi màn hình phải lấy giá trị từ đây, không tự đặt số.

Tệp triển khai tương ứng: `apps/mobile/theme/` (mới) — thay cho `apps/mobile/styles.ts` hiện tại.

---

## 1. Nền tảng kỹ thuật

| Hạng mục | Chọn | Lý do |
|---|---|---|
| Điều hướng | `expo-router` | Có lịch sử điều hướng, xử lý nút Back cứng của Android, hỗ trợ deep link cho thông báo đẩy |
| Vùng an toàn | `react-native-safe-area-context` | `SafeAreaView` của React Native **chỉ có tác dụng trên iOS**; trên Android dùng cử chỉ thì thanh tab dưới bị che |
| Biểu tượng | `@expo/vector-icons` — `Feather` là chính, `MaterialCommunityIcons` khi Feather thiếu glyph | Đã có sẵn trong Expo, không thêm tệp ảnh, không cần bản @2x/@3x, hiển thị giống nhau trên mọi máy |
| Kiểu chữ | Phông hệ thống (Roboto trên Android) | Không tải phông ngoài: thêm 300–500 KB và gây nhấp nháy chữ lúc mở app trên máy yếu |
| Hoạt ảnh | `react-native-reanimated` | Chạy trên luồng UI, không giật khi luồng JS bận tải dữ liệu |

**Không dùng:** thư viện UI dựng sẵn (NativeBase, Tamagui, gluestack). Bộ màn hình này chỉ có 11 màn với yêu cầu rất riêng; một thư viện tổng quát sẽ mang theo phong cách của nó và phải chống lại nó ở mọi màn.

---

## 2. Bảng màu

Giữ nhận diện xanh dương – cam của bản hiện tại, nhưng dựng thành thang đầy đủ và bổ sung chế độ tối.

### 2.1. Thang màu gốc

```
Xanh dương (thương hiệu, hành động chính)
  blue-50   #EFF6FF      blue-500  #2563EB
  blue-100  #DBEAFE      blue-600  #0B5FC6   ← màu thương hiệu hiện tại
  blue-200  #BFDBFE      blue-700  #1D4ED8
  blue-300  #93C5FD      blue-800  #1E40AF
  blue-400  #60A5FA      blue-900  #1E3A8A

Xanh lá (sẵn sàng, đã xong)          Cam (cần chú ý, đang chờ)
  green-50   #ECFDF5                  amber-50   #FFF7ED
  green-100  #D1FAE5                  amber-100  #FFEDD5
  green-500  #16A34A                  amber-500  #EA7A12   ← hiện tại
  green-600  #15803D  ← hiện tại      amber-600  #C2410C
  green-700  #166534                  amber-700  #9A3412

Đỏ (nguy hiểm, chặn)                 Xám trung tính (nền, chữ, viền)
  red-50   #FEF2F2                     gray-0    #FFFFFF
  red-100  #FEE2E2                     gray-50   #F6F9FC
  red-500  #DC2626  ← hiện tại         gray-100  #EEF3F8   ← surfaceAlt hiện tại
  red-600  #B91C1C                     gray-200  #D9E2EC   ← border hiện tại
  red-700  #991B1B                     gray-400  #9AA8B8
                                       gray-500  #62748A   ← muted hiện tại
                                       gray-700  #334E68
                                       gray-900  #102A43   ← text hiện tại
```

### 2.2. Token ngữ nghĩa

**Luôn dùng token, không bao giờ dùng thẳng màu gốc trong màn hình.** Đây là điều kiện để chế độ tối chạy được mà không phải sửa từng màn.

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `bg` | `gray-50` #F6F9FC | #0B1220 | Nền màn hình |
| `surface` | #FFFFFF | #131C2B | Nền thẻ, nền phiếu |
| `surface-raised` | #FFFFFF | #1B2637 | Thẻ nổi trên thẻ (phiếu trong danh sách) |
| `surface-sunken` | `gray-100` #EEF3F8 | #0A101B | Nền vùng lõm (thanh tìm kiếm, ô nhập) |
| `border` | `gray-200` #D9E2EC | #263449 | Viền mặc định |
| `border-strong` | `gray-400` #9AA8B8 | #3A4B63 | Viền ô nhập đang chọn |
| `text` | `gray-900` #102A43 | #E8EEF6 | Chữ chính |
| `text-muted` | `gray-500` #62748A | #93A3B8 | Chữ phụ, nhãn |
| `text-inverse` | #FFFFFF | #0B1220 | Chữ trên nền đặc |
| `primary` | `blue-600` #0B5FC6 | #4D93F0 | Hành động chính, tab đang chọn |
| `primary-soft` | `blue-50` #EFF6FF | #16273F | Nền nhấn nhẹ của primary |
| `ready` | `green-600` #15803D | #3DBE6B | Sẵn sàng, đã xong, đủ hàng |
| `ready-soft` | `green-50` #ECFDF5 | #10261A | Nền trạng thái sẵn sàng |
| `attention` | `amber-600` #C2410C | #F0A05A | Cần xử lý, đang chờ, gần hạn |
| `attention-soft` | `amber-50` #FFF7ED | #2A1B0E | Nền trạng thái cần xử lý |
| `critical` | `red-500` #DC2626 | #F2696B | Nguy hiểm, chặn điều phối, hỏng |
| `critical-soft` | `red-50` #FEF2F2 | #2B1315 | Nền trạng thái nguy hiểm |
| `offline` | `amber-600` #C2410C | #F0A05A | Dải báo ngoại tuyến |

**Kiểm tra tương phản — bắt buộc trước khi chốt màu.** Mọi cặp chữ/nền phải đạt tối thiểu **4.5:1** (chữ thường) và **3:1** (chữ ≥ 24 dp hoặc ≥ 19 dp đậm). Điều kiện làm việc là nắng gắt ngoài sân kho, nên đây là ngưỡng sàn chứ không phải mục tiêu.

Ba cặp cần kiểm kỹ vì hay trượt:
- `text-muted` trên `surface-sunken`
- `attention` trên `attention-soft`
- Chữ trắng trên `attention` (#C2410C đạt 4.6:1 — đủ, nhưng #EA7A12 của bản hiện tại **chỉ đạt 2.9:1 và không đạt**, đây là lý do đổi sang sắc đậm hơn cho vai trò chữ)

### 2.3. Màu theo nghĩa

Bảng này là bắt buộc. Không dùng màu ngoài đúng nghĩa của nó.

| Màu | Nghĩa duy nhất | Ví dụ đúng | Ví dụ sai |
|---|---|---|---|
| Xanh dương `primary` | Hành động người dùng thực hiện | Nút "Gửi báo cáo", tab đang chọn | Tô cho trạng thái "tốt" |
| Xanh lá `ready` | Đã hoàn tất, đủ, sẵn sàng | Trạng thái "Sẵn sàng điều phối", lô hàng còn tốt | Nút bấm |
| Cam `attention` | Đang chờ người xử lý | "Kho đang chuẩn bị", lô gần hạn, dải ngoại tuyến | Lỗi hệ thống |
| Đỏ `critical` | Nguy hiểm hoặc đang chặn | "Chưa thể điều phối", lô hỏng, sự cố mở | Nút xóa thông thường |

**Màu không bao giờ là tín hiệu duy nhất.** Mỗi trạng thái phải có thêm **chữ** và **hình dạng/biểu tượng**. Khoảng 8% nam giới bị rối loạn phân biệt màu đỏ – xanh lá, và đây là hai màu mang nghĩa đối lập nhau trong ứng dụng này.

### 2.4. Màu nhóm vật tư — giữ nguyên

Bảng màu nhóm vật tư trong `apps/mobile/supplies.ts` đã được thiết kế có chủ đích (bảy nhóm chức năng, màu để mắt gom nhóm nhanh). **Giữ nguyên**, chỉ thay biểu tượng emoji bằng biểu tượng vector.

| Nhóm | Màu nền ô | Biểu tượng Feather / MCI |
|---|---|---|
| Nước uống | #0E7490 | `mci:water` |
| Lương thực | #B45309 | `mci:rice` |
| Cứu hộ | #C2410C | `mci:lifebuoy` |
| Y tế | #B91C1C | `mci:medical-bag` |
| Trú ẩn | #15803D | `mci:tent` |
| Thiết bị | #4338CA | `feather:tool` |
| Vệ sinh | #0F766E | `mci:hand-wash` |

Ô biểu tượng: 44×44 dp, bo góc 12 dp, biểu tượng 22 dp màu trắng ở giữa.

---

## 3. Kiểu chữ

Phông: `Roboto` (mặc định Android). Trọng lượng dùng: 400 (thường), 600 (đậm vừa), 700 (đậm).

| Vai trò | Cỡ | Dòng | Trọng lượng | Giãn chữ | Dùng cho |
|---|---:|---:|---:|---:|---|
| `display` | 40 | 44 | 700 | −0.5 | Điểm sẵn sàng, số người gặp nạn |
| `title-lg` | 24 | 30 | 700 | −0.2 | Tiêu đề màn hình |
| `title` | 20 | 26 | 700 | −0.2 | Tiêu đề thẻ lớn |
| `subtitle` | 17 | 24 | 600 | 0 | Tiêu đề mục, tên vật tư |
| `body` | 16 | 24 | 400 | 0 | Chữ nội dung mặc định |
| `body-strong` | 16 | 24 | 600 | 0 | Chữ nội dung cần nhấn |
| `label` | 14 | 20 | 600 | 0 | Nhãn trường nhập, nhãn chip |
| `caption` | 13 | 18 | 400 | 0 | Chữ phụ, mốc thời gian |
| `overline` | 12 | 16 | 700 | +0.8 | Nhãn nhóm viết hoa ("TRẠNG THÁI TOÀN KHO") |
| `number` | thay đổi | — | 700 | −0.5 | Số liệu — dùng `fontVariant: ['tabular-nums']` |

**Cỡ chữ nhỏ nhất trong toàn ứng dụng là 13 dp.** Bản hiện tại có chỗ dùng 12 dp cho dải ngoại tuyến — nâng lên 13 và tăng độ đậm.

**Số liệu phải dùng chữ số đều bề ngang** (`fontVariant: ['tabular-nums']`). Không có nó, con số nhảy ngang khi cập nhật theo thời gian thực và bảng số trông rung.

**Hỗ trợ cỡ chữ hệ thống.** Người dùng lớn tuổi thường đặt cỡ chữ hệ thống lớn. Mọi bố cục phải chịu được `fontScale` tới **1.3×** mà không cắt chữ và không vỡ khung. Chặn trên ở 1.3 bằng `maxFontSizeMultiplier` cho các nhãn trong thanh tab và huy hiệu — quá mức đó thì thanh tab vỡ.

---

## 4. Khoảng cách và bố cục

Lưới 4 dp. Chỉ dùng các giá trị trong thang này.

```
space-1   4      space-5   20
space-2   8      space-6   24
space-3   12     space-8   32
space-4   16     space-10  40
```

| Quy tắc | Giá trị |
|---|---|
| Lề ngang màn hình | 16 dp |
| Khoảng giữa hai thẻ trong danh sách | 12 dp |
| Đệm trong thẻ | 16 dp |
| Khoảng giữa nhãn và trường nhập | 8 dp |
| Khoảng giữa hai nhóm nội dung | 24 dp |
| Khoảng trước tiêu đề mục | 24 dp trên, 12 dp dưới |
| Đáy vùng cuộn | 24 dp + chiều cao vùng an toàn dưới |

**Bo góc:**

```
radius-sm   8    chip, huy hiệu, ô biểu tượng nhỏ
radius-md   12   nút, trường nhập, ô biểu tượng vật tư
radius-lg   16   thẻ
radius-xl   20   phiếu trượt lên từ đáy (mép trên)
radius-full 999  chấm trạng thái, nút tròn
```

**Đổ bóng:** dùng rất tiết chế. Ở chế độ tối, thay đổ bóng bằng đổi màu nền (`surface-raised`) vì bóng gần như vô hình trên nền tối.

```
shadow-card   y2  blur 8   #102A43 ở 6%    thẻ thường
shadow-sheet  y-4 blur 24  #102A43 ở 16%   phiếu trượt lên, hộp thoại
shadow-fab    y4  blur 12  #102A43 ở 20%   nút nổi
```

---

## 5. Vùng chạm và vùng ngón cái

**Vùng chạm tối thiểu 48×48 dp** cho mọi phần tử bấm được, kể cả khi phần nhìn thấy nhỏ hơn — mở rộng bằng `hitSlop`.

Bản đồ vùng với tay trên màn 360×800 dp:

```
┌─────────────────────────────┐  0
│   KHÓ VỚI                   │     Chỉ đặt: tiêu đề, chữ chỉ đọc,
│   (0–200 dp)                │     nút phụ ít dùng
├─────────────────────────────┤  200
│                             │
│   VỪA TẦM                   │     Nội dung cuộn, danh sách
│   (200–520 dp)              │
│                             │
├─────────────────────────────┤  520
│   DỄ VỚI                    │     ★ Mọi hành động chính đặt ở đây
│   (520–730 dp)              │     Nút gửi, nút xác nhận, thanh tab
├─────────────────────────────┤  730
│   vùng an toàn dưới          │     Không đặt gì bấm được
└─────────────────────────────┘  800
```

Hệ quả bắt buộc:

- **Nút hành động chính của mỗi màn neo ở đáy**, không nằm cuối danh sách cuộn. Người dùng không phải cuộn tới cuối mới bấm được nút gửi.
- **Nút Đăng xuất không đặt ở góc trên phải.** Bản hiện tại đặt ở đó — vừa khó với, vừa nguy hiểm vì nằm cạnh vùng hay chạm nhầm. Chuyển vào màn Hồ sơ.
- Thanh tab luôn cách mép dưới bằng `insets.bottom` để không bị thanh cử chỉ Android chồng lên.

---

## 6. Biểu tượng

Bộ: `Feather` (nét 2 dp, tròn đầu) cho toàn bộ giao diện chung. Dùng `MaterialCommunityIcons` chỉ khi Feather không có glyph phù hợp — và khi đó chọn glyph có nét tương đương để không lệch phong cách.

| Cỡ | Dùng cho |
|---:|---|
| 16 | Biểu tượng trong chữ, mũi tên chip |
| 20 | Biểu tượng trong nút, đầu dòng danh sách |
| 24 | Biểu tượng thanh tab, nút biểu tượng trên thanh tiêu đề |
| 32 | Biểu tượng trong trạng thái trống |
| 44 | Ô biểu tượng nhóm vật tư |

**Danh mục biểu tượng chuẩn — dùng đúng, không tự chọn cái khác:**

| Ý nghĩa | Biểu tượng | Ý nghĩa | Biểu tượng |
|---|---|---|---|
| Tổng quan | `feather:home` | Nhập kho | `feather:download` |
| Kho vật tư | `feather:package` | Xuất kho | `feather:upload` |
| Kiểm kê | `feather:clipboard` | Chuyển kho/kệ | `feather:corner-up-right` |
| Lệnh | `feather:navigation` | Điều chỉnh | `feather:edit-3` |
| Báo cáo | `feather:edit` | Báo tình trạng | `feather:alert-triangle` |
| Thông báo | `feather:bell` | Mượn vật tư | `feather:share-2` |
| Hồ sơ | `feather:user` | Hoàn trả | `feather:rotate-ccw` |
| Quét QR | `feather:maximize` | Mã QR | `mci:qrcode` |
| Tìm kiếm | `feather:search` | Ngoại tuyến | `feather:wifi-off` |
| Ghi âm | `feather:mic` | Đã kết nối | `feather:wifi` |
| Quay lại | `feather:chevron-left` | Tải lại | `feather:refresh-cw` |
| Đóng | `feather:x` | Thành công | `feather:check-circle` |
| Lỗi | `feather:alert-circle` | Vị trí | `feather:map-pin` |

**Biểu tượng không bao giờ đứng một mình cho hành động chính.** Luôn kèm nhãn chữ. Ngoại lệ duy nhất: nút Đóng (`x`) và Quay lại (`chevron-left`) — hai quy ước này người dùng Android đã quen.

---

## 7. Chuyển động

Chuyển động ở đây phục vụ **định hướng**, không phải trang trí. Người đang vội không có thời gian chờ hoạt ảnh.

| Loại | Thời lượng | Đường cong |
|---|---:|---|
| Đổi trạng thái tại chỗ (nút nhấn, chip chọn) | 120 ms | `ease-out` |
| Hiện/ẩn phần tử | 180 ms | `ease-out` |
| Phiếu trượt lên từ đáy | 240 ms | `ease-out` |
| Chuyển màn (đẩy ngang) | 250 ms | mặc định của `expo-router` |

**Không có hoạt ảnh nào vượt quá 300 ms.**

**Tôn trọng cài đặt giảm chuyển động.** Khi hệ thống bật "Giảm hoạt ảnh", thay mọi chuyển cảnh bằng hiện/ẩn tức thì. Đọc bằng `AccessibilityInfo.isReduceMotionEnabled()`.

**Phản hồi rung (haptics):** dùng đúng ba chỗ, không hơn.

| Sự kiện | Loại rung |
|---|---|
| Quét QR nhận diện thành công | `ImpactFeedbackStyle.Medium` |
| Thao tác ghi thành công (nhập/xuất/gửi báo cáo) | `NotificationFeedbackType.Success` |
| Thao tác ghi thất bại | `NotificationFeedbackType.Error` |

---

## 8. Trợ năng

Đây là phần **không được cắt** khi vẽ lại. Bản hiện tại đã có `accessibilityLabel` và `accessibilityRole` ở nhiều chỗ — mức đó là sàn, không phải trần.

| Yêu cầu | Chi tiết |
|---|---|
| Nhãn cho trình đọc màn hình | Mọi phần tử bấm được có `accessibilityLabel` mô tả **hành động**, không mô tả hình dạng. Đúng: "Xuất kho lô ÁO PHAO L01". Sai: "nút mũi tên lên" |
| Vai trò | `accessibilityRole` đúng loại: `button`, `link`, `header`, `alert`, `checkbox` |
| Trạng thái | `accessibilityState={{ disabled, selected, busy }}` cho nút và tab |
| Thông báo động | Dải ngoại tuyến, thông báo thành công/lỗi dùng `accessibilityLiveRegion="polite"`; lỗi chặn dùng `"assertive"` |
| Nhóm | Thẻ vật tư dùng `accessible={true}` ở cấp thẻ để trình đọc đọc trọn thẻ thay vì đọc rời từng mẩu chữ |
| Cỡ chữ | Chịu được `fontScale` 1.3× (xem §3) |
| Tương phản | 4.5:1 chữ thường, 3:1 chữ lớn (xem §2.2) |
| Thứ tự tiêu điểm | Theo thứ tự đọc tự nhiên trên xuống; phiếu trượt lên phải bẫy tiêu điểm và trả về đúng chỗ khi đóng |

---

## 9. Viết chữ trong giao diện

Giọng văn: **rõ, ngắn, dùng từ nghiệp vụ của người dùng**. Không dùng từ phần mềm.

| Dùng | Không dùng |
|---|---|
| "Lô hàng" | "Batch", "bản ghi" |
| "Kho thôn Long Châu" | "Warehouse ID W-07" |
| "Chưa lấy được dữ liệu" | "Lỗi 500", "Request failed" |
| "Cần nhập lý do" | "Trường bắt buộc" |
| "Đang dùng số liệu lưu lúc 14:20" | "Cached data" |

**Quy tắc thông báo lỗi:** mỗi thông báo lỗi phải nói được **chuyện gì xảy ra** và **người dùng làm gì tiếp**. Một câu, không có mã lỗi kỹ thuật.

```
Sai:   "Network request failed"
Sai:   "Đã xảy ra lỗi"
Đúng:  "Chưa kết nối được máy chủ xã. Kiểm tra Wi-Fi rồi thử lại."
```

**Số và đơn vị:** luôn kèm đơn vị, luôn cách một khoảng trắng. `120 chai`, không phải `120chai`. Số lớn dùng dấu chấm phân nhóm nghìn theo quy ước tiếng Việt: `12.500`.

**Thời gian:** dùng thời gian tương đối cho việc mới (`3 phút trước`), thời gian tuyệt đối cho việc cũ hơn 24 giờ (`14:20 · 30/08`). Mốc dữ liệu ngoại tuyến **luôn dùng tuyệt đối** — người dùng cần biết chính xác số liệu cũ tới đâu.

---

## 10. Chế độ tối

Không phải tùy chọn trang trí. Phòng trực xã lúc bão thường tắt bớt đèn, và màn hình trắng toát 400 nit vào mắt lúc 2 giờ sáng là vấn đề vận hành thật.

| Quy tắc | Chi tiết |
|---|---|
| Cách bật | Theo cài đặt hệ thống (`useColorScheme`), kèm ghi đè thủ công trong màn Hồ sơ: Tự động / Sáng / Tối |
| Nền | Không dùng đen tuyền `#000000`. Dùng `#0B1220` — xanh đen, giảm chói và giữ được cảm giác chiều sâu |
| Phân tầng | Nền càng cao càng sáng: `bg` → `surface` → `surface-raised`. Không dùng đổ bóng để phân tầng |
| Màu trạng thái | Sáng hơn và bớt bão hòa so với bản sáng — màu bão hòa cao trên nền tối gây quầng nhòe |
| Ảnh và logo | Logo thương hiệu cần bản cho nền tối. Không đảo màu tự động |
| Bản đồ, ảnh chụp | Giữ nguyên, không làm tối — làm tối ảnh khiến người dùng đánh giá sai hiện trường |

---

## 11. Danh mục kiểm tra trước khi chốt một màn

Áp cho mọi màn trong bộ tài liệu này.

- [ ] Màn trả lời đúng **một** câu hỏi; thứ không phục vụ câu hỏi đó đã bị đẩy xuống hoặc bỏ
- [ ] Hành động chính nằm trong vùng dễ với (nửa dưới), vùng chạm ≥ 48 dp
- [ ] Có đủ **năm** trạng thái: đang tải · có dữ liệu · trống · lỗi · ngoại tuyến
- [ ] Trạng thái trống và trạng thái lỗi **trông khác nhau rõ rệt**
- [ ] Mọi màu mang nghĩa đều kèm chữ và biểu tượng
- [ ] Mọi chữ đạt tương phản 4.5:1 ở **cả** chế độ sáng và tối
- [ ] Bố cục không vỡ ở `fontScale` 1.3× và ở màn rộng 320 dp
- [ ] Mọi phần tử bấm được có `accessibilityLabel` mô tả hành động
- [ ] Nút Back cứng của Android làm đúng việc mong đợi
- [ ] Thanh tab và nút đáy không bị thanh cử chỉ Android che
- [ ] Chữ trong giao diện dùng từ nghiệp vụ, không dùng từ phần mềm
- [ ] Thao tác ghi có xác nhận trước và phản hồi sau

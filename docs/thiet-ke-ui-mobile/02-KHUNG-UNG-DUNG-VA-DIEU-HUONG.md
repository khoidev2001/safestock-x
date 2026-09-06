# 02 · Khung ứng dụng và điều hướng

Bộ khung chung bao quanh mọi màn: thanh tiêu đề, thanh tab, vùng an toàn, nút Back, và cách chuyển màn.

---

## 1. Sơ đồ điều hướng theo vai

Ứng dụng có **ba giao diện khác nhau**, chọn theo vai lúc đăng nhập. Không có màn nào dùng chung cho cả ba.

### 1.1. Phụ trách kho (kiêm trưởng thôn) — 5 tab

Vai dùng ứng dụng nhiều nhất.

```
Đăng nhập
   └── Khung tab
        ├── Tổng quan      (home)         ← mở đầu sau đăng nhập
        ├── Kho            (inventory)
        │    ├── Quét QR                  (toàn màn)
        │    ├── Phiếu thao tác kho       (phiếu đáy ×7)
        │    └── Chi tiết lô              (phiếu đáy)
        ├── Kiểm kê        (stocktake)
        │    └── Chi tiết kỳ báo cáo      (đẩy ngang)
        ├── Báo cáo        (report)
        │    └── Chi tiết báo cáo đã gửi  (đẩy ngang)
        └── Thông báo      (alerts)
             └── Chi tiết lệnh            (đẩy ngang)

   Ngoài tab: Hồ sơ và cài đặt (mở từ ảnh đại diện trên thanh tiêu đề)
```

**Thay đổi so với bản hiện tại:** gộp hai tab `home` và `readiness` thành một. Cả hai đang render từ cùng một component chỉ khác tham số `view` — người dùng thấy hai tab nhưng thực chất là một màn hình. Sau khi gộp còn 5 tab, đúng giới hạn thiết kế của thanh tab.

### 1.2. Đội cứu hộ — 3 tab

```
Đăng nhập
   └── Khung tab
        ├── Lệnh           (missions)     ← mở đầu sau đăng nhập
        │    └── Chi tiết lệnh            (đẩy ngang)
        ├── Báo cáo        (report)
        └── Thông báo      (alerts)
```

Không có nghiệp vụ kho. Đây là chủ ý: họ xem xét tình hình rồi gửi yêu cầu; việc đối chiếu tồn và quyết định cho mượn là của người giữ kho.

### 1.3. Quản trị xã — không có thanh tab

Quản trị xã làm việc trên web. Khi cầm điện thoại, họ chỉ quét QR để nhập/xuất ngay tại kệ.

```
Đăng nhập
   └── Kho vật tư (màn đơn, không có thanh tab)
        ├── Quét QR
        └── Phiếu Nhập kho / Xuất kho (chỉ hai thao tác này)
```

**Thay đổi so với bản hiện tại:** bỏ thanh tab. Bản hiện tại vẽ một thanh tab có đúng một mục — vừa chiếm 64 dp chiều cao vô ích, vừa gợi sai rằng còn tab khác.

---

## 2. Thanh tiêu đề (`AppBar`)

Cao **56 dp + `insets.top`**. Nền `surface`, viền dưới 1 dp `border`.

### 2.1. Biến thể gốc — dùng cho màn cấp tab

```
┌──────────────────────────────────────────┐
│  Tổng quan                    ⬤  🔔³     │
│  Kho thôn Long Châu                      │
└──────────────────────────────────────────┘
   ↑ title-lg + caption          ↑ ảnh đại diện + chuông
```

- **Trái:** tiêu đề màn (`title-lg`) và dòng phụ (`caption`) — dòng phụ là **tên kho đang xem**, không phải tên người dùng. Tên kho là thông tin người dùng cần liếc thấy liên tục; tên mình thì họ đã biết.
- **Phải:** ảnh đại diện 32 dp (mở Hồ sơ) và chuông thông báo có huy hiệu.

Cả hai dòng chữ dùng `numberOfLines={1}` và khối chữ có `flex: 1, minWidth: 0`. Bản hiện tại đã ghi nhận đúng lỗi này trong chú thích: thiếu `minWidth: 0` thì cột trái giãn theo dòng chữ dài nhất và đè lên phần bên phải — và chỉ tài khoản có tên vai dài ("Đội cứu hộ") mới lộ lỗi, nên dễ lọt lúc thử.

### 2.2. Biến thể màn con — có nút quay lại

```
┌──────────────────────────────────────────┐
│  ‹   Chi tiết lệnh                  ↻    │
└──────────────────────────────────────────┘
```

Nút `‹` vùng chạm 48×48, `accessibilityLabel="Quay lại"`.

### 2.3. Nút Đăng xuất — chuyển vị trí

Bản hiện tại đặt Đăng xuất ở góc trên phải của nhiều màn. **Bỏ khỏi mọi thanh tiêu đề**, chuyển vào màn Hồ sơ.

Hai lý do: góc trên phải là vùng khó với nhất trên màn hình lớn, và đó lại là chỗ ngón tay hay quét qua khi cầm máy — đặt một thao tác phá phiên làm việc ở đó là mời gọi tai nạn.

---

## 3. Thanh tab (`TabBar`)

Cao **64 dp + `insets.bottom`**. Nền `surface`, viền trên 1 dp `border`.

```
┌──────────────────────────────────────────┐
│   ⌂        ▤        ☑       ✎      🔔    │   biểu tượng 24 dp
│ Tổng quan  Kho   Kiểm kê Báo cáo Thông báo│   nhãn 12 dp, 1 dòng
└──────────────────────────────────────────┘
     ▔▔▔▔                                       gạch chỉ báo 3 dp
├────── insets.bottom ─────────────────────┤
```

| Quy tắc | Chi tiết |
|---|---|
| Biểu tượng | Vector từ `Feather` — **không dùng ký tự Unicode**. Xem lý do ở [00](00-HE-THONG-THIET-KE.md#6-biểu-tượng) |
| Tab đang chọn | Biểu tượng và nhãn màu `primary`, biểu tượng dùng bản đặc, thêm gạch chỉ báo 3 dp phía trên |
| Tab không chọn | Biểu tượng và nhãn màu `text-muted`, biểu tượng bản nét |
| Nhãn | **Luôn hiện**, không ẩn khi không chọn. Người dùng không rành công nghệ đọc nhãn, không đọc hình |
| Huy hiệu | Trên tab Thông báo, góc trên phải biểu tượng |
| Vùng chạm | Toàn bộ chiều cao 64 dp × bề rộng ô |
| Cỡ chữ | `maxFontSizeMultiplier={1.2}` — quá mức này thì nhãn 5 tab vỡ hàng |
| Vùng an toàn | Cộng `insets.bottom`, nếu không thanh cử chỉ Android che mất |

**Không dùng màu riêng cho từng tab.** Bản hiện tại gán mỗi tab một màu (`home` xanh dương, `missions` cam, `alerts` đỏ...). Cách này làm hỏng quy ước màu theo nghĩa: tab Thông báo màu đỏ khiến người dùng tưởng đang có nguy hiểm ngay cả khi không có gì. Màu chỉ dùng để phân biệt **đang chọn / không chọn**.

---

## 4. Nút Back cứng của Android

Đây là lỗi rõ nhất của bản hiện tại: chuyển tab bằng `useState`, không có `BackHandler` ở đâu, nên **nút Back thoát thẳng app** ở mọi màn.

Hành vi đúng, theo thứ tự ưu tiên:

| Tình huống | Nút Back làm gì |
|---|---|
| Đang mở phiếu đáy hoặc hộp thoại | Đóng phiếu/hộp thoại |
| Đang mở màn quét QR | Đóng màn quét |
| Đang ở màn con (chi tiết lệnh, chi tiết báo cáo) | Quay về màn cha |
| Đang ở tab không phải tab gốc | Về tab gốc của vai (Tổng quan / Lệnh / Kho) |
| Đang ở tab gốc | Hiện hỏi "Thoát ứng dụng?" — **không thoát ngay** |
| Đang ở màn đăng nhập | Thoát ứng dụng |

**Trường hợp đặc biệt — biểu mẫu dở dang.** Nếu người dùng đã nhập liệu mà chưa gửi, nút Back hiện hỏi trước:

> **Bỏ nội dung đang nhập?**
> Báo cáo chưa gửi sẽ mất.
> `[ Ở lại ]` `[ Bỏ ]`

Áp cho: biểu mẫu báo tình huống, phiếu thao tác kho, và bản nháp kiểm kê tháng.

---

## 5. Chuyển màn

| Kiểu | Dùng cho | Hiệu ứng |
|---|---|---|
| Chuyển tab | Giữa 5 tab | Đổi tức thì, không hoạt ảnh trượt. Trượt ngang giữa tab gây cảm giác lạc chỗ |
| Đẩy ngang | Vào màn con | Trượt từ phải sang, 250 ms |
| Phiếu đáy | Biểu mẫu thao tác | Trượt lên từ đáy, 240 ms |
| Toàn màn | Quét QR | Mờ dần, 180 ms |

**Giữ vị trí cuộn khi quay lại.** Người dùng cuộn xuống lô thứ 40, mở phiếu xuất kho, đóng lại — phải thấy đúng lô thứ 40, không phải nhảy về đầu danh sách.

---

## 6. Vùng an toàn

Dùng `react-native-safe-area-context`, **không dùng `SafeAreaView` của React Native** (chỉ có tác dụng trên iOS) và không tự tính chiều cao thanh trạng thái như bản hiện tại đang làm.

```
┌──────────────────────────────┐
│░░░ insets.top ░░░░░░░░░░░░░░░│  thanh trạng thái — AppBar cộng vào đệm trên
├──────────────────────────────┤
│  AppBar                      │
├──────────────────────────────┤
│                              │
│  nội dung cuộn               │  đệm đáy = 24 + chiều cao TabBar
│                              │
├──────────────────────────────┤
│  TabBar                      │
├──────────────────────────────┤
│░░░ insets.bottom ░░░░░░░░░░░░│  thanh cử chỉ — TabBar cộng vào đệm dưới
└──────────────────────────────┘
```

**Ba máy phải kiểm tra trước khi chốt:** một máy có tai thỏ, một máy dùng điều hướng ba nút, một máy dùng điều hướng cử chỉ. Ba máy này cho ba giá trị `insets` khác hẳn nhau.

---

## 7. Bàn phím

| Quy tắc | Chi tiết |
|---|---|
| Vùng neo đáy | Bám lên trên bàn phím, không bị che |
| Đóng bàn phím | Chạm ra ngoài trường nhập thì đóng (`keyboardShouldPersistTaps="handled"`) |
| Cuộn tới trường | Trường đang nhập tự cuộn vào giữa vùng nhìn thấy |
| Phím Enter | `returnKeyType="next"` nhảy trường sau; `"done"` ở trường cuối thì **gửi biểu mẫu** |

Điểm cuối quan trọng: bản web hiện có 55 ô nhập nhưng chỉ 6 thẻ `<form>` nên Enter không gửi được. Bản điện thoại không được lặp lại — mọi biểu mẫu phải gửi được từ phím `done`.

---

## 8. Phiên làm việc

| Tình huống | Hành vi |
|---|---|
| Mở app, còn phiên hợp lệ | Vào thẳng tab gốc của vai. Không nháy màn đăng nhập |
| Mở app, đang khôi phục phiên | Màn chờ có logo, tối đa 2 giây rồi chuyển tiếp |
| Khóa truy cập hết hạn | Tự làm mới ngầm, người dùng không thấy gì |
| Khóa làm mới hết hạn | Về màn đăng nhập kèm thông báo *"Phiên làm việc đã hết hạn, đăng nhập lại."* — **không mất nội dung biểu mẫu đang nhập dở**, lưu tạm và khôi phục sau khi đăng nhập lại |
| Đăng xuất chủ động | Hỏi xác nhận, xóa bộ nhớ đệm ngoại tuyến của người đó, về màn đăng nhập |

---

## 9. Deep link từ thông báo đẩy

Đây là lý do phải dùng `expo-router` thay vì chuyển tab bằng state.

| Loại thông báo | Mở tới |
|---|---|
| Lệnh mới | Chi tiết lệnh đó |
| Yêu cầu vật tư cho kho | Chi tiết lệnh, cuộn tới phần yêu cầu của kho mình |
| Sự cố kho | Tổng quan, cuộn tới mục cảnh báo |
| Báo cáo tháng bị trả lại | Chi tiết kỳ báo cáo đó |
| Đề nghị mượn liên xã | Thông báo, mở đúng thẻ có hai nút Đồng ý / Từ chối |

**Khi mở bằng deep link, ngăn xếp điều hướng phải hợp lệ** — nút Back đưa về màn danh sách tương ứng, không đưa ra khỏi app.

---

## 10. Danh mục kiểm tra khung ứng dụng

- [ ] Nút Back cứng làm đúng việc ở cả 6 tình huống ở §4
- [ ] Thanh tab không bị thanh cử chỉ che trên máy dùng điều hướng cử chỉ
- [ ] Nhãn 5 tab không vỡ hàng ở `fontScale` 1.2×
- [ ] Chuyển tab giữ nguyên vị trí cuộn của tab cũ
- [ ] Đăng xuất không còn nằm trên bất kỳ thanh tiêu đề nào
- [ ] Vùng neo đáy bám lên trên bàn phím ở mọi biểu mẫu
- [ ] Quản trị xã không thấy thanh tab
- [ ] Deep link từ thông báo dựng được ngăn xếp có nút Back hợp lệ
- [ ] Tiêu đề dài không đè lên phần bên phải thanh tiêu đề (thử với vai "Đội cứu hộ")

# 08 · Màn Quét mã QR

**Câu hỏi màn này trả lời:** *Lô hàng đang cầm trên tay là lô nào, và tôi thao tác gì với nó?*

**Vai dùng:** Phụ trách kho, Quản trị xã · **Tệp hiện tại:** `InventoryScreen.tsx` (`scannerOpen`, `parseScannedInventoryCode`)

---

## 1. Bối cảnh

Đây là lối vào nhanh nhất của toàn ứng dụng. Người dùng đang **đứng trước kệ, cầm hàng bằng một tay**, và mục đích là bỏ hẳn bước tra sổ.

Điều kiện thực tế cần thiết kế cho: kho thường tối, nhãn QR có thể bị ướt, bụi, hoặc dán cong theo mặt thùng.

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│  ✕                                  ⚡    │  đóng · đèn pin
│                                          │
│                                          │
│        ┌────────────────────┐            │
│        ┐                    ┌            │  khung ngắm 240×240
│                                          │  bốn góc, không viền kín
│                                          │
│                                          │
│        ┘                    └            │
│        └────────────────────┘            │
│                                          │
│      Đưa mã QR vào khung                 │  hướng dẫn
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  Không quét được?                        │
│  ┌────────────────────────────────────┐  │
│  │ Nhập mã vật tư                     │  │  lối thoát bằng tay
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 2.1. Khung ngắm

240×240 dp, canh giữa theo bề ngang, đặt **hơi cao hơn giữa màn** (khoảng 40% chiều cao) — vì tay cầm điện thoại tự nhiên hướng camera hơi chếch xuống.

Vẽ bằng bốn góc chữ L thay vì viền kín: góc chỉ rõ vùng ngắm mà không che mã.

Vùng ngoài khung phủ đen 50% để mắt tự dồn vào giữa.

### 2.2. Đèn pin

Nút ở góc trên phải, 48×48. **Bắt buộc có** — kho thường tối và đây là lý do phổ biến nhất khiến quét thất bại.

Trạng thái bật: nền `attention`, biểu tượng đặc.

### 2.3. Lối thoát bằng tay

Luôn hiện ở đáy, không giấu sau nhiều lớp. Khi camera hỏng, mã rách, hoặc người dùng không cấp quyền camera thì đây là đường duy nhất còn lại.

Bấm vào mở phiếu đáy nhập mã SKU bằng bàn phím, có gợi ý theo mã đã có trong kho.

---

## 3. Luồng quét

```
Mở màn
  ↓
Xin quyền camera (nếu chưa có)
  ↓
Camera chạy · khung ngắm
  ↓
Nhận diện mã ──► rung Medium + khung ngắm chớp xanh
  ↓
Phân tích mã (parseScannedInventoryCode)
  ├─ Hợp lệ, tìm thấy lô  ──► phiếu kết quả (§4)
  ├─ Hợp lệ, không thấy lô ──► thông báo lỗi, tiếp tục quét
  └─ Không hợp lệ          ──► thông báo lỗi, tiếp tục quét
```

**Ba định dạng mã được chấp nhận** (giữ nguyên logic hiện có):

| Định dạng | Ví dụ |
|---|---|
| SKU trần | `WATER-01` |
| JSON | `{"sku":"WATER-01","batch":"L-0142"}` |
| URL có tham số | `https://.../q?sku=WATER-01&batch=L-0142` |

### 3.1. Phản hồi khi nhận diện

Ba tín hiệu cùng lúc, trong 200 ms:

1. Rung `ImpactFeedbackStyle.Medium`
2. Khung ngắm chớp màu `ready` một nhịp
3. Camera dừng lại (đóng băng khung hình)

Camera dừng là chi tiết quan trọng: nếu vẫn chạy, người dùng hạ tay xuống và máy quét tiếp mã khác trong tầm nhìn.

### 3.2. Chống quét trùng

Sau khi nhận một mã, **bỏ qua mọi lần đọc lại cùng mã đó trong 2 giây**. Không có bước này, một mã trong tầm ngắm sẽ kích hoạt liên tục hàng chục lần.

---

## 4. Phiếu kết quả

Trượt lên từ đáy ngay sau khi nhận diện. Camera vẫn đóng băng phía sau.

```
┌──────────────────────────────────────────┐
│              ▬▬▬▬                        │
│  ✓ Đã nhận diện                      ✕   │
├──────────────────────────────────────────┤
│  ┌────┐ WATER-01                         │
│  │ 💧 │ Nước uống đóng chai              │
│  └────┘                                  │
│                                          │
│  Lô L-0142 · Kệ A2-03                    │
│  ● Mới        ● Trong kho                │
│  HSD 12/2027                             │
│                                          │
│         120 chai                         │  number 32 dp
│                                          │
├──────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐      │
│  │  Nhập kho    │  │   Xuất kho   │      │  hai nút lớn
│  └──────────────┘  └──────────────┘      │
│                                          │
│  ( Xem chi tiết )   ( Quét mã khác )     │
└──────────────────────────────────────────┘
```

**Hai nút chính là Nhập kho và Xuất kho**, cỡ `lg`, chia đôi bề ngang. Đây là hai việc chiếm gần hết số lần dùng quét QR — người đứng trước kệ hoặc đang nhận hàng vào, hoặc đang lấy hàng ra.

Các thao tác khác nằm sau "Xem chi tiết" (mở thẻ lô đầy đủ với đủ bảy hành động).

"Quét mã khác" cho camera chạy lại — phục vụ trường hợp nhận hàng nhiều lô liên tiếp.

### 4.1. Quản trị xã

Vai này trên điện thoại chỉ có Nhập kho và Xuất kho. Phiếu kết quả giữ nguyên hai nút chính, bỏ "Xem chi tiết".

### 4.2. Chế độ quét liên tiếp

Khi nhận nhiều lô cùng lúc, người dùng bật công tắc "Quét liên tiếp" trong phiếu kết quả. Khi bật:

- Sau khi hoàn tất một thao tác, tự quay lại camera thay vì đóng màn
- Một dải trên đầu đếm số lô đã xử lý trong phiên: `Đã xử lý 4 lô`
- Bấm vào dải xem lại danh sách vừa làm, để soát trước khi rời màn

---

## 5. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Đang xin quyền | Màn giải thích trước khi hộp thoại hệ thống hiện (§5.1) |
| Từ chối quyền | Màn hướng dẫn + nút mở Cài đặt + lối nhập tay |
| Camera đang khởi động | Nền tối + vòng xoay + "Đang bật camera…" |
| Đang quét | Khung ngắm + hướng dẫn |
| Mã không đọc được | `Toast` đỏ, camera tiếp tục chạy |
| Không tìm thấy lô | `Toast` đỏ nêu rõ mã, camera tiếp tục |
| Ngoại tuyến | Quét vẫn chạy, tra cứu dùng dữ liệu đã lưu, dải báo "chỉ đọc" |

### 5.1. Xin quyền camera

**Không gọi thẳng hộp thoại quyền của hệ thống.** Người dùng từ chối một lần rồi thì Android không hỏi lại, và họ mắc kẹt.

Hiện màn giải thích trước:

```
        📷
  Ứng dụng cần dùng camera
  Để quét mã QR dán trên kệ hàng,
  thay cho việc tra sổ bằng tay.

     [ Cho phép dùng camera ]
     ( Nhập mã bằng tay )
```

Khi đã bị từ chối vĩnh viễn:

```
        📷
  Camera đang bị chặn
  Mở Cài đặt → Quyền → Camera
  và bật cho Ứng phó nhanh.

     [ Mở Cài đặt ]
     ( Nhập mã bằng tay )
```

### 5.2. Lỗi khi phân tích mã

| Tình huống | Chữ hiện |
|---|---|
| Không phải mã của hệ thống | "Mã này không phải mã vật tư của hệ thống." |
| Đúng định dạng, không có trong kho | "Không tìm thấy mã **WATER-99** trong kho Long Châu." |
| Có trong xã nhưng khác kho | "Mã **WATER-01** thuộc kho thôn Tân Bình, ngoài phạm vi của bạn." |

Trường hợp thứ ba cần nói rõ — nếu chỉ báo "không tìm thấy", người dùng sẽ tưởng nhãn hỏng và đi in lại.

---

## 6. Tương tác

| Thao tác | Kết quả |
|---|---|
| Nút Back cứng | Đóng phiếu kết quả nếu đang mở; nếu không thì đóng màn quét |
| Chạm ✕ | Đóng màn quét, về màn Kho |
| Chạm đèn pin | Bật/tắt |
| Chạm ngoài khung ngắm | Không có tác dụng — tránh đóng nhầm |
| Xoay máy | Khung ngắm giữ nguyên tỉ lệ, camera xoay theo |

**Màn quét giữ màn hình luôn sáng** (`expo-keep-awake`) trong lúc mở. Màn tắt giữa lúc đang căn mã là phiền toái lặp lại.

---

## 7. Trợ năng

Quét QR là thao tác thị giác, nhưng màn vẫn phải dùng được với trình đọc màn hình:

| Phần tử | Yêu cầu |
|---|---|
| Khi mở màn | Đọc: "Màn quét mã QR. Đưa mã vào khung giữa màn hình. Có nút nhập mã bằng tay ở cuối màn." |
| Nút đèn pin | Nhãn đổi theo trạng thái: "Bật đèn pin" / "Tắt đèn pin" |
| Khi nhận diện | `accessibilityLiveRegion="assertive"`: "Đã nhận diện nước uống đóng chai, lô L-0142, còn 120 chai" |
| Lối nhập tay | Luôn nằm trong luồng tiêu điểm, không bị camera che |
| Phiếu kết quả | Tiêu điểm chuyển vào phiếu khi mở |

---

## 8. Danh mục kiểm tra

- [ ] Có nút đèn pin
- [ ] Lối nhập mã bằng tay luôn hiện, không giấu
- [ ] Có màn giải thích trước khi xin quyền camera
- [ ] Bị từ chối quyền vĩnh viễn có hướng dẫn và nút mở Cài đặt
- [ ] Nhận diện xong thì **camera dừng lại**
- [ ] Chống quét trùng trong 2 giây
- [ ] Ba tín hiệu phản hồi khi nhận diện: rung, chớp khung, dừng camera
- [ ] Phiếu kết quả có hai nút lớn Nhập kho và Xuất kho
- [ ] Mã thuộc kho khác báo đúng lý do, không báo "không tìm thấy"
- [ ] Có chế độ quét liên tiếp cho việc nhận nhiều lô
- [ ] Nút Back đóng phiếu trước, đóng màn sau
- [ ] Màn hình không tự tắt trong lúc quét
- [ ] Quản trị xã chỉ thấy hai nút Nhập và Xuất
- [ ] Quét vẫn dùng được khi ngoại tuyến (tra cứu từ dữ liệu đã lưu)

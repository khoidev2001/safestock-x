# 03 · Trạng thái chung

Năm trạng thái mà **mọi màn có tải dữ liệu đều phải có đủ**. Đây là phần dễ bị bỏ sót nhất khi vẽ lại giao diện, và với ứng dụng này nó là phần quan trọng nhất.

---

## 1. Vì sao tệp này tồn tại

Bản rà soát hệ thống ghi nhận ở phía web: **90 lệnh truy vấn dữ liệu nhưng chỉ khoảng 40 chỗ xử lý lỗi.** Truy vấn hỏng hiện ra thành bảng trống — trông y hệt "kho hết hàng".

Trong một hệ thống lấy *"không bịa số"* làm nguyên tắc số một, đây là đúng loại lỗi nguy hiểm nhất: người trực nhìn thấy con số 0 và tin rằng kho hết hàng, trong khi thực tế là điện thoại mất sóng.

**Quy tắc tuyệt đối: ba tình huống dưới đây phải trông khác hẳn nhau.**

| Tình huống | Nghĩa thật | Người dùng phải làm gì |
|---|---|---|
| Trống | Có kết nối, máy chủ trả lời, và **thật sự không có dữ liệu** | Tạo mới, hoặc không làm gì |
| Lỗi | Không lấy được dữ liệu, **không biết thực tế thế nào** | Thử lại |
| Ngoại tuyến | Đang xem **số liệu cũ đã lưu**, thực tế có thể đã khác | Biết rằng số đang xem không phải số hiện tại |

---

## 2. Trạng thái 1 — Đang tải

### 2.1. Tải lần đầu: dùng khung xương, không dùng vòng xoay

```
┌──────────────────────────────┐
│  ▬▬▬▬▬▬▬▬▬▬▬                 │
│  ▬▬▬▬▬▬                      │   khung xương có hình dạng
├──────────────────────────────┤   giống hệt nội dung sắp hiện
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬     ▬▬▬▬     │
│  ▬▬▬▬▬▬▬▬                    │
│  ▬▬▬▬  ▬▬▬▬▬  ▬▬▬            │
└──────────────────────────────┘
```

Khung xương phải **giống hình dạng nội dung thật**: khung xương của thẻ lô hàng phải trông như thẻ lô hàng. Khung xương chung chung không giúp người dùng chuẩn bị mắt cho cái sắp tới.

Số khối khung xương: 3 cho danh sách, 1 cho thẻ đơn. Nhấp nháy 1200 ms, tắt khi hệ thống bật giảm chuyển động.

### 2.2. Tải lại khi đã có dữ liệu: không được che nội dung cũ

Giữ nguyên nội dung đang hiển thị, chỉ thêm một vạch tiến trình mảnh 2 dp dưới thanh tiêu đề.

Người dùng đang đọc số liệu mà màn hình chớp sang khung xương là mất chỗ đang đọc — và trong lúc vội thì đó là mất mấy giây thật.

### 2.3. Kéo xuống làm mới

Dùng `RefreshControl` chuẩn của Android với màu `primary`. Có ở mọi màn danh sách.

### 2.4. Tải lâu hơn 8 giây

Thêm một dòng dưới khung xương:

> Máy chủ xã đang phản hồi chậm. Bạn có thể chờ thêm hoặc thử lại.
> `[ Thử lại ]`

Chờ vô tận không lời giải thích là chỗ người dùng bỏ cuộc và gọi điện hỏi.

---

## 3. Trạng thái 2 — Có dữ liệu

Trạng thái bình thường. Một quy tắc bắt buộc:

**Mọi màn hiển thị số liệu phải có mốc thời gian cập nhật.** Đặt ở đáy vùng cuộn, cỡ `caption`, màu `text-muted`:

> Cập nhật lúc 14:20 · kéo xuống để làm mới

---

## 4. Trạng thái 3 — Trống

```
┌──────────────────────────────┐
│                              │
│            ⃝                 │  biểu tượng 32 dp trong vòng 64 dp
│                              │  nền surface-sunken, biểu tượng text-muted
│    Kho chưa có lô hàng nào   │  subtitle, text
│                              │
│   Bấm Nhập kho để thêm lô    │  caption, text-muted
│         đầu tiên             │
│                              │
│      [ Nhập kho ]            │  hành động gợi ý (nếu có quyền)
└──────────────────────────────┘
```

| Quy tắc | Chi tiết |
|---|---|
| Màu | Trung tính. **Không dùng đỏ, không dùng cam** — trống không phải lỗi |
| Chữ | Nói rõ trống ở đâu, không nói chung chung. "Kho chưa có lô hàng nào" chứ không phải "Không có dữ liệu" |
| Hành động | Nếu vai đó có quyền tạo mới thì gợi ý; nếu không thì bỏ nút |
| Biểu tượng | Dùng đúng biểu tượng của mục đó (`package` cho kho, `bell` cho thông báo) |

**Trống do bộ lọc thì khác trống thật.** Khi người dùng đang lọc hoặc tìm kiếm mà không có kết quả:

> Không có lô hàng nào khớp "áo phao"
> `[ Xóa tìm kiếm ]`

Kèm nút xóa bộ lọc — nếu không người dùng tưởng kho rỗng.

---

## 5. Trạng thái 4 — Lỗi

```
┌──────────────────────────────┐
│                              │
│            ⚠                 │  alert-circle 32 dp, màu critical
│                              │  vòng nền critical-soft
│  Chưa lấy được danh sách lô  │  subtitle, text
│                              │
│  Kiểm tra kết nối Wi-Fi rồi  │  caption, text-muted
│         thử lại.             │
│                              │
│      [ Thử lại ]             │  BẮT BUỘC có
└──────────────────────────────┘
```

| Quy tắc | Chi tiết |
|---|---|
| Phải khác trống | Biểu tượng cảnh báo, màu `critical`, và **luôn có nút Thử lại** |
| Không mã kỹ thuật | Không hiện "500", "Network request failed", "TypeError" |
| Nói được việc tiếp theo | Mỗi thông báo lỗi có một câu chỉ việc phải làm |
| Không bao giờ hiện số 0 | Khi lỗi, **không hiển thị bất kỳ con số nào**. Thà trống còn hơn số sai |

### 5.1. Bảng thông điệp lỗi

| Nguyên nhân kỹ thuật | Chữ hiện cho người dùng |
|---|---|
| Không có mạng | "Điện thoại đang không có mạng. Bật Wi-Fi hoặc dữ liệu di động rồi thử lại." |
| Không tới được máy chủ | "Chưa kết nối được máy chủ xã. Kiểm tra Wi-Fi rồi thử lại." |
| Quá hạn chờ | "Máy chủ xã phản hồi chậm. Thử lại sau ít phút." |
| 401 / 403 | "Phiên làm việc đã hết hạn. Đăng nhập lại." (tự chuyển màn đăng nhập) |
| 403 do phạm vi kho | "Bạn không có quyền xem kho này." |
| 404 | "Không tìm thấy. Có thể mục này vừa bị xóa." |
| 409 (đã đổi) | "Số liệu vừa được người khác cập nhật. Tải lại rồi thao tác tiếp." |
| 422 (dữ liệu sai) | Hiện đúng thông điệp nghiệp vụ từ máy chủ (đã bằng tiếng Việt) |
| 429 | "Bạn thao tác quá nhanh. Chờ một chút rồi thử lại." |
| 5xx | "Máy chủ xã đang gặp sự cố. Báo cán bộ phụ trách nếu tình trạng kéo dài." |

### 5.2. Lỗi cục bộ — khi đã có dữ liệu trên màn

Không thay cả màn hình. Hiện `Toast` màu lỗi kèm nút Thử lại, giữ nguyên nội dung cũ và **gắn mốc thời gian của nội dung cũ** để người dùng biết nó không phải số mới nhất.

---

## 6. Trạng thái 5 — Ngoại tuyến

Trạng thái quan trọng nhất của ứng dụng này. Kho thôn nằm rải trên địa bàn miền núi, và mất sóng là chuyện thường ngày chứ không phải ngoại lệ.

### 6.1. Dải báo ngoại tuyến

Ngay dưới thanh tiêu đề, không cuộn theo nội dung:

```
┌──────────────────────────────────────────┐
│ ⚡ Ngoại tuyến · chỉ đọc                  │
│   Số liệu lưu lúc 14:20 · 30/08          │
└──────────────────────────────────────────┘
   nền attention-soft, viền dưới attention
   chữ 13 dp đậm màu attention
   accessibilityRole="alert", liveRegion="polite"
```

**Ba điểm bắt buộc:**

1. **Luôn hiện mốc thời gian tuyệt đối** của dữ liệu đang xem. Không dùng thời gian tương đối ở đây — người dùng cần biết chính xác số liệu cũ tới đâu để tự quyết định có tin được không.
2. **Nói rõ "chỉ đọc"**, không chỉ nói "ngoại tuyến". Người dùng cần biết ngay là không ghi được.
3. **Cỡ chữ 13 dp, không phải 12.** Bản hiện tại dùng 12 dp — dưới ngưỡng tối thiểu của hệ thống thiết kế.

### 6.2. Ứng xử của các nút khi ngoại tuyến

**Không ẩn nút.** Nút biến mất khiến người dùng tưởng mình nhớ nhầm, và họ sẽ đi tìm.

Thay vào đó: nút chuyển sang trạng thái vô hiệu, kèm dòng lý do bên dưới.

```
[ Xuất kho ]                    ← vô hiệu, độ mờ 0.4
  Cần có kết nối để ghi vào sổ kho
```

Chạm vào nút vô hiệu vẫn phát `Toast`: *"Đang ngoại tuyến. Thao tác này cần kết nối tới máy chủ xã."*

### 6.3. Phân biệt hai kiểu mất kết nối

Ứng dụng phải nói đúng cái nào đang xảy ra, vì cách xử lý khác nhau:

| Tình huống | Cách nhận biết | Chữ hiện |
|---|---|---|
| Điện thoại không có mạng | `NetInfo.isConnected === false` | "Điện thoại đang không có mạng" |
| Có mạng nhưng không tới được máy chủ xã | `isConnected === true` nhưng gọi API hỏng và đang phải dùng cache | "Chưa kết nối được máy chủ xã" |

Phân biệt này quan trọng thật: trường hợp một thì người dùng đi tìm sóng; trường hợp hai thì máy chủ xã có vấn đề và họ cần báo cán bộ phụ trách.

### 6.4. Khi có mạng trở lại

Tự tải lại ngầm. Khi xong, dải ngoại tuyến biến mất kèm `Toast`:

> ✓ Đã kết nối lại · số liệu đã cập nhật

Không tự thực hiện lại thao tác ghi mà người dùng đã thử lúc ngoại tuyến. Nếu có bản nháp chưa gửi, hiện nhắc:

> Bạn có 1 báo cáo chưa gửi. `[ Gửi ngay ]`

---

## 7. Trạng thái 6 — Không có quyền

Trường hợp riêng, xuất hiện khi vai không được xem một mục.

**Nguyên tắc hàng đầu là không dựng ngõ cụt:** ưu tiên **không hiện lối vào** thay vì hiện rồi chặn. Đây là nguyên tắc đã có trong mã nguồn hiện tại (`fieldForceActionsFor` chỉ trả về hành động khi trạng thái cho phép) và phải được giữ.

Khi buộc phải hiện (ví dụ mở bằng deep link tới thứ mình không có quyền):

```
            🔒
  Bạn không có quyền xem mục này
  Mục này thuộc phạm vi của kho khác.
       [ Về Tổng quan ]
```

Không giải thích chi tiết cấu trúc phân quyền — vừa vô ích với người dùng, vừa để lộ thông tin về những gì tồn tại ngoài phạm vi của họ.

---

## 8. Trạng thái đang ghi dữ liệu

Áp cho mọi thao tác thay đổi dữ liệu (nhập, xuất, chuyển, gửi báo cáo, xác nhận giao).

```
Trước:  [ Xác nhận xuất kho ]
Trong:  [ ◌ Đang xuất kho…  ]   ← nút giữ nguyên bề rộng, không nhận chạm thêm
Sau:    Toast ✓ "Đã xuất 120 chai khỏi lô L-0142"
        + rung Success
        + phiếu tự đóng
        + danh sách phía sau đã cập nhật số mới
```

| Quy tắc | Chi tiết |
|---|---|
| Chống bấm hai lần | Nút không nhận chạm ngay khi bắt đầu; kèm khóa chống gửi trùng phía máy chủ |
| Nút không đổi bề rộng | Nút co lại làm bố cục nhảy |
| Phản hồi phải nêu số | "Đã xuất 120 chai khỏi lô L-0142" chứ không phải "Thành công" |
| Cập nhật màn nền | Danh sách phía sau phải hiện số mới ngay, không đợi người dùng kéo làm mới |
| Thất bại | Phiếu **không đóng**, giữ nguyên nội dung đã nhập, hiện lỗi trên phiếu |

Điểm cuối quan trọng: đóng phiếu khi thất bại là bắt người dùng nhập lại từ đầu — trong lúc vội thì đó là lỗi khiến họ bỏ cuộc và quay lại ghi sổ giấy.

---

## 9. Danh mục kiểm tra trạng thái cho từng màn

Áp cho mọi màn có tải dữ liệu:

- [ ] Tải lần đầu dùng khung xương giống hình dạng nội dung thật
- [ ] Tải lại không che nội dung cũ
- [ ] Có kéo xuống làm mới
- [ ] Tải lâu hơn 8 giây có lối thoát
- [ ] Trạng thái trống dùng màu trung tính, nói rõ trống ở đâu
- [ ] Trống do bộ lọc khác trống thật, và có nút xóa bộ lọc
- [ ] Trạng thái lỗi **trông khác hẳn** trạng thái trống
- [ ] Trạng thái lỗi luôn có nút Thử lại
- [ ] Khi lỗi, **không hiển thị con số nào**
- [ ] Không có mã lỗi kỹ thuật nào lọt ra giao diện
- [ ] Dải ngoại tuyến có mốc thời gian tuyệt đối và chữ "chỉ đọc"
- [ ] Nút khi ngoại tuyến bị vô hiệu kèm lý do, **không bị ẩn**
- [ ] Phân biệt được "máy không có mạng" và "không tới được máy chủ xã"
- [ ] Thao tác ghi thất bại giữ nguyên nội dung đã nhập
- [ ] Phản hồi sau khi ghi nêu được con số cụ thể

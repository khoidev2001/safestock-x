# 05 · Màn Tổng quan

**Câu hỏi màn này trả lời:** *Kho của tôi hôm nay có ổn không, và nếu không thì vướng ở đâu?*

**Vai dùng:** Phụ trách kho · **Tệp hiện tại:** `DashboardScreen.tsx` (972 dòng, phục vụ cả `view="home"` và `view="readiness"`)

---

## 1. Thay đổi cấu trúc: gộp hai tab thành một

Bản hiện tại có hai tab — "Tổng quan" và "Sẵn sàng" — cùng render từ `DashboardScreen` chỉ khác tham số `view`. Người dùng thấy hai tab, thực chất là một màn hình bị cắt đôi.

Bản mới gộp thành **một tab, một trang cuộn, năm tầng thông tin**. Phụ trách kho giảm từ 6 xuống 5 tab.

Nguyên tắc sắp xếp: **cái cần hành động lên trên, cái để tham khảo xuống dưới.**

```
Tầng 1  Trạng thái vận hành + điểm chặn      ← trả lời "có ổn không"
Tầng 2  Bốn ô số liệu nhanh                  ← trả lời "quy mô thế nào"
Tầng 3  Cảnh báo đang mở                     ← trả lời "có gì cần xử lý ngay"
Tầng 4  Bản tin đầu ngày + dự báo mưa        ← bối cảnh
Tầng 5  Sáu thành phần sẵn sàng (thu gọn)    ← chi tiết, mở khi cần
```

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│  Tổng quan                    ⬤  🔔³     │  AppBar
│  Kho thôn Long Châu                      │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐  │  ← TẦNG 1
│  │   ╭───╮                            │  │
│  │   │ 78│   CẦN XỬ LÝ                │  │  ScoreRing 96 dp
│  │   ╰───╯   2 điểm chặn cần xử lý    │  │  + trạng thái
│  │                                    │  │
│  │  ⛔ Kệ A2 đang khóa                 │  │  điểm chặn 1
│  │     Không lấy được hàng trên kệ này│  │
│  │  ⛔ Nhiệt độ kho vượt ngưỡng        │  │  điểm chặn 2
│  │     Ghi nhận 14:05 hôm nay         │  │
│  │                                    │  │
│  │  [ Xem chi tiết sẵn sàng ]         │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌─────────────┐  ┌─────────────┐        │  ← TẦNG 2
│  │ Mã vật tư   │  │ Tổng số lượng│       │  lưới 2 cột
│  │ 42          │  │ 12.480      │        │  MetricTile
│  │ 118 lô      │  │ đơn vị      │        │
│  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐        │
│  │ ● Cảnh báo  │  │ ● Lô cần chú ý│      │
│  │ 2           │  │ 7           │        │
│  │ mức Cao     │  │ 3 hỏng·4 gần hạn│    │
│  └─────────────┘  └─────────────┘        │
│                                          │
│  CẢNH BÁO ĐANG MỞ            ( Tất cả )  │  ← TẦNG 3
│  ┌────────────────────────────────────┐  │
│  │▌🌡 Nhiệt độ kho vượt ngưỡng        │  │  StatusCard
│  │  Cảm biến · Cao · 14:05 hôm nay    │  │  viền trái theo mức
│  └────────────────────────────────────┘  │
│                                          │
│  BẢN TIN ĐẦU NGÀY               08:00    │  ← TẦNG 4
│  ┌────────────────────────────────────┐  │
│  │ – Kho đang ở mức cần xử lý...      │  │
│  │ – Dự báo mưa 72 giờ đạt 180 mm...  │  │
│  │ ⚑ Việc ưu tiên: kiểm tra kệ A2     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  MỨC SẴN SÀNG THEO THÀNH PHẦN        ⌄   │  ← TẦNG 5 (thu gọn)
│                                          │
│  Cập nhật lúc 14:20 · kéo xuống làm mới  │
├──────────────────────────────────────────┤
│  ⌂     ▤     ☑     ✎     🔔              │  TabBar
└──────────────────────────────────────────┘
```

---

## 3. Tầng 1 — Trạng thái vận hành

Khối quan trọng nhất của màn. Nếu người dùng chỉ nhìn một thứ, phải là khối này.

### 3.1. Vòng điểm và trạng thái

| Trạng thái | Nhãn | Màu | Biểu tượng |
|---|---|---|---|
| `READY` | Sẵn sàng điều phối | `ready` | `check-circle` |
| `NEEDS_ACTION` | Cần xử lý | `attention` | `alert-triangle` |
| `NOT_DISPATCHABLE` | Chưa thể điều phối | `critical` | `slash` |

**Màu vòng lấy theo trạng thái vận hành, tuyệt đối không lấy theo điểm số.**

Đây là quy tắc nghiệp vụ cốt lõi của sản phẩm và giao diện phải làm nó nhìn thấy được: kho 95 điểm nhưng có điểm chặn thì vòng vẫn màu đỏ. Điểm số là tham khảo; điểm chặn là sự thật.

Ngay dưới điểm, luôn có dòng nhắc:

> Điểm tham khảo không vượt qua được điểm chặn vận hành.

### 3.2. Danh sách điểm chặn

Nếu có điểm chặn, hiện **ngay trong khối này**, không đẩy xuống dưới. Bản hiện tại đặt điểm chặn ở tab riêng — nghĩa là người dùng phải chuyển tab mới biết mình đang bị chặn vì cái gì.

Mỗi điểm chặn: biểu tượng `slash` màu `critical`, tiêu đề `body-strong`, và một dòng lý do `caption`. Tối đa hiện 3, còn lại gộp thành "và 2 điểm chặn khác".

### 3.3. Khi không có điểm chặn

Khối rút gọn lại, nền `ready-soft`:

```
╭───╮
│ 94│   SẴN SÀNG ĐIỀU PHỐI
╰───╯   Không có điểm chặn đang mở
```

---

## 4. Tầng 2 — Bốn ô số liệu

Lưới 2×2, mỗi ô là `MetricTile`.

| Ô | Số chính | Chú thích | Nguồn |
|---|---|---|---|
| Mã vật tư | số SKU | "118 lô" | `buildInventorySummary` |
| Tổng số lượng | tổng số đơn vị | "đơn vị" | `buildInventorySummary` |
| Cảnh báo | số sự cố đang mở | mức cao nhất | `snapshot.incidents` |
| Lô cần chú ý | hỏng + gần hạn | "3 hỏng · 4 gần hạn" | `buildInventorySummary` |

**Hai ô cuối đổi màu khi khác 0**, và khi đổi màu thì thêm chấm 8 dp trước nhãn — để không phụ thuộc riêng vào màu.

**Cả bốn ô đều bấm được**, dẫn tới nơi xử lý tương ứng:

| Ô | Bấm vào dẫn tới |
|---|---|
| Mã vật tư | Tab Kho |
| Tổng số lượng | Tab Kho |
| Cảnh báo | Tầng 3 của chính màn này (cuộn xuống) |
| Lô cần chú ý | Tab Kho, đã bật sẵn bộ lọc "hỏng hoặc gần hạn" |

Ô số liệu không bấm được là ngõ cụt: người dùng thấy "7 lô cần chú ý" rồi phải tự đi tìm bảy lô đó trong danh sách.

---

## 5. Tầng 3 — Cảnh báo đang mở

Tối đa 4 thẻ, sắp theo mức nghiêm trọng rồi tới thời gian.

```
┌────────────────────────────────────┐
│▌🌡 Nhiệt độ kho vượt ngưỡng        │  viền trái 4 dp theo mức
│  Cảm biến · Cao · 14:05 hôm nay    │  caption
└────────────────────────────────────┘
```

Màu viền trái theo mức: `CRITICAL` → `critical`, `HIGH` → `critical`, `MEDIUM` → `attention`, `LOW` → `text-muted`.

Biểu tượng theo loại sự cố (nhiệt độ, độ ẩm, cháy, tiếp cận). **Có biểu tượng thì người dùng nhận ra loại sự cố trước khi đọc chữ.**

Trống: *"Không có cảnh báo đang mở tại kho này."* — màu trung tính, biểu tượng `check-circle` màu `ready`.

---

## 6. Tầng 4 — Bản tin đầu ngày và dự báo mưa

### 6.1. Bản tin

Mỗi câu một dòng có dấu đầu dòng, giữ đúng cách làm hiện tại. Lý do đã ghi trong mã nguồn và vẫn đúng: bản tin gộp bốn mảng vận hành (sẵn sàng, mưa, tồn kho, sự cố), đọc thành đoạn liền thì phải tự dò câu nào nói chuyện gì.

**Nhãn nguồn:** chỉ hiện huy hiệu `DỰ PHÒNG` khi bản tin **không** do AI viết. Giữ đúng cách làm hiện tại — nhãn hiện mọi lúc thì thành nền, không ai đọc; còn lúc rơi về bản mẫu mới là tin phải nói vì câu chữ khô hơn hẳn.

Ba việc ưu tiên hiện dưới dạng danh sách có biểu tượng `flag`.

### 6.2. Dự báo mưa 72 giờ

Chỉ hiện khi có dữ liệu thời tiết.

```
┌────────────────────────────────────┐
│ 🌧  180.4 mm                       │  number 28 dp
│    3 mặt hàng có nguy cơ thiếu     │  caption
│    do nhu cầu tăng                 │
└────────────────────────────────────┘
```

Viền đổi sang `critical` khi vượt ngưỡng. Bấm vào dẫn tới tab Kho đã lọc sẵn các mặt hàng có nguy cơ.

---

## 7. Tầng 5 — Sáu thành phần sẵn sàng

**Mặc định thu gọn.** Đây là nội dung tham khảo, không phải nội dung hành động — nhưng phải có mặt vì nó giải thích vì sao điểm là con số đó.

Khi mở ra, mỗi thành phần một hàng:

```
Số lượng khả dụng                      88
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░
Còn 3 mặt hàng dưới định mức tối thiểu
→ Đề nghị nhập bổ sung áo phao trẻ em
```

| Thành phần | Nhãn hiển thị |
|---|---|
| `quantityAvailability` | Số lượng khả dụng |
| `itemCondition` | Tình trạng vật tư |
| `expiry` | Hạn sử dụng |
| `accessibility` | Khả năng tiếp cận |
| `environment` | Môi trường bảo quản |
| `dataReliability` | Độ tin cậy dữ liệu |

Màu thanh theo trạng thái của thành phần đó, không theo điểm tổng. Tối đa 2 dòng lý do; khuyến nghị hành động hiện với biểu tượng `arrow-right` màu `primary`.

Bên dưới là mục "Việc nên làm tiếp" — danh sách đánh số các khuyến nghị.

---

## 8. Chọn kho khi phụ trách nhiều kho

Người phụ trách kho tổng nhìn được nhiều kho. Bộ chọn đặt ở dòng phụ của thanh tiêu đề:

```
Tổng quan
Kho thôn Long Châu  ⌄        ← bấm mở phiếu đáy chọn kho
```

Phiếu đáy liệt kê các kho trong phạm vi, mỗi dòng kèm chấm trạng thái vận hành — để người dùng thấy ngay kho nào đang có vấn đề mà không phải mở từng kho.

Kho đang chọn được nhớ lại giữa các lần mở app.

---

## 9. Trạng thái

Theo [03-TRANG-THAI-CHUNG.md](03-TRANG-THAI-CHUNG.md), với các điểm riêng:

| Trạng thái | Riêng ở màn này |
|---|---|
| Đang tải lần đầu | Khung xương: một khối lớn (tầng 1) + lưới 2×2 (tầng 2) + hai hàng (tầng 3) |
| Ngoại tuyến | Dải báo trên đầu. **Vòng điểm chuyển sang viền nét đứt** để nói rõ đây là điểm cũ, không phải điểm hiện tại |
| Lỗi | Không hiện điểm số nào. Thà trống còn hơn hiện điểm sai |
| Trống | Kho chưa có dữ liệu: "Kho này chưa có lô hàng nào. Bắt đầu bằng việc nhập lô đầu tiên." |

Chi tiết cho ngoại tuyến: vòng điểm nét đứt là tín hiệu hình dạng, đi kèm màu và chữ — thỏa nguyên tắc không dùng màu làm tín hiệu duy nhất.

---

## 10. Tương tác

| Thao tác | Kết quả |
|---|---|
| Kéo xuống | Tải lại toàn màn |
| Chạm ô số liệu | Dẫn tới nơi xử lý (§4) |
| Chạm điểm chặn | Mở tầng 5, cuộn tới thành phần liên quan |
| Chạm thẻ cảnh báo | Mở phiếu đáy chi tiết sự cố |
| Chạm dòng phụ thanh tiêu đề | Mở bộ chọn kho |
| Nút Back cứng | Hỏi thoát ứng dụng (đây là tab gốc) |

**Cập nhật thời gian thực:** khi có sự cố mới qua WebSocket, thẻ cảnh báo mới trượt vào từ trên với hiệu ứng 180 ms, và ô "Cảnh báo" nhích số. **Không tự cuộn màn hình** — người dùng có thể đang đọc chỗ khác.

---

## 11. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Vòng điểm | `accessibilityLabel="Mức sẵn sàng 78 trên 100, trạng thái cần xử lý, có 2 điểm chặn"` — đọc trọn nghĩa, không đọc rời |
| Điểm chặn | `accessibilityRole="alert"` |
| Ô số liệu | Gộp thành một nút: "Lô cần chú ý, 7 lô, 3 hỏng 4 gần hạn, mở danh sách" |
| Thanh thành phần | `accessibilityValue={{ min: 0, max: 100, now: 88 }}` |
| Mục thu gọn | `accessibilityState={{ expanded }}` |
| Bản tin | Nhóm thành một khối đọc liền |

---

## 12. Danh mục kiểm tra

- [ ] Đã gộp hai tab cũ thành một, còn 5 tab
- [ ] Màu vòng điểm theo **trạng thái vận hành**, không theo điểm số
- [ ] Kho 95 điểm có điểm chặn vẫn hiện màu đỏ
- [ ] Điểm chặn hiện ngay trong khối tầng 1, không phải ở tab khác
- [ ] Cả bốn ô số liệu bấm được và dẫn tới đúng nơi xử lý
- [ ] Ô số liệu đổi màu có kèm chấm chỉ báo
- [ ] Huy hiệu `DỰ PHÒNG` chỉ hiện khi bản tin không do AI viết
- [ ] Ngoại tuyến: vòng điểm chuyển nét đứt
- [ ] Lỗi: không hiện điểm số nào
- [ ] Sự cố mới qua WebSocket không tự cuộn màn hình
- [ ] Bộ chọn kho nhớ lựa chọn giữa các lần mở app
- [ ] Chạy đúng ở chế độ tối
- [ ] Không vỡ ở `fontScale` 1.3× — chú ý lưới 2×2 và vòng điểm

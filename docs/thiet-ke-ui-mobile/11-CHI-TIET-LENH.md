# 11 · Màn Chi tiết lệnh

**Câu hỏi màn này trả lời:** *Việc này là gì, lấy hàng ở đâu, và tôi phải bấm gì?*

**Vai dùng:** Lực lượng hiện trường và Phụ trách kho — **hai giao diện khác nhau trên cùng một màn** · **Tệp hiện tại:** `MissionDetail.tsx`

---

## 1. Một màn, hai vai, hai việc khác hẳn nhau

Đây là màn duy nhất trong ứng dụng phục vụ hai vai với hai mục đích khác nhau. Bản hiện tại dồn cả hai vào một luồng cuộn; bản mới tách rõ.

| Vai | Việc của họ | Phần quan trọng nhất |
|---|---|---|
| **Lực lượng hiện trường** | Đi giao và báo kết quả | Nắm bắt nhanh + danh sách vật tư + trợ lý hiện trường |
| **Phụ trách kho** | Chuẩn bị và xuất hàng theo từng mã | **Bảng yêu cầu vật tư của kho mình** |

Thứ tự các khối đảo theo vai: cái gì là việc của vai đó thì lên đầu.

---

## 2. Bố cục — vai Lực lượng hiện trường

```
┌──────────────────────────────────────────┐
│  ‹  Chi tiết lệnh                    ↻   │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │  ← KHỐI NẮM BẮT NHANH
│  │  ⚠ RẤT NGUY HIỂM                   │  │
│  │                                    │  │
│  │      🌊  Lũ lụt                    │  │
│  │  📍 Thôn Long Châu                  │  │
│  │                                    │  │
│  │       150                          │  │  display 40 dp
│  │       người gặp nạn                │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌──────────┬──────────┬──────────┐      │  ← BA Ô DỮ KIỆN
│  │ Thời gian│ Khoảng   │ Trạng thái│     │
│  │ 48 giờ   │ 6,2 km   │ Chờ giao │     │
│  └──────────┴──────────┴──────────┘      │
│                                          │
│  VẬT TƯ CẦN GIAO              4 loại     │
│  ┌────────────────────────────────────┐  │
│  │┌───┐ Nước uống đóng chai    ĐỦ     │  │  ← SupplyRow
│  ││💧 │ Nước uống                     │  │
│  │└───┘ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬            │  │
│  │      4.500/4.500 chai              │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │┌───┐ Áo phao người lớn      THIẾU  │  │
│  ││🦺 │ Cứu hộ                        │  │
│  │└───┘ ▬▬▬▬▬▬▬▬▬░░░░░░░              │  │
│  │      90/150 cái   Thiếu 60 cái     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  LẤY HÀNG Ở ĐÂU                          │  ← ĐIỂM LẤY HÀNG
│  ┌────────────────────────────────────┐  │
│  │ 1. Kho xã Đồng Xuân      ✓ Đã xuất │  │
│  │    2,1 km · ~8 phút                │  │
│  │    Nước uống, Áo phao              │  │
│  ├────────────────────────────────────┤  │
│  │ 2. Kho thôn Tân Bình  ⏳ Đang chuẩn bị│
│  │    4,8 km · ~15 phút               │  │
│  │    Chăn, Bộ sơ cứu                 │  │
│  └────────────────────────────────────┘  │
│                                          │
│  TRỢ LÝ HIỆN TRƯỜNG                      │
│  ┌────────────────────────────────────┐  │
│  │ Nói hoặc gõ cập nhật tại chỗ       │  │
│  │ ┌────────────────────────────────┐ │  │
│  │ │                            🎤  │ │  │
│  │ └────────────────────────────────┘ │  │
│  │              [ Gửi cập nhật ]      │  │
│  └────────────────────────────────────┘  │
│                                          │
│  DIỄN BIẾN                          ⌄    │
├──────────────────────────────────────────┤
│  [ Báo kết quả giao ]                    │  ← NÚT NEO
└──────────────────────────────────────────┘
```

---

## 3. Khối nắm bắt nhanh

Giữ nguyên ý tưởng của bản hiện tại — làm nổi bật ba thứ quan trọng nhất: **loại thiên tai · mức nguy hiểm · số người gặp nạn** — nhưng thay emoji bằng biểu tượng vector và siết lại tỉ lệ.

| Phần | Kiểu |
|---|---|
| Nhãn mức nguy hiểm | `overline`, màu theo mức, có biểu tượng `alert-triangle` |
| Biểu tượng thiên tai | 48 dp, màu nhận diện của loại đó |
| Tên loại | `title` |
| Địa điểm | `body` + biểu tượng `map-pin` |
| Số người | `display` 40 dp — **con số lớn nhất màn hình** |

Nền `*-soft` theo mức nguy hiểm, viền 2 dp.

---

## 4. Danh sách vật tư

Thành phần `SupplyRow` — giữ nguyên cấu trúc hiện tại, đây là phần đã làm tốt.

```
┌───┐  Áo phao người lớn            THIẾU
│🦺 │  Cứu hộ                              ← nhóm chức năng
└───┘  ▬▬▬▬▬▬▬▬▬░░░░░░░                    ← thanh tiến độ
       90/150 cái      Thiếu 60 cái
```

| Phần | Chi tiết |
|---|---|
| Ô biểu tượng | 44 dp, nền màu nhóm, biểu tượng vector trắng |
| Nhãn trạng thái | `ĐỦ` (ready) · `THIẾU` (attention) · `KHÔNG CÓ` (critical) |
| Thanh tiến độ | Màu theo trạng thái, viền trái thẻ cùng màu |
| Số | `allocated/required` — số cấp đậm, số cần nhạt |
| Dòng thiếu | Chỉ hiện khi `shortage > 0`, màu `attention` |

**Vật tư thiếu sắp lên đầu.** Người ngoài hiện trường cần biết trước cái gì không đủ, để tính phương án tại chỗ.

Bảy nhóm chức năng và màu của chúng giữ nguyên từ `supplies.ts` — bảng này đã được thiết kế có chủ đích để mắt gom nhóm nhanh.

---

## 5. Điểm lấy hàng — khối bổ sung

Bản hiện tại không có khối này ở màn điện thoại; người hiện trường phải suy ra từ danh sách vật tư là hàng nằm ở kho nào.

Mỗi kho một hàng, đánh số theo thứ tự đi:

| Phần | Nội dung |
|---|---|
| Số thứ tự | Theo khoảng cách gần → xa |
| Tên kho | `subtitle` |
| Trạng thái | `✓ Đã xuất` / `⏳ Đang chuẩn bị` / `⚠ Báo thiếu` |
| Khoảng cách và thời gian | Từ dữ liệu định tuyến OSRM |
| Vật tư lấy tại kho đó | Danh sách tên rút gọn |

Bấm vào hàng: mở phiếu đáy có nút **"Chỉ đường"** (mở ứng dụng bản đồ của máy với tọa độ kho) và số điện thoại người phụ trách kho — bấm gọi được ngay.

Hai nút này là thứ người ngoài hiện trường cần nhất và hiện đang không có: họ phải tự tra địa chỉ và tự tìm số điện thoại.

---

## 6. Bảng yêu cầu vật tư — vai Phụ trách kho

Với vai kho, khối này **lên ngay dưới khối nắm bắt nhanh**, trước cả danh sách vật tư tổng.

Đây là việc của họ: nhận yêu cầu riêng cho từng mã hàng, và xác nhận xuất **từng dòng**.

```
YÊU CẦU CHO KHO CỦA BẠN            2/4 dòng
┌──────────────────────────────────────────┐
│ 💧 Nước uống đóng chai                   │
│    Cần: 4.500 chai                       │
│    Kho còn: 6.200 chai            ✓ Đủ   │
│    ┌────────────────────────────────┐    │
│    │ Số thực lấy   [−] 4.500 [+]    │    │
│    └────────────────────────────────┘    │
│    [ Xác nhận xuất ]      ( Báo thiếu )  │
├──────────────────────────────────────────┤
│ 🦺 Áo phao người lớn          ✓ Đã xuất  │
│    Đã xuất 90 cái lúc 14:05              │
│    bởi Nguyễn Văn A                      │
├──────────────────────────────────────────┤
│ 🛏 Chăn                        ⚠ Báo thiếu│
│    Cần 200, kho chỉ còn 120              │
│    "Còn lại đang cho thôn Phú Xuân mượn" │
└──────────────────────────────────────────┘
```

### 6.1. Ba trạng thái mỗi dòng

| Trạng thái | Thể hiện |
|---|---|
| Chờ xử lý | Có ô số thực lấy và hai nút |
| Đã xuất | Thu gọn, hiện số đã xuất, thời điểm, người thực hiện |
| Báo thiếu | Thu gọn, hiện số thiếu và lý do đã ghi |

### 6.2. Ô "Số thực lấy"

Điền sẵn số được yêu cầu, cho phép sửa. Trường hợp thực tế: kho lấy được ít hơn yêu cầu vì lô ngoài cùng bị hỏng.

Vượt tồn khả dụng thì chặn ngay tại chỗ kèm lý do:

> Kho chỉ còn 120 cái khả dụng (80 cái đang cho mượn)

Câu này nói rõ **vì sao** không đủ, không chỉ nói không đủ.

### 6.3. Báo thiếu

Mở phiếu đáy, bắt buộc nhập lý do. Lý do hiện lại cho người điều phối và cho lực lượng hiện trường — nên nó phải cụ thể.

### 6.4. Tiến độ tổng

Tiêu đề khối hiện `2/4 dòng`. Đây là con số người điều phối cần: biết còn nợ dòng nào, không phải một con số gộp kiểu "1/5" không nói được phải gọi cho ai.

---

## 7. Trợ lý hiện trường

Ô nhập cập nhật tại chỗ, có nút micro.

```
┌────────────────────────────────────┐
│ Nói hoặc gõ cập nhật tại chỗ       │
│ ┌────────────────────────────────┐ │
│ │ Nước đã rút, xe vào được đến   │ │
│ │ đầu thôn                   🎤  │ │
│ └────────────────────────────────┘ │
│              [ Gửi cập nhật ]      │
└────────────────────────────────────┘
```

Luồng ghi âm giống màn Báo tình huống (xem [12](12-BAO-TINH-HUONG.md)): giữ nút để ghi, thả để dừng, chữ nhận dạng được **chèn vào ô để người dùng sửa trước khi gửi**.

**Không bao giờ gửi thẳng chữ nhận dạng.** Nhận dạng giọng nói có thể sai, và cập nhật hiện trường sai làm lệch quyết định điều phối. Người nói phải xác nhận.

---

## 8. Diễn biến

Dòng thời gian dọc, **thu gọn mặc định**. Ghi lại: phát hành phương án, từng kho xác nhận xuất, các cập nhật hiện trường, kết quả giao.

Mỗi mục: chấm màu, thời gian, người thực hiện, nội dung.

---

## 9. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Đang tải | Khung xương: khối lớn + 3 hàng vật tư |
| Lỗi | `ErrorState` toàn màn + Thử lại |
| Ngoại tuyến | Dải báo; xem được từ bản lưu; mọi nút ghi vô hiệu kèm lý do |
| Lệnh đã đóng | Nút neo biến mất, thay bằng thẻ tóm tắt kết quả giao |
| Không có quyền | "Nhiệm vụ này ngoài phạm vi của bạn" + nút về danh sách |

---

## 10. Tương tác

| Thao tác | Kết quả |
|---|---|
| Nút Back | Về danh sách (hoặc về Thông báo nếu vào từ thông báo) |
| Chạm hàng kho | Phiếu đáy có nút Chỉ đường và Gọi điện |
| Chạm hàng vật tư | Mở chi tiết định mức: cơ sở tính, nguồn dẫn |
| Giữ nút micro | Ghi âm; thả thì dừng và nhận dạng |
| Kéo xuống | Tải lại |

**Cập nhật thời gian thực:** khi một kho xác nhận xuất, hàng tương ứng đổi trạng thái tại chỗ kèm hiệu ứng nhấp nháy 600 ms và tiến độ nhích. Không tải lại cả màn — người dùng có thể đang nhập ghi chú dở.

### 10.1. Chi tiết định mức — khối bổ sung

Chạm vào một hàng vật tư mở phiếu đáy giải thích con số:

```
Nước uống đóng chai
Cần 4.500 chai

Cách tính:
  150 người × 15 lít/người/ngày × 2 ngày
  = 4.500 lít = 4.500 chai (1 lít/chai)

Căn cứ: Sphere Handbook — mức nước tối thiểu
15 lít/người/ngày cho sinh hoạt và vệ sinh.
```

Đây là chỗ nguyên tắc *"không bịa số"* của sản phẩm trở nên nhìn thấy được với người dùng. Dữ liệu đã có sẵn ở backend; việc còn lại là hiện ra.

---

## 11. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Khối nắm bắt nhanh | Nhãn gộp: *"Lũ lụt, mức rất nguy hiểm, 150 người gặp nạn tại thôn Long Châu"* |
| Hàng vật tư | *"Áo phao người lớn, nhóm cứu hộ, đã cấp 90 trên 150 cái, còn thiếu 60 cái"* |
| Thanh tiến độ | `accessibilityValue` đầy đủ |
| Hàng kho | *"Kho xã Đồng Xuân, cách 2,1 km khoảng 8 phút, đã xuất hàng"* |
| Nút micro | `accessibilityHint="Giữ để ghi âm, thả để dừng"` |
| Cập nhật realtime | `accessibilityLiveRegion="polite"` |
| Nút neo | Nhãn nêu rõ nhiệm vụ nào |

---

## 12. Danh mục kiểm tra

- [ ] Thứ tự khối đảo theo vai: việc của vai nào lên đầu vai đó
- [ ] Biểu tượng thiên tai và vật tư là vector, không phải emoji
- [ ] Số người gặp nạn là con số lớn nhất màn hình
- [ ] Vật tư thiếu sắp lên đầu danh sách
- [ ] Có khối "Lấy hàng ở đâu" với khoảng cách và thời gian
- [ ] Hàng kho có nút Chỉ đường và Gọi điện
- [ ] Vai kho thấy bảng yêu cầu vật tư ngay dưới khối nắm bắt nhanh
- [ ] Mỗi dòng yêu cầu xử lý riêng, tiến độ hiện `2/4 dòng`
- [ ] Ô "Số thực lấy" điền sẵn và sửa được
- [ ] Vượt tồn khả dụng chặn tại chỗ và **nói rõ vì sao** (đang cho mượn)
- [ ] Báo thiếu bắt buộc lý do
- [ ] Chữ nhận dạng giọng nói **chèn vào ô để sửa**, không gửi thẳng
- [ ] Chạm hàng vật tư mở được giải thích cách tính định mức kèm nguồn
- [ ] Cập nhật realtime không tải lại cả màn
- [ ] Lệnh đã đóng: nút neo thay bằng thẻ tóm tắt kết quả
- [ ] Ngoại tuyến: xem được, mọi nút ghi vô hiệu kèm lý do

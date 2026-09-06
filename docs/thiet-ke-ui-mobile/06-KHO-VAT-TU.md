# 06 · Màn Kho vật tư

**Câu hỏi màn này trả lời:** *Món này còn bao nhiêu, nằm ở đâu, dùng được không?*

**Vai dùng:** Phụ trách kho (đầy đủ), Quản trị xã (chỉ nhập/xuất) · **Tệp hiện tại:** `InventoryScreen.tsx` — **1.886 dòng, tệp lớn nhất ứng dụng**

---

## 1. Việc cần làm trước khi vẽ

Tệp hiện tại gộp bảy nghiệp vụ kho, màn quét QR, hộp thoại mã QR, xuất hàng loạt, nhập lô mới, tìm kiếm ngữ nghĩa và chọn kho vào **một component 1.886 dòng với một `StyleSheet.create`**.

Phải tách trước khi vẽ lại, nếu không mọi thay đổi giao diện đều phải mò trong gần hai nghìn dòng:

```
app/(tabs)/inventory/
  index.tsx              danh sách + tìm kiếm + lọc      (~250 dòng)
  components/
    BatchCard.tsx        thẻ lô hàng
    LoanCard.tsx         thẻ khoản cho mượn
    FilterSheet.tsx      phiếu lọc
    WarehousePicker.tsx  chọn kho
  sheets/                7 phiếu thao tác → tệp 07
  scanner.tsx            quét QR → tệp 08
```

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│  Kho vật tư                   ⬤  🔔      │
│  Kho thôn Long Châu ⌄                    │
├──────────────────────────────────────────┤
│  ┌──────────────────────────────┬─────┐  │
│  │ 🔍 Tìm theo tên hoặc mã      │ ▣  │  │  ô tìm + nút quét QR
│  └──────────────────────────────┴─────┘  │
│                                          │
│  ( Tất cả 118 )( Cần chú ý 7 )( Cho mượn 4 )│  chip lọc, cuộn ngang
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 💧 WATER-01            ▌120 chai   │  │  ← BatchCard
│  │    Nước uống đóng chai              │  │
│  │    Lô L-0142 · Kệ A2-03            │  │
│  │    ● Mới      ● Trong kho          │  │
│  │    HSD 12/2027                     │  │
│  │  ┌──────┬──────┬──────┬─────────┐  │  │
│  │  │Nhập  │Xuất  │Chuyển│  ⋯      │  │  │  hành động
│  │  └──────┴──────┴──────┴─────────┘  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🦺 LIFE-ADULT           ▌48 cái    │  │
│  │    Áo phao người lớn                │  │
│  │    Lô L-0087 · Kệ B1-01            │  │
│  │    ● Cần kiểm tra ● Đang cho mượn  │  │
│  │    ⚠ 12 cái chưa hoàn về            │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Cập nhật lúc 14:20                      │
├──────────────────────────────────────────┤
│              ( + Nhập lô mới )           │  nút nổi, vùng dễ với
├──────────────────────────────────────────┤
│  ⌂     ▤     ☑     ✎     🔔              │
└──────────────────────────────────────────┘
```

---

## 3. Thẻ lô hàng (`BatchCard`) — thành phần trung tâm

Đây là thành phần dày đặc nhất của ứng dụng và là nơi quyết định màn này dùng được hay không.

### 3.1. Bố cục thẻ

```
┌─────────────────────────────────────────┐
│ ┌────┐ WATER-01              120        │  ← hàng 1
│ │ 💧 │ Nước uống đóng chai   chai       │
│ └────┘                                  │
│                                         │
│ Lô L-0142 · Kệ A2-03                    │  ← hàng 2
│                                         │
│ ● Mới        ● Trong kho    HSD 12/2027 │  ← hàng 3
│                                         │
│ ┌──────┬───────┬────────┬──────┐        │  ← hàng 4
│ │Nhập  │ Xuất  │Chuyển  │  ⋯   │        │
│ └──────┴───────┴────────┴──────┘        │
└─────────────────────────────────────────┘
```

| Hàng | Nội dung | Kiểu chữ |
|---|---|---|
| 1 | Ô biểu tượng nhóm 44 dp · mã SKU · tên vật tư · **số lượng và đơn vị** | SKU `label` màu `text-muted`, tên `subtitle`, số `number` 24 dp |
| 2 | Mã lô · vị trí kệ | `caption` |
| 3 | Nhãn tình trạng · nhãn lưu hành · hạn sử dụng | `ConditionPill` + `CirculationPill` + `caption` |
| 4 | Ba hành động hay dùng nhất + nút `⋯` mở phần còn lại | `Chip action`, cao 40 dp |

### 3.2. Hai nhãn trạng thái luôn đi cùng nhau

**Đây là điểm thiết kế quan trọng nhất của thẻ này.**

Mỗi lô mang hai chiều trạng thái tách biệt, và giao diện phải làm cả hai nhìn thấy được:

| Chiều | Giá trị |
|---|---|
| Tình trạng vật lý | Mới · Đã dùng · Cần kiểm tra · Hỏng |
| Trạng thái lưu hành | Trong kho · Đang cho mượn · Đã xuất |

Một lô còn tốt nhưng đang cho mượn thì **không khả dụng**. Đây là chỗ phần mềm kho thông thường hay đếm nhầm, và cũng là điểm khác biệt sản phẩm đã nêu trong hồ sơ dự thi. Gộp hai nhãn thành một là xóa mất chính điểm khác biệt đó.

Khi lô đang cho mượn, thêm một dòng cảnh báo cam:

> ⚠ 12 cái chưa hoàn về

### 3.3. Nhấn mạnh theo tình trạng

| Tình trạng | Thể hiện trên thẻ |
|---|---|
| Bình thường | Thẻ chuẩn |
| Cần kiểm tra | Viền trái 4 dp màu `attention` |
| Hỏng | Viền trái 4 dp màu `critical` + nền `critical-soft` rất nhạt |
| Gần hạn (≤ 30 ngày) | Chữ hạn sử dụng màu `attention` + biểu tượng `clock` |
| Đã quá hạn | Chữ hạn sử dụng màu `critical` + chữ "QUÁ HẠN" thay ngày |

### 3.4. Hành động trên thẻ

Bản hiện tại đặt bảy hành động vào một dải cuộn ngang. Cuộn ngang trong danh sách cuộn dọc là mẫu tương tác khó — người dùng không biết còn hành động nào bên phải, và cuộn dọc hay bị bắt nhầm.

**Bản mới: ba hành động thường dùng nhất hiện thẳng, phần còn lại trong nút `⋯`.**

| Vai | Ba hành động hiện thẳng | Trong `⋯` |
|---|---|---|
| Phụ trách kho | Nhập · Xuất · Chuyển | Kiểm kê · Điều chỉnh · Báo tình trạng · Mượn · Mã QR |
| Quản trị xã | Nhập · Xuất · Mã QR | — |
| Đội cứu hộ | *(không có hành động kho)* | Mã QR |

Nút `⋯` mở phiếu đáy liệt kê hành động còn lại, mỗi hành động một hàng có biểu tượng và một dòng mô tả ngắn — dễ đọc hơn hẳn chip nhỏ trong dải cuộn.

**Mã QR luôn xem được kể cả khi chỉ đọc** — in nhãn không đụng vào tồn kho. Giữ đúng cách làm hiện tại.

---

## 4. Tìm kiếm

### 4.1. Ô tìm kiếm

Cao 48 dp, nền `surface-sunken`, biểu tượng `search` bên trái, nút xóa `x` bên phải khi có chữ.

Bên phải ô là **nút quét QR** — không nằm trong ô, mà là nút riêng 48×48. Quét QR là lối vào nhanh nhất khi người dùng đang đứng trước kệ, phải luôn nhìn thấy.

### 4.2. Ba tầng tìm kiếm

| Tầng | Cách hoạt động | Độ trễ |
|---|---|---|
| 1. Lọc tại chỗ | Khớp chuỗi trên SKU, tên vật tư, mã lô — chạy trên dữ liệu đã tải | tức thì |
| 2. Tìm ngữ nghĩa | Gọi máy chủ khi tầng 1 không có kết quả và chuỗi ≥ 3 ký tự | sau 500 ms ngừng gõ |
| 3. Không có gì | Trạng thái trống do bộ lọc, kèm nút xóa tìm kiếm | — |

Khi kết quả đến từ tìm ngữ nghĩa, hiện dải giải thích phía trên danh sách:

> 🔎 Không có mã nào khớp "áo cứu sinh". Đây là 4 vật tư gần nghĩa nhất.

Người dùng phải biết đây không phải kết quả khớp chính xác — nếu không họ sẽ tưởng mình gõ đúng mã.

Tìm ngữ nghĩa **không chạy khi ngoại tuyến**; khi đó dừng ở tầng 1 và nói rõ.

---

## 5. Chip lọc

Cuộn ngang, dưới ô tìm kiếm. Mỗi chip kèm số đếm — số đếm giúp người dùng biết có đáng bấm không.

| Chip | Lọc |
|---|---|
| Tất cả | không lọc |
| Cần chú ý | tình trạng hỏng / cần kiểm tra, hoặc hạn ≤ 30 ngày |
| Cho mượn | đang có khoản chưa hoàn về |
| Gần hạn | hạn ≤ 30 ngày |
| Hết hàng | số lượng = 0 |

Chip đang chọn: nền `primary`, chữ `text-inverse`. Chỉ chọn được **một** chip.

Khi có chip đang bật, thêm nút "Xóa lọc" ở cuối dải.

---

## 6. Hai mục: Tồn kho và Cho mượn

Bản hiện tại có `section: "stock" | "loans"`. Giữ nguyên, trình bày bằng thanh mục phân đoạn dưới chip lọc:

```
┌─────────────────┬─────────────────┐
│   Tồn kho 118   │  Cho mượn 4     │
└─────────────────┴─────────────────┘
```

Mục "Cho mượn" hiện `LoanCard`: tên vật tư, bên mượn, số đã mượn, **số còn nợ** (nhấn mạnh), và nút "Ghi nhận hoàn trả".

Số còn nợ tính bằng `quantity − returnedOk − returnedDamaged − lost`, hiện cỡ `number` 20 dp màu `attention`.

---

## 7. Nút "Nhập lô mới"

Nút nổi neo trên thanh tab, canh giữa, `Button primary md` có biểu tượng `plus`.

Đặt ở đáy vì đây là hành động chính của màn và nó phải nằm trong vùng ngón cái. Bản hiện tại đặt nút này trong vùng cuộn — người dùng có 118 lô phải cuộn hết mới thấy.

Nút ẩn khi cuộn xuống, hiện lại khi cuộn lên — giữ được chỗ nhìn nội dung mà vẫn dễ gọi ra.

Chỉ hiện với vai có quyền nhập kho.

---

## 8. Chọn kho

Người phụ trách kho tổng thấy nhiều kho. Bộ chọn ở dòng phụ thanh tiêu đề, giống màn Tổng quan.

Phiếu đáy chọn kho hiện: tên kho, số lô, và chấm trạng thái vận hành.

---

## 9. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Đang tải | 3 khung xương hình thẻ lô hàng |
| Trống thật | "Kho này chưa có lô hàng nào" + nút Nhập lô mới |
| Trống do lọc | "Không có lô nào khớp *áo phao*" + nút Xóa tìm kiếm |
| Lỗi | `ErrorState` + nút Thử lại. **Không hiện con số nào** |
| Ngoại tuyến | Dải báo; mọi chip hành động vô hiệu kèm lý do; nút Nhập lô mới vô hiệu; **nút Mã QR vẫn dùng được** |

---

## 10. Tương tác

| Thao tác | Kết quả |
|---|---|
| Chạm thân thẻ | Mở phiếu đáy chi tiết lô (lịch sử giao dịch, thông tin đầy đủ) |
| Chạm chip hành động | Mở phiếu thao tác tương ứng (xem [07](07-THAO-TAC-KHO.md)) |
| Chạm `⋯` | Phiếu đáy các hành động còn lại |
| Chạm nút quét QR | Mở màn quét (xem [08](08-QUET-MA-QR.md)) |
| Kéo xuống | Tải lại |
| Cuộn tới cuối | Tải thêm trang tiếp (xem §11) |
| Nút Back cứng | Nếu đang tìm kiếm/lọc: xóa lọc. Nếu không: về tab Tổng quan |

**Không dùng vuốt ngang trên thẻ để gọi hành động.** Cử chỉ ẩn không phù hợp với người dùng không được đào tạo, và vuốt nhầm trên thao tác kho là ghi sai vào sổ.

---

## 11. Hiệu năng danh sách

Kho tổng có thể có hàng trăm lô. Yêu cầu bắt buộc:

| Yêu cầu | Cách làm |
|---|---|
| Danh sách ảo hóa | `FlashList` hoặc `FlatList` có `getItemLayout`. **Không dùng `ScrollView` + `map`** |
| Phân trang | Tải 30 lô mỗi lần, tải thêm khi còn cách cuối 10 phần tử |
| Ổn định chiều cao | Thẻ có chiều cao cố định theo biến thể để cuộn không giật |
| Ghi nhớ vị trí cuộn | Mở phiếu rồi đóng phải về đúng chỗ cũ |

Ghi chú liên hệ backend: phía máy chủ hiện chưa phân trang danh sách lô (`inventory.service.ts:110` không có `take`). Việc phân trang cần làm ở cả hai đầu — xem mục P1 của [bản rà soát](../RA-SOAT-HE-THONG-VA-KE-HOACH-TOI-UU.md).

---

## 12. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Thẻ lô | `accessible={true}` ở cấp thẻ, nhãn gộp: *"Nước uống đóng chai, mã WATER-01, 120 chai, lô L-0142, kệ A2-03, tình trạng mới, đang trong kho, hạn dùng tháng 12 năm 2027"* |
| Chip hành động | Nhãn nêu rõ đối tượng: *"Xuất kho lô L-0142 nước uống đóng chai"* |
| Chip lọc | `accessibilityState={{ selected }}` |
| Ô tìm kiếm | `accessibilityLabel="Tìm vật tư theo tên hoặc mã"` |
| Kết quả tìm ngữ nghĩa | Dải giải thích dùng `accessibilityLiveRegion="polite"` |
| Nút nổi | Không che nội dung khi trình đọc màn hình đang bật — dùng `accessibilityViewIsModal={false}` |

---

## 13. Danh mục kiểm tra

- [ ] `InventoryScreen.tsx` đã tách thành các tệp nhỏ hơn
- [ ] Thẻ lô hiện **cả hai** nhãn tình trạng và lưu hành, không gộp
- [ ] Lô đang cho mượn có dòng cảnh báo số chưa hoàn về
- [ ] Ba hành động hiện thẳng, phần còn lại trong `⋯` — không còn dải cuộn ngang
- [ ] Nút Mã QR dùng được cả khi chỉ đọc
- [ ] Nút quét QR luôn nhìn thấy, không nằm trong ô tìm kiếm
- [ ] Kết quả tìm ngữ nghĩa có dải giải thích rõ đây không phải khớp chính xác
- [ ] Chip lọc có số đếm
- [ ] Nút "Nhập lô mới" neo đáy, không nằm cuối danh sách cuộn
- [ ] Danh sách ảo hóa, không dùng `ScrollView` + `map`
- [ ] Mở phiếu rồi đóng giữ nguyên vị trí cuộn
- [ ] Trống do lọc khác trống thật
- [ ] Lô quá hạn hiện chữ "QUÁ HẠN" thay vì ngày
- [ ] Không có cử chỉ vuốt nào gọi thao tác kho
- [ ] Vai Đội cứu hộ không vào được màn này
- [ ] Quản trị xã chỉ thấy Nhập, Xuất, Mã QR

# 07 · Phiếu thao tác kho

**Câu hỏi màn này trả lời:** *Tôi ghi thay đổi này vào sổ kho như thế nào, và tôi có chắc chưa?*

**Vai dùng:** Phụ trách kho (7 thao tác), Quản trị xã (2 thao tác) · **Tệp hiện tại:** `InventoryScreen.tsx` — `BatchActionModal`, `ReturnLoanModal`, `BulkExportModal`, `ReceiveBatchModal`

---

## 1. Vì sao đây là màn quan trọng nhất

Đây là nơi duy nhất trong ứng dụng mà người dùng **thay đổi con số thật của kho**. Mọi thứ khác chỉ đọc.

Một phiếu xuất kho nhập sai số dẫn tới: tồn kho sai → mức sẵn sàng sai → phương án cứu trợ sai → thiếu hàng ở hiện trường. Chuỗi hệ quả này là lý do màn này được thiết kế **chậm hơn và nhiều xác nhận hơn** phần còn lại của ứng dụng.

**Nguyên tắc riêng của màn này: thà chậm một nhịp còn hơn ghi sai một lần.**

---

## 2. Khuôn chung cho cả bảy phiếu

Mọi thao tác dùng cùng một khuôn `BottomSheet`. Người dùng học một lần, dùng được cả bảy.

```
                                          ← nền tối 40%
┌──────────────────────────────────────────┐
│              ▬▬▬▬                        │  tay nắm kéo
│  Xuất kho                            ✕   │  title
├──────────────────────────────────────────┤
│  ┌────┐ WATER-01                         │  ← KHỐI NHẮC LÔ
│  │ 💧 │ Nước uống đóng chai              │    luôn có, không cuộn mất
│  └────┘ Lô L-0142 · Kệ A2-03             │
│         Hiện có: 120 chai                │
├──────────────────────────────────────────┤
│                                          │  ← VÙNG NHẬP (cuộn được)
│  Số lượng xuất                           │
│  ┌─────┐ ┌───────────────┐ ┌─────┐       │
│  │  −  │ │      20       │ │  +  │       │  NumberStepper
│  └─────┘ └───────────────┘ └─────┘       │
│          chai                            │
│                                          │
│  Còn lại sau khi xuất: 100 chai          │  ← XEM TRƯỚC KẾT QUẢ
│                                          │
│  Ghi chú                                 │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
├──────────────────────────────────────────┤
│  [ Xác nhận xuất 20 chai          ]      │  ← NÚT NEO, không cuộn
└──────────────────────────────────────────┘
```

### 2.1. Bốn phần bắt buộc của mọi phiếu

| Phần | Vì sao bắt buộc |
|---|---|
| **Khối nhắc lô** | Người dùng mở phiếu từ một danh sách dài. Không nhắc lại đang thao tác trên lô nào thì rất dễ ghi nhầm lô. Khối này **không cuộn mất** |
| **Xem trước kết quả** | Hiện số tồn sau thao tác, ngay khi người dùng gõ. Đây là cách rẻ nhất để bắt lỗi nhập nhầm trước khi ghi |
| **Nút neo đáy** | Nằm trong vùng ngón cái, không bị bàn phím che |
| **Nhãn nút nêu rõ việc** | "Xác nhận xuất 20 chai" chứ không phải "Xác nhận". Đây là lần cuối người dùng đọc được mình sắp làm gì |

### 2.2. Nhãn nút cập nhật theo số đang nhập

Nút phải đọc lại đúng con số hiện tại. Khi ô số trống hoặc bằng 0, nút vô hiệu và ghi "Nhập số lượng".

Đây là chi tiết nhỏ nhưng nó biến nút bấm thành câu xác nhận cuối cùng.

---

## 3. Bảy phiếu

### 7.1. Nhập kho (`import`)

Thêm số lượng vào một lô đã có.

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| Số lượng | `NumberStepper` | ✓ | ≥ 1 |
| Ghi chú | `TextArea` | — | |

Xem trước: `Sau khi nhập: 140 chai`

### 7.2. Xuất kho (`export`)

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| Số lượng | `NumberStepper` | ✓ | 1 … số hiện có |
| Mã nhiệm vụ | `TextField` | — | Có thì gắn xuất kho vào nhiệm vụ |
| Ghi chú | `TextArea` | — | |

**Chặn tại chỗ khi vượt tồn:** ô số viền đỏ, dòng lỗi *"Kho chỉ còn 120 chai"*, nút vô hiệu. Không để người dùng bấm rồi mới nhận lỗi từ máy chủ.

Xem trước: `Còn lại sau khi xuất: 100 chai`

### 7.3. Chuyển kho hoặc kệ (`transfer`)

| Trường | Kiểu | Bắt buộc |
|---|---|---|
| Số lượng | `NumberStepper` | ✓ |
| Kho đích | Bộ chọn phân cấp | ✓ |
| Kệ đích | Bộ chọn phân cấp | ✓ |
| Ghi chú | `TextArea` | — |

Bộ chọn đích là phiếu đáy hai cấp: **Kho → Khu → Kệ**. Kệ đang khóa hiện màu xám kèm chữ "đang khóa" và không chọn được.

**Cảnh báo tách lô.** Khi chuyển ít hơn toàn bộ, hiện dải giải thích trước khi xác nhận:

> ℹ Chuyển 20 trong 120 chai sẽ **tách lô**: 20 chai sang kệ mới giữ nguyên mã lô L-0142, 100 chai ở lại kệ cũ.

Người dùng không hiểu tách lô sẽ hoảng khi thấy hai dòng cùng mã lô sau đó.

### 7.4. Kiểm kê (`reconcile`)

Đối chiếu số đếm thực tế với sổ.

| Trường | Kiểu | Bắt buộc |
|---|---|---|
| Số đếm thực tế | `NumberStepper` | ✓ |
| Lý do chênh lệch | `TextArea` | ✓ khi có chênh lệch |

Xem trước là **phần quan trọng nhất của phiếu này**:

```
┌────────────────────────────────────┐
│  Sổ ghi        120 chai            │
│  Đếm thực tế   112 chai            │
│  ─────────────────────────────     │
│  Chênh lệch    −8 chai             │  ← màu attention, number 20 dp
└────────────────────────────────────┘
```

Khớp thì khối chuyển xanh với chữ "Khớp sổ", và ô lý do biến mất.

### 7.5. Điều chỉnh (`adjust`)

Sửa số liệu có ghi lý do. Ô số **điền sẵn số hiện tại** và `selectTextOnFocus`.

| Trường | Kiểu | Bắt buộc |
|---|---|---|
| Số lượng mới | `NumberStepper` | ✓ |
| Lý do | `TextArea` | ✓ **tối thiểu 3 ký tự** |

Xem trước hiện cả cũ, mới và chênh lệch.

**Lý do bắt buộc là quy tắc nghiệp vụ, không phải hình thức.** Nhãn ghi rõ "Lý do bắt buộc", và lỗi khi để trống là *"Điều chỉnh số liệu phải có lý do để hậu kiểm."* — nói được **vì sao** bắt buộc.

### 7.6. Báo tình trạng (`condition`)

Đổi tình trạng vật lý của lô.

| Trường | Kiểu | Bắt buộc |
|---|---|---|
| Tình trạng mới | 4 thẻ chọn | ✓ |
| Lý do | `TextArea` | ✓ tối thiểu 3 ký tự |

Bốn thẻ chọn xếp lưới 2×2, mỗi thẻ có biểu tượng, nhãn và màu của `ConditionPill`:

```
┌──────────────┐  ┌──────────────┐
│  ✓  Mới      │  │  ○  Đã dùng  │
└──────────────┘  └──────────────┘
┌──────────────┐  ┌──────────────┐
│  ?  Cần kiểm │  │  ✕  Hỏng     │
│     tra      │  │              │
└──────────────┘  └──────────────┘
```

Chọn "Hỏng" thì hiện cảnh báo hệ quả:

> ⚠ Lô hỏng sẽ **không được tính vào tồn khả dụng** và không xuất hiện trong phương án cấp phát.

Đây là hệ quả người dùng cần biết trước khi bấm, không phải sau.

### 7.7. Mượn vật tư (`borrow`)

| Trường | Kiểu | Bắt buộc |
|---|---|---|
| Số lượng | `NumberStepper` | ✓ |
| Bên mượn | `TextField` | ✓ |
| Ngày hẹn trả | Bộ chọn ngày | — |
| Ghi chú | `TextArea` | — |

Xem trước: `Sau khi cho mượn, tồn khả dụng còn 100 chai (20 chai đang cho mượn)`

Câu này nói rõ hai chiều trạng thái — số không mất đi, nhưng không còn khả dụng.

---

## 4. Ba phiếu ngoài nhóm bảy

### 4.1. Nhập lô mới (`ReceiveBatchModal`)

Phiếu dài nhất. Chia **ba bước** thay vì một biểu mẫu dài — biểu mẫu 8 trường trên màn điện thoại là chỗ người dùng bỏ giữa chừng.

```
Bước 1  Vật tư nào      chọn/tìm vật tư · mã lô
Bước 2  Bao nhiêu       số lượng · hạn dùng · tình trạng
Bước 3  Để ở đâu        kho · khu · kệ
        ─────────────────────────────────
        Xem lại toàn bộ rồi mới xác nhận
```

Thanh tiến trình 3 chấm trên đầu. Nút "Tiếp" ở mỗi bước, "Quay lại" cho phép sửa. Bước cuối hiện lại toàn bộ để soát.

Trường mã lô có nút "Tạo mã tự động" theo quy ước của xã — gõ tay mã lô là nguồn lỗi và trùng mã.

### 4.2. Xuất nhiều lô (`BulkExportModal`)

Chọn nhiều lô, xuất một lượt theo phương án.

Danh sách lô đã chọn, mỗi dòng có ô số lượng riêng. Chân phiếu hiện **tổng số dòng và tổng số lượng**. Xóa dòng bằng nút `x` ở cuối dòng.

### 4.3. Ghi nhận hoàn trả (`ReturnLoanModal`)

Ba ô số: **Trả tốt · Trả hỏng · Mất**.

```
Đang nợ: 20 cái

Trả tốt    [ − ]  12  [ + ]
Trả hỏng   [ − ]   3  [ + ]
Mất        [ − ]   0  [ + ]
──────────────────────────
Tổng hoàn   15 / 20 cái
Còn nợ       5 cái            ← attention
```

Tổng cập nhật theo thời gian thực. Vượt số nợ thì viền đỏ và nút vô hiệu. Tổng bằng 0 thì nút vô hiệu.

---

## 5. Xác nhận trước khi ghi

**Không phải thao tác nào cũng cần hộp thoại xác nhận.** Hỏi quá nhiều thì người dùng bấm qua theo phản xạ và xác nhận mất hết tác dụng.

| Thao tác | Có hộp thoại xác nhận? |
|---|---|
| Nhập kho | Không — cộng thêm, dễ sửa |
| Xuất kho ≤ 20% tồn | Không |
| **Xuất kho > 20% tồn** | **Có** |
| Chuyển kho/kệ | Không |
| Kiểm kê khớp sổ | Không |
| **Kiểm kê có chênh lệch** | **Có** |
| **Điều chỉnh** | **Có** |
| **Báo tình trạng thành Hỏng** | **Có** |
| Mượn | Không |
| Hoàn trả | Không |
| **Xuất nhiều lô** | **Có** |

Nội dung hộp thoại nêu **hậu quả**, không nêu hành động:

> **Xuất 100 trong 120 chai nước uống?**
> Kho Long Châu sẽ còn 20 chai. Thao tác ghi vào sổ kho và không hoàn tác được.
> `[ Xem lại ]` `[ Xác nhận xuất ]`

---

## 6. Chống ghi trùng

Mọi phiếu tạo một `requestId` ngay khi mở (bản hiện tại đã làm đúng — `createMutationRequestId`). Giữ nguyên và bổ sung ở lớp giao diện:

| Lớp | Cách chặn |
|---|---|
| Giao diện | Nút không nhận chạm ngay khi bắt đầu gửi |
| Giao diện | Phiếu không đóng được trong lúc đang gửi (chặn cả tay nắm kéo và nút Back) |
| Máy chủ | Khóa chống gửi trùng theo `requestId` |

---

## 7. Sau khi ghi

### 7.1. Thành công

1. Rung `Success`
2. Phiếu đóng, 240 ms
3. `Toast`: **"Đã xuất 20 chai khỏi lô L-0142"** — nêu số cụ thể, không nói "Thành công"
4. Thẻ lô trong danh sách phía sau **nhấp nháy nhẹ 600 ms** và hiện số mới

Bước 4 quan trọng: người dùng cần thấy kết quả của việc mình vừa làm ngay tại chỗ, không phải kéo làm mới.

### 7.2. Thất bại

1. Rung `Error`
2. **Phiếu KHÔNG đóng**
3. Dải lỗi hiện trên nút neo, `accessibilityLiveRegion="assertive"`
4. **Toàn bộ nội dung đã nhập giữ nguyên**

Đóng phiếu khi thất bại là bắt người dùng nhập lại từ đầu — trong lúc vội thì đó là lỗi khiến họ bỏ cuộc và quay lại ghi sổ giấy.

### 7.3. Lỗi thường gặp

| Nguyên nhân | Chữ hiện |
|---|---|
| Vượt tồn (chặn được ở giao diện, đây là hàng phòng thứ hai) | "Kho chỉ còn 120 chai. Số vừa nhập vượt quá tồn hiện có." |
| Người khác vừa đổi | "Số liệu vừa được người khác cập nhật. Tải lại rồi thao tác tiếp." + nút Tải lại |
| Kệ đích đang khóa | "Kệ A2 đang khóa, không nhận hàng. Chọn kệ khác." |
| Ngoài phạm vi kho | "Bạn không có quyền thao tác trên kho này." |
| Mất kết nối giữa chừng | "Chưa gửi được. Kiểm tra kết nối rồi bấm gửi lại." + nút Gửi lại |

Trường hợp cuối: **nút gửi lại dùng đúng `requestId` cũ**, nên bấm lại an toàn, không tạo hai bản ghi.

---

## 8. Ngoại tuyến

Không thao tác nào trong tệp này ghi được khi ngoại tuyến. Đây là chủ ý — mất mạng thì từ chối ghi, không giả vờ thành công.

Khi ngoại tuyến, chip hành động trên thẻ lô vô hiệu kèm dòng lý do:

> Cần có kết nối để ghi vào sổ kho

Chạm vào vẫn phát `Toast` giải thích, không im lặng.

---

## 9. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Phiếu | `accessibilityViewIsModal={true}`, bẫy tiêu điểm, trả tiêu điểm về chip đã mở nó |
| Tiêu điểm khi mở | Vào tiêu đề phiếu, **không** vào ô nhập — bàn phím bật ngay làm mất phương hướng |
| `NumberStepper` | `accessibilityRole="adjustable"`, `accessibilityValue={{ min, max, now }}`, hỗ trợ tăng/giảm bằng cử chỉ của trình đọc màn hình |
| Xem trước kết quả | `accessibilityLiveRegion="polite"` — đọc lại khi số đổi |
| Nút xác nhận | Nhãn đầy đủ: "Xác nhận xuất 20 chai khỏi lô L-0142" |
| Dải lỗi | `accessibilityLiveRegion="assertive"` |
| Thẻ chọn tình trạng | `accessibilityRole="radio"`, `accessibilityState={{ checked }}` |

---

## 10. Danh mục kiểm tra

- [ ] Cả bảy phiếu dùng chung một khuôn
- [ ] Khối nhắc lô luôn hiện, không cuộn mất
- [ ] Mọi phiếu có xem trước kết quả cập nhật theo thời gian thực
- [ ] Nhãn nút nêu rõ số lượng và cập nhật khi số đổi
- [ ] Nút neo đáy, không bị bàn phím che
- [ ] Vượt tồn bị chặn ngay ở giao diện, không đợi máy chủ
- [ ] Chuyển một phần có cảnh báo tách lô
- [ ] Kiểm kê hiện rõ sổ / đếm / chênh lệch
- [ ] Điều chỉnh và Báo tình trạng bắt buộc lý do, có nói vì sao bắt buộc
- [ ] Chọn "Hỏng" có cảnh báo hệ quả với tồn khả dụng
- [ ] Chỉ 5 thao tác có hộp thoại xác nhận, không phải tất cả
- [ ] Hộp thoại xác nhận nêu hậu quả, không nêu hành động
- [ ] Nhập lô mới chia 3 bước, có bước xem lại
- [ ] Ghi nhận hoàn trả có tổng cập nhật theo thời gian thực
- [ ] Thất bại: phiếu không đóng, nội dung giữ nguyên
- [ ] Gửi lại dùng đúng `requestId` cũ
- [ ] Thành công: `Toast` nêu số cụ thể + thẻ phía sau nhấp nháy hiện số mới
- [ ] Không phiếu nào ghi được khi ngoại tuyến, và có nói rõ vì sao
- [ ] Tiêu điểm khi mở phiếu vào tiêu đề, không vào ô nhập

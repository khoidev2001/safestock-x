# 10 · Màn Danh sách lệnh

**Câu hỏi màn này trả lời:** *Tôi đang có việc gì phải làm?*

**Vai dùng:** Đội cứu hộ · **Tệp hiện tại:** `MissionsScreen.tsx`

---

## 1. Bối cảnh

Đây là **màn mở đầu sau khi đăng nhập** của đội cứu hộ, và chú thích trong mã nguồn hiện tại đã nêu đúng lý do: *việc chính của họ là biết mình đang có lệnh nào, chứ không phải đi tìm trong danh sách thông báo*.

Người dùng màn này đang ở ngoài hiện trường, có thể đang trên xe, trong mưa, và cần biết trong ba giây: **có việc gì cần làm ngay không**.

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│  Lệnh cứu hộ                  ⬤  🔔²     │
│  Trần Văn B · Đội cứu hộ      │
├──────────────────────────────────────────┤
│                                          │
│  CẦN LÀM NGAY                            │  ← nhóm 1
│  ┌────────────────────────────────────┐  │
│  │▌🌊 Lũ lụt          ⚠ RẤT NGUY HIỂM │  │
│  │                                    │  │
│  │  150 người gặp nạn                 │  │  number 28 dp
│  │  📍 Thôn Long Châu                  │  │
│  │                                    │  │
│  │  Kho đã sẵn sàng · chờ giao        │  │  trạng thái
│  │  4 loại vật tư · 2 kho             │  │
│  │                                    │  │
│  │  [ Báo kết quả giao ]              │  │  hành động
│  └────────────────────────────────────┘  │
│                                          │
│  ĐANG CHẠY                               │  ← nhóm 2
│  ┌────────────────────────────────────┐  │
│  │▌⛰ Sạt lở              ⚠ NGUY HIỂM  │  │
│  │  40 người gặp nạn                  │  │
│  │  📍 Thôn Phú Xuân                   │  │
│  │  Kho đang chuẩn bị                 │  │
│  │  ▬▬▬▬▬▬▬▬░░░░  2/4 kho đã xuất     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ĐÃ ĐÓNG                            ⌄    │  ← nhóm 3 (thu gọn)
│                                          │
│  Cập nhật lúc 14:20                      │
├──────────────────────────────────────────┤
│  ➤     ✎     🔔                           │
└──────────────────────────────────────────┘
```

---

## 3. Ba nhóm, theo đúng thứ tự ưu tiên

Logic sắp xếp hiện có (`sortMissionsForFieldForce`) đã đúng. Bản mới **làm nó nhìn thấy được** bằng cách chia nhóm có tiêu đề, thay vì một danh sách phẳng đã sắp xếp.

| Nhóm | Điều kiện | Trình bày |
|---|---|---|
| **Cần làm ngay** | `fieldForceActionsFor(status).length > 0` — tức trạng thái `READY` | Thẻ đầy đủ, có nút hành động, nền `surface`, viền trái theo mức nguy hiểm |
| **Đang chạy** | Lệnh còn mở nhưng chưa tới lượt mình | Thẻ rút gọn, không có nút, có thanh tiến độ kho |
| **Đã đóng** | `COMPLETED` · `CANCELLED` | **Thu gọn mặc định**, mở ra thì hiện thẻ tối giản |

Danh sách phẳng buộc người dùng tự đọc trạng thái từng thẻ để biết cái nào tới lượt mình. Tiêu đề nhóm trả lời câu hỏi đó trước khi họ đọc thẻ nào.

Nhóm rỗng thì **ẩn cả tiêu đề**, trừ nhóm "Cần làm ngay" — nhóm này khi rỗng hiện:

> ✓ Không có lệnh nào chờ bạn xử lý

---

## 4. Thẻ lệnh (`MissionCard`)

### 4.1. Thứ tự thông tin

Sắp theo đúng thứ tự người ngoài hiện trường cần đọc:

```
1. Loại thiên tai + mức nguy hiểm   ← nhận diện trong 1 giây
2. Số người gặp nạn                 ← quy mô
3. Địa điểm                         ← đi đâu
4. Trạng thái + tiến độ             ← đang ở bước nào
5. Hành động                        ← bấm gì
```

### 4.2. Mức nguy hiểm

Logic `assessDanger` hiện có (loại thiên tai + số người) được giữ nguyên. Thể hiện bằng **ba tín hiệu**:

| Tín hiệu | Cách làm |
|---|---|
| Chữ | "RẤT NGUY HIỂM" / "NGUY HIỂM" / "CẦN CHÚ Ý" / "THEO DÕI" |
| Màu | Viền trái 4 dp + màu chữ nhãn |
| Biểu tượng | `alert-triangle` cho hai mức trên, `info` cho hai mức dưới |

Ba tín hiệu chứ không chỉ màu — đây là màn mà người mù màu đỏ–xanh vẫn phải phân biệt được việc gấp và việc không gấp.

### 4.3. Biểu tượng loại thiên tai

Bản hiện tại dùng emoji (`🌊 🌀 ⛰️ 🔥 🚧`). Thay bằng biểu tượng vector:

| Loại | Biểu tượng |
|---|---|
| Lũ lụt | `mci:waves` |
| Bão | `mci:weather-hurricane` |
| Sạt lở | `mci:landslide` |
| Cháy | `mci:fire` |
| Cô lập | `mci:road-variant` |
| Khác | `feather:alert-triangle` |

Giữ nguyên màu nhận diện của từng loại trong `disaster.ts`.

### 4.4. Số người gặp nạn

Cỡ `number` 28 dp — con số lớn nhất trên thẻ. Đây là thông tin quyết định quy mô ứng phó và người dùng phải đọc được từ xa, khi máy để trên bảng điều khiển xe.

### 4.5. Trạng thái

| Trạng thái | Nhãn hiển thị |
|---|---|
| `DRAFT` | Nháp |
| `PENDING_WAREHOUSE` | Kho đang chuẩn bị |
| `READY` | Kho đã sẵn sàng · chờ giao |
| `COMPLETED` | Hoàn thành |
| `CANCELLED` | Đã huỷ |

Với `PENDING_WAREHOUSE`, thêm thanh tiến độ theo số kho đã xuất xong: `2/4 kho đã xuất`.

Con số này quan trọng hơn một nhãn gộp: người điều phối và người hiện trường đều cần biết **còn chờ kho nào**, chứ không chỉ biết "đang chờ".

> **Ghi chú kỹ thuật.** Năm trạng thái `PENDING_RESCUE`, `RESCUE_CONFIRMED`, `REJECTED`, `DEFERRED`, `APPROVED` thuộc nhánh workflow cũ đã chết — xem mục N1 của [bản rà soát](../RA-SOAT-HE-THONG-VA-KE-HOACH-TOI-UU.md). **Không thiết kế giao diện cho chúng.** Nếu dữ liệu cũ còn mang các trạng thái này, hiển thị nhãn trung tính "Trạng thái cũ" và không hiện nút hành động nào.

### 4.6. Nút hành động

Chỉ hiện khi thao tác thực sự đi được. Nguyên tắc này đã có trong mã nguồn và phải giữ: *nút bấm vào là báo lỗi còn tệ hơn không có nút, nhất là với người đang đứng ngoài mưa*.

Với đội cứu hộ, chỉ có **một** hành động: `READY` → "Báo kết quả giao".

---

## 5. Báo kết quả giao

Thao tác quan trọng nhất của vai này. Mở phiếu đáy.

```
┌──────────────────────────────────────────┐
│              ▬▬▬▬                        │
│  Báo kết quả giao                    ✕   │
├──────────────────────────────────────────┤
│  🌊 Lũ lụt · Thôn Long Châu              │
│  150 người · 4 loại vật tư               │
├──────────────────────────────────────────┤
│  Kết quả thực tế                         │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ ✓  Giao đủ                         │  │
│  │    Đã giao hết vật tư theo phương án│ │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ◐  Giao một phần                   │  │
│  │    Kho sẽ đối soát và nhập lại phần │ │
│  │    chưa giao                       │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ✕  Không giao được                 │  │
│  │    Toàn bộ vật tư tự động nhập lại  │ │
│  │    về kho                          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Ghi chú                                 │
│  ┌────────────────────────────────────┐  │
│  │                                🎤  │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  [ Xác nhận: Giao đủ ]                   │
└──────────────────────────────────────────┘
```

### 5.1. Ba lựa chọn nêu rõ hệ quả kho

Đây là điểm thiết kế quan trọng nhất của phiếu. Mỗi lựa chọn có **một dòng nói hệ quả với kho**, vì ba lựa chọn dẫn tới ba xử lý tồn kho khác hẳn nhau:

| Lựa chọn | Hệ quả thật (theo `completeByRescue`) |
|---|---|
| Giao đủ | Không đụng kho — hàng đã giao hết theo phương án |
| Giao một phần | Không tự đoán số; gắn cảnh báo để kho đối soát nhập lại |
| Không giao được | **Tự nhập lại 100%** phần đã xuất về đúng lô cũ |

Người báo kết quả cần biết mình đang kích hoạt xử lý nào. Chọn nhầm "Không giao được" thay vì "Giao một phần" là làm sai lệch tồn kho của cả hai kho.

### 5.2. Ghi chú bắt buộc với hai lựa chọn dưới

"Giao một phần" và "Không giao được" **bắt buộc ghi chú tối thiểu 10 ký tự**. Đây là thông tin kho cần để đối soát và là căn cứ hậu kiểm.

Ô ghi chú có nút micro — người đang ngoài hiện trường, tay ướt, nói nhanh hơn gõ. Dùng chung cơ chế nhận dạng giọng nói tại chỗ của màn Báo tình huống.

### 5.3. Xác nhận

Hộp thoại xác nhận cho hai lựa chọn dưới, nêu hệ quả:

> **Báo "Không giao được"?**
> Toàn bộ vật tư đã xuất sẽ được nhập lại về kho. Nhiệm vụ kết thúc và không mở lại được.
> `[ Xem lại ]` `[ Xác nhận ]`

---

## 6. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Đang tải | 2 khung xương hình thẻ lệnh |
| Trống | `check-circle` màu `ready` + "Chưa có lệnh nào được giao cho bạn" |
| Lỗi | `ErrorState` + Thử lại |
| Ngoại tuyến | Dải báo; nút "Báo kết quả giao" vô hiệu kèm lý do; danh sách vẫn xem được từ bản lưu |

---

## 7. Tương tác

| Thao tác | Kết quả |
|---|---|
| Chạm thẻ | Mở chi tiết lệnh |
| Chạm nút hành động | Mở phiếu báo kết quả — **không mở chi tiết** |
| Kéo xuống | Tải lại |
| Chạm tiêu đề nhóm "Đã đóng" | Mở/thu gọn |
| Nút Back cứng | Hỏi thoát ứng dụng (đây là tab gốc của vai này) |

**Lệnh mới đến qua WebSocket:** thẻ trượt vào đầu nhóm "Cần làm ngay" kèm rung nhẹ và dải thông báo:

> 🔔 Có lệnh mới · Lũ lụt · Thôn Long Châu

**Không tự cuộn màn hình** và **không tự mở lệnh mới** — người dùng có thể đang đọc lệnh khác hoặc đang lái xe.

---

## 8. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Tiêu đề nhóm | `accessibilityRole="header"` |
| Thẻ lệnh | Nhãn gộp: *"Lũ lụt, rất nguy hiểm, 150 người gặp nạn tại thôn Long Châu, kho đã sẵn sàng chờ giao, 4 loại vật tư từ 2 kho"* |
| Nút hành động | *"Báo kết quả giao cho nhiệm vụ lũ lụt thôn Long Châu"* |
| Thanh tiến độ kho | `accessibilityValue={{ min: 0, max: 4, now: 2 }}` |
| Lựa chọn kết quả | `accessibilityRole="radio"`, nhãn đọc cả dòng hệ quả |
| Lệnh mới đến | `accessibilityLiveRegion="assertive"` |

---

## 9. Danh mục kiểm tra

- [ ] Chia ba nhóm có tiêu đề, không phải danh sách phẳng
- [ ] Nhóm "Cần làm ngay" rỗng vẫn hiện, với thông điệp tích cực
- [ ] Nhóm "Đã đóng" thu gọn mặc định
- [ ] Mức nguy hiểm có **ba** tín hiệu: chữ, màu, biểu tượng
- [ ] Biểu tượng thiên tai là vector, không phải emoji
- [ ] Số người gặp nạn là con số lớn nhất trên thẻ
- [ ] Trạng thái `PENDING_WAREHOUSE` hiện tiến độ theo số kho
- [ ] Không thiết kế giao diện cho 5 trạng thái thuộc nhánh workflow đã chết
- [ ] Chỉ hiện nút khi thao tác thực sự đi được
- [ ] Ba lựa chọn kết quả giao **đều nêu hệ quả với kho**
- [ ] "Giao một phần" và "Không giao được" bắt buộc ghi chú
- [ ] Ô ghi chú có nút micro
- [ ] Hai lựa chọn dưới có hộp thoại xác nhận nêu hệ quả
- [ ] Lệnh mới không tự cuộn và không tự mở
- [ ] Ngoại tuyến: danh sách vẫn xem được, nút bị vô hiệu kèm lý do

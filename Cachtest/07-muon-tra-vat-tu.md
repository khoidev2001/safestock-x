# 07 · Mượn và trả vật tư

Dành cho vật tư dùng lại được: xuồng, áo phao, máy phát điện, đèn pin.

**Ai làm:** phụ trách kho. **Ở đâu:** web (mục **Mượn, trả**) hoặc điện thoại (thẻ **Kho**).

Lực lượng hiện trường **không** tự thao tác mượn trả. Họ báo cần gì, người giữ kho
đối chiếu tồn rồi quyết định cho mượn.

## Phần 1 — Cho mượn

1. Đăng nhập `staff@`, mở **Mượn, trả**.
2. Chọn lô, nhập số lượng mượn.
3. Xác nhận.

**Kỳ vọng:**
- Lô chuyển sang trạng thái đang cho mượn.
- Tồn **vật lý** không đổi — hàng vẫn thuộc kho, chỉ là đang ở ngoài.
- Tồn **khả dụng** giảm — không cấp phát tiếp phần đang cho mượn được.

Đây là chỗ dễ hiểu nhầm: hàng cho mượn **chưa rời khỏi sổ sách**, khác hẳn hàng đã
xuất đi cứu trợ.

## Phần 2 — Hoàn trả

Khi hoàn, phải khai **ba con số riêng biệt**:

| Ô | Nghĩa |
|---|---|
| Trả tốt | dùng lại được ngay |
| Trả hỏng | hư trong quá trình dùng |
| Mất | không mang về được |

### Thử: mượn 2, hoàn 1 tốt + 1 hỏng

**Kỳ vọng:**
- Hàng tốt quay lại tồn sẵn sàng.
- Hàng hỏng **không** quay lại tồn sẵn sàng mà thành lô riêng chờ kiểm tra.
- Khoản nợ đóng lại.

**Vì sao tách hàng hỏng:** trộn áo phao rách vào tồn tốt nghĩa là lần cứu hộ sau có
người mặc phải nó. Trong cứu trợ, sai chỗ này không phải sai sổ sách mà là nguy hiểm
tính mạng.

### Thử: mượn 4, mất 1

**Kỳ vọng:** phần mất **làm giảm tồn vật lý thật** — hàng không còn nữa thì sổ sách
phải phản ánh đúng. Tồn không bao giờ được âm.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Tổng tốt + hỏng + mất **lớn hơn** số đang nợ | bị từ chối |
| Hoàn một phần | khoản nợ còn mở với phần chưa trả |
| Hoàn hết | khoản nợ đóng |
| Mượn quá tồn khả dụng | bị chặn |
| Mượn số âm hoặc 0 | bị chặn |
| Hoàn hai lần cùng phiếu | không cộng kho hai lần |
| Chuyển kho lô đang cho mượn | **bị chặn** trước khi tách lô |
| Hiện trường tự bấm mượn | **403** |

## Ảnh hưởng tới kiểm kê tháng

Hàng đang cho mượn **không nằm trên kệ** nên người đi đếm không thấy. Vì vậy khi
duyệt báo cáo kiểm kê, tồn của lô được tính bằng:

```
số đếm được  +  phần đang cho mượn
```

Xem chi tiết ở [08 · Kiểm kê tháng](08-kiem-ke-thang.md).

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3110/api
STAFF=<mã đăng nhập của staff@>

# cho mượn 2 đơn vị
curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" \
  -d '{"batchId":"<mã lô>","quantity":2}' $API/loans

# xem khoản đang mở
curl -s -H "Authorization: Bearer $STAFF" $API/loans/warehouses/<mã kho>/open

# hoàn: 1 tốt, 1 hỏng, 0 mất
curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" \
  -d '{"ok":1,"damaged":1,"lost":0}' $API/loans/<mã phiếu>/return
```

**Kỳ vọng:** sau khi hoàn, kiểm lại danh sách lô sẽ thấy một lô mới mang tình trạng
cần kiểm tra, chứa đúng 1 đơn vị hàng hỏng.

---

Tiếp theo: [08 · Kiểm kê tháng](08-kiem-ke-thang.md)

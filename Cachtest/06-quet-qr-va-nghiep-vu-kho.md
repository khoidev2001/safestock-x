# 06 · Quét mã và nghiệp vụ kho

**Ai làm:** phụ trách kho. **Ở đâu:** web (tiếp nhận, in nhãn) và điện thoại (quét, thao tác).

## Mã QR dùng để làm gì

Quét mã là để **tìm đúng lô hàng**, không phải để tự động cộng kho. Mọi thay đổi tồn
kho vẫn do người xác nhận số lượng rồi bấm gửi.

**Vì sao không tự động:** quét một nhãn không cho biết **bao nhiêu đơn vị** vừa về —
một thùng có thể 10 hay 100 chai. Nếu quét là tự cộng, quét nhầm hai lần sẽ nhân đôi
tồn kho mà không ai biết. Trong kho cứu trợ, số liệu sai nghĩa là điều xe đi lấy hàng
không có thật.

## Phần 1 — Tạo lô và in nhãn (web)

Hàng mới về thì **chưa có mã nào để quét**. Phải tạo lô trước.

1. Đăng nhập `staff@`, vào **Vật tư**.
2. Tiếp nhận hàng: chọn vật tư có sẵn hoặc khai mã mới, chọn kệ, nhập số lượng, hạn
   dùng, tình trạng.
3. Gửi → lô được tạo.
4. Mở hộp thoại mã QR → in nhãn dán lên thùng.

**Nội dung mã:**

```
safestock://inventory?sku=WATER-01&batch=LOT-2026-07-001
```

Chỉ có **mã vật tư và mã lô**. Không chứa mã đăng nhập, không chứa dữ liệu cá nhân —
nhãn dán ngoài thùng ai cũng nhìn thấy, nên trong đó không được có gì nhạy cảm.

## Phần 2 — Quét mã (điện thoại)

1. Đăng nhập `staff@`, vào thẻ **Kho**.
2. Bấm nút **QR** cạnh ô tìm kiếm.
3. Đưa nhãn vào khung.

**Kỳ vọng:** mã đọc được điền vào ô tìm kiếm, danh sách lọc còn đúng lô đó, kèm dòng
báo *"Đã quét SKU WATER-01 · lô LOT-2026-07-001"*.

Ứng dụng hiểu **ba dạng** nội dung: mã vật tư trần, chuỗi có cấu trúc, hoặc địa chỉ
`safestock://`.

4. Chọn lô → chọn thao tác → nhập số lượng → xác nhận.

## Bảy thao tác kho

| Thao tác | Việc |
|---|---|
| Nhập kho | thêm số lượng vào lô đã có |
| Xuất kho | trừ số lượng |
| Chuyển kho/kệ | dời hàng sang vị trí khác |
| Kiểm kê | đặt lại số lượng theo thực đếm |
| Điều chỉnh | sửa số lượng kèm lý do |
| Báo tình trạng | đổi tình trạng lô (hỏng, cần kiểm tra…) |
| Xuất hàng loạt | xuất nhiều lô một lần |

## Kỳ vọng cho từng phép thử

| Thử | Kỳ vọng |
|---|---|
| Xuất quá tồn | bị chặn, **không** ghi sổ |
| Chuyển **toàn bộ** một lô sang kệ khác | lô giữ nguyên mã, **không** sinh lô rỗng |
| Chuyển **một phần** | tách lô con, tổng số lượng không đổi |
| Lô đang có người mượn | **chặn** trước khi tách |
| Chuyển sang chính kệ đang đứng | không ghi sổ |
| Chuyển sang kho khác xã | bị chặn |
| Bấm gửi hai lần vì mạng chậm | **chỉ ghi một lần** |

Chống trùng dựa trên khoá do ứng dụng sinh cho mỗi thao tác.

## Case biên khi quét

| Thử | Kỳ vọng |
|---|---|
| Quét mã không chứa mã vật tư hợp lệ | báo *"QR không chứa SKU hợp lệ"*, không làm gì |
| Quét nhãn của lô đã hết hàng | vẫn tìm thấy, hiện số lượng 0 |
| Từ chối quyền camera | hiện nút xin quyền, không sập ứng dụng |
| Quét khi mất mạng | tìm được trong bản lưu, nhưng **không thao tác được** |

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3110/api
STAFF=<mã đăng nhập của staff@>

# tra cứu theo mã vật tư, đúng thứ nút QR làm phía sau
curl -s -H "Authorization: Bearer $STAFF" "$API/inventory/scan?sku=WATER-01"

# nhập thêm vào một lô
curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" \
  -d '{"batchId":"<mã lô>","quantity":10,"note":"Nhập bổ sung","requestId":"test-1"}' \
  $API/inventory/import
```

Gửi lại đúng lệnh thứ hai với cùng `requestId` → **không** cộng kho lần nữa.

## Nếu muốn nhanh hơn khi bốc dỡ hàng loạt

Ba hướng có thể làm thêm, chưa có trong bản hiện tại:

- **Quét xong mở thẳng ô nhập số lượng** — bỏ bước chọn lô và chọn thao tác. Nhanh
  hơn rõ rệt, vẫn giữ xác nhận.
- **Quét liên tục nhiều thùng** rồi xác nhận một lần cho cả xe hàng.
- **Nhúng số lượng vào nhãn** lúc in — nhưng chỉ đúng khi thùng còn nguyên.

---

Tiếp theo: [07 · Mượn và trả vật tư](07-muon-tra-vat-tu.md)

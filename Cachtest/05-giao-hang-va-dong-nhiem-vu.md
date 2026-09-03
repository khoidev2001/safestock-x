# 05 · Giao hàng và đóng nhiệm vụ

**Ai làm:** lực lượng hiện trường. **Ở đâu:** điện thoại, thẻ **Lệnh**.

## Vì sao bước này bắt buộc phải có

Không có bước đóng thì nhiệm vụ nằm mãi ở *Sẵn sàng*, trong khi vật tư **đã trừ khỏi
kho**. Không ai biết hàng tới nơi hay chưa, và hàng giao thất bại cũng không có đường
quay về sổ sách.

## Các bước

1. Đăng nhập `rescue`.
2. Mở ứng dụng — vào thẳng **Lệnh điều phối**, không phải màn chung chung.
3. Nhiệm vụ ở trạng thái **Kho đã sẵn sàng · chờ giao** có nút **Báo kết quả giao**.
4. Chọn một trong ba kết quả.

## Ba kết quả và hệ quả

| Chọn | Nhiệm vụ | Tồn kho |
|---|---|---|
| **Giao đủ** | Hoàn thành | giữ nguyên — hàng đã tới nơi |
| **Không giao được** | Hoàn thành | **hoàn về kho** |
| **Giao một phần** | Hoàn thành | **không tự đụng**, chờ đối soát tay |

Giao một phần không tự sửa kho vì máy không biết phần nào đã giao, phần nào mang về.
Đoán ở đây là làm sai sổ sách của kho cứu trợ.

## Sắp xếp danh sách

Danh sách lệnh xếp theo mức cần xử lý:

1. Việc **cần làm ngay** (đang chờ giao) lên đầu
2. Việc đang chạy (kho còn chuẩn bị)
3. Việc đã đóng xuống cuối

Trong cùng nhóm thì mới nhất trước.

## Nút chỉ hiện khi bấm được

Lệnh chưa tới bước giao thì **không có nút nào**. Nút bấm vào là báo lỗi còn tệ hơn
không có nút, nhất là với người đang đứng ngoài mưa.

| Trạng thái nhiệm vụ | Nút hiện ra |
|---|---|
| Nháp, Chờ kho chuẩn bị | không có |
| Kho đã sẵn sàng | **Báo kết quả giao** |
| Hoàn thành, Đã huỷ | không có |

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Bấm báo kết quả **lần thứ hai** | **400**, và **không hoàn kho thêm lần nữa** |
| Báo kết quả khi kho **chưa xuất xong** | **400** — hàng chưa ra khỏi kho thì không thể đã giao |
| Phụ trách kho tự báo thay người đi giao | **403** |
| Không có mã đăng nhập | **401** |
| Gửi kết quả ngoài ba giá trị hợp lệ | **400** |
| Bấm khi mất mạng | báo lỗi rõ ràng, không im lặng nuốt mất |

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3100/api
RESCUE=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"rescue","password":"rescue123"}' \
  $API/auth/login | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $RESCUE" \
  -d '{"outcome":"DELIVERED","note":"Giao đủ tại điểm tập kết"}' \
  $API/missions/<mã nhiệm vụ>/complete
```

**Kỳ vọng:** trả `status: COMPLETED`, `deliveryOutcome: DELIVERED`.

Đổi `DELIVERED` thành `FAILED` để thử hoàn kho, `PARTIAL` để thử trường hợp giao một
phần. Bấm lại lần hai phải trả **400**.

## Kiểm tra tồn kho có đúng không

Trước khi giao, ghi lại số lượng lô. Sau khi báo **Không giao được**, kiểm lại:

```bash
curl -s -H "Authorization: Bearer $STAFF" $API/inventory/warehouses/<mã kho>/batches
```

**Kỳ vọng:** số lượng trở về đúng mức trước khi kho chuẩn bị.

---

Tiếp theo: [06 · Quét mã và nghiệp vụ kho](06-quet-qr-va-nghiep-vu-kho.md)

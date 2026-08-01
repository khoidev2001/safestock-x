# 08 · Kiểm kê tháng

Định kỳ đối chiếu sổ sách với hàng thật trên kệ.

**Ai làm:** phụ trách kho lập phiếu, quản trị xã duyệt.
**Ở đâu:** web — kho vào **Kiểm kê**, xã vào **Báo cáo tháng**.

## Phần 1 — Kho lập phiếu và đếm

1. Đăng nhập `staff@` (hoặc tài khoản kho thôn), vào **Kiểm kê**.
2. Chọn kỳ báo cáo, ví dụ `2026-07`.
3. Bắt đầu kiểm kê — hệ thống liệt kê các lô đang có.
4. Nhập **số đếm thực tế cho từng lô**.
5. Kiểm tra lại rồi gửi.

**Kỳ vọng:** phiếu chuyển sang **Chờ duyệt**. Tồn kho **chưa thay đổi** — gửi phiếu
không tự sửa kho.

## Quy tắc quan trọng nhất: đếm theo lô

Khi một mã vật tư nằm ở **nhiều lô**, báo cáo **phải ghi rõ đếm được ở lô nào**. Hệ
thống từ chối số tổng.

**Vì sao:** mỗi lô có hạn dùng và tình trạng riêng. Nếu khai tổng 9 chai nước rồi để
máy tự chia, máy không biết 9 chai đó thuộc lô sắp hết hạn hay lô còn mới. Đoán hộ ở
đây là đoán hộ hạn dùng của hàng cứu trợ.

Thử khai số tổng cho mã có nhiều lô → **bị từ chối** kèm thông báo yêu cầu ghi rõ lô.

## Phần 2 — Xã duyệt

1. Đăng nhập `admin`, vào **Báo cáo tháng**.
2. Mở phiếu đang **Chờ duyệt**.
3. Bấm **Duyệt** hoặc **Từ chối** kèm lý do.

**Kỳ vọng khi duyệt:**
- Tồn kho được điều chỉnh về đúng số đã đếm.
- Ghi vào nhật ký để hậu kiểm.
- Điểm sẵn sàng của kho được tính lại.

**Kỳ vọng khi từ chối:** tồn kho **giữ nguyên**, phiếu chuyển sang bị từ chối.

## Hàng đang cho mượn tính thế nào

Người đi đếm chỉ thấy hàng **trên kệ**. Phần đang cho mượn đang ở ngoài hiện trường.
Nên sau khi duyệt:

```
tồn của lô  =  số đếm được  +  phần đang cho mượn
```

Ví dụ đã kiểm chứng: lô có 2 đơn vị đang cho mượn, người đếm khai 5 → sau duyệt tồn
là **7**, không phải 5.

Nếu hệ thống lấy đúng 5 thì 2 đơn vị đang cho mượn sẽ biến mất khỏi sổ sách, và khi
người ta mang trả thì không biết ghi vào đâu.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Khai số tổng cho mã có nhiều lô | **bị từ chối** |
| Khai lô không còn ở vị trí đã đếm | bị từ chối |
| Duyệt hai lần | lần hai không sửa kho thêm |
| Duyệt và từ chối bấm cùng lúc | **chỉ một** bên thắng, trạng thái nhất quán |
| Quản trị xã khác đơn vị bấm duyệt | **403**, không ghi gì |
| Một lô trong phiếu lỗi giữa chừng | **toàn bộ phiếu bị hoàn tác**, không sửa nửa vời |

Chỗ cuối quan trọng: nếu phiếu có 5 lô mà lô thứ 3 lỗi, thì 2 lô đầu cũng phải hoàn
tác. Sửa nửa vời để lại sổ sách không ai đọc nổi.

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3100/api
ADMIN=<mã đăng nhập của admin>

# danh sách phiếu
curl -s -H "Authorization: Bearer $ADMIN" $API/reports

# duyệt
curl -s -X POST -H "Authorization: Bearer $ADMIN" $API/reports/<mã phiếu>/approve

# từ chối kèm lý do
curl -s -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN" \
  -d '{"reason":"Số liệu chưa khớp thực tế"}' $API/reports/<mã phiếu>/reject
```

## Nhập bằng tệp bảng tính

Kho cũng có thể tải lên tệp `.xlsx` gồm bảy cột: mã vật tư, tên, số lượng, đơn vị,
hạn dùng, tình trạng, ghi chú.

Luồng giống hệt: tải lên → chờ duyệt → xã duyệt → mới áp vào tồn kho.

---

Tiếp theo: [09 · Cảm biến mô phỏng và chuông](09-cam-bien-mo-phong-va-chuong.md)

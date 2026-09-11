# 01 · Đăng nhập và phân quyền

## Ba vai, không hơn

| Vai | Tài khoản mẫu | Mật khẩu | Làm gì |
|---|---|---|---|
| Quản trị xã | `admin` | `admin123@` | Lập và duyệt phương án, quản lý tài khoản, xem nhật ký |
| Phụ trách kho | `staff` | `staff123` | Giữ kho, chuẩn bị vật tư, kiêm báo tình huống của thôn |
| Lực lượng hiện trường | `rescue` | `rescue123` | Nhận lệnh, đi giao, báo kết quả, báo tình huống |

Mọi tài khoản đều đăng nhập bằng **tên đăng nhập trần**, không phải địa chỉ email —
`admin`, `staff`, `longchau`, không kèm hậu tố tên miền.

Vai "trưởng thôn" riêng đã bị bỏ: người giữ kho thôn kiêm luôn việc báo tình huống
của thôn mình. Tách hai tài khoản chỉ thêm việc đăng nhập chứ không thêm quyền kiểm
soát nào.

## Test 1 — Web hiển thị đúng theo vai

Đăng nhập lần lượt ba tài khoản tại http://localhost:3200 và đếm số mục trên thanh
điều hướng.

| Mục | Quản trị | Kho | Hiện trường |
|---|:---:|:---:|:---:|
| Tổng quan | ✅ | ✅ | — |
| Điều phối cứu hộ | ✅ | ✅ | ✅ |
| Theo dõi, dự báo | ✅ | ✅ | — |
| Tra cứu kho | ✅ | ✅ | — |
| Vật tư | ✅ | ✅ | — |
| Kiểm kê | ✅ | ✅ | — |
| Mượn, trả | ✅ | ✅ | — |
| Sự cố | ✅ | ✅ | ✅ |
| Báo cáo tháng | ✅ | ✅ | — |
| Bản đồ kho | ✅ | ✅ | — |
| Cảm biến thử nghiệm | ✅ | ✅ | — |
| Tài khoản | ✅ | — | — |
| Nhật ký | ✅ | — | — |

**Kỳ vọng:** hiện trường chỉ thấy **đúng hai mục**. Thấy nhiều hơn là phân quyền hỏng.

## Test 2 — Điện thoại chọn giao diện theo vai

| Vai | Các thẻ |
|---|---|
| Hiện trường | Lệnh · Báo cáo · Cảnh báo |
| Phụ trách kho | Tổng quan · Sẵn sàng · Kho · Kiểm kê · Báo cáo · Cảnh báo |
| Quản trị xã | Kho (chỉ để quét mã tại kệ) |

**Kỳ vọng:** hiện trường **không có** thẻ Kho ở bất kỳ đâu. Họ xem xét tình hình
thực tế rồi gửi yêu cầu; việc đối chiếu tồn và quyết định cho mượn là của người giữ kho.

## Test 3 — Gõ thẳng địa chỉ không vào được

Đăng nhập `staff@`, gõ thẳng `http://localhost:3200/users` lên thanh địa chỉ.

**Kỳ vọng:** bị đẩy sang trang khác, không hiện danh sách tài khoản. Ẩn mục trên
thanh điều hướng là chưa đủ — người biết địa chỉ vẫn gõ được, nên máy chủ phải chặn.

## Test 4 — Máy chủ chặn thật, không chỉ giao diện

```bash
API=http://localhost:3110/api
TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"rescue","password":"rescue123"}' \
  $API/auth/login | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

curl -s -o /dev/null -w "danh sach tai khoan: %{http_code}\n" -H "Authorization: Bearer $TOKEN" $API/admin/users
curl -s -o /dev/null -w "nhat ky:             %{http_code}\n" -H "Authorization: Bearer $TOKEN" $API/audit
```

**Kỳ vọng:** cả hai trả **403**.

Đã kiểm chứng thật:

| Thử | Kết quả |
|---|---|
| Hiện trường xem danh sách tài khoản | 403 |
| Hiện trường xem nhật ký | 403 |
| Kho xem danh sách tài khoản | 403 |
| Kho xem nhật ký | 403 |
| Quản trị xem danh sách tài khoản | 200 |

## Test 5 — Phiên đăng nhập

1. Đăng nhập trên điện thoại.
2. Tắt hẳn ứng dụng rồi mở lại.

**Kỳ vọng:** vào thẳng, không phải đăng nhập lại. Phiên nằm trong kho lưu trữ an
toàn của máy, chỉ mở được khi máy đã mở khoá.

Thời hạn: mã truy cập sống 15 phút và tự gia hạn; phiên đăng nhập sống 7 ngày. Đội
hiện trường mất mạng quá 7 ngày, khi có sóng lại sẽ phải đăng nhập lại — điều đáng
biết trước với chiến dịch dài ngày.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Sai mật khẩu | báo lỗi rõ ràng, không cho vào |
| Đăng xuất rồi bấm quay lại | không vào lại được màn trong |
| Đăng xuất trên điện thoại | **xoá sạch bản lưu ngoại tuyến** |

---

Tiếp theo: [02 · Báo cáo tình huống](02-bao-cao-tinh-huong.md)

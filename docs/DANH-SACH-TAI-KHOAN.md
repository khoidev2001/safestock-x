# Danh sách tài khoản — SafeStock X (xã Đồng Xuân)

Đơn vị: **Hội Chữ thập đỏ xã Đồng Xuân**. Đăng nhập bằng **tên đăng nhập trần**,
không phải địa chỉ email (gõ `superadmindongxuan`, không phải `superadmindongxuan@...`).

Tổng cộng **21 tài khoản**. Cả 21 mật khẩu dưới đây đều đã được kiểm chứng bằng
đăng nhập thật vào API (21/21 thành công), không phải chép từ tài liệu.

## Quản trị xã — duyệt và phát hành nhiệm vụ

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `superadmindongxuan` | `admin123` | Nguyễn Khánh Trình | Toàn xã · **super admin** |

## Đội cứu hộ — chỉ đọc, gửi cập nhật hiện trường

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `rescue` | `rescue123` | Đội cứu hộ Đồng Xuân | Toàn xã |

## Phụ trách kho và trưởng thôn

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `kydu` | `truongthon123` | Trưởng thôn Kỳ Đu | Kho thôn Kỳ Đu |
| `longbinh` | `truongthon123` | Trưởng thôn Long Bình | Kho thôn Long Bình |
| `longchau` | `truongthon123` | Trưởng thôn Long Châu | Kho thôn Long Châu |
| `longha` | `truongthon123` | Trưởng thôn Long Hà | Kho thôn Long Hà |
| `longhoa` | `truongthon123` | Trưởng thôn Long Hòa | Kho thôn Long Hòa |
| `longmy` | `truongthon123` | Trưởng thôn Long Mỹ | Kho thôn Long Mỹ |
| `longthach` | `truongthon123` | Trưởng thôn Long Thạch | Kho thôn Long Thạch |
| `longthang` | `truongthon123` | Trưởng thôn Long Thăng | Kho thôn Long Thăng |
| `phuochue` | `truongthon123` | Trưởng thôn Phước Huệ | Kho thôn Phước Huệ |
| `phuson` | `truongthon123` | Trưởng thôn Phú Sơn | Kho thôn Phú Sơn |
| `staff` | `staff123` | Phụ trách kho trung tâm | Kho xã Đồng Xuân |
| `tanan` | `truongthon123` | Trưởng thôn Tân An | Kho thôn Tân An |
| `tanbinh` | `truongthon123` | Trưởng thôn Tân Bình | Kho thôn Tân Bình |
| `tanhoa` | `truongthon123` | Trưởng thôn Tân Hòa | Kho thôn Tân Hòa |
| `tanphu` | `truongthon123` | Trưởng thôn Tân Phú | Kho thôn Tân Phú |
| `tanphuoc` | `truongthon123` | Trưởng thôn Tân Phước | Kho thôn Tân Phước |
| `tanvinh` | `truongthon123` | Trưởng thôn Tân Vinh | Kho thôn Tân Vinh |
| `triemduc` | `truongthon123` | Trưởng thôn Triêm Đức | Kho thôn Triêm Đức |

## Ghi chú

- **Một super admin, nhiều quản trị xã.** `superadmindongxuan` là super admin duy nhất
  của hệ thống — không tạo thêm được người thứ hai. Quản trị xã (ADMIN) thì có bao nhiêu
  cũng được, và chính super admin là người tạo ra họ.
- Super admin khác quản trị xã đúng hai chỗ: tạo được tài khoản quản trị xã (bắt buộc
  kèm email đã xác minh bằng mã 6 số), và không tài khoản nào xoá được nó. Mọi tính năng
  còn lại giống hệt nhau.
- Xoá tài khoản: super admin xoá được tất cả trừ chính bậc super admin; quản trị xã chỉ
  xoá được bậc dưới (phụ trách kho, đội cứu hộ). Cả hai bậc đều tạo được tài
  khoản phụ trách kho và đội cứu hộ.
- Super admin chỉ cấp được từ máy chủ, và chuyển giao thì phải nói rõ:
  `pnpm --filter @safestock/backend prisma:promote-super-admin <login> [login-mới] [--chuyen]`.
- Tài khoản `iot` nêu trong một số tài liệu **chưa tồn tại** trong cơ sở dữ liệu này;
  tạo bằng `pnpm --filter @safestock/backend exec ts-node prisma/create-iot-account.ts` nếu cần.
- Khoá đăng nhập: sai **10 lần** thì tạm khoá 15 phút; từ lần sai thứ **5** hệ thống
  bắt đầu báo số lần còn lại.
- Mỗi người **tự sửa họ tên** trong hồ sơ cá nhân được.

> Đây là mật khẩu môi trường thử nghiệm. Trước khi đưa lên ungphonhanh.life phải đổi hết.

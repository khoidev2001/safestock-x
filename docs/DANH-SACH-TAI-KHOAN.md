# Danh sách tài khoản — SafeStock X

Đăng nhập bằng **tên đăng nhập trần**, không phải địa chỉ email (gõ `dongxuan`, không
phải `dongxuan@...`).

Tổng cộng **27 tài khoản**: 21 tài khoản của xã Đồng Xuân và 6 tài khoản quản trị các
xã lân cận. Cả 27 mật khẩu dưới đây đã được đối chiếu với mật khẩu lưu trong cơ sở dữ
liệu (27/27 khớp), không chép từ tài liệu cũ.

> **Đổi ngày 13/09/2026:** `staff` đổi thành `dongxuan`, `rescue` đổi thành
> `cuuhodongxuan`, và mỗi kho thôn có mật khẩu riêng `<tên đăng nhập>123` thay cho mật
> khẩu chung `truongthon123`. Máy nào đang đăng nhập các tài khoản này phải đăng nhập lại.

## Xã Đồng Xuân — Hội Chữ thập đỏ xã Đồng Xuân

### Quản trị xã — duyệt và phát hành nhiệm vụ

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `superadmindongxuan` | `admin123` | Nguyễn Khánh Trình | Toàn xã · **super admin** |
| `admindongxuan` | `admin123@` | Khôi | Toàn xã |

### Đội cứu hộ — chỉ đọc, gửi cập nhật hiện trường

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `cuuhodongxuan` | `cuuho123` | Đội cứu hộ Đồng Xuân | Toàn xã |

### Phụ trách kho trung tâm

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `dongxuan` | `dongxuan123` | Phụ trách kho trung tâm | Kho cứu trợ trung tâm Đồng Xuân |

### Trưởng thôn — phụ trách kho thôn (17 kho)

Mật khẩu mỗi thôn là tên đăng nhập thêm `123`.

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `kydu` | `kydu123` | Trưởng thôn Kỳ Đu | Kho thôn Kỳ Đu |
| `longbinh` | `longbinh123` | Trưởng thôn Long Bình | Kho thôn Long Bình |
| `longchau` | `longchau123` | Trưởng thôn Long Châu | Kho thôn Long Châu |
| `longha` | `longha123` | Trưởng thôn Long Hà | Kho thôn Long Hà |
| `longhoa` | `longhoa123` | Trưởng thôn Long Hòa | Kho thôn Long Hòa |
| `longmy` | `longmy123` | Trưởng thôn Long Mỹ | Kho thôn Long Mỹ |
| `longthach` | `longthach123` | Trưởng thôn Long Thạch | Kho thôn Long Thạch |
| `longthang` | `longthang123` | Trưởng thôn Long Thăng | Kho thôn Long Thăng |
| `phuochue` | `phuochue123` | Trưởng thôn Phước Huệ | Kho thôn Phước Huệ |
| `phuson` | `phuson123` | Trưởng thôn Phú Sơn | Kho thôn Phú Sơn |
| `tanan` | `tanan123` | Trưởng thôn Tân An | Kho thôn Tân An |
| `tanbinh` | `tanbinh123` | Trưởng thôn Tân Bình | Kho thôn Tân Bình |
| `tanhoa` | `tanhoa123` | Trưởng thôn Tân Hòa | Kho thôn Tân Hòa |
| `tanphu` | `tanphu123` | Trưởng thôn Tân Phú | Kho thôn Tân Phú |
| `tanphuoc` | `tanphuoc123` | Trưởng thôn Tân Phước | Kho thôn Tân Phước |
| `tanvinh` | `tanvinh123` | Trưởng thôn Tân Vinh | Kho thôn Tân Vinh |
| `triemduc` | `triemduc123` | Trưởng thôn Triêm Đức | Kho thôn Triêm Đức |

## Quản trị các xã lân cận

| Tên đăng nhập | Mật khẩu | Họ tên | Phạm vi |
|---|---|---|---|
| `admin.xuantho` | `admin123@` | Lê Thị Hoài Thu | Xã Xuân Thọ |
| `admin.tuyanbac` | `admin123@` | Phạm Văn Cường | Xã Tuy An Bắc |
| `admin.tuyantay` | `admin123@` | Ngô Thị Bích Hà | Xã Tuy An Tây |
| `admin.xuanlanh` | `admin123@` | Đặng Minh Tuấn | Xã Xuân Lãnh |
| `admin.phumo` | `admin123@` | So Bếp Mang | Xã Phú Mỡ |
| `admin.xuanphuoc` | `admin123@` | Huỳnh Quốc Đạt | Xã Xuân Phước |

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

- Database đang chạy mà vẫn còn tài khoản cũ (`staff`, `rescue`, `truongthon123`) thì đổi
  bằng script, không cần seed lại (seed xoá sạch tồn kho và nhiệm vụ):
  `pnpm --filter @safestock/backend exec ts-node prisma/rename-dong-xuan-accounts.ts --apply`
  (bỏ `--apply` để chạy thử trước).

> Đây là mật khẩu môi trường thử nghiệm. Trước khi đưa lên ungphonhanh.life phải đổi hết.

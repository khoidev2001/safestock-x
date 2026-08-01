# Danh sách tài khoản demo

Toàn bộ tài khoản do `pnpm --filter @safestock/backend seed` tạo ra. Danh sách này
lấy trực tiếp từ database sau khi seed, và **mọi mật khẩu đã được kiểm chứng bằng
đăng nhập thật** qua `POST /api/auth/login`.

> Đây là tài khoản **dữ liệu mẫu**, mật khẩu cố tình đơn giản để trình diễn. Không
> dùng bộ này cho hệ thống vận hành thật, và không mở cổng công khai khi còn chúng.

Hệ thống chỉ có **ba vai**: quản trị xã, phụ trách kho, lực lượng hiện trường. Vai
"trưởng thôn" riêng đã bị bỏ — người giữ kho thôn kiêm luôn việc báo tình huống của
thôn mình. Các tài khoản tên `truongthon*` vẫn giữ tên cũ nhưng mang vai **phụ trách
kho**.

---

## Ba tài khoản chính để trình diễn

| Tài khoản | Mật khẩu | Vai | Phạm vi |
|---|---|---|---|
| `admin` | `admin123@` | Quản trị xã | Toàn xã |
| `staff@ungphonhanh.life` | `staff123` | Phụ trách kho | Kho cứu trợ trung tâm Đồng Xuân |
| `rescue@ungphonhanh.life` | `rescue123` | Lực lượng hiện trường | Toàn xã |

Lưu ý tên đăng nhập của quản trị là **`admin`**, không phải địa chỉ email.

### Dùng ở đâu

| Ứng dụng | Tài khoản dùng được |
|---|---|
| Web | cả ba, mỗi vai thấy một tập chức năng khác nhau |
| Điện thoại | `staff@` (giao diện kho) · `rescue@` (giao diện hiện trường) · `admin` (chỉ quét QR) |
| Desktop | **chỉ `admin`** — chỉ vai này có quyền bơm số liệu mô phỏng |

---

## Mười tám tài khoản phụ trách kho thôn

Tất cả đều vai **phụ trách kho**, mỗi tài khoản gắn một kho thôn.

| Tài khoản | Mật khẩu | Kho phụ trách |
|---|---|---|
| `truongthon@ungphonhanh.life` | `reporter123` | Kho thôn Long Châu |
| `truongthon1@ungphonhanh.life` | `truongthon123` | Kho thôn Long Châu |
| `truongthon2@ungphonhanh.life` | `truongthon123` | Kho thôn Long Thăng |
| `truongthon3@ungphonhanh.life` | `truongthon123` | Kho thôn Long Hà |
| `truongthon4@ungphonhanh.life` | `truongthon123` | Kho thôn Long Bình |
| `truongthon5@ungphonhanh.life` | `truongthon123` | Kho thôn Long Mỹ |
| `truongthon6@ungphonhanh.life` | `truongthon123` | Kho thôn Long Thạch |
| `truongthon7@ungphonhanh.life` | `truongthon123` | Kho thôn Long Hòa |
| `truongthon8@ungphonhanh.life` | `truongthon123` | Kho thôn Kỳ Đu |
| `truongthon9@ungphonhanh.life` | `truongthon123` | Kho thôn Phước Huệ |
| `truongthon10@ungphonhanh.life` | `truongthon123` | Kho thôn Tân Bình |
| `truongthon11@ungphonhanh.life` | `truongthon123` | Kho thôn Tân An |
| `truongthon12@ungphonhanh.life` | `truongthon123` | Kho thôn Tân Hòa |
| `truongthon13@ungphonhanh.life` | `truongthon123` | Kho thôn Tân Phước |
| `truongthon14@ungphonhanh.life` | `truongthon123` | Kho thôn Tân Phú |
| `truongthon15@ungphonhanh.life` | `truongthon123` | Kho thôn Tân Vinh |
| `truongthon16@ungphonhanh.life` | `truongthon123` | Kho thôn Phú Sơn |
| `truongthon17@ungphonhanh.life` | `truongthon123` | Kho thôn Triêm Đức |

Hai tài khoản đầu **cùng trỏ về Kho thôn Long Châu** và mật khẩu khác nhau
(`reporter123` với `truongthon123`). Đây là dấu vết còn lại từ thời có vai trưởng
thôn riêng; cả hai đều dùng được, không phải lỗi.

Tổng cộng **21 tài khoản**: 1 quản trị + 1 hiện trường + 19 phụ trách kho (1 kho
trung tâm + 18 kho thôn).

---

## Điều dễ vấp khi trình diễn

**Một nhiệm vụ thường cần hai tài khoản kho.** AI phân bổ vật tư theo kho gần điểm
sự cố, nên một nhiệm vụ hay trải trên cả kho trung tâm lẫn kho thôn. Nếu chỉ đăng
nhập `staff@`, nhiệm vụ sẽ dừng ở *Chờ kho chuẩn bị* và **không bao giờ tới trạng
thái Sẵn sàng** — lúc đó không diễn được bước giao hàng.

Kiểm chứng thực tế với một báo cáo ngập tại thôn Phú Hòa: 5 loại vật tư được chia
thành **1 ở kho trung tâm** và **4 ở Kho thôn Long Châu**. Phải đăng nhập thêm
`truongthon1@ungphonhanh.life` mới hoàn tất được.

**Đăng xuất trên điện thoại xoá sạch bản lưu ngoại tuyến.** Nếu định trình diễn chế
độ mất mạng, đừng đăng xuất trước đó.

---

## Đặt lại về trạng thái ban đầu

```bash
pnpm be:db     # sinh Prisma client, đẩy schema, seed lại toàn bộ
```

Lệnh này **xoá sạch rồi dựng lại** dữ liệu, kể cả tài khoản. Không chạy trên hệ
thống vận hành thật.

Kịch bản test theo luồng: [HUONG-DAN-TEST-3-UNG-DUNG.md](HUONG-DAN-TEST-3-UNG-DUNG.md).

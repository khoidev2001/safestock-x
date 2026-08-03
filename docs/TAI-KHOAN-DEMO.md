# Danh sách tài khoản demo

Toàn bộ tài khoản do `pnpm --filter @safestock/backend seed` tạo ra. Danh sách này
lấy trực tiếp từ database sau khi seed, và **mọi mật khẩu đã được kiểm chứng bằng
đăng nhập thật** qua `POST /api/auth/login`.

> Đây là tài khoản **dữ liệu mẫu**, mật khẩu cố tình đơn giản để trình diễn. Không
> dùng bộ này cho hệ thống vận hành thật, và không mở cổng công khai khi còn chúng.

Hệ thống chỉ có **ba vai**: quản trị xã, phụ trách kho, lực lượng hiện trường. Vai
"trưởng thôn" riêng đã bị bỏ — người giữ kho thôn kiêm luôn việc báo tình huống của
thôn mình.

Tên đăng nhập của kho thôn đặt theo đúng tên thôn người đó giữ, bỏ dấu và viết liền:
`Kho thôn Phú Sơn` → `phuson@ungphonhanh.life`. Trước đây đánh số `truongthon1..17`
theo thứ tự seed nên muốn biết ai giữ kho nào phải tra bảng.

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

## Mười bảy tài khoản phụ trách kho thôn

Tất cả đều vai **phụ trách kho**, mật khẩu chung `truongthon123`, mỗi tài khoản gắn
đúng một kho thôn. Tên đăng nhập chính là tên thôn bỏ dấu viết liền, nên nhìn là biết
ai giữ kho nào — không phải tra bảng.

| Tài khoản | Kho phụ trách |
|---|---|
| `kydu@ungphonhanh.life` | Kho thôn Kỳ Đu |
| `longbinh@ungphonhanh.life` | Kho thôn Long Bình |
| `longchau@ungphonhanh.life` | Kho thôn Long Châu |
| `longha@ungphonhanh.life` | Kho thôn Long Hà |
| `longhoa@ungphonhanh.life` | Kho thôn Long Hòa |
| `longmy@ungphonhanh.life` | Kho thôn Long Mỹ |
| `longthach@ungphonhanh.life` | Kho thôn Long Thạch |
| `longthang@ungphonhanh.life` | Kho thôn Long Thăng |
| `phuochue@ungphonhanh.life` | Kho thôn Phước Huệ |
| `phuson@ungphonhanh.life` | Kho thôn Phú Sơn |
| `tanan@ungphonhanh.life` | Kho thôn Tân An |
| `tanbinh@ungphonhanh.life` | Kho thôn Tân Bình |
| `tanhoa@ungphonhanh.life` | Kho thôn Tân Hòa |
| `tanphu@ungphonhanh.life` | Kho thôn Tân Phú |
| `tanphuoc@ungphonhanh.life` | Kho thôn Tân Phước |
| `tanvinh@ungphonhanh.life` | Kho thôn Tân Vinh |
| `triemduc@ungphonhanh.life` | Kho thôn Triêm Đức |

Tổng cộng **20 tài khoản**: 1 quản trị + 1 hiện trường + 18 phụ trách kho (1 kho
trung tâm + 17 kho thôn).

Bản trước có thêm `truongthon@ungphonhanh.life` trỏ trùng Kho thôn Long Châu — dấu
vết từ thời có vai trưởng thôn riêng, đã bỏ vì 18 tài khoản cho 17 kho thì không ai
biết ai giữ kho nào.

---

## Điều dễ vấp khi trình diễn

**Một nhiệm vụ thường cần hai tài khoản kho.** AI phân bổ vật tư theo kho gần điểm
sự cố, nên một nhiệm vụ hay trải trên cả kho trung tâm lẫn kho thôn. Nếu chỉ đăng
nhập `staff@`, nhiệm vụ sẽ dừng ở *Chờ kho chuẩn bị* và **không bao giờ tới trạng
thái Sẵn sàng** — lúc đó không diễn được bước giao hàng.

Kiểm chứng thực tế với một báo cáo ngập tại thôn Phú Hòa: 5 loại vật tư được chia
thành **1 ở kho trung tâm** và **4 ở Kho thôn Long Châu**. Phải đăng nhập thêm
`longchau@ungphonhanh.life` mới hoàn tất được.

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

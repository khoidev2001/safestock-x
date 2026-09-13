# Danh sách tài khoản demo

Toàn bộ tài khoản do `pnpm --filter @safestock/backend seed` tạo ra. Danh sách này
lấy trực tiếp từ database sau khi seed, và **mọi mật khẩu đã được kiểm chứng bằng
đăng nhập thật** qua `POST /api/auth/login`.

> Đây là tài khoản **dữ liệu mẫu**, mật khẩu cố tình đơn giản để trình diễn. Không
> dùng bộ này cho hệ thống vận hành thật, và không mở cổng công khai khi còn chúng.

Hệ thống chỉ có **ba vai**: quản trị xã, phụ trách kho, đội cứu hộ. Vai
"trưởng thôn" riêng đã bị bỏ — người giữ kho thôn kiêm luôn việc báo tình huống của
thôn mình.

Tên đăng nhập của kho thôn đặt theo đúng tên thôn người đó giữ, bỏ dấu và viết liền:
`Kho thôn Phú Sơn` → `phuson`. Trước đây đánh số `truongthon1..17`
theo thứ tự seed nên muốn biết ai giữ kho nào phải tra bảng.

---

## Ba tài khoản chính để trình diễn

| Tài khoản | Mật khẩu | Vai | Phạm vi |
|---|---|---|---|
| `superadmindongxuan` | `admin123` | Super admin — quản trị xã (Nguyễn Khánh Trình) | Toàn xã |
| `admindongxuan` | `admin123@` | Quản trị xã (Khôi) | Toàn xã |
| `dongxuan` | `dongxuan123` | Phụ trách kho | Kho cứu trợ trung tâm Đồng Xuân |
| `cuuhodongxuan` | `cuuho123` | Đội cứu hộ | Toàn xã |
| `iot` | `iot123456` | App IoT (giả lập cảm biến) | Kho trung tâm |

Lưu ý mọi tài khoản đều đăng nhập bằng **tên đăng nhập trần**, không phải địa chỉ
email — `superadmindongxuan`, `dongxuan`, `longchau`, không kèm hậu tố tên miền.

App IoT phải dùng **tài khoản riêng `iot@`**, không dùng chung `admin`. Mỗi lượt
đăng nhập đều xoay khoá phiên của tài khoản đó, nên hai máy dùng chung một tài
khoản sẽ đá nhau: web đăng nhập là app IoT rớt phiên, số liệu đã chỉnh nằm lại
hàng chờ và không bao giờ gửi đi.

### Dùng ở đâu

Bảng này theo đúng kiến trúc trong PRD §945: **IoT chỉ có ở kho trung tâm**; kho
thôn không có thiết bị, vận hành bằng điện thoại.

| Nơi làm việc | Thiết bị | Tài khoản |
|---|---|---|
| Quản trị xã | Máy tính (web) | `superadmindongxuan` hoặc `admindongxuan` |
| **Kho trung tâm** | **Máy tính riêng**: web + app IoT | `dongxuan` cho web · `iot` cho app IoT |
| **Kho thôn** (17 kho) | **Điện thoại** | `<tênthôn>` — trưởng thôn tự quản kho của mình |
| Đội cứu hộ | Điện thoại | `cuuhodongxuan` |

Vì sao kho trung tâm cần **hai** tài khoản trên cùng một máy: mỗi lượt đăng nhập
xoay khoá phiên của tài khoản đó, nên web và app IoT dùng chung một tài khoản sẽ
đá nhau. App IoT là một THIẾT BỊ, cho nó danh tính riêng vừa tránh va chạm vừa
giúp nhật ký phân biệt số liệu do thiết bị bơm với thao tác do người làm.

---

## Mười bảy tài khoản phụ trách kho thôn

Tất cả đều vai **phụ trách kho**, mỗi tài khoản gắn đúng một kho thôn. Mật khẩu là
**tên đăng nhập cộng `123`** (`longchau` → `longchau123`) — không còn mật khẩu chung
`truongthon123`: một mật khẩu cho mười bảy người thì đổi được của một người là đổi
của cả mười bảy. Tên đăng nhập chính là tên thôn bỏ dấu viết liền, nên nhìn là biết
ai giữ kho nào — không phải tra bảng.

| Tài khoản | Kho phụ trách |
|---|---|
| `kydu` | Kho thôn Kỳ Đu |
| `longbinh` | Kho thôn Long Bình |
| `longchau` | Kho thôn Long Châu |
| `longha` | Kho thôn Long Hà |
| `longhoa` | Kho thôn Long Hòa |
| `longmy` | Kho thôn Long Mỹ |
| `longthach` | Kho thôn Long Thạch |
| `longthang` | Kho thôn Long Thăng |
| `phuochue` | Kho thôn Phước Huệ |
| `phuson` | Kho thôn Phú Sơn |
| `tanan` | Kho thôn Tân An |
| `tanbinh` | Kho thôn Tân Bình |
| `tanhoa` | Kho thôn Tân Hòa |
| `tanphu` | Kho thôn Tân Phú |
| `tanphuoc` | Kho thôn Tân Phước |
| `tanvinh` | Kho thôn Tân Vinh |
| `triemduc` | Kho thôn Triêm Đức |

Tổng cộng **28 tài khoản**: 2 quản trị xã Đồng Xuân + 1 đội cứu hộ + 18 phụ trách
kho (1 kho trung tâm + 17 kho thôn) + 6 quản trị xã lân cận + 1 tài khoản máy `iot`.

Sáu quản trị xã lân cận dùng chung mật khẩu `admin123@`: `admin.xuantho`,
`admin.tuyanbac`, `admin.tuyantay`, `admin.xuanlanh`, `admin.phumo`,
`admin.xuanphuoc`. Chúng chỉ tồn tại để bấm hai đầu luồng mượn — trả liên xã.

Bản trước có thêm `truongthon` trỏ trùng Kho thôn Long Châu — dấu
vết từ thời có vai trưởng thôn riêng, đã bỏ vì 18 tài khoản cho 17 kho thì không ai
biết ai giữ kho nào.

---

## Điều dễ vấp khi trình diễn

**Một nhiệm vụ thường cần hai tài khoản kho.** AI phân bổ vật tư theo kho gần điểm
sự cố, nên một nhiệm vụ hay trải trên cả kho trung tâm lẫn kho thôn. Nếu chỉ đăng
nhập `dongxuan`, nhiệm vụ sẽ dừng ở *Chờ kho chuẩn bị* và **không bao giờ tới trạng
thái Sẵn sàng** — lúc đó không diễn được bước giao hàng.

Kiểm chứng thực tế với một báo cáo ngập tại thôn Phú Hòa: 5 loại vật tư được chia
thành **1 ở kho trung tâm** và **4 ở Kho thôn Long Châu**. Phải đăng nhập thêm
`longchau` mới hoàn tất được.

**Đăng xuất trên điện thoại xoá sạch bản lưu ngoại tuyến.** Nếu định trình diễn chế
độ mất mạng, đừng đăng xuất trước đó.

---

## Đặt lại về trạng thái ban đầu

```bash
pnpm be:db     # sinh Prisma client, đẩy schema, seed lại toàn bộ
```

Lệnh này **xoá sạch rồi dựng lại** dữ liệu, kể cả tài khoản. Không chạy trên hệ
thống vận hành thật.

**Database đang chạy mà danh sách tài khoản lệch bảng trên** thì đừng seed lại — nó
xoá luôn tồn kho, nhiệm vụ và lịch sử giao dịch. Dùng script đồng bộ, chạy thử trước:

```bash
pnpm --filter @safestock/backend exec ts-node prisma/sync-account-roster.ts           # chạy thử
pnpm --filter @safestock/backend exec ts-node prisma/sync-account-roster.ts --apply   # ghi thật
pnpm --filter @safestock/backend prisma:communes                                       # 6 xã lân cận
```

Kịch bản test theo luồng: [HUONG-DAN-TEST-3-UNG-DUNG.md](HUONG-DAN-TEST-3-UNG-DUNG.md).

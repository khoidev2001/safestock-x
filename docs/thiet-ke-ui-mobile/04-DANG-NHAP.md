# 04 · Màn Đăng nhập

**Câu hỏi màn này trả lời:** *Làm sao vào được hệ thống?*

**Vai dùng:** tất cả · **Tệp hiện tại:** `App.tsx` (`LoginScreen`, dòng 332–397)

---

## 1. Bối cảnh

Đây là màn đầu tiên người dùng gặp, và với nhiều trưởng thôn thì đây là màn khó nhất — họ gõ email dài trên bàn phím ảo, có thể đang ở ngoài sân, và nếu sai thì không biết sai ở đâu.

Bản hiện tại đã đủ chức năng nhưng có bốn vấn đề: không xem được mật khẩu vừa gõ, thông báo lỗi lấy thẳng từ máy chủ, không có gì xử lý trường hợp APK chưa cấu hình địa chỉ máy chủ, và nút đăng nhập nằm cuối thẻ nên trên máy nhỏ có thể bị bàn phím che.

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│░░░░░░░░ vùng an toàn trên ░░░░░░░░░░░░░░░│
│                                          │
│                                          │
│              ⬤ LOGO                      │  96×96, canh giữa
│           Ứng phó nhanh                  │  title-lg
│    Điều phối cứu hộ cấp xã               │  caption, text-muted
│                                          │
│                                          │  ← khoảng trống 40 dp
│  Địa chỉ email                           │  label
│  ┌────────────────────────────────────┐  │
│  │ truongthon.longchau@...            │  │  TextField, cao 52
│  └────────────────────────────────────┘  │
│                                          │
│  Mật khẩu                                │
│  ┌──────────────────────────────┬─────┐  │
│  │ ••••••••                     │  👁  │  │  nút hiện/ẩn 48×48
│  └──────────────────────────────┴─────┘  │
│                                          │
│  ⚠ Email hoặc mật khẩu không đúng.       │  vùng lỗi (chỉ khi có lỗi)
│                                          │
│  ┌────────────────────────────────────┐  │
│  │        Đăng nhập                   │  │  Button primary lg (52)
│  └────────────────────────────────────┘  │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  🖧 Máy chủ: ungphonhanh.life        ⚙   │  chân trang
│░░░░░░░░ vùng an toàn dưới ░░░░░░░░░░░░░░░│
└──────────────────────────────────────────┘
```

---

## 3. Chi tiết từng phần

### 3.1. Khối thương hiệu

Logo 96×96 dp, có bản riêng cho chế độ tối. Bên dưới là tên sản phẩm và một dòng mô tả.

**Khi bàn phím mở, khối này thu nhỏ:** logo còn 48 dp, bỏ dòng mô tả, chuyển 200 ms. Không có bước này thì trên máy 5 inch, biểu mẫu bị đẩy ra ngoài vùng nhìn thấy.

### 3.2. Trường email

| Thuộc tính | Giá trị |
|---|---|
| `keyboardType` | `email-address` |
| `autoCapitalize` | `none` |
| `autoCorrect` | `false` |
| `autoComplete` | `username` — cho phép trình quản lý mật khẩu điền |
| `returnKeyType` | `next` → nhảy sang ô mật khẩu |
| `textContentType` | `emailAddress` |

Cắt khoảng trắng đầu cuối trước khi gửi. Bàn phím ảo Android hay tự thêm dấu cách sau khi gợi ý từ.

### 3.3. Trường mật khẩu

| Thuộc tính | Giá trị |
|---|---|
| `secureTextEntry` | mặc định `true` |
| `autoComplete` | `password` |
| `returnKeyType` | `done` → **gửi biểu mẫu** |

**Nút hiện/ẩn mật khẩu là bắt buộc.** Đây là bổ sung so với bản hiện tại. Gõ mật khẩu trên bàn phím ảo mà không nhìn thấy là nguồn thất bại lớn nhất ở màn này, nhất là với người lớn tuổi. Nút 48×48 dp bên trong ô, biểu tượng `feather:eye` / `feather:eye-off`, `accessibilityLabel` đổi theo trạng thái.

### 3.4. Nút Đăng nhập

`Button primary lg`, rộng hết bề ngang.

| Trạng thái | Thể hiện |
|---|---|
| Vô hiệu | Khi email rỗng hoặc mật khẩu rỗng |
| Đang chạy | "Đang đăng nhập…" + vòng xoay, giữ nguyên bề rộng |
| Sau khi thành công | Không đổi trạng thái nút — chuyển màn ngay |

### 3.5. Chân trang — địa chỉ máy chủ

Bổ sung so với bản hiện tại, và nó giải quyết một vấn đề có thật.

```
🖧 Máy chủ: ungphonhanh.life                    ⚙
```

Bản hiện tại có xử lý trường hợp `requireApiBase()` ném lỗi ("APK chưa được cấu hình địa chỉ") nhưng chỉ hiện lỗi đó ở màn Thông báo, sau khi đã đăng nhập. Người dùng gặp lỗi ở màn đăng nhập thì không có đường nào biết máy đang trỏ đi đâu.

- Chữ `caption`, màu `text-muted`, luôn hiện.
- Chấm trạng thái phía trước: xanh nếu vừa gọi được máy chủ, xám nếu chưa thử, đỏ nếu không tới được.
- Nút `⚙` mở phiếu đáy đổi địa chỉ máy chủ — **chỉ hiện khi bản dựng là bản thử nghiệm hoặc khi người dùng chạm 5 lần vào logo**. Bản phát hành cho xã không nên để người dùng đổi nhầm.

Khi đang ở mạng nội bộ mà tên miền không phân giải được, chân trang đổi thành:

> ⚠ Không tới được `ungphonhanh.life`. Nếu đang dùng Wi-Fi của xã, thử lại sau ít phút.

---

## 4. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Nghỉ | Biểu mẫu trống, nút vô hiệu |
| Đang khôi phục phiên | Màn chờ chỉ có logo, tối đa 2 giây. **Không nháy biểu mẫu đăng nhập** rồi mới chuyển — người dùng đã đăng nhập không được thấy màn này |
| Đang gửi | Nút "Đang đăng nhập…", hai ô nhập bị khóa |
| Sai thông tin | Vùng lỗi hiện dưới ô mật khẩu, ô mật khẩu viền đỏ và **được xóa trắng**, tiêu điểm về ô mật khẩu |
| Bị chặn do thử quá nhiều | Vùng lỗi kèm đồng hồ đếm ngược |
| Không có mạng | Vùng lỗi kèm nút Thử lại |
| Phiên hết hạn (bị đá về) | Dải thông báo trên đầu biểu mẫu |

### 4.1. Bảng thông điệp lỗi

Bản hiện tại hiển thị thẳng `e.message` từ máy chủ. Thay bằng bảng dịch cố định:

| Máy chủ trả về | Chữ hiện cho người dùng |
|---|---|
| 401 | "Email hoặc mật khẩu không đúng." |
| 429 (bị chặn) | "Đã nhập sai quá nhiều lần. Thử lại sau **14:32**." — hiện đồng hồ đếm ngược thật |
| Không có mạng | "Điện thoại đang không có mạng. Bật Wi-Fi rồi thử lại." |
| Không tới máy chủ | "Chưa kết nối được máy chủ xã. Kiểm tra Wi-Fi rồi thử lại." |
| Chưa cấu hình địa chỉ | "Ứng dụng chưa được cài đặt địa chỉ máy chủ. Liên hệ cán bộ phụ trách." |
| 5xx | "Máy chủ xã đang gặp sự cố. Báo cán bộ phụ trách nếu kéo dài." |

**Không nói rõ email tồn tại hay không.** Cả hai trường hợp đều trả về đúng một câu — nếu không thì đây thành công cụ dò danh sách tài khoản của xã.

### 4.2. Bị chặn do nhập sai nhiều lần

Máy chủ chặn sau 5 lần sai trong 15 phút. Giao diện phải nói rõ, kèm đồng hồ đếm ngược cập nhật từng giây:

```
┌────────────────────────────────────────┐
│ ⚠ Đã nhập sai quá nhiều lần            │
│                                        │
│ Thử lại sau 14:32                      │
│ Nếu quên mật khẩu, liên hệ quản trị xã.│
└────────────────────────────────────────┘
```

Nút Đăng nhập vô hiệu suốt thời gian đếm ngược. Không có bước này, người dùng bấm liên tục và mỗi lần bấm lại gia hạn thêm.

---

## 5. Tương tác

| Thao tác | Kết quả |
|---|---|
| Nhấn `next` ở ô email | Nhảy sang ô mật khẩu |
| Nhấn `done` ở ô mật khẩu | **Gửi biểu mẫu** |
| Chạm ra ngoài ô nhập | Đóng bàn phím |
| Nút Back cứng | Thoát ứng dụng (đây là màn gốc) |
| Chạm 5 lần vào logo | Hiện nút cấu hình máy chủ |
| Kéo xuống | Không có tác dụng — màn này không tải dữ liệu |

**Không tự động đăng nhập lại sau khi bị đá ra vì hết phiên.** Người dùng phải chủ động bấm — nếu không, một lỗi phía máy chủ có thể tạo vòng lặp đăng nhập liên tục.

---

## 6. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Logo | `accessibilityRole="image"`, `accessibilityLabel="Logo Ứng phó nhanh"` |
| Ô email | `accessibilityLabel="Địa chỉ email đăng nhập"` |
| Ô mật khẩu | `accessibilityLabel="Mật khẩu"`, `accessibilityState={{ invalid }}` khi lỗi |
| Nút hiện/ẩn | Nhãn đổi theo trạng thái: "Hiện mật khẩu" / "Ẩn mật khẩu" |
| Vùng lỗi | `accessibilityRole="alert"`, `accessibilityLiveRegion="assertive"` |
| Nút Đăng nhập | `accessibilityState={{ disabled, busy }}` |
| Đồng hồ đếm ngược | `accessibilityLiveRegion="polite"`, chỉ đọc lại mỗi 30 giây (đọc từng giây là tra tấn) |

---

## 7. Đáp ứng kích thước

| Chiều rộng | Điều chỉnh |
|---|---|
| 320 dp | Lề còn 12 dp; logo 72 dp |
| 360 dp | Chuẩn thiết kế |
| 412 dp trở lên | Biểu mẫu giới hạn bề rộng tối đa **360 dp** và canh giữa. Trường nhập kéo dài hết màn rộng khó đọc và trông lỏng lẻo |
| Xoay ngang | Khối thương hiệu chuyển sang trái, biểu mẫu sang phải, chia đôi màn |
| `fontScale` 1.3× | Ô nhập cao 60 dp; khối thương hiệu tự thu nhỏ |

---

## 8. Danh mục kiểm tra

- [ ] Có nút hiện/ẩn mật khẩu
- [ ] `done` ở ô mật khẩu gửi được biểu mẫu
- [ ] Khối thương hiệu thu nhỏ khi bàn phím mở; nút Đăng nhập không bị che trên máy 5 inch
- [ ] Không có thông điệp lỗi thô nào từ máy chủ lọt ra giao diện
- [ ] Email sai và mật khẩu sai cho **cùng một** thông báo
- [ ] Bị chặn 429 hiện đồng hồ đếm ngược thật, nút vô hiệu suốt thời gian đó
- [ ] Sai mật khẩu thì xóa trắng ô mật khẩu và đưa tiêu điểm về đó
- [ ] Chân trang hiện đúng địa chỉ máy chủ và trạng thái kết nối
- [ ] Người đã đăng nhập không thấy nháy màn này lúc mở app
- [ ] Trình quản lý mật khẩu của Android điền được (`autoComplete`)
- [ ] Chạy đúng ở chế độ tối, logo có bản riêng
- [ ] Không vỡ ở `fontScale` 1.3× và màn 320 dp

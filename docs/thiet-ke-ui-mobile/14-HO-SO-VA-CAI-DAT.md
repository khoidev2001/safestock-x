# 14 · Màn Hồ sơ và cài đặt

**Câu hỏi màn này trả lời:** *Tôi đang đăng nhập bằng tài khoản nào, và làm sao đổi thứ tôi cần đổi?*

**Vai dùng:** tất cả · **Tệp hiện tại:** chưa có — **màn bổ sung**

---

## 1. Vì sao cần màn này

Bản hiện tại không có màn hồ sơ. Hệ quả là ba việc bị đặt sai chỗ:

| Việc | Hiện đang ở đâu | Vấn đề |
|---|---|---|
| Đăng xuất | Góc trên phải nhiều màn | Vùng khó với nhất, lại nằm đúng chỗ ngón tay hay quét qua |
| Xem mình là ai, kho nào | Dòng phụ thanh tiêu đề, cắt một dòng | Tên vai dài bị cắt, không xem được đầy đủ |
| Đổi chế độ sáng/tối, kiểm tra kết nối, xem phiên bản | Không có | Không có chỗ nào |

Màn này gom cả ba, và mở từ **ảnh đại diện trên thanh tiêu đề** — vị trí quy ước mà người dùng Android đã quen.

---

## 2. Bố cục

```
┌──────────────────────────────────────────┐
│  ‹  Hồ sơ                                │
├──────────────────────────────────────────┤
│                                          │
│              ╭────────╮                  │
│              │   TĐK  │                  │  ảnh đại diện 88 dp
│              ╰────────╯                  │
│           Trần Đình Khôi                 │  title
│         Phụ trách kho                    │  chip vai
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Kho phụ trách                      │  │
│  │ Kho thôn Long Châu                 │  │
│  ├────────────────────────────────────┤  │
│  │ Xã                                 │  │
│  │ Đồng Xuân, Đắk Lắk                 │  │
│  ├────────────────────────────────────┤  │
│  │ Email                              │  │
│  │ truongthon.longchau@...            │  │
│  ├────────────────────────────────────┤  │
│  │ Số điện thoại                   ›  │  │  sửa được
│  │ 0396 225 940                       │  │
│  └────────────────────────────────────┘  │
│                                          │
│  HIỂN THỊ                                │
│  ┌────────────────────────────────────┐  │
│  │ Giao diện                       ›  │  │
│  │ Theo hệ thống                      │  │
│  ├────────────────────────────────────┤  │
│  │ Cỡ chữ lớn                    ( ○) │  │  công tắc
│  └────────────────────────────────────┘  │
│                                          │
│  KẾT NỐI                                 │
│  ┌────────────────────────────────────┐  │
│  │ ● Máy chủ xã            Đã kết nối │  │
│  │   ungphonhanh.life                 │  │
│  ├────────────────────────────────────┤  │
│  │ Dữ liệu đã lưu trên máy         ›  │  │
│  │ 2,4 MB · lưu lúc 14:20             │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │        Đăng xuất                   │  │  danger
│  └────────────────────────────────────┘  │
│                                          │
│  Ứng phó nhanh 0.6.0 (mã dựng 142)       │
│                                          │
└──────────────────────────────────────────┘
```

---

## 3. Khối danh tính

### 3.1. Ảnh đại diện

88 dp, bo tròn. Khi chưa có ảnh, hiện chữ cái đầu của họ tên trên nền màu suy ra từ tên — mỗi người một màu ổn định.

Chạm vào mở phiếu chọn ảnh: **Chụp ảnh · Chọn từ thư viện · Xóa ảnh**.

Ảnh nén xuống tối đa 512×512 trước khi gửi — người dùng chụp ảnh 12 MP trên mạng yếu của xã sẽ chờ rất lâu.

### 3.2. Vai

Chip màu, không phải chữ thường. Ba vai:

| Vai | Nhãn |
|---|---|
| `ADMIN` | Quản trị xã |
| `WAREHOUSE` | Phụ trách kho |
| `RESCUE` | Đội cứu hộ |

### 3.3. Khối thông tin

Bốn hàng. Ba hàng đầu **chỉ đọc** — chúng do quản trị xã cấp, không tự sửa được. Hàng chỉ đọc không có mũi tên và không phản hồi khi chạm.

Chỉ **số điện thoại** sửa được, vì đó là số người khác gọi khi cần liên hệ về nhiệm vụ.

**Hàng "Kho phụ trách" là hàng quan trọng nhất.** Người dùng cần chỗ xác nhận chắc chắn mình đang thao tác trên kho nào — thanh tiêu đề cắt một dòng nên không phải lúc nào cũng đọc đủ.

Người phụ trách nhiều kho thì hàng này liệt kê tất cả.

---

## 4. Hiển thị

### 4.1. Giao diện sáng/tối

Ba lựa chọn: **Theo hệ thống** (mặc định) · **Sáng** · **Tối**.

Đổi có hiệu lực ngay, không cần khởi động lại. Lưu vào máy, giữ qua các lần mở app.

Có lựa chọn thủ công là cần thiết chứ không thừa: người trực đêm muốn giao diện tối kể cả khi máy đang để chế độ sáng ban ngày.

### 4.2. Cỡ chữ lớn

Công tắc, nhân cỡ chữ toàn ứng dụng lên 1.15×.

Đây là lối tắt cho người không biết đổi cỡ chữ trong Cài đặt Android. Bố cục đã chịu được `fontScale` 1.3× nên công tắc này an toàn.

Ghi chú dưới công tắc: *"Đổi cỡ chữ của cả máy trong Cài đặt Android."*

---

## 5. Kết nối

### 5.1. Trạng thái máy chủ

```
● Máy chủ xã                    Đã kết nối
  ungphonhanh.life
```

Chấm trạng thái: `ready` khi vừa gọi thành công, `attention` khi đang thử lại, `critical` khi không tới được.

Chạm vào chạy kiểm tra ngay và hiện kết quả — thời gian phản hồi và thời điểm kiểm tra.

Đây là công cụ chẩn đoán đầu tiên khi có sự cố: cán bộ phụ trách hỏi "máy anh có vào được không" thì người dùng có chỗ để nhìn và trả lời.

### 5.2. Dữ liệu đã lưu trên máy

Hiện dung lượng và mốc lưu gần nhất. Chạm vào mở phiếu:

```
Dữ liệu đã lưu trên máy

Kho vật tư        1,2 MB   14:20 hôm nay
Nhiệm vụ          0,4 MB   14:18 hôm nay
Thông báo         0,3 MB   14:20 hôm nay
Nháp kiểm kê      0,5 MB   09:15 hôm nay   ⚠ chưa gửi

Dữ liệu được mã hóa trên máy và tự xóa khi
đăng xuất.

[ Xóa dữ liệu đã lưu ]
```

Dòng "Nháp kiểm kê — chưa gửi" có cảnh báo, và nút xóa hỏi rõ trước khi xóa mất công đếm của người dùng.

Câu về mã hóa nên có: người dùng cầm dữ liệu vật tư của xã trên máy cá nhân và họ có quyền biết nó được giữ thế nào.

---

## 6. Đăng xuất

`Button danger`, rộng hết bề ngang, **đặt cuối trang** — phải cuộn xuống mới tới. Đây là chủ ý: hành động phá phiên làm việc không nên nằm ở chỗ dễ chạm nhầm.

Hộp thoại xác nhận:

> **Đăng xuất khỏi ứng dụng?**
> Dữ liệu đã lưu trên máy sẽ bị xóa. Bạn cần có kết nối để đăng nhập lại.
> `[ Ở lại ]` `[ Đăng xuất ]`

**Khi còn việc chưa gửi**, hộp thoại đổi nội dung:

> **Còn 1 báo cáo kiểm kê chưa gửi**
> Đăng xuất sẽ **mất** nội dung đã đếm (18/42 lô). Gửi báo cáo trước khi đăng xuất.
> `[ Về gửi báo cáo ]` `[ Vẫn đăng xuất ]`

Câu *"Bạn cần có kết nối để đăng nhập lại"* quan trọng với người ở vùng sóng yếu: đăng xuất lúc đang ngoại tuyến là tự khóa mình ra khỏi cả dữ liệu đã lưu.

---

## 7. Chân trang

```
Ứng phó nhanh 0.6.0 (mã dựng 142)
```

Chạm 7 lần mở màn chẩn đoán dành cho người hỗ trợ kỹ thuật: địa chỉ máy chủ, mã thiết bị, trạng thái quyền (camera, micro), nhật ký lỗi gần nhất. Không hiện trong luồng thường.

---

## 8. Trạng thái

| Trạng thái | Thể hiện |
|---|---|
| Đang tải hồ sơ | Khung xương khối danh tính |
| Lỗi tải | Hiện thông tin từ phiên đăng nhập + dòng lỗi nhỏ. **Không chặn màn** — đăng xuất và đổi giao diện vẫn phải dùng được |
| Ngoại tuyến | Hiện thông tin từ bản lưu; sửa số điện thoại và đổi ảnh vô hiệu kèm lý do; **đổi giao diện và đăng xuất vẫn dùng được** |
| Đang tải ảnh lên | Ảnh đại diện phủ lớp mờ + vòng tiến trình |

Nguyên tắc chung: **màn này phải dùng được kể cả khi mọi thứ khác hỏng**. Nó là chỗ người dùng tới khi có sự cố.

---

## 9. Trợ năng

| Phần tử | Yêu cầu |
|---|---|
| Ảnh đại diện | `accessibilityLabel="Ảnh đại diện của Trần Đình Khôi. Chạm để đổi."` |
| Hàng chỉ đọc | **Không** gán `accessibilityRole="button"` — trình đọc màn hình không được gợi ý là bấm được |
| Hàng sửa được | `accessibilityRole="button"` + gợi ý hành động |
| Công tắc | `accessibilityRole="switch"`, `accessibilityState={{ checked }}` |
| Trạng thái máy chủ | Nhãn đọc cả trạng thái, cập nhật khi đổi |
| Nút Đăng xuất | `accessibilityRole="button"`, hộp thoại xác nhận nhận tiêu điểm |

---

## 10. Danh mục kiểm tra

- [ ] Mở được từ ảnh đại diện trên thanh tiêu đề ở mọi màn cấp tab
- [ ] Đăng xuất **chỉ có ở màn này**, không còn trên thanh tiêu đề nào
- [ ] Nút Đăng xuất ở cuối trang, phải cuộn mới tới
- [ ] Hộp thoại đăng xuất cảnh báo mất dữ liệu đã lưu
- [ ] Còn việc chưa gửi thì hộp thoại đổi nội dung và nêu rõ mất gì
- [ ] Hàng "Kho phụ trách" hiện đầy đủ, không cắt
- [ ] Hàng chỉ đọc không có mũi tên và không nhận chạm
- [ ] Đổi giao diện sáng/tối có hiệu lực ngay
- [ ] Trạng thái máy chủ kiểm tra được ngay khi chạm
- [ ] Hiện được dung lượng và mốc lưu của dữ liệu trên máy
- [ ] Nháp chưa gửi có cảnh báo riêng trong danh sách dữ liệu đã lưu
- [ ] Ảnh đại diện nén trước khi tải lên
- [ ] Màn dùng được khi ngoại tuyến và khi lỗi tải hồ sơ
- [ ] Có số phiên bản ở chân trang

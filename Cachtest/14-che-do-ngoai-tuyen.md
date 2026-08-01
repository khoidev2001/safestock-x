# 14 · Chế độ ngoại tuyến

Đây là phần đáng trình diễn nhất, vì bối cảnh thật là **thiên tai làm mất mạng**.
Một hệ thống cứu trợ chỉ chạy khi có Internet là hệ thống chết đúng lúc cần nhất.

## Ba lớp ngoại tuyến

| Ứng dụng | Làm được gì khi mất mạng |
|---|---|
| Điện thoại | xem dữ liệu đã tải, ghi thao tác vào hàng chờ |
| Desktop | đối chiếu ngưỡng tại chỗ, **kêu chuông**, xếp hàng thao tác |
| Máy chủ tại kho | chạy đủ nghiệp vụ trong mạng nội bộ, kể cả AI |

## Test 1 — Điện thoại mất mạng

1. Đăng nhập điện thoại khi còn mạng, mở qua các thẻ để dữ liệu được tải về.
2. **Bật chế độ máy bay.**

**Kỳ vọng:**
- Thanh trạng thái hiện **đang ngoại tuyến**.
- Vẫn xem được tồn kho, nhiệm vụ, điểm sẵn sàng — bằng dữ liệu đã tải.
- Có ghi rõ **dữ liệu tính đến lúc nào**.

Mốc thời gian đó không phải chi tiết trang trí: người dùng phải biết mình đang nhìn số
liệu cũ bao lâu rồi trước khi quyết định điều hàng.

3. Gửi một báo cáo tình huống khi vẫn ngoại tuyến.

**Kỳ vọng:** báo cáo vào **hàng chờ**, hiện số thao tác đang chờ gửi.

4. Tắt chế độ máy bay.

**Kỳ vọng:** hàng chờ **tự gửi lên**, số đang chờ về 0, dữ liệu được làm mới.

## Test 2 — Gửi trùng khi có mạng lại

1. Ngoại tuyến, gửi một báo cáo.
2. Bật mạng, để nó gửi lên.
3. Ngắt mạng ngay giữa lúc gửi rồi bật lại.

**Kỳ vọng:** hệ thống chỉ ghi **một** bản ghi, không ra hai.

**Vì sao được:** mỗi thao tác mang một mã yêu cầu riêng sinh từ lúc bấm nút. Gửi lại
cùng mã đó thì máy chủ trả về kết quả cũ thay vì tạo mới.

Không có cơ chế này thì mạng chập chờn ở vùng lũ sẽ đẻ ra hàng loạt phương án trùng.

## Test 3 — Desktop mất mạng vẫn kêu chuông

Xem chi tiết ở [09 · Cảm biến mô phỏng và chuông](09-cam-bien-mo-phong-va-chuong.md),
phần Test 2.

Tóm tắt: ngưỡng đã lưu sẵn trong máy, tiếng chuông tự sinh bằng bộ tạo âm. Không cần
mạng, không cần tải tệp âm thanh.

## Test 4 — Cả kho mất Internet nhưng LAN còn

Đây là kịch bản thật nhất: trụ sở mất Internet, nhưng mạng nội bộ, máy chủ và cảm
biến vẫn cắm điện.

1. Rút dây Internet của bộ định tuyến (**giữ nguyên mạng nội bộ**).
2. Từ máy trong cùng mạng, mở địa chỉ nội bộ của máy chủ.

**Kỳ vọng:** vào bình thường. Đăng nhập, xem kho, lập phương án, kéo cảm biến, chuông
kêu — **tất cả vẫn chạy**.

3. Thử hỏi trợ lý AI.

**Kỳ vọng:** vẫn trả lời, vì mô hình chạy ngay trên máy đó.

4. Thử tính đường đi giao hàng.

**Kỳ vọng:** vẫn tính được, vì bản đồ định tuyến chạy cục bộ.

**Điều duy nhất mất:** điện thoại ở **ngoài** mạng nội bộ không vào được. Xem lý do ở
[15 · Một tên miền, hai đường đi](15-mot-ten-mien-hai-duong-di.md).

## Test 5 — Đăng xuất xoá dữ liệu tạm

1. Đang ngoại tuyến trên điện thoại, bấm đăng xuất.

**Kỳ vọng:** dữ liệu đã tải bị xoá sạch.

**Vì sao:** điện thoại đi hiện trường dễ mất. Tồn kho và danh sách hộ dân không nên
nằm lại trong máy sau khi người dùng đã đăng xuất.

**Hệ quả khi trình diễn:** đăng xuất rồi mà chưa có mạng lại thì sẽ **không xem được
gì**. Đừng đăng xuất giữa phần trình diễn ngoại tuyến.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Mở ứng dụng lần đầu khi đang ngoại tuyến | báo chưa có dữ liệu, không treo |
| Ngoại tuyến, gửi 5 thao tác | hàng chờ giữ đủ 5, gửi lên đúng thứ tự |
| Mạng chập chờn (lúc có lúc không) | không gửi trùng, không mất thao tác |
| Mã đăng nhập hết hạn khi đang xếp hàng | hàng chờ giữ lại, gửi sau khi đăng nhập lại |
| Máy chủ trả lỗi cho thao tác trong hàng chờ | báo rõ thao tác nào hỏng, không im lặng nuốt |

Chỗ cuối đáng chú ý: hàng chờ **không được im lặng bỏ qua** thao tác thất bại. Người
dùng tưởng đã báo cáo mà thực ra chưa có gì tới nơi là tình huống tệ nhất.

---

Tiếp theo: [15 · Một tên miền, hai đường đi](15-mot-ten-mien-hai-duong-di.md)

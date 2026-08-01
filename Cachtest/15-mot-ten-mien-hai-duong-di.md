# 15 · Một tên miền, hai đường đi

Người dùng chỉ cần nhớ **một địa chỉ**: `ungphonhanh.life`. Máy tự chọn đường tuỳ
tình huống mạng.

Không bắt cán bộ xã nhớ *"ở cơ quan gõ 192.168.1.x, ở nhà gõ tên miền"*. Trong lúc
lũ về, ai đó gõ nhầm địa chỉ là mất mấy phút quý giá.

## Hai đường đi

| Đường | Dùng khi | Cơ chế |
|---|---|---|
| Công cộng | có Internet | đường hầm Cloudflare tới máy chủ ở kho |
| Nội bộ | trong mạng của kho | Caddy phục vụ trực tiếp qua cổng 443 |

Cùng một tên miền, cùng một chứng chỉ bảo mật. Trình duyệt không cảnh báo ở cả hai
đường.

## Bốn tình huống mạng phải nắm

| # | Tình huống | Kết quả |
|---|---|---|
| 1 | Trụ sở có Internet, điện thoại có Internet | vào được từ **mọi nơi** |
| 2 | Trụ sở có Internet, điện thoại mất mạng | điện thoại chạy bằng dữ liệu đã tải |
| 3 | Trụ sở **chỉ có LAN**, điện thoại có Internet | điện thoại ở xa **không vào được** |
| 4 | Cả hai mất Internet, LAN còn | thiết bị **trong** mạng kho vào bình thường |

### Vì sao tình huống 3 không vào được

Đường hầm công cộng cần trụ sở **gọi ra Internet** để dựng. Trụ sở mất Internet thì
đường hầm sập. Không có phép màu nào đưa gói tin từ nhà mạng di động vào một mạng nội
bộ đã tách khỏi Internet.

Đây là giới hạn vật lý, không phải lỗi phần mềm. Nói thẳng điều này với giám khảo tốt
hơn là để họ tự phát hiện.

**Bù lại:** điện thoại đi hiện trường vẫn chạy bằng dữ liệu đã tải và hàng chờ gửi
sau — xem [14 · Chế độ ngoại tuyến](14-che-do-ngoai-tuyen.md).

## Test 1 — Đường công cộng

Từ điện thoại dùng mạng di động (**tắt Wi-Fi**):

```
https://ungphonhanh.life
```

**Kỳ vọng:** vào được, ổ khoá xanh, đăng nhập chạy bình thường.

## Test 2 — Đường nội bộ

Từ máy trong cùng mạng Wi-Fi với kho:

```bash
nslookup ungphonhanh.life
```

**Kỳ vọng:** trả về địa chỉ **nội bộ** của máy chủ (dạng `192.168.x.x`), không phải
địa chỉ công cộng.

Nếu trả về địa chỉ công cộng thì bộ định tuyến chưa được cấu hình phân giải tách
hướng — xem phần dưới.

## Test 3 — Kiểm tra chứng chỉ hợp lệ ở đường nội bộ

```bash
curl -sI https://ungphonhanh.life/api/health
```

**Kỳ vọng:** `200`, **không** phải thêm cờ bỏ qua kiểm tra chứng chỉ.

Chứng chỉ được cấp bằng phương thức xác thực qua DNS nên có hiệu lực cả khi máy chủ
không mở ra Internet.

## Việc còn phải làm trước khi thi

**Cấu hình phân giải tách hướng trên bộ định tuyến của kho** (trang quản trị tại
`192.168.1.1`): thêm một bản ghi trỏ `ungphonhanh.life` về địa chỉ nội bộ của máy chủ.

Chưa làm thì tình huống 4 (mất hẳn Internet) sẽ hỏng: máy trong mạng gõ tên miền
nhưng không hỏi được máy chủ tên miền công cộng để biết nó ở đâu.

**Cách xoay khi chưa cấu hình được** (ví dụ hội trường không cho vào bộ định tuyến):
thêm dòng vào tệp `hosts` của từng máy trình diễn.

- Windows: `C:\Windows\System32\drivers\etc\hosts`
- Android: cần quyền quản trị máy — nếu không có thì dùng thẳng địa chỉ nội bộ

```
192.168.1.50   ungphonhanh.life
```

## Cấu hình cho buổi trình diễn ở hội trường

Trong hội trường, **cả ba điện thoại và máy tính dùng chung một Wi-Fi**. Đây là tình
huống dễ nhất: mọi thiết bị đều trong cùng mạng nội bộ.

Khuyến nghị:
1. Phát Wi-Fi từ máy tính hoặc từ bộ phát riêng mang theo — không phụ thuộc mạng hội
   trường.
2. Nối tất cả thiết bị vào mạng đó.
3. Trên điện thoại, đặt địa chỉ máy chủ bằng **địa chỉ nội bộ** của máy tính.

Cách này chạy được **kể cả khi hội trường không có Internet**, và không phụ thuộc vào
việc có cấu hình được bộ định tuyến hay không.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Đang trong mạng kho, rút Internet giữa lúc dùng | phiên vẫn chạy, không văng ra |
| Ngắt đường hầm rồi vào từ ngoài | không vào được — đúng như đã nêu |
| Điện thoại chuyển từ Wi-Fi kho sang mạng di động | tự đi đường công cộng |
| Địa chỉ máy chủ trên điện thoại trỏ sai | báo **máy chủ LAN không phản hồi** |

Dòng cuối là lỗi hay gặp nhất khi cài đặt điện thoại. Không phải hệ thống hỏng, mà là
địa chỉ máy chủ đang trỏ sai chỗ.

---

Tiếp theo: [16 · Bộ kiểm thử tự động](16-bo-kiem-thu-tu-dong.md)

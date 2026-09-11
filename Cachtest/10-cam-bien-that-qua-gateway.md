# 10 · Cảm biến thật qua khoá thiết bị

Thiết bị mô phỏng và cảm biến vật lý dùng **chung một cửa vào, một hợp đồng dữ liệu,
một luồng xử lý**. Khác biệt duy nhất là ai sinh ra con số: phần cứng đo được, hay
người kéo thanh trượt.

Sau khi số liệu đã vào, **không nhánh nào rẽ theo nguồn**. Nghĩa là cắm cảm biến thật
chỉ cần cấp khoá, không phải sửa phần xử lý phía sau.

## Bước 1 — Cấp khoá cho gateway

```bash
pnpm --filter @safestock/backend device:issue -- \
  --warehouse <mã kho trung tâm> --code gateway_a --name "Gateway kho trung tâm"
```

**Kỳ vọng:** in ra mã khoá và chuỗi token dạng `upn_<16 ký tự>.<chuỗi bí mật>`.

Token **chỉ hiện đúng một lần**. Hệ thống chỉ giữ bản băm nên mất là phải cấp lại,
không đọc lại được. Lộ cả cơ sở dữ liệu cũng không đủ để giả mạo thiết bị.

Chỉ **kho trung tâm** được cấp khoá gateway; thử với kho thôn sẽ bị từ chối.

## Bước 2 — Gửi số liệu như một cảm biến

```bash
curl -X POST http://localhost:3110/api/telemetry/snapshots \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Token: upn_....' \
  -d '{"warehouseId":"<mã kho>","idempotencyKey":"demo-1",
       "observedAt":"2026-08-01T04:00:00.000Z",
       "readings":[{"deviceCode":"temp_A","value":41.5,"quality":0.9}]}'
```

**Kỳ vọng:** `201`, và sinh sự cố y hệt như khi người vận hành kéo thanh trượt.

Kiểm tra trong cơ sở dữ liệu: bản ghi mang `source = HARDWARE`, **không gán cho tài
khoản người nào**.

## Bảy chốt an toàn phải thử

| Thử | Kết quả đúng |
|---|---|
| Không gửi khoá | **401** |
| Khoá sai | **401** |
| Dùng mã đăng nhập người dùng thay khoá thiết bị | **401** |
| Gửi cho kho khác | **403** |
| Gửi lại **đúng gói tin** | `201` nhưng **chỉ ghi một lô** |
| Bắn liên tục bằng khoá lạ | **429** sau khi vượt trần |
| Thu hồi khoá rồi gửi tiếp | **401** |

Thu hồi khoá:

```bash
pnpm --filter @safestock/backend device:revoke -- --id <mã khoá>
```

## Vì sao có chặn tần suất

Cửa này **không có mã đăng nhập người dùng chắn phía trước** và đang mở ra Internet
qua đường hầm. Mỗi lượt xác thực tốn một phép băm mật khẩu cố ý chậm. Nếu không chặn
sớm thì bất kỳ ai biết đường dẫn cũng đốt được sức máy chủ bằng yêu cầu rác, không
cần khoá hợp lệ nào.

Cách chặn:
- **Theo từng thiết bị** — một gateway hỏng tự dội cũng bị giãn nhịp.
- **Một rổ chung cho khoá lạ** — kẻ đổi khoá liên tục để né hạn mức từng thiết bị sẽ
  rơi hết vào rổ này. Thiết bị hợp lệ không đi qua rổ đó nên không bị liên luỵ.

Kiểm chứng thật: bắn 100 yêu cầu với khoá lạ đổi liên tục → **60 được phục vụ, 40 bị
chặn**. Gateway hợp lệ cấp ngay sau đó vẫn gửi được bình thường.

## Chất lượng phép đo

Trường `quality` (từ 0 đến 1) phản ánh độ tin cậy: pin yếu, nhiễu, giá trị ngoài dải
đo. Không gửi thì mặc định là 1.

Kiểm chứng: gửi ba cảm biến với `quality` lần lượt 0.9, 0.95 và bỏ trống → lưu đúng
0.9, 0.95 và 1.

Con số này nuôi thẳng vào điểm "độ tin cậy dữ liệu" trên bảng điều khiển. Cắm cứng
bằng 1 thì điểm đó vô nghĩa.

## Mốc đo riêng từng cảm biến

Mỗi phép đo có thể mang mốc thời gian riêng, khác mốc chung của cả lô — vì gateway
gom nhiều cảm biến đọc ở các thời điểm khác nhau.

| Thử | Kỳ vọng |
|---|---|
| Mốc đo **muộn hơn** mốc chung của lô quá mức | bị từ chối |
| Mốc đo trong quá khứ (gửi bù sau khi mất mạng) | chấp nhận, tối đa 7 ngày |
| `quality` ngoài khoảng 0–1 | bị từ chối |

## Vì sao gateway gửi bù dữ liệu cũ không làm sai mốc "lần cuối có tin"

Mốc lần cuối nhận tin của thiết bị **chỉ tiến, không lùi**. Gateway mất mạng ba tiếng
rồi gửi bù cả đống dữ liệu cũ sẽ không làm thiết bị trông như "vừa mới báo".

---

Tiếp theo: [11 · Mất tín hiệu thiết bị](11-mat-tin-hieu-thiet-bi.md)

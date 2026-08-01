# 09 · Cảm biến mô phỏng và chuông báo động

**Ai làm:** quản trị xã — chỉ vai này có quyền bơm số liệu mô phỏng.
**Ở đâu:** ứng dụng desktop.

## Chuẩn bị

Trong `.env` phải có `SIMULATION_MUTATION_ENABLED=true`, rồi:

```bash
pnpm desktop:dev
```

Đăng nhập `admin` / `admin123@`, địa chỉ máy chủ `localhost:3100`.

Thử đăng nhập `staff@` → vào được, xem được thiết bị, nhưng **gửi số liệu trả 403**.
Đây là hành vi đúng, không phải lỗi.

## Test 1 — Chuông kêu theo ngưỡng

1. Kéo thanh nhiệt độ lên **trên 35°C** (hoặc độ ẩm trên 85%).
2. Bấm **Xác nhận và gửi**.

**Kỳ vọng:**
- Chuông kêu **ngay lập tức**.
- Chuông **chỉ tắt khi bấm nút Tắt chuông**, không tự tắt.
- Sự cố xuất hiện trên web ở mục **Sự cố**.

**Vì sao chuông không tự tắt:** cảnh báo tự tắt là cảnh báo bị bỏ lỡ. Bắt người bấm
tắt nghĩa là có người đã biết chuyện gì đang xảy ra.

## Test 2 — Chuông vẫn kêu khi mất mạng

1. Ngắt mạng của máy chạy desktop.
2. Kéo vượt ngưỡng, bấm xác nhận.

**Kỳ vọng:** chuông **vẫn kêu**.

**Vì sao được:** ngưỡng cảnh báo đã lưu sẵn trong máy và được đối chiếu ngay tại chỗ.
Tiếng chuông tự sinh bằng bộ tạo âm, không tải tệp nào từ mạng. Kho mất Internet vẫn
phải biết hàng đang hỏng.

3. Bấm **Tắt chuông**, rồi nối mạng lại.

**Kỳ vọng:** số liệu và thao tác tắt chuông đã nằm trong hàng chờ, **tự gửi lên khi
có mạng** — không mất dữ liệu. Ứng dụng hiện số thao tác đang chờ gửi.

## Test 3 — Chuông do nguồn khác kích hoạt

1. Mở desktop, để yên, **không bấm gì**.
2. Từ nơi khác, gửi số liệu vượt ngưỡng bằng khoá thiết bị
   (xem [10 · Cảm biến thật qua gateway](10-cam-bien-that-qua-gateway.md)).

**Kỳ vọng:** chuông kêu **mà không ai chạm vào desktop**.

**Vì sao quan trọng:** chuông phải kêu vì *có sự cố*, không phải vì *có người bấm nút*.
Cảm biến thật báo cháy lúc 2 giờ sáng thì không có ai ngồi trước máy cả.

## Test 4 — Không dội chuông vì chuyện cũ

1. Để hệ thống có sẵn vài sự cố đang mở.
2. Đăng xuất khỏi desktop rồi đăng nhập lại.

**Kỳ vọng:** **không** kêu chuông cho những sự cố đã tồn tại từ trước. Chỉ sự cố mới
xuất hiện sau khi đăng nhập mới kéo chuông.

Người vừa ngồi vào ca trực không cần bị dội chuông cho chuyện của hôm qua.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Gửi số liệu **dưới** ngưỡng | không kêu chuông |
| Gửi lại đúng gói tin đã gửi | **chỉ ghi một lô**, không tạo sự cố trùng |
| Chưa từng tải ngưỡng về máy lần nào | ứng dụng ghi rõ trong nhật ký là chưa đánh giá được tại chỗ |
| Tắt cờ mô phỏng rồi gửi | **403** |
| `staff@` bấm gửi | **403** |
| Tắt chuông khi mất mạng | chuông tắt tại chỗ, xác nhận vào hàng chờ |

## Tắt chuông cho sự cố do phần cứng gây ra

Người trực kho (`staff@`) **phải tắt được** chuông kể cả khi sự cố do cảm biến thật
kích hoạt, và kể cả khi cờ mô phỏng đang tắt.

Kiểm chứng bằng lệnh:

```bash
API=http://localhost:3100/api
STAFF=<mã đăng nhập của staff@>

curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" \
  -d '{"warehouseId":"<mã kho>","incidentIds":["<mã sự cố>"],"acknowledgementKey":"ack-1","acknowledgedAt":"2026-08-01T00:00:00.000Z"}' \
  $API/simulator/alarm-acks
```

**Kỳ vọng:** `201`. Nếu trả 403 thì phân quyền sai — chuông không tắt được là chuông
sẽ bị rút điện.

---

Tiếp theo: [10 · Cảm biến thật qua gateway](10-cam-bien-that-qua-gateway.md)

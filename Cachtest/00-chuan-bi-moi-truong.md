# 00 · Chuẩn bị môi trường

Làm xong file này rồi mới test được các luồng khác.

## Bước 1 — Dựng hạ tầng

```bash
pnpm infra:up      # PostgreSQL + Redis + định tuyến offline, chạy trong Docker
pnpm be:db         # sinh Prisma client, đẩy schema, seed dữ liệu mẫu
```

> `be:db` **xoá sạch rồi dựng lại** toàn bộ dữ liệu. Không chạy trên hệ thống đang
> vận hành thật.

**Kỳ vọng:** seed in ra 1 tổ chức, 21 người dùng, 18 kho, 17 thôn, 17 mã vật tư,
126 lô, 19 thiết bị, 2 sự cố.

Nếu Windows báo `EPERM` khi sinh Prisma client: **dừng backend đang chạy** rồi thử
lại. Tiến trình Node đang giữ tệp thư viện của Prisma.

## Bước 2 — Chạy ứng dụng

| Ứng dụng | Lệnh | Địa chỉ |
|---|---|---|
| Máy chủ | `pnpm be:dev` | http://localhost:3100 |
| Web | `pnpm fe:dev` | http://localhost:3200 |
| Desktop | `pnpm desktop:dev` | cửa sổ riêng |
| Trí tuệ nhân tạo | `cd apps/ai-service && uvicorn main:app --port 8000` | http://localhost:8000 |
| Điện thoại | cài `app-release.apk` | trỏ tới `https://ungphonhanh.life` |

## Bước 3 — Kiểm tra mọi thứ đã sống

```bash
curl http://localhost:3100/api/health
```

**Kỳ vọng:**

```json
{"status":"ok","services":{"database":"up","redis":"up"}}
```

Kiểm nhanh cả cụm:

```bash
curl -s -o /dev/null -w "may chu: %{http_code}\n"  http://localhost:3100/api/health
curl -s -o /dev/null -w "web:     %{http_code}\n"  http://localhost:3200/
curl -s -o /dev/null -w "AI:      %{http_code}\n"  http://localhost:8000/health
```

Cả ba phải trả `200`. Trí tuệ nhân tạo trả `{"status":"ok","provider":"ollama"}`.

## Bước 4 — Cờ cần bật

Trong `.env`:

```
SIMULATION_MUTATION_ENABLED=true
```

Không bật thì desktop **không gửi được số liệu cảm biến**. Cờ này chỉ chi phối
luồng mô phỏng — thiết bị phần cứng đã xác thực không bao giờ bị nó làm câm.

## Bước 5 — Làm nóng trí tuệ nhân tạo

Trước buổi trình diễn, hỏi trợ lý một câu bất kỳ để mô hình được nạp vào bộ nhớ.

**Vì sao cần:** mô hình chạy ngay trên máy. Lần gọi đầu sau khi nguội mất hơn 15
giây, vượt quá thời gian chờ của máy chủ, nên trả lỗi hoặc rơi về bản mẫu. Lần thứ
hai trở đi chỉ khoảng 6 giây.

Đo được thật:

| Lần gọi | Kết quả |
|---|---|
| Đầu tiên (mô hình nguội) | trợ lý **503**, bản tin rơi về bản mẫu |
| Sau khi đã nóng | trợ lý **201** trong ~6s, bản tin ghi `source: AI` |

## Đặt lại giữa chừng

Nếu dữ liệu đã bị làm rối trong lúc test:

```bash
pnpm --filter @safestock/backend seed
```

Không cần dựng lại schema, chỉ nạp lại dữ liệu mẫu.

---

Tiếp theo: [01 · Đăng nhập và phân quyền](01-dang-nhap-va-phan-quyen.md)

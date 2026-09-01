# ADR-005: Một đường ống số liệu cho cả cảm biến thật và thiết bị mô phỏng

- Trạng thái: Accepted
- Ngày: 2026-07-31
- Phạm vi: simulation/telemetry, incident, desktop, phân quyền

## Bối cảnh

Số liệu cảm biến chỉ vào hệ thống được bằng một đường: người vận hành chỉnh giá
trị trên app desktop rồi bấm "Xác nhận và gửi". Bảng thiết bị tên là
`VirtualDevice`, cửa vào `POST /api/simulator/snapshots` bắt buộc JWT của người
dùng, và `SensorSubmission.submittedByUserId` là cột NOT NULL.

Khi lắp cảm biến vật lý, mô hình này vỡ ở ba chỗ:

1. Cảm biến không có tài khoản người dùng để mượn.
2. Chuông báo động chỉ được bật bên trong hàm xử lý nút bấm, nên cảm biến tự báo
   lúc 2 giờ sáng sẽ không kêu — không có ai đang bấm gì cả.
3. Cảm biến hỏng, hết pin hoặc đứt mạng thì **không gửi gì cả**. Hệ thống chỉ
   phản ứng với dữ liệu nhận được nên sẽ hiểu im lặng thành "mọi thứ bình
   thường", đúng lúc kho không còn được giám sát.

Ngoài ra `acknowledgeAlarm` khoá theo "ai gửi lô số liệu", nên nếu người gửi là
cái cảm biến thì sẽ không còn ai tắt được chuông.

## Quyết định

1. **Một hợp đồng dữ liệu, hai nguồn phát.** Giữ nguyên gói tin snapshot
   (`idempotencyKey`, `observedAt` tách khỏi `receivedAt`, danh sách readings).
   Gateway phần cứng gửi đúng gói tin mà desktop đang gửi.
2. **Danh tính đa hình, xử lý không rẽ nhánh.** `SensorSubmission` mang
   `source: OPERATOR | HARDWARE`, cùng đúng một trong hai chủ thể:
   `submittedByUserId` hoặc `submittedByDeviceId`. Sau khi số liệu đã vào,
   phần ghi sự kiện, quét sự cố, tính điểm sẵn sàng và phát realtime **không có
   nhánh nào phân biệt nguồn**; `source` chỉ dùng để hiển thị và truy vết.
3. **Thiết bị xác thực bằng khoá của chính nó.** `DeviceCredential` giữ bcrypt
   hash của phần bí mật, thu hồi độc lập, và khoá cứng phạm vi kho. Cửa vào là
   `POST /api/telemetry/snapshots` với header `X-Device-Token`. Thiết bị không
   mượn quyền của bất kỳ tài khoản người nào.
4. **Cờ `SIMULATION_MUTATION_ENABLED` chỉ chi phối luồng OPERATOR.** Tắt luồng
   mô phỏng là công tắc vận hành; nó không được phép làm câm cảm biến thật.
5. **Chuông kêu vì có sự cố, không vì có người bấm nút.** Desktop nối realtime và
   kéo chuông khi xuất hiện sự cố mới còn mở, bất kể nguồn nào sinh ra. Lượt tải
   đầu sau đăng nhập chỉ ghi nhận hiện trạng để không dội chuông vì chuyện cũ.
   Lớp đánh giá ngưỡng cục bộ được giữ nguyên làm dự phòng khi mất kết nối, nên
   chuông vẫn kêu tại chỗ lúc mất mạng.
6. **Quyền tắt chuông tách khỏi `simulation:mutate`.** Quyền mới
   `incident:alarm_ack` được cấp cho WAREHOUSE và ADMIN. Người trực kho phải tắt
   được chuông do phần cứng kích hoạt mà không cần quyền bơm số liệu mô phỏng,
   và không phụ thuộc cờ simulator. Chuông không tắt được là chuông sẽ bị rút điện.
7. **Im lặng là một sự cố.** `VirtualDevice.lastSeenAt` được cập nhật ở đúng một
   chỗ khi nhận số liệu, và chỉ tiến chứ không lùi khi gateway gửi bù dữ liệu cũ.
   Thiết bị khai báo `expectedIntervalSeconds` mà im quá 3 chu kỳ sẽ sinh sự cố
   `DEVICE_SILENT` (quá 10 chu kỳ thì nâng lên mức HIGH). Thiết bị đã khai báo
   nhưng chưa từng gửi số liệu cũng bị coi là mất tín hiệu — đó là lắp đặt hỏng,
   không phải "đang chờ số liệu đầu tiên".
8. **Giám sát im lặng phải được bật có chủ đích.** Mặc định
   `expectedIntervalSeconds = null`. Thiết bị mô phỏng do người kéo tay không có
   nhịp báo cố định; bật sẵn sẽ đẻ ra cảnh báo giả mỗi lúc không ai ngồi trước máy.
9. **Đồng hồ canh chạy trong tiến trình, không qua hàng đợi Redis.** Mọi quy tắc
   khác chạy khi có số liệu đi vào; mất tín hiệu thì không có gì đi vào cả nên
   phải có người chủ động hỏi. Kho mất Internet vẫn phải được canh, và cảnh báo
   an toàn không nên phụ thuộc thêm một dịch vụ nữa có thể chết. Chạy nhiều bản
   sao không sinh cảnh báo trùng vì `scanWarehouse` đã chặn sự cố cùng loại đang
   mở trên cùng thiết bị.
10. **Chất lượng phép đo là dữ liệu thật.** `quality` (0..1) và mốc đo riêng của
    từng cảm biến được nhận từ gateway thay vì cắm cứng bằng 1. Điểm "độ tin cậy
    dữ liệu" trên dashboard chỉ có ý nghĩa khi con số này phản ánh thực tế.
11. **Chặn lạm dụng trước khi chạm bcrypt.** Cửa thiết bị không có JWT chắn phía
    trước và phơi ra Internet qua tunnel, trong khi mỗi lượt xác thực tốn một
    phép bcrypt cố ý chậm — nếu không chặn sớm thì đó là cách đốt CPU máy kho rất
    rẻ. Thứ tự kiểm tra đi từ rẻ tới đắt: cú pháp token → hạn mức → truy vấn có
    index → bcrypt. Hạn mức theo **danh tính thiết bị**, không theo IP: máy chủ
    không bật `trust proxy` nên mọi request qua Caddy/tunnel đều mang cùng một IP,
    chặn theo IP sẽ gom hết gateway thật vào một rổ. Khoá không tồn tại hoặc đã
    thu hồi dồn vào một rổ chung, nên đổi prefix ngẫu nhiên mỗi lần không né được
    hạn mức, còn thiết bị hợp lệ không đi qua rổ đó nên không bị liên luỵ.

## Hệ quả

- Khi cảm biến thật về, chỉ cần cấp cho nó một khoá thiết bị và cho nó gửi đúng
  gói tin desktop đang gửi. Không sửa phần xử lý, quy tắc sự cố, chuông,
  dashboard hay ứng dụng di động.
- Thiết bị mô phỏng không phải bản demo bị vứt đi: nó thành công cụ diễn tập
  cháy, ngập, mất điện mà không cần đốt thật thứ gì.
- Chữ ký payload giữ nguyên khi client không gửi `quality`/`observedAt` theo
  reading, nên hàng chờ offline tạo trước khi nâng cấp vẫn khớp idempotency cũ.
- `INCIDENT_WATCHDOG_INTERVAL_SECONDS` bị kiểm tra lúc khởi động: gõ sai không
  được phép âm thầm tắt việc canh cảm biến. Chỉ giá trị 0 mới tắt có chủ đích.

## Công cụ vận hành

```bash
pnpm --filter @safestock/backend device:issue   -- --warehouse <id> --code gateway_a --name "Gateway kho"
pnpm --filter @safestock/backend device:revoke  -- --id <credentialId>
pnpm --filter @safestock/backend device:monitor -- --warehouse <id> --device temp_A --interval 300
pnpm --filter @safestock/backend device:monitor -- --warehouse <id> --device temp_A --interval off
```

Token chỉ hiện đúng một lần lúc cấp; hệ thống chỉ giữ bản băm nên mất token là
phải cấp lại chứ không đọc lại được.

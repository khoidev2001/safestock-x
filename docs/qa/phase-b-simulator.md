# Q&A — Simulator cảm biến và kết nối hybrid

> Câu trả lời cho giám khảo về mô phỏng IoT, LAN và Internet. Đây là thiết kế đã
> chốt tại [PRD](../PRD.md#44-simulator). Source đã có nút Xác nhận, hàng đợi
> cục bộ idempotent, policy chuông cache và email outbox retry. Runbook cho
> split-horizon DNS, TLS CA nội bộ và public API routing nằm tại
> [HYBRID-DOMAIN-RUNBOOK.md](../HYBRID-DOMAIN-RUNBOOK.md); chỉ tick nghiệm thu
> sau khi đã test trên hạ tầng thực.

---

### H: Cơ quan đã có LAN nội bộ, dùng domain `ungphonhanh.life` có thừa không?

**Đ:** Không. Domain là tên dễ nhớ, còn LAN là đường truyền. Trong cơ quan, DNS nội bộ
trả `ungphonhanh.life` về IP private của ingress LAN. Ingress này phát web local và
chuyển `/api`/`/socket.io` vào backend, nên thiết bị đi thẳng trong LAN, không qua
Internet. Người dùng không phải nhớ dải IP.

### H: Mất Internet rồi có phải đổi sang IP LAN không?

**Đ:** Không nếu đã có split-horizon DNS. Khi public Internet mất nhưng LAN và DNS nội bộ
vẫn chạy, cùng tên `https://ungphonhanh.life` vẫn phân giải về backend LAN. Chỉ khi chưa
có DNS nội bộ mới phải dùng IP/hostname LAN làm phương án dự phòng.

### H: Người ở ngoài cơ quan còn truy cập được domain không?

**Đ:** Có thể. DNS public có thể đưa họ qua Cloudflare Tunnel hoặc VPN, trong khi DNS nội
bộ cùng tên vẫn đưa máy trong cơ quan thẳng về backend LAN. Domain không tự cấp quyền:
đăng nhập, phân quyền kho và giới hạn mạng vẫn áp dụng ở cả hai đường.

### H: Cảm biến thật ESP32 gửi dữ liệu vào app desktop hay qua đâu?

**Đ:** ESP32 kết nối Wi-Fi LAN rồi gửi telemetry tới MQTT broker/gateway hoặc backend tại
kho. Web và desktop chỉ là client đọc API. Desktop simulator thay vai ESP32 trong buổi
demo: operator xác nhận dữ liệu giả lập để đi vào cùng pipeline xử lý.

### H: Mất Internet thì chuông và email thế nào?

**Đ:** Chuông tại kho là cảnh báo cục bộ, phải hoạt động qua LAN/gateway và không phụ thuộc
Internet. Email không thể gửi khi SMTP/Internet không tới được; backend lưu Incident và
email chờ, retry khi kết nối hồi phục. Email gửi muộn nêu riêng giờ phát hiện và giờ gửi.

### H: Làm sao không mất lần xác nhận khi desktop mất cả kết nối tới backend?

**Đ:** Desktop lưu gói xác nhận bền vững trước khi gửi, có khóa idempotency và thời điểm
operator xác nhận. Khi kết nối lại, backend nhận một lần, lưu lịch sử cảm biến/Incident và
xử lý email. Vì vậy không nhầm giờ sự cố với giờ đồng bộ hoặc giờ email được chuyển đi.

### H: Vì sao không gửi dữ liệu ngay khi kéo slider?

**Đ:** Kéo chỉ là thao tác chuẩn bị. Người vận hành xem giá trị cuối rồi bấm **Xác nhận**;
hệ thống mới ghi lịch sử, đánh giá ngưỡng, kích chuông và xử lý email. Điều này tránh tạo
hàng trăm sự kiện vô nghĩa trong lúc kéo và làm bước tạo cảnh báo rõ ràng cho giám khảo.

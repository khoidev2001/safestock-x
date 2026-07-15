# Q&A — Phase B (mô phỏng cảm biến / Digital Twin)

> Sinh sự kiện cảm biến theo kịch bản, đẩy realtime WebSocket. 6 kịch bản thiên tai/sự cố.

---

### H: Gọi là "Digital Twin" nhưng thực chất là gì? Nó đồng bộ với thiết bị thật nào?
**Đ:** Thành thật: đây là **mô phỏng lớp cảm biến**, không phải Digital Twin công nghiệp (mô hình vật lý đồng bộ realtime với máy móc thật). Mục đích: **tái tạo luồng dữ liệu cảm biến để kiểm thử logic AI trước khi có phần cứng**. Điểm quan trọng — schema sự kiện giống hệt thứ cảm biến thật xuất ra, nên thay mock bằng thiết bị thật không đổi phần mềm.

### H: Kịch bản do các em tự viết, vậy AI "phát hiện sự cố" chỉ là đọc lại kịch bản?
**Đ:** Câu hỏi hay. Để tránh chính điều đó, chúng em thêm **nhiễu ngẫu nhiên có kiểm soát** vào kịch bản bình thường — giá trị cảm biến dao động nhẹ như thực tế. Bộ phát hiện sự cố phải **phân biệt nhiễu bình thường vs bất thường thật**, không chỉ so khớp kịch bản. Đây là điều chứng minh nó không phải "đọc script".

### H: Làm sao đảm bảo demo chạy lại giống hệt mỗi lần?
**Đ:** Dùng **bộ sinh số ngẫu nhiên có seed** (mulberry32) + mô hình timeline (danh sách sự kiện có mốc thời gian tính sẵn). Cùng một seed → cùng dãy sự kiện, kể cả phần nhiễu. **Đã kiểm thử: chạy 2 lần cùng seed ra 27 sự kiện y hệt**. Điều này giúp demo an toàn, không "lần trước chạy được lần này khác".

### H: Độ trễ từ lúc cảm biến báo tới lúc cảnh báo là bao lâu?
**Đ:** Dưới 2 giây (mục tiêu). **Đã đo thực tế: sự kiện đầu tiên tới client qua WebSocket sau ~545ms**. Dùng Socket.IO với room theo từng kho — chỉ kho liên quan nhận sự kiện, không phát tràn lan.

### H: Vì sao không tua nhanh thời gian x5, x20 như một số hệ mô phỏng?
**Đ:** Chúng em chọn x1/x10 cho MVP. Lý do kỹ thuật: tua thời gian kết hợp tạm dừng/tiếp tục + tính lặp lại được là 3 ràng buộc dễ xung đột nếu làm phức tạp. Mô hình "con trỏ chạy qua timeline" (như trình phát video) cho x1/x10 ổn định, đủ để trình diễn. Thêm tốc độ khác là mở rộng dễ, không phải rào cản kỹ thuật.

### H: Sao không lưu mọi giá trị cảm biến vào database?
**Đ:** Có **ngưỡng lọc** — chỉ lưu sự kiện có ý nghĩa (đổi trạng thái, vượt ngưỡng), không lưu mỗi lần nhiệt độ nhích 0.1°C. Tránh phình database. Nhưng giá trị hiện tại của mỗi thiết bị luôn được cập nhật để Readiness đọc tức thời. Đã kiểm thử: đổi 40→40.1°C (nhỏ) không lưu, nhưng giá trị hiện tại vẫn cập nhật.

### H: 6 kịch bản là những gì?
**Đ:** Bình thường (có nhiễu), nghi thất thoát (loadcell giảm + cửa mở + RFID + không phiếu xuất), lỗi cảm biến, điều kiện bảo quản xấu (độ ẩm/nhiệt tăng), mất kết nối, vật tư sai vị trí. Đủ phủ các tình huống PRD và các loại cảnh báo hệ thống cần xử lý.

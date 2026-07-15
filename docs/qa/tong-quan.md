# Q&A — Câu hỏi xuyên suốt (mọi phase)

> Những câu giám khảo hay hỏi nhất về toàn hệ thống. Trả lời thành thật + có căn cứ.

---

### H: Sản phẩm này khác gì phần mềm quản lý kho thông thường?
**Đ:** Phần mềm kho thường trả lời "kho có bao nhiêu?". Chúng em trả lời "kho **sẵn sàng tới đâu?**". Ví dụ: kho thường báo "100 áo phao"; SafeStock báo "84/100 sẵn sàng — 96 có mặt, 92 đúng vị trí, 88 đủ điều kiện, 84 lấy được ngay", kèm nguyên nhân trừ điểm và đề xuất khắc phục. Đây là quản lý **năng lực phản ứng thực tế**, không phải con số tồn kho.

### H: "AI" trong sản phẩm nằm ở đâu? Có phải chỉ là if-else phức tạp?
**Đ:** Chúng em dùng AI **đúng chỗ, không nhồi để làm màu**:
- **LLM (Gemini/Ollama/Claude)**: hiểu mô tả tình huống bằng ngôn ngữ tự nhiên → JSON có cấu trúc; giải thích phương án/sự cố bằng tiếng Việt.
- **Rule Engine + tối ưu**: tính Readiness Score, phân bổ vật tư (bài toán tối ưu có ràng buộc).

Nguyên tắc kiến trúc: **LLM KHÔNG tự tính tồn kho hay kết luận số liệu** — chỉ xử lý ngôn ngữ. Mọi con số do backend + rule engine tính, kiểm chứng được. Đây là cách dùng AI có trách nhiệm, tránh "ảo giác" (hallucination) của LLM ở khâu số liệu.

### H: Không có phần cứng thật (cảm biến IoT) thì sao gọi là hệ thống thật?
**Đ:** Chúng em **mô phỏng lớp cảm biến**, và đây là **thiết kế có chủ đích, không phải thiếu kinh phí**. Điểm mấu chốt: dữ liệu mô phỏng dùng **đúng schema JSON mà cảm biến thật sẽ xuất ra** — khi có ngân sách cắm cảm biến thật vào, **phần mềm không đổi một dòng**. Chúng em chứng minh phần khó (AI ra quyết định) trước; phần dễ (cắm cảm biến) là bước triển khai sau. Chi phí thật: RFID tag ~1-3k/món, đầu đọc ~vài triệu/cổng dùng nhiều năm — hợp lý cho kho cấp xã.

### H: Hệ thống chạy AI, cơ quan xã có đủ máy không?
**Đ:** Có. Bản triển khai thật dùng **Ollama chạy local trên PC văn phòng 16GB RAM + CPU thường (không cần GPU)** với model Qwen 2.5 3B — mỗi câu 3-8 giây, chấp nhận được vì parse tình huống không cần realtime. **0đ chi phí API, offline hoàn toàn, dữ liệu không rời cơ quan** (an ninh dữ liệu). Bản demo hôm nay dùng Gemini (miễn phí) cho khỏi phụ thuộc máy mạnh tại hội trường. Kiến trúc không khóa cứng 1 nhà cung cấp AI.

### H: Vì sao chọn làm ở địa bàn Đắk Lắk/Phú Yên?
**Đ:** Ý tưởng sinh ra từ **bão lũ Phú Yên 2025** (nay thuộc Đắk Lắk). Tỉnh mới có cả địa hình ven biển (bão, lũ) lẫn Tây Nguyên (lũ quét, sạt lở, hồ chứa) — nhu cầu quản lý kho cứu hộ là thật. Hội Chữ thập đỏ xã Đồng Xuân đã có thư quan tâm, xác nhận vấn đề có thật và sẵn sàng thử nghiệm.

### H: Định mức vật tư (1 áo phao/người, 15 lít nước/ngày) lấy từ đâu?
**Đ:** Dẫn từ **Sphere Handbook** (chuẩn cứu trợ nhân đạo quốc tế) + quy định phòng chống thiên tai Việt Nam + tiêu chuẩn Hội Chữ thập đỏ. Và quan trọng: **mọi định mức + trọng số đều CHỈNH ĐƯỢC** trong hệ thống — mỗi kho tự tinh chỉnh theo đặc thù. Chúng em ghi rõ "định mức tham khảo nghiên cứu", không áp đặt.

### H: Nếu demo mất mạng/mất điện thì sao?
**Đ:** Đã thiết kế 3 lớp chịu lỗi:
1. Mất internet, LAN còn → chuyển AI sang Ollama local, chạy đủ.
2. Thiết bị ra hiện trường mất mạng → điện thoại cache kho (offline-đọc), trao đổi qua bộ đàm, nhập bù khi có mạng.
3. Mất điện toàn kho → máy chủ trên UPS + điện thoại độc lập + **phiếu giấy in sẵn**.

Triết lý: **công nghệ hỗ trợ, không thay thế hoàn toàn quy trình cứu hộ** — luôn có đường lui.

### H: Đội mấy người, làm bao lâu?
**Đ:** 2 người, kế hoạch 10 tuần. Chúng em ưu tiên làm **xuất sắc 2 module lõi (Readiness Score + Mission-to-Kit)** thay vì dàn trải nhiều tính năng hời hợt. Có kế hoạch build chi tiết chia phase, mỗi phase có checklist + kiểm thử tự động.

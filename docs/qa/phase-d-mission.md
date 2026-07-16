# Q&A — Phase D (Mission-to-Kit Compiler — differentiator #2)

> Nhập tình huống (ngôn ngữ tự nhiên) → AI parse → JSON → định mức → phân bổ greedy → gợi ý kho lân cận → giải thích → duyệt. Đây là "AI hỗ trợ ra quyết định" cốt lõi.

---

### H: AI ở đây làm gì? Nó có tự quyết định xuất bao nhiêu vật tư không?
**Đ:** Không. AI (Gemini/Ollama) **chỉ làm 2 việc ngôn ngữ**: (1) hiểu mô tả tình huống tiếng Việt → chuyển thành dữ liệu có cấu trúc, (2) diễn đạt phương án đã tính thành đoạn văn dễ hiểu. **Mọi con số — cần bao nhiêu, cấp được bao nhiêu, thiếu gì — do backend + rule engine tính**, kiểm chứng được. AI không chạm vào tồn kho. Đây là cách dùng AI có trách nhiệm, tránh "ảo giác" (bịa số).

### H: Định mức "1 áo phao/người, 15 lít nước/ngày" lấy từ đâu?
**Đ:** Dẫn từ **Sphere Handbook** (chuẩn cứu trợ nhân đạo quốc tế — nước tối thiểu 15 lít/người/ngày) + tiêu chuẩn Hội Chữ thập đỏ + quy định phòng chống thiên tai VN. Và **mọi định mức chỉnh được** cho từng kho. Chúng em ghi rõ "định mức tham khảo nghiên cứu", không áp đặt.

### H: Mức đáp ứng tính thế nào? Sao lũ 120 người mà chỉ báo 14%?
**Đ:** Đáp ứng = **mắt xích yếu nhất** (giá trị nhỏ nhất qua các loại), KHÔNG phải trung bình. Ví dụ thật: 120 người cần 120 áo phao (cấp được 96 = 80%) và 3600 lít nước (cấp được 500 = 14%) → đáp ứng chung = **14%**, vì thiếu nước thì đủ áo phao cũng chưa cứu được người. Nếu lấy trung bình sẽ ra ~50% — con số đẹp nhưng **ru ngủ**. Chúng em chọn báo đúng điểm yếu để người điều phối biết phải bổ sung gì gấp.

### H: Phân bổ vật tư theo nguyên tắc gì? Có ưu tiên vật tư sắp hết hạn không?
**Đ:** Dùng **greedy + FEFO** (First-Expired-First-Out): sắp lô theo hạn dùng, lấy lô gần hết hạn trước (còn đủ điều kiện), rồi tới lô hạn xa, lô không hạn cuối. Vừa đáp ứng nhu cầu, vừa giảm lãng phí vật tư hết hạn. Không bao giờ xuất quá tồn thực tế. Đã kiểm thử phủ các trường hợp.

### H: Sao không dùng thuật toán tối ưu (OR-Tools) cho "AI" hơn?
**Đ:** Ở quy mô kho cấp xã, phân bổ là bài toán đơn giản — greedy cho **kết quả gần như y hệt** thuật toán tối ưu phức tạp, nhưng **giải thích được trong một câu** cho người không chuyên và chạy tức thì. OR-Tools đáng khi có nhiều kho + ràng buộc định tuyến phức tạp — chúng em ghi vào hướng phát triển. Nguyên tắc: dùng công cụ vừa đủ, không phô trương.

### H: Thiếu vật tư thì hệ thống làm gì?
**Đ:** **Gợi ý mượn kho lân cận, ưu tiên gần nhất**. Ví dụ thiếu áo phao → hệ thống đề xuất "liên hệ kho xã Xuân Sơn (8km, còn 10 chiếc)" trước, rồi "kho huyện (35km, còn 24)". Nhưng **AI chỉ GỢI Ý** — con người tự gọi điện/bộ đàm liên hệ, bên cho mượn tự xuất đánh dấu. Mỗi xã một hệ thống độc lập, không tự chuyển hàng qua mạng. Đúng thực tế điều phối liên xã.

### H: Nhập tình huống bằng giọng nói có chính xác không?
**Đ:** Giọng nói chỉ là cách nhập ở giao diện: nói → chuyển thành chữ → **người dùng SỬA lại** → mới gửi phân tích. Không bắn thẳng giọng nói vào AI, vì nhận dạng giọng nói dễ sai số/tên riêng. Luôn có nút gõ tay + tình huống mẫu dự phòng. Người vẫn kiểm soát, công nghệ chỉ hỗ trợ.

### H: Demo phụ thuộc mạng để gọi AI — mất mạng thì sao?
**Đ:** Ba lớp phòng: (1) **cache** — câu tình huống demo đã lưu kết quả sẵn, không cần gọi lại; (2) triển khai thật dùng **Ollama chạy nội bộ**, không cần internet; (3) có thể **nhập tình huống đã cấu trúc trực tiếp** bỏ qua AI. Phần phân bổ + tính toán chạy hoàn toàn nội bộ, không phụ thuộc mạng. AI chỉ là "cửa vào" ngôn ngữ, có thể thay bằng nhập tay.

### H: AI parse sai định dạng thì sao?
**Đ:** Có **validation + tự thử lại**: kết quả AI phải khớp schema (đúng kiểu số, đúng danh mục tình huống) mới chấp nhận; sai thì gọi lại tối đa 2 lần, vẫn sai thì báo lỗi rõ ràng thay vì dùng dữ liệu rác. AI free tier đôi khi quá tải (lỗi tạm thời) → hệ thống tự thử lại vài lần. Không bao giờ để dữ liệu AI không hợp lệ đi vào tính toán.

### H: Phương án có được duyệt trước khi thực hiện không?
**Đ:** Có. Phương án sinh ra ở trạng thái **nháp (DRAFT)**, người phụ trách kho xem rồi **duyệt (APPROVED)** mới thực hiện. Đã duyệt thì không duyệt lại được (tránh thao tác trùng). Đây là cổng kiểm soát của con người trước khi xuất kho theo phương án AI đề xuất.

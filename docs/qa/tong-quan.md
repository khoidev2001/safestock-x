# Q&A — Câu hỏi xuyên suốt (mọi phase)

> Những câu giám khảo hay hỏi nhất về toàn hệ thống. Trả lời thành thật + có căn cứ.

---

### H: Sản phẩm này khác gì phần mềm quản lý kho thông thường?
**Đ:** Phần mềm kho thường trả lời "kho có bao nhiêu?". Chúng em trả lời "kho **sẵn sàng tới đâu?**". Ví dụ: kho thường báo "100 áo phao"; Ứng phó nhanh báo "84/100 sẵn sàng — 96 có mặt, 92 đúng vị trí, 88 đủ điều kiện, 84 lấy được ngay", kèm nguyên nhân trừ điểm và đề xuất khắc phục. Đây là quản lý **năng lực phản ứng thực tế**, không phải con số tồn kho.

### H: "AI" trong sản phẩm nằm ở đâu? Có phải chỉ là if-else phức tạp?
**Đ:** Chúng em dùng AI **đúng chỗ, không nhồi để làm màu**:
- **LLM (Gemini/Ollama)**: hiểu mô tả tình huống bằng ngôn ngữ tự nhiên → JSON có cấu trúc; diễn giải phương án/sự cố bằng tiếng Việt.
- **RAG offline**: vector hóa câu hỏi bằng `nomic-embed-text`, truy hồi ngữ nghĩa từ corpus Sphere/IFRC/PCTT Việt Nam, rồi trả lời có tên tài liệu + mục/trang + URL.
- **PhoWhisper local**: nhận dạng giọng Việt khi cán bộ không thể gõ; con người đọc lại trước khi xử lý.
- **Rule Engine + thống kê**: tính Readiness Score, phân bổ vật tư và forecast EWMA. Chúng em gọi đúng tên, không phóng đại các phần này thành ML.

Nguyên tắc kiến trúc: **LLM KHÔNG tự tính tồn kho hay kết luận số liệu**. Số kho do backend chụp. Với kiến thức RAG, model không được viết câu trả lời tự do mà chỉ chọn ID câu bằng chứng như `K1S1`; hệ thống trả nguyên văn câu trong corpus rồi tự gắn nguồn thật từ index. Vì model không có trường `answer`, nó không thể đổi “15 lít” thành “15 viên thuốc” hoặc đóng dấu Sphere cho claim mới. Đây là cách dùng AI có trách nhiệm, tránh ảo giác cả ở nội dung, số liệu lẫn citation.

### H: Không có phần cứng thật (cảm biến IoT) thì sao gọi là hệ thống thật?
**Đ:** Chúng em **mô phỏng lớp cảm biến**, và đây là **thiết kế có chủ đích, không phải thiếu kinh phí**. Điểm mấu chốt: dữ liệu mô phỏng dùng **đúng schema JSON mà cảm biến thật sẽ xuất ra** — khi có ngân sách cắm cảm biến thật vào, **phần mềm không đổi một dòng**. Chúng em chứng minh phần khó (AI ra quyết định) trước; phần dễ (cắm cảm biến) là bước triển khai sau. Chi phí thật: RFID tag ~1-3k/món, đầu đọc ~vài triệu/cổng dùng nhiều năm — hợp lý cho kho cấp xã.

### H: Hệ thống chạy AI, cơ quan xã có đủ máy không?
**Đ:** Có. Bản local dùng **Ollama + Qwen 3.5 4B** để sinh câu trả lời và `nomic-embed-text` để truy hồi RAG. Trên máy demo đã đo thật: câu trợ lý/RAG thường khoảng **8–16 giây**; Action Plan phức tạp có thể lâu hơn. **Không tốn phí API, chạy offline và dữ liệu không rời máy**. Kiến trúc chat và embedding được tách riêng nên có thể đổi provider mà không viết lại nghiệp vụ; nếu Ollama embedding tạm tắt, tra cứu snapshot kho vẫn chạy và kiến thức chuyên môn sẽ nói tài liệu chưa sẵn sàng thay vì bịa.

### H: Vì sao chọn làm ở địa bàn Đắk Lắk/Phú Yên?
**Đ:** Ý tưởng sinh ra từ **bão lũ Phú Yên 2025** (nay thuộc Đắk Lắk). Tỉnh mới có cả địa hình ven biển (bão, lũ) lẫn Tây Nguyên (lũ quét, sạt lở, hồ chứa) — nhu cầu quản lý kho cứu hộ là thật. Hội Chữ thập đỏ xã Đồng Xuân đã có thư quan tâm, xác nhận vấn đề có thật và sẵn sàng thử nghiệm.

### H: Định mức vật tư (1 áo phao/người, 15 lít nước/ngày) lấy từ đâu?
**Đ:** Cần tách hai khái niệm, không gộp để “mượn uy tín” nguồn. **Sphere Handbook 2018** xác nhận mức tối thiểu trung bình **15 lít nước/người/ngày cho uống và vệ sinh sinh hoạt** (Water supply standard 2.1, trang in 106–107); trong đó nước sống còn qua uống và thức ăn là 2,5–3 lít, tổng nhu cầu cơ bản là 7,5–15 lít tùy bối cảnh. Còn quy tắc áo phao của Mission-to-Kit là **tham số nghiệp vụ an toàn của hệ thống**, không tuyên bố là định mức Sphere. Mọi định mức nghiệp vụ đều phải cấu hình/hiệu chỉnh theo phương án địa phương và con người xác nhận trước khi xuất kho.

### H: RAG có thật sự ngăn AI bịa nguồn không, hay chỉ nhắc model “hãy trích dẫn”?
**Đ:** Không chỉ nhắc bằng prompt. Pipeline có các lớp kiểm soát xác định:
1. Câu hỏi được embedding local và hybrid retrieval chọn chunk có nguồn; bộ 19 câu calibration đạt **8/8 câu đúng có hit, 11/11 câu âm không hit**, gồm cả cross-topic quantity exploit.
2. LLM không được viết câu trả lời, tên nguồn hay URL; nó chỉ chọn ID câu bằng chứng như `K1S1`.
3. Ai-service reject ID không được cấp; nếu model trả field `answer`/claim tự viết thì schema `extra=forbid` buộc retry.
4. Câu trả lời là **nguyên văn evidence trong corpus**; tên tài liệu, mục/trang và URL được hệ thống lấy thẳng từ index. Nếu không có câu trực tiếp hỗ trợ thì nói chưa có tài liệu và không gắn nguồn.

Bằng chứng demo: gọi `/knowledge/search` để xem retrieval độc lập; hỏi “một người cần bao nhiêu nước?” → 15 lít/người/ngày cho uống + vệ sinh sinh hoạt, kèm Sphere Water supply standard 2.1, trang in 106–107. Hỏi liều insulin/calo/kháng sinh ngoài corpus → không gắn nguồn sai và không tự bịa.

### H: Nếu index RAG hoặc model embedding chưa sẵn sàng thì sao?
**Đ:** Service không sập. `/knowledge/search` trả `available=false` với reason code an toàn (`index_missing`, `model_mismatch`, `embedding_unavailable`...), không lộ path/stack trace. `/assistant` vẫn dùng snapshot để trả lời tồn kho/readiness/sự cố; với định mức hoặc sơ cứu không có nguồn, nó nói kho tài liệu tạm thời chưa sẵn sàng. Index đã commit sẵn để không embed lại corpus khi demo, nhưng máy vẫn phải có `nomic-embed-text` để vector hóa câu hỏi.

### H: Nếu demo mất mạng/mất điện thì sao?
**Đ:** Đã thiết kế 3 lớp chịu lỗi:
1. Mất internet, LAN còn → chuyển AI sang Ollama local, chạy đủ.
2. Thiết bị ra hiện trường mất mạng → điện thoại cache kho (offline-đọc), trao đổi qua bộ đàm, nhập bù khi có mạng.
3. Mất điện toàn kho → máy chủ trên UPS + điện thoại độc lập + **phiếu giấy in sẵn**.

Triết lý: **công nghệ hỗ trợ, không thay thế hoàn toàn quy trình cứu hộ** — luôn có đường lui.

### H: Nhập tình huống bằng giọng nói — có phải làm cho "sang", hay giải quyết vấn đề thật?
**Đ:** Giải quyết vấn đề thật, và chúng em định vị nó là **khả năng tiếp cận trong điều kiện khẩn cấp**, không phải "nhập cho tiện". Bối cảnh dùng: cán bộ đứng dưới mưa lũ, tay ướt/bùn, trên xuồng, ban đêm — **không gõ điện thoại được**; nói một câu là hệ thống ghi nhận. Hai điểm kỹ thuật quan trọng:
- **Chạy offline** bằng PhoWhisper local (VinAI fine-tune riêng cho tiếng Việt) — **vùng lũ mất sóng vẫn dùng được**. Khác với Web Speech/Whisper cloud: mất mạng là chết, và dữ liệu phải gửi ra máy chủ nước ngoài.
- **Không phụ thuộc phần cứng đắt** — chạy trên GPU máy văn phòng; thiếu GPU/model thì tự degrade về gõ tay, không sập hệ thống.

### H: AI có tự ý điều vật tư dựa trên giọng nói không? Nghe nhầm thì sao?
**Đ:** **Không.** AI chỉ hỗ trợ nhập liệu, mọi con số quyết định đều qua **2 chốt con người xác nhận** (human-in-the-loop):
1. **Chốt 1 — đọc lại chữ:** giọng nói → PhoWhisper ra text → hiện lên ô mô tả để cán bộ **đọc lại và sửa** (máy nghe nhầm "200" thành "2000" thì gõ tay đè lên). Không nhảy thẳng vào xử lý.
2. **Chốt 2 — soát lại số:** bấm "Phân tích bằng AI" → LLM rút ra số (loại tình huống, số người, giờ, nhóm dễ tổn thương) và **điền sẵn vào form cho người sửa**, chứ không tự lập phương án. Người phải tự bấm "Tính nhu cầu vật tư".

Triết lý: cứu hộ mà để máy tự quyết theo giọng nói là rủi ro chết người. **Con người luôn là người bấm nút cuối** — AI gõ hộ và rút số nháp, không thay người ra quyết định.

### H: Đội mấy người, làm bao lâu?
**Đ:** 2 người, kế hoạch 10 tuần. Chúng em ưu tiên làm **xuất sắc 2 module lõi (Readiness Score + Mission-to-Kit)** thay vì dàn trải nhiều tính năng hời hợt. Có kế hoạch build chi tiết chia phase, mỗi phase có checklist + kiểm thử tự động.

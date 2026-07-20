# Q&A — Chatbot hỏi-đáp kho (G4api) + Backup Supabase (Bp5)

> Trợ lý AI trả lời từ dữ liệu kho thật; sao lưu định kỳ chống mất dữ liệu.

---

## Chatbot hỏi-đáp kho (BE-G4api)

### H: Chatbot này khác gì ChatGPT? Nó tự bịa số không?
**Đ:** Khác căn bản: **không để LLM tự nhớ hay bịa**. Mỗi câu hỏi, **backend chụp một ảnh dữ liệu kho hiện tại** (tồn theo mặt hàng đã trừ phần đang cho mượn, điểm sẵn sàng, sự cố đang mở) thành JSON, rồi đưa cho LLM kèm ràng buộc "chỉ trả lời từ dữ liệu này". LLM đóng vai người đọc số và diễn đạt, không phải nguồn số. Đã verify thật: hỏi "còn bao nhiêu áo phao người lớn?" → trả "còn 96 chiếc" đúng khớp database.

### H: Nếu hỏi cái kho không có dữ liệu, hoặc hỏi linh tinh ngoài phạm vi thì sao?
**Đ:** Có 2 lớp chặn trong system prompt: hỏi thông tin không có trong snapshot → trả "Tôi không có dữ liệu về việc đó trong kho hiện tại"; hỏi ngoài phạm vi quản lý kho (chuyện phiếm, kiến thức chung) → "Tôi chỉ hỗ trợ hỏi-đáp về kho vật tư cứu hộ". Đã verify: hỏi "Thủ đô nước Pháp?" → từ chối đúng, **không trả lời Paris**. Chatbot không lạc đề, không thành trợ lý tổng quát.

### H: Vì sao chặt chẽ vậy? Cho nó trả lời rộng hơn không tốt hơn à?
**Đ:** Đây là hệ cứu hộ — thông tin sai còn nguy hiểm hơn không có thông tin. Nếu để LLM "đoán cho có", cán bộ có thể ra quyết định điều phối dựa trên số bịa. Ràng buộc chỉ-trả-lời-từ-dữ-liệu-thật là **có chủ đích**, đúng nguyên tắc xuyên suốt dự án: AI diễn đạt, rule/dữ liệu quyết định.

### H: Dữ liệu kho có bị lộ cho bên thứ ba (Google/Gemini) khi hỏi không?
**Đ:** Snapshot gửi qua LLM chỉ gồm số liệu vận hành (tồn, điểm, sự cố) — **không có thông tin cá nhân người dùng**. Provider AI pluggable: demo dùng Gemini free tier; nếu cần khép kín hoàn toàn, đổi sang Ollama chạy local (0đ, offline) — cùng một endpoint, không đổi code backend. Tên nhà cung cấp/model cũng được che (redact) trong câu trả lời.

---

## Backup Supabase (BE-Bp5)

### H: Dữ liệu kho được sao lưu thế nào? Lỡ hỏng database thì sao?
**Đ:** Có **lịch sao lưu tự động hằng ngày 17:00**: hệ thống dump toàn bộ database → tải lên Supabase Storage (lưu trữ đám mây), giữ **3 bản gần nhất**, bản cũ hơn tự xóa để không phình dung lượng. Chạy bằng hàng đợi công việc (BullMQ) nền, không ảnh hưởng hiệu năng phục vụ.

### H: Mất mạng lúc 17:00 thì backup lỗi cả cụm à?
**Đ:** Không — job backup chạy **nền, tách khỏi luồng chính**. Mất mạng/lỗi upload → job đánh dấu thất bại và thử lại theo cơ chế hàng đợi, hệ thống chính vẫn phục vụ bình thường. Chưa cấu hình Supabase (vd môi trường dev) → app **bỏ qua lịch backup êm**, không sập lúc khởi động.

### H: pg_dump có cần cài thêm gì trên máy chủ không?
**Đ:** Không — lệnh dump chạy **bên trong container Postgres** đã có sẵn, máy chủ ứng dụng không cần cài công cụ database. Bản dump bỏ thông tin chủ sở hữu/quyền (portable) để khôi phục được trên máy khác dễ dàng.

### H: Khóa Supabase để ở đâu? Có an toàn không?
**Đ:** Khóa `service_role` (bỏ qua kiểm soát truy cập để ghi/xóa backup) chỉ đặt trong biến môi trường **phía máy chủ**, không bao giờ gửi ra client hay commit vào mã nguồn. Endpoint chạy backup thủ công yêu cầu quyền `audit:view` (cấp quản trị). Hướng dẫn lấy khóa ghi trong `.env.example`.

# Đánh giá Ollama Qwen local

> Baseline Qwen 2.5. Kết quả sau nâng cấp: [ollama-qwen35-4b-evaluation.md](ollama-qwen35-4b-evaluation.md).

Ngày chạy: 2026-07-20  
Model: `qwen2.5:latest` (4,7 GB), chạy local qua Ollama  
Phạm vi: chatbot kho, thời tiết, parse tình huống, giải thích điều phối và Action Plan.

## Kết quả 10 ca

| # | Câu hỏi / tình huống | Kết quả chính | Thời gian | Đánh giá |
|---|---|---|---:|---|
| 1 | Còn bao nhiêu áo phao người lớn? | 15 chiếc | 49 ms | Đạt |
| 2 | Vật tư nào có hạn dùng gần nhất? | Nước: 2027-01-13; áo phao: 2028-07-06 | 19 ms | Đạt |
| 3 | Kho đang có sự cố gì? | Không có sự cố đang mở | 19 ms | Đạt |
| 4 | Điểm sẵn sàng hiện tại là bao nhiêu? | 96/100, mức sẵn sàng | 8 ms | Đạt |
| 5 | Ba ngày tới có mưa lớn không? | 1,6 mm/72 giờ, chưa cảnh báo mưa lớn | 990 ms | Đạt |
| 6 | Thủ đô nước Pháp là gì? | Từ chối vì ngoài phạm vi kho | 3,64 s | Đạt |
| 7 | Lũ tại Phú Xuân, 170-180 người, 48 giờ, 25 trẻ, 15 người già | FLOOD; lấy cận trên 180; đủ nhóm dễ tổn thương | 8,16 s | Đạt |
| 8 | Cháy chợ Hòa An, 40 người, 6 giờ, 3 ca y tế | FIRE; 40 người; 3 ca y tế; CRITICAL | 7,35 s | Đạt |
| 9 | Giải thích điều phối cho 180 người, đáp ứng 72%, thiếu 300 chai và 50 áo phao | Giữ đúng toàn bộ số, không thêm số liệu | 8,71 s | Đạt |
| 10 | Sinh Action Plan cho lũ 180 người, 48 giờ | Đủ 3 giai đoạn, mục tiêu, cảnh báo, câu hỏi; thuần tiếng Việt | 22,02 s | Đạt, chậm |

## Kết luận

- Luồng sản phẩm tích hợp đạt **10/10 ca về tính đúng đắn**.
- Qwen thuần đạt 8/10 trong lần thử trực tiếp: model không ổn định khi tự so sánh ngày hết hạn và đọc dữ liệu thời tiết lồng trong JSON.
- Backend hiện xử lý xác định tồn kho, hạn dùng, sự cố, readiness và thời tiết từ snapshot/API; chỉ giao câu hỏi mở, parse và diễn giải cho Qwen. Cách này loại hai lỗi trên và giảm chat thường xuống 8-990 ms.
- Action Plan đúng schema và nội dung nhưng mất khoảng 22 giây trên model local hiện tại. UI cần tiếp tục hiển thị trạng thái chờ; không nên dùng cho thao tác cần phản hồi tức thời.

## Chạy lại

```powershell
cd apps/ai-service
.\.venv\Scripts\python.exe scripts\evaluate_ollama.py
```

# Đánh giá Ollama Qwen 3.5 4B

Ngày chạy: 2026-07-20

Model: `qwen3.5:4b`, Q4_K_M, 4,7B tham số

Thiết bị lúc test: 100% GPU, context runtime 4096 token
Phạm vi: chatbot kho, thời tiết, parse tình huống, giải thích điều phối và Action Plan.

## Kết quả AI thuần

| # | Chức năng | Kết quả | Thời gian | Đánh giá |
|---|---|---|---:|---|
| 1 | Tồn áo phao người lớn | Trả đúng 15 chiếc | 6,31 giây | Đạt |
| 2 | Hạn dùng gần nhất | Chọn đúng vật tư nhưng đổi sai ngày thành 20/01/2027 | 7,03 giây | Không đạt |
| 3 | Sự cố đang mở | Mất điện khu vực B | 6,30 giây | Đạt |
| 4 | Readiness | 73/100 | 6,61 giây | Đạt |
| 5 | Thời tiết 72 giờ | 1,6 mm, không cảnh báo mưa lớn | 6,95 giây | Đạt |
| 6 | Câu ngoài phạm vi | Từ chối đúng phạm vi kho | 5,91 giây | Đạt |
| 7 | Parse lũ | FLOOD, 180 người, 48 giờ, đúng nhóm dễ tổn thương | 6,85 giây | Đạt |
| 8 | Parse cháy | FIRE, 40 người, 3 ca y tế | 6,87 giây | Đạt |
| 9 | Giải thích điều phối | Giữ đúng 180, 72%, 300 và 50 | 7,09 giây | Đạt |
| 10 | Action Plan | Đủ schema, ba giai đoạn, không thêm số ngoài context | 33,12 giây | Đạt, chậm |

Kết quả: **9/10 ca AI thuần**. So với baseline `qwen2.5:latest` đạt 8/10, Qwen 3.5 4B cải thiện một ca nhưng vẫn không đủ tin cậy để tự tính hoặc tự so sánh dữ liệu nghiệp vụ.

## Thay đổi kỹ thuật

- Chuyển cấu hình mặc định sang `OLLAMA_MODEL=qwen3.5:4b`.
- Tắt thinking bằng `think: false`, giữ model trong bộ nhớ 30 phút.
- Truyền JSON Schema trực tiếp cho Ollama thay vì chỉ yêu cầu JSON tự do.
- Action Plan bắt buộc đúng ba phase `0-2h`, `2-6h`, `6-24h`; mỗi phase có 2-4 hành động.
- Cấm field lạ, bắt buộc warnings và follow-up questions.
- Chặn số do model tự thêm và retry với chỉ dẫn sửa lỗi.
- Giới hạn đầu ra JSON 2048 token, văn bản thường 512 token để tránh lặp vô hạn.

## Đánh giá sản phẩm

- Các câu tồn kho, hạn dùng, sự cố, readiness và thời tiết tiếp tục dùng fast path backend. Vì vậy lỗi đọc sai ngày của AI thuần không đi tới người dùng.
- Câu hỏi mở, parse và diễn giải mới gọi Qwen. Độ trễ warm khoảng 6-7 giây.
- Action Plan dao động 19-50 giây tùy số lần retry. UI phải giữ trạng thái chờ và backend luôn validate trước khi sử dụng.
- Lần gọi cold đầu tiên đã quan sát khoảng 62 giây; `keep_alive=30m` giảm các lần nạp lại khi demo liên tục.

## Xác minh

- AI evaluator: 9/10 ca AI thuần.
- Backend: 19/19 suite, 147/147 test đạt.
- Ollama: `qwen3.5:4b` chạy 100% GPU khi benchmark.
- Python compile và kiểm tra schema: đạt.

## Chạy lại

```powershell
apps\ai-service\.venv\Scripts\python.exe apps\ai-service\scripts\evaluate_ollama.py
```

## Câu hỏi chưa xử lý

Không.

# Kế hoạch E2E RAG qua giao diện

_Lập ngày: 2026-07-23 · Phạm vi: frontend → backend → AI service → Ollama_

## Kết quả mong muốn

Xác minh trực tiếp bằng trình duyệt rằng trợ lý ADMIN trả lời kiến thức cứu trợ bằng bằng chứng nguyên văn và nguồn thật, từ chối an toàn câu ngoài corpus, đồng thời giữ luồng trả lời nhanh cho dữ liệu kho. Việc kiểm thử không reset/seed database, không thay đổi nghiệp vụ và không commit/push.

## Ràng buộc

- Giữ nguyên toàn bộ working tree chưa commit.
- Chỉ dùng mô hình hành chính hai cấp tỉnh + xã; không đưa mô hình cũ vào dữ liệu kiểm thử hoặc ảnh demo.
- Dùng browser session cô lập, chỉ cho phép truy cập localhost.
- Không đọc hoặc ghi token/cookie; chỉ dùng tài khoản development đã công khai trong `docs/HUONG-DAN-TEST.md`.
- Không gọi pass nếu thiếu bằng chứng UI, network hoặc response thực tế.

## Chuẩn bị

1. Xác nhận PostgreSQL, Redis, backend, AI service và Ollama đang khỏe.
2. Xác nhận `qwen3.5:4b` và `nomic-embed-text` có trong Ollama.
3. Khởi động frontend tại `http://localhost:3200` nếu chưa chạy; không seed database.
4. Mở browser session cô lập và ghi bằng chứng vào `docs/evidence/e2e-rag/`.

## Ca kiểm thử

### E2E-RAG-01 · Đăng nhập và mở trợ lý

- Đăng nhập ADMIN bằng tài khoản development.
- Mở màn hình **Trợ lý** hoặc bong bóng chat.
- Đạt khi dashboard/trợ lý hiển thị, không có lỗi console nghiêm trọng và request xác thực thành công.

### E2E-RAG-02 · Câu hỏi định mức nước

- Hỏi: `Một người cần bao nhiêu nước mỗi ngày?`
- Đạt khi câu trả lời chứa bằng chứng nguyên văn, phân biệt đúng phạm vi định mức và gắn nguồn Sphere thật; không đổi số hoặc đơn vị.

### E2E-RAG-03 · Câu ngoài corpus và quantity exploit

- Hỏi lần lượt về insulin, calo và liều thuốc ngoài corpus.
- Đạt khi hệ thống nói chưa có trong tài liệu tham khảo, không gắn nguồn sai và không suy diễn con số từ chunk khác chủ đề.

### E2E-RAG-04 · Fast-answer dữ liệu kho

- Hỏi một câu về tồn kho đang có dữ liệu, ví dụ số áo phao người lớn có thể cấp ngay.
- Đạt khi câu trả lời lấy từ snapshot/backend, không gắn nguồn corpus và không bị chậm bởi luồng RAG không cần thiết.

### E2E-RAG-05 · Duplicate/spam và degrade

- Gửi lại cùng một câu hỏi sau khi câu trước hoàn tất; quan sát không nhân đôi message/request ngoài thao tác người dùng.
- Kiểm tra lỗi hiển thị/network không làm mất khả năng nhập lại câu hỏi.
- Không chủ động dừng Ollama hoặc sửa index trong lượt kiểm thử này vì có thể ảnh hưởng phiên dịch vụ đang dùng; chỉ đối chiếu degrade qua bằng chứng test hiện có nếu chưa được phép cô lập dịch vụ.

## Bằng chứng cần lưu

- Screenshot sau đăng nhập, câu RAG dương, câu ngoài corpus và fast-answer.
- Network request/response liên quan đến login và assistant, đã tránh lưu/chia sẻ token.
- Console error/warning liên quan trực tiếp đến luồng.
- Thời gian phản hồi quan sát được cho câu RAG và fast-answer.

## Review sau kiểm thử

- **False-positive:** nguồn có thật nhưng claim/số/đơn vị có đúng câu hỏi không.
- **Duplicate/spam:** một thao tác có tạo đúng một message và một request không.
- **Security:** không lộ token, vector, toàn index hoặc dữ liệu ngoài scope.
- **Degrade:** lỗi AI/retrieval có được diễn đạt an toàn, không làm sập trợ lý hoặc fast-answer không.
- **Tính trung thực:** phân biệt rõ phần đã chạy UI, phần chỉ có test contract và phần chưa chạy.

## Điều kiện hoàn tất

- Các ca E2E-RAG-01 đến E2E-RAG-04 có bằng chứng browser thực tế.
- E2E-RAG-05 được đánh giá trung thực theo phạm vi có thể chạy an toàn.
- Nếu E2E pass, tạo kế hoạch riêng cho P0 mission prepare atomic; chưa triển khai P0 trong lượt này.

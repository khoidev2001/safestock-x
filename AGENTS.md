# Quy trình làm việc nhanh

## Mặc định khi xử lý thay đổi

- Bắt đầu bằng việc đọc `README.md`, quy tắc liên quan và diff hiện tại.
- Mặc định review diff và chạy kiểm tra nhỏ, trực tiếp liên quan đến phần đã sửa.
- Không tự động chạy build toàn repo, full test, E2E, coverage, browser/preview, lint/typecheck toàn repo hoặc review phạm vi rộng.
- Không lặp lại cùng một kiểm tra nếu chưa có thay đổi mới ảnh hưởng đến nó.
- Nếu chưa chạy kiểm tra nào, ghi rõ `Not run` và lý do trong báo cáo.

## Chỉ chạy kiểm tra nặng khi

- Người dùng yêu cầu rõ; hoặc
- Thay đổi thuộc nhóm rủi ro cao: migration/schema/database, auth/quyền, payment, security, dependency, CI/deployment; hoặc
- Có bằng chứng trực tiếp cho thấy cần kiểm tra rộng để xác nhận lỗi/regression.

Khi cần xác nhận lỗi hiển nhiên, ưu tiên một kiểm tra nhỏ nhất có thể tái hiện lỗi trước.

## Hook và an toàn

- Không tự tắt các hook bảo vệ bí mật, quyền riêng tư hoặc an toàn.
- Không tự động chạy hook tốn thời gian ở đầu/cuối mỗi prompt hoặc mỗi tool nếu chúng không cần thiết cho thay đổi hiện tại.
- Không che giấu lỗi kiểm tra; phân biệt rõ `Passed`, `Failed`, và `Not run`.

## Báo cáo

Nêu kết quả trước, sau đó liệt kê kiểm tra đã chạy và chưa chạy. Cuối báo cáo phải có mục `Câu hỏi còn bỏ ngỏ` nếu còn vấn đề cần người dùng quyết định.

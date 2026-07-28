# Kho tri thức RAG — quy chuẩn biên tập

Đây là corpus mà trợ lý AI được phép dùng khi trả lời kiến thức cứu trợ. Mục tiêu là **ít nhưng đúng**, không điền cho đủ chủ đề.

## Quy tắc bắt buộc

1. Mỗi mục `##` hoặc `###` là một chunk tự chứa, mục tiêu 80–150 từ, tối đa 220 từ.
2. Cuối mỗi chunk phải có ít nhất một nguồn theo đúng format:

```md
> Nguồn: <tên tài liệu> | <mục/trang cụ thể> | <URL https> | truy cập YYYY-MM-DD
```

3. Chỉ dùng nguồn gốc hoặc tổ chức chuyên môn uy tín: Sphere Standards, IFRC/WHO, cơ quan PCTT Việt Nam, Bộ Y tế hoặc cơ quan nhà nước tương ứng.
4. Mọi con số phải được đọc trực tiếp trong tài liệu gốc và có locator trang/mục. Không chép số từ plan, trí nhớ hoặc câu trả lời AI.
5. Tách rõ phạm vi định mức. Ví dụ, nước sống còn để uống/ăn không đồng nghĩa tổng nước uống + nấu + vệ sinh. Không gọi một mức là “tối đa” nếu nguồn chỉ gọi là mức tối thiểu/tham khảo.
6. Nội dung sơ cứu chỉ là hỗ trợ ban đầu, không thay thế nhân viên y tế. Không tự thêm số điện thoại hoặc thuốc/liều lượng chưa được nguồn xác minh.
7. Dùng mô hình hành chính 2 cấp (tỉnh + xã); không đưa mô hình hành chính cũ vào corpus.
8. Chạy linter/parser và `build_knowledge_index.py --check` sau mọi thay đổi. Index JSON là artifact sinh tự động, không sửa tay.

## Phạm vi hiện tại

- Định mức nước và tiếp cận nước an toàn: Sphere Handbook 2018 bản PDF gốc.
- Nước sạch, vệ sinh, lưu trữ nước và phòng bệnh tại điểm sơ tán: Sphere Handbook 2018.
- An toàn lương thực, bảo quản/phân phối và nhận biết nguy cơ dinh dưỡng cần chuyển chuyên môn: Sphere Handbook 2018.
- Nơi ở khẩn cấp, lựa chọn điểm sơ tán, đồ dùng thiết yếu và nguyên tắc bảo vệ: Sphere Handbook 2018.
- Ứng phó mưa lớn/lũ/lũ quét/sạt lở: cổng thông tin PCTT Việt Nam.
- Sơ cứu và chuẩn bị trong thiên tai: IFRC International First Aid Guidelines 2020.
- Các chủ đề chưa có tài liệu gốc đủ chắc sẽ trả “chưa có trong tài liệu tham khảo”, không dùng trí nhớ mô hình để bù.

# Q&A — Phase C (Readiness Score — differentiator)

> Chỉ số sẵn sàng: 6 thành phần có trọng số, tính ở 4 cấp, kèm nguyên nhân trừ điểm + đề xuất + ngưỡng hành động.
>
> Trạng thái: C0-C3 ✅ (6 công thức, tính điểm 4 cấp, recalc realtime, đề xuất, ngưỡng hành động).

---

### H: Readiness Score gồm những gì, tính thế nào?
**Đ:** 6 thành phần có trọng số (tổng = 100%):
- Khả dụng số lượng (28%) · Tình trạng vật tư (22%) · Thời hạn dùng (15%) · Khả năng tiếp cận (15%) · Điều kiện môi trường (10%) · Độ tin cậy dữ liệu (10%).

Mỗi thành phần chuẩn hóa về thang 0-100, rồi gộp theo trọng số. Tính ở 4 cấp: từng lô → kệ → khu → toàn kho. Mỗi điểm **truy ngược được** về 6 thành phần và lý do trừ điểm.

### H: Trọng số 28/22/15/15/10/10 lấy đâu ra? Có tùy tiện không?
**Đ:** Đây là **đề xuất tham khảo**, và quan trọng hơn — **chỉnh được cho từng kho**. Trong cứu hộ, khả dụng số lượng và tình trạng vật tư quan trọng nhất (nên trọng số cao), môi trường và độ tin cậy là yếu tố bổ trợ. Chúng em ghi rõ "định mức tham khảo nghiên cứu", cho quản lý kho tinh chỉnh theo đặc thù. Hệ thống lưu trọng số cấu hình trong database (bảng ReadinessRule).

### H: Vật tư "sắp hết hạn" được đánh dấu thế nào? Ai cập nhật khi thời gian trôi?
**Đ:** **Không lưu cứng trạng thái thời gian** — tính phái sinh từ ngày hết hạn so với thời điểm hiện tại mỗi lần đọc. Nên không bao giờ lệch: hôm nay "còn hạn dài", 5 tháng sau tự thành "sắp hết hạn" mà không cần công việc nền cập nhật. Ngưỡng: còn >6 tháng = 100đ, 2-6 tháng = 70đ, <2 tháng = 40đ, hết hạn = 0đ.

### H: Vật tư đang được đội cứu hộ mượn thì tính là còn hay mất?
**Đ:** Đang mượn (ON_LOAN) **vẫn thuộc kho, không tính mất**, nhưng **loại khỏi "khả dụng ngay"** — vì chưa lấy lại được tức thời. Đây là 2 chiều độc lập: tình trạng vật lý (mới/cũ/hỏng) và trạng thái lưu hành (trong kho/đang mượn). Kiểm kê định kỳ cũng chỉ đếm phần trong kho, trừ phần đang mượn ra, để không "làm mất" số đang cho mượn khỏi sổ.

### H: Vật tư có đơn vị khác nhau (lít nước, chiếc áo phao) thì gộp điểm kiểu gì?
**Đ:** Không cộng đơn vị thô (không "88 lít + 96 chiếc"). Mỗi loại tính điểm 0-100 **theo đơn vị riêng** của nó, rồi mới gộp các điểm đã chuẩn hóa. Điểm 0-100 gộp được vì cùng thang. (Còn ở Mission-to-Kit, mức đáp ứng lấy theo **mắt xích yếu nhất** — thiếu nước thì đủ áo phao cũng chưa sẵn sàng.)

### H: Cảm biến hỏng/không cập nhật thì điểm môi trường có bị sai không?
**Đ:** Không tin dữ liệu ma. Nếu cảm biến không cập nhật quá 30 phút, hệ thống **không dùng giá trị cũ** và **hạ điểm "độ tin cậy dữ liệu"** — biến "cảm biến chết" thành tín hiệu cảnh báo, không phải dữ liệu giả. Đây là lý do có riêng thành phần độ tin cậy dữ liệu.

### H: Điểm số để làm gì? Nhìn con số 84 thì người quản lý biết làm gì?
**Đ:** Điểm gắn với **ngưỡng hành động** — hệ thống tự phản ứng theo vùng điểm:
- ≥80: sẵn sàng (xanh)
- 70-79: cần chú ý (cảnh báo vàng)
- 50-69: suy giảm → **tự thông báo quản lý** + đề xuất khắc phục
- <50: không đủ khả năng → **cảnh báo đỏ + cảnh báo khi lập nhiệm vụ mới**

Ngưỡng chỉnh được. Điểm không chỉ để nhìn — nó **kích hoạt hành động**.

### H: Điểm số có cập nhật tự động không, hay phải bấm tính lại?
**Đ:** Tự động. Khi cảm biến môi trường thay đổi, hệ thống **tự tính lại điểm trong dưới 2 giây** — đã đo thực tế: đẩy độ ẩm một khu từ 60% lên 95% → điểm khu đó rớt ngay. Có cơ chế gộp nhiều thay đổi liên tiếp thành một lần tính (tránh tính dồn dập). Đây là điều làm hệ thống "sống": người quản lý thấy năng lực kho biến động realtime, không phải số liệu tĩnh của hôm qua.

### H: Tính điểm 4 cấp thì làm sao đảm bảo cấp trên phản ánh đúng cấp dưới?
**Đ:** Điểm cấp trên = **trung bình có trọng số theo số lượng** của cấp dưới (lô → kệ → khu → kho). Lô nhiều vật tư ảnh hưởng điểm nhiều hơn — hợp lý vì mất 100 áo phao nghiêm trọng hơn mất 2 chiếc. Breakdown 6 thành phần cũng cuộn lên theo, kèm gom lý do trừ điểm nổi bật. Kho rỗng → điểm 0 (chưa sẵn sàng), không chia cho 0.

### H: Đề xuất cải thiện là AI sinh ra hay lập trình cứng?
**Đ:** Sinh từ **chính nguyên nhân trừ điểm** — không phải câu chung chung. Ví dụ điểm "thời hạn" thấp vì "bộ sơ cứu sắp hết hạn" → đề xuất "Ưu tiên sử dụng hoặc thay mới vật tư sắp hết hạn". Đề xuất sắp theo thành phần yếu nhất trước, để người quản lý biết xử lý gì đầu tiên. Ở bản nâng cao, LLM sẽ diễn đạt đề xuất mượt hơn, nhưng căn cứ vẫn từ dữ liệu thật.

### H: Vì sao môi trường xấu mà điểm không rớt nhiều?
**Đ:** Vì môi trường chỉ chiếm 10% trọng số — đúng thiết kế. Độ ẩm cao là cảnh báo cần xử lý, nhưng không phủ nhận việc kho vẫn có đủ vật tư đúng điều kiện. Chúng em **không phóng đại** để tạo hiệu ứng demo. Nếu muốn môi trường ảnh hưởng mạnh hơn với kho y tế (nhạy cảm độ ẩm), quản lý chỉnh trọng số lên — hệ thống cho phép.

### H: Công thức tính điểm có kiểm thử không, hay chỉ áng chừng?
**Đ:** Mỗi công thức con là một hàm thuần (không phụ thuộc database), có **kiểm thử tự động phủ mọi nhánh** — đã pass **52 test**: từng ngưỡng hết hạn, từng mức tình trạng, chưa kiểm kê, cảm biến hỏng, gộp trọng số, cuộn 4 cấp, sinh đề xuất, phân vùng hành động... Tách công thức khỏi truy vấn database giúp kiểm thử chính xác và dễ chỉnh.

### H: Sao không dùng máy học (ML) để tính điểm cho "AI" hơn?
**Đ:** Readiness cần **giải thích được và kiểm chứng được** — người quản lý phải hiểu vì sao điểm thấp và sửa được. Mô hình ML hộp đen không phù hợp: cứu hộ cần minh bạch, không đoán mò. Chúng em dùng rule engine có trọng số minh bạch. AI (LLM) dùng ở khâu hiểu ngôn ngữ và giải thích — đúng thế mạnh của nó. Đây là lựa chọn có chủ đích, không phải thiếu năng lực ML.

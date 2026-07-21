# Q&A — Phase C (Readiness vận hành v2.2)

> Kết luận chính: blocker có bằng chứng + 3 trạng thái vận hành + khả năng đáp ứng nhiệm vụ. Sáu thành phần và điểm 0-100 dùng để giải thích, theo dõi xu hướng.
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
**Đ:** Điểm 0-100 chỉ là chỉ báo xu hướng và lớp giải thích phụ. Màn hình chính trả lời trực tiếp: **Sẵn sàng điều phối / Cần xử lý / Chưa thể điều phối**, blocker nào đang tồn tại và cần làm gì. Điểm cao không được ghi đè blocker; điểm thấp nhưng không có blocker không tự động khóa kho.

### H: Điểm số có cập nhật tự động không, hay phải bấm tính lại?
**Đ:** Tự động. Khi cảm biến môi trường thay đổi, hệ thống **tự tính lại điểm trong dưới 2 giây** — đã đo thực tế: đẩy độ ẩm một khu từ 60% lên 95% → điểm khu đó rớt ngay. Có cơ chế gộp nhiều thay đổi liên tiếp thành một lần tính (tránh tính dồn dập). Đây là điều làm hệ thống "sống": người quản lý thấy năng lực kho biến động realtime, không phải số liệu tĩnh của hôm qua.

### H: Tính điểm 4 cấp thì làm sao đảm bảo cấp trên phản ánh đúng cấp dưới?
**Đ:** Điểm cấp trên = **trung bình có trọng số theo số lượng** của cấp dưới (lô → kệ → khu → kho). Lô nhiều vật tư ảnh hưởng điểm nhiều hơn — hợp lý vì mất 100 áo phao nghiêm trọng hơn mất 2 chiếc. Breakdown 6 thành phần cũng cuộn lên theo, kèm gom lý do trừ điểm nổi bật. Kho rỗng → điểm 0 (chưa sẵn sàng), không chia cho 0.

### H: Đề xuất cải thiện là AI sinh ra hay lập trình cứng?
**Đ:** Sinh từ **chính nguyên nhân trừ điểm** — không phải câu chung chung. Ví dụ điểm "thời hạn" thấp vì "bộ sơ cứu sắp hết hạn" → đề xuất "Ưu tiên sử dụng hoặc thay mới vật tư sắp hết hạn". Đề xuất sắp theo thành phần yếu nhất trước, để người quản lý biết xử lý gì đầu tiên. Ở bản nâng cao, LLM sẽ diễn đạt đề xuất mượt hơn, nhưng căn cứ vẫn từ dữ liệu thật.

### H: Vì sao môi trường xấu mà điểm không rớt nhiều?
**Đ:** Vì điểm môi trường chỉ chiếm 10% trong chỉ báo xu hướng. Tuy nhiên kết luận vận hành đọc trạng thái môi trường riêng: chưa tới mức mất an toàn thì `NEEDS_ACTION`; khi thành phần môi trường bằng 0 thì tạo blocker `UNSAFE_ENVIRONMENT` và kho thành `NOT_DISPATCHABLE`. Do đó trọng số thấp không thể che một điều kiện nguy hiểm.

### H: Công thức tính điểm có kiểm thử không, hay chỉ áng chừng?
**Đ:** Mỗi công thức và luật kết luận là hàm thuần. Ngoài test ngưỡng cũ còn có test điểm cao + blocker vẫn chặn, điểm thấp không blocker chỉ cảnh báo, lọc lô hết hạn/kệ khóa/hỏng/cần kiểm tra và trừ phần đang mượn. Toàn backend pass **25 suite / 168 test** ngày 2026-07-21.

### H: Sao không dùng máy học (ML) để tính điểm cho "AI" hơn?
**Đ:** Readiness cần **giải thích được và kiểm chứng được** — người quản lý phải hiểu vì sao điểm thấp và sửa được. Mô hình ML hộp đen không phù hợp: cứu hộ cần minh bạch, không đoán mò. Chúng em dùng rule engine có trọng số minh bạch. AI (LLM) dùng ở khâu hiểu ngôn ngữ và giải thích — đúng thế mạnh của nó. Đây là lựa chọn có chủ đích, không phải thiếu năng lực ML.

### H: Điểm sẵn sàng có tự cập nhật khi nhập/xuất kho không, hay chỉ khi cảm biến đổi?
**Đ:** Có — **mọi giao dịch tồn kho** (nhập/xuất/xuất lô/sửa tay/kiểm kê) đều tự kích hoạt tính lại điểm ngay sau khi giao dịch hoàn tất, không cần bấm "tính lại" thủ công. Chạy **sau khi** giao dịch đã lưu (không nằm trong cùng transaction) — lỗi tính điểm không bao giờ làm hỏng giao dịch kho, chỉ ghi log cảnh báo. Trước đây chỉ cảm biến môi trường mới tự trigger; giờ đã nối đủ cả đường tồn kho.

### H: Khi kho chuyển sang trạng thái nguy hiểm, hệ thống có tự báo ai không? Có bị báo dồn dập không?
**Đ:** Có. Hệ thống thông báo cho vai trò phụ trách kho khi `operationalStatus` đổi sang `NEEDS_ACTION` hoặc `NOT_DISPATCHABLE`, kèm blocker hoặc hành động đầu tiên. Nếu trạng thái không đổi thì không gửi lại chỉ vì điểm dao động.

### H: Nếu điểm kho ở mức CRITICAL, hệ thống có cho lập nhiệm vụ cứu hộ mới không?
**Đ:** Không quyết định theo chữ `CRITICAL` nữa. Hệ thống chỉ chặn lập phương án khi kho có blocker vận hành cụ thể. Sau đó Mission lọc từng lô; nếu một SKU thiết yếu không có lô đủ điều kiện, nhiệm vụ vẫn được lưu nháp để cán bộ xem thiếu gì nhưng không thể duyệt/gửi cho tới khi xử lý blocker hoặc bổ sung nguồn hàng.

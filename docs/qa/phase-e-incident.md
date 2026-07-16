# Q&A — Phase E (Incident Intelligence — điều tra sự cố)

> Hợp nhất sự kiện cảm biến đa nguồn → timeline → chấm điểm nghiêm trọng → giải thích. Rule engine với ngưỡng cụ thể, phân biệt nhiễu vs sự cố thật.

---

### H: Hệ thống "phát hiện thất thoát" thế nào? Có phải chỉ đọc lại kịch bản đã lập trình?
**Đ:** Không. Rule engine hợp nhất **nhiều nguồn độc lập** với **ngưỡng cụ thể**: loadcell giảm hơn 3kg + cửa mở + RFID ghi nhận vật tư qua cổng, tất cả trong cửa sổ ±5 phút → nghi thất thoát. Điểm mấu chốt: engine phải thấy **tổ hợp đồng thuận**, không phải một tín hiệu đơn lẻ. Đã kiểm thử: loadcell giảm mà không có cửa/RFID → hệ thống kết luận **lỗi cảm biến**, không phải thất thoát. Nó phân biệt được, không mù quáng khớp kịch bản.

### H: Làm sao phân biệt nhiễu cảm biến bình thường với sự cố thật?
**Đ:** Bằng **ngưỡng + cửa sổ thời gian**. Loadcell dao động nhỏ (dưới 3kg — người chạm vào, rung) bị bỏ qua, không tạo sự cố. Chỉ biến động vượt ngưỡng mới xét. Và các sự kiện phải xảy ra **gần nhau về thời gian** (±5 phút) mới coi là liên quan — cửa mở 10 phút sau khi loadcell giảm thì không tính là cùng một vụ. Đã kiểm thử cả hai trường hợp. Đây là lý do chúng em thêm nhiễu có kiểm soát vào dữ liệu mô phỏng: để chứng minh engine lọc được.

### H: Mức độ nghiêm trọng và độ tin cậy tính ra sao?
**Đ:** Theo **số nguồn đồng thuận và trọng số bằng chứng**. Loadcell giảm (trọng số 0.4) + cửa mở (0.3) + RFID (0.3). Càng nhiều nguồn xác nhận → độ tin cậy càng cao, mức càng nghiêm trọng: 2 nguồn = CAO, 3 nguồn = NGHIÊM TRỌNG. Con số minh bạch, truy được về từng bằng chứng — không phải "cảm tính".

### H: AI (LLM) có tự kết luận "đây là trộm cắp" không?
**Đ:** Không. Kết luận + điểm nghiêm trọng do **rule engine tính** (có bằng chứng cụ thể). LLM **chỉ diễn đạt** dòng thời gian bằng chứng thành đoạn văn tiếng Việt dễ đọc cho người điều phối — và bị ràng buộc "chỉ dùng dữ liệu đưa vào, không suy diễn ngoài bằng chứng". Hệ thống dùng từ "**nghi ngờ** thất thoát", không khẳng định tội. Quyết định cuối là của con người sau khi xác minh.

### H: Mọi kết luận sự cố có bằng chứng không, hay đoán mò?
**Đ:** 100% có bằng chứng truy nguồn. Mỗi sự cố kèm **timeline** — từng sự kiện cảm biến góp phần, ghi rõ thời điểm và ý nghĩa. Ví dụ: "21:02 cửa kho mở → 21:03 khối lượng kệ giảm → 21:03 RFID ghi nhận vật tư qua cổng → không có phiếu xuất tương ứng". Người điều tra thấy đúng chuỗi sự việc, không phải một con số vô căn cứ.

### H: Sau khi phát hiện sự cố thì quy trình xử lý thế nào?
**Đ:** Có luồng xử lý 3 bước: **tiếp nhận** (acknowledge) → **phân công** (assign) → **giải quyết** (resolve). Mỗi bước ghi lại ai làm, lúc nào, ghi chú gì — vào nhật ký không xóa được. Trạng thái sự cố chuyển tuần tự, minh bạch cho việc theo dõi và tra soát sau.

### H: Sự cố này gắn với phần cứng thật thế nào khi triển khai?
**Đ:** Rule engine đọc **cùng một định dạng sự kiện** mà cảm biến thật (loadcell, cảm biến cửa, đầu đọc RFID) sẽ xuất ra. Hiện tại mô phỏng, nhưng khi cắm phần cứng thật vào, engine không đổi một dòng — vẫn hợp nhất sự kiện, vẫn phát hiện, vẫn dựng timeline như vậy. Đây là điểm nhất quán của kiến trúc.

# Q&A — Phase M (Normal Mode — AI quản trị kho ngày thường)

> "AI khi KHÔNG có thiên tai": dự báo cạn kho, cảnh báo hết hạn, đề xuất cân bằng tồn giữa kho, xu hướng xuất, cảnh báo thời tiết. Toàn bộ số do backend tính (rule/thống kê thuần), LLM chỉ diễn giải báo cáo.

---

### H: Hệ thống chỉ hữu ích lúc thiên tai à? Ngày thường nó làm gì?
**Đ:** Ngày thường mới là lúc AI chạy nhiều nhất — chuẩn bị để lúc thiên tai kho đã sẵn sàng. 5 việc: **dự báo cạn kho** (còn mấy ngày hết theo tốc độ xuất), **cảnh báo hết hạn** (lô nào sắp hết hạn trong 30 ngày), **đề xuất cân bằng tồn** (kho thừa chuyển sang kho thiếu cùng SKU), **xu hướng xuất** (mặt hàng nào đang tăng/giảm), **cảnh báo thời tiết** (mưa lớn 72h tới). Thiên tai chỉ là lúc "dùng vốn"; ngày thường là lúc "tích vốn".

### H: Dự báo cạn kho tính thế nào? Có phải AI đoán không?
**Đ:** Không đoán — thống kê thuần. Lấy **tổng xuất 30 ngày gần nhất chia 30** ra tốc độ trung bình mỗi ngày, rồi lấy tồn hiện tại chia tốc độ ra số ngày còn lại. Còn dưới 7 ngày → đánh dấu "sắp cạn". Mặt hàng chưa từng xuất trong kỳ → không suy được ngày cạn (không chia cho 0), không báo giả. Minh bạch, kiểm chứng được bằng tay.

### H: Tồn để dự báo/cân bằng có tính cả hàng đang cho đội cứu hộ mượn không?
**Đ:** Không — dùng **tồn khả dụng ngay** = tồn trong kho **trừ phần đang cho mượn** (giống đúng công thức Mission-to-Kit và Readiness). Hàng đang mượn ở ngoài, chưa lấy về được tức thời, nên không tính vào "còn dùng được mấy ngày" hay "kho thừa để chuyển". Nếu tính cả phần mượn, dự báo sẽ lạc quan sai và đề xuất chuyển hàng thực chất không có. (Riêng cảnh báo hết hạn vẫn tính cả lô đang mượn — vì lô vẫn hết hạn dù ở đâu.)

### H: Đề xuất "chuyển kho thừa sang kho thiếu" dựa trên gì? Có tự động chuyển không?
**Đ:** So tồn **cùng một mặt hàng** giữa các kho **cùng xã** (communeId). Kho nào tồn ≥2 lần trung bình cụm → đề xuất chuyển bớt phần dư sang kho đang thiếu nhất. Hệ thống chỉ **gợi ý**, con người quyết định và thực hiện điều chuyển — không tự động chuyển hàng vật lý. Chỉ đề xuất khi có ≥2 kho cùng mặt hàng đó (1 kho thì không có gì để cân bằng), và trung bình cụm > 0.

### H: Cảnh báo hết hạn khác gì điểm "thời hạn" trong Readiness Score?
**Đ:** Readiness Score cho **một con điểm tổng** về thời hạn của cả kho (để đánh giá sẵn sàng). Cảnh báo hết hạn ở đây là **danh sách cụ thể từng lô** sắp hết hạn trong 30 ngày, sắp lô gần hết hạn nhất lên đầu, kèm cả lô **đã** hết hạn (ngày âm) để xử lý ngay. Một cái để chấm điểm, một cái để hành động chi tiết — bổ trợ nhau.

### H: Cảnh báo thời tiết lấy dữ liệu đâu? Có tốn tiền API không?
**Đ:** Open-Meteo — dịch vụ thời tiết **miễn phí, không cần khóa API**. Theo toạ độ kho, lấy tổng lượng mưa 3 ngày tới; vượt 100mm/72h → cảnh báo (nguy cơ ngập/cô lập kho). Kho chưa ghim toạ độ hoặc mất mạng → **bỏ qua thời tiết, không báo lỗi** — cả cụm insights vẫn trả bình thường. Không phụ thuộc dịch vụ trả phí, chạy được ở xã.

### H: Báo cáo tháng có phải LLM tự bịa số không?
**Đ:** Không — giống nguyên tắc Action Plan: **backend tính hết số** (xu hướng xuất kỳ này so kỳ trước theo từng mặt hàng), LLM chỉ **diễn giải thành đoạn văn**. LLM không được đổi số. Nếu ai-service lỗi/mất mạng → **fallback template** đếm số mặt hàng tăng/giảm, báo cáo không bao giờ trắng màn hình. LLM là cây bút, không phải máy tính.

### H: Phần "AI" ở Normal Mode thực chất là thống kê, sao gọi là AI?
**Đ:** Thành thật: 4/5 việc (dự báo, hết hạn, cân bằng, xu hướng) là **thống kê/rule thuần** — và đó là lựa chọn đúng, vì quản lý kho cần con số **giải thích được và kiểm chứng được**, không phải hộp đen. LLM (AI ngôn ngữ) dùng đúng chỗ mạnh của nó: diễn giải báo cáo tháng thành văn dễ đọc. Cộng với anomaly thống kê (z-score) và cảnh báo dự đoán (ngoại suy trend) ở Incident Intelligence — đó là "AI ra quyết định dựa trên pattern dữ liệu", không chỉ ngưỡng cố định.

### H: Các hàm này có kiểm thử không?
**Đ:** Có — 4 hàm lõi (dự báo/hết hạn/cân bằng/xu hướng) tách khỏi database thành **hàm thuần**, có kiểm thử tự động: tính đúng tốc độ/ngày cạn, bỏ giao dịch ngoài cửa sổ thời gian, không chia cho 0, sắp xếp lô hết hạn, chặn đề xuất khi tồn đã cân bằng. 14 test riêng cho insights, nằm trong 128 test toàn backend đều pass.

### H: Endpoint dùng quyền gì? Có tạo quyền mới không?
**Đ:** Tái dùng quyền **READINESS_VIEW** (xem tình trạng kho) — cùng nhóm "xem sức khỏe kho", đọc-only, không tạo quyền mới để không phình hệ thống phân quyền. `GET /insights/warehouses/:id` cho toàn bộ insight; `GET /insights/warehouses/:id/monthly-report` cho báo cáo tháng.

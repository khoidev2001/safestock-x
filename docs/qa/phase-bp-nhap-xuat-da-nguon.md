# Q&A — Phase B-plus (nhập/xuất đa nguồn + mượn-trả)

> 4 tầng nhập/xuất (quét QR, xuất lô khẩn cấp, cảm biến tự động, kiểm kê tay), mượn-trả vật tư tái sử dụng. Kiểm soát bằng phân quyền + hậu kiểm.

---

### H: Lúc thiên tai khẩn cấp, nhân viên không kịp quét QR từng món thì làm sao?
**Đ:** Có **4 tầng nhập/xuất bổ trợ**, mỗi tầng bắt cái tầng trên sót:
1. **Quét QR** — thường ngày, chính xác từng món.
2. **Xuất lô 1 chạm** — khẩn cấp: bấm 1 lần xuất cả kệ / cả cơ số theo nhiệm vụ.
3. **Cảm biến tự động** — loadcell/RFID phát hiện vật tư rời kho, tự ghi nhận.
4. **Kiểm kê định kỳ + sửa tay** — nguồn sự thật cao nhất, đối chiếu ghi đè.

Lúc khẩn cấp dùng tầng 2 (xuất cả lô), sai sót được tầng 4 (kiểm kê) sửa sau. Không bắt quét từng món giữa dòng nước lũ.

### H: Xuất cả lô một lúc, lỡ một món không đủ tồn thì sao?
**Đ:** Toàn bộ chạy trong **một giao dịch database** — nếu bất kỳ món nào không đủ tồn, **hủy toàn bộ** (rollback), không xuất nửa vời. Đã kiểm thử: xuất 2 lô, một lô vượt tồn → cả hai đều không bị trừ. Đảm bảo dữ liệu nhất quán.

### H: Nhiều nhân viên cùng xuất một lô cùng lúc, có bị âm kho không?
**Đ:** Không. Dùng **cập nhật nguyên tử có điều kiện** — câu lệnh trừ tồn kèm kiểm tra "chỉ trừ nếu còn đủ" thực thi ngay trong database, database tự xếp hàng các yêu cầu. Đã kiểm thử khắc nghiệt: **20 yêu cầu xuất song song, tổng cầu 40 trong khi kho chỉ 30 → tồn cuối đúng 0, không bao giờ âm**. 15 yêu cầu thành công, 5 bị từ chối "không đủ tồn".

### H: Ai được sửa tay số lượng kho? Lỡ sửa khống thì sao?
**Đ:** Chỉ người có quyền (phụ trách kho/quản trị), và **bắt buộc nhập lý do** — thiếu lý do hệ thống từ chối ngay (đã kiểm thử: sửa không lý do → lỗi 400). Mọi lần sửa ghi nhật ký số trước/sau/người/lý do, không xóa được. Sửa khống để lại dấu vết, quản trị hậu kiểm phát hiện.

### H: Kiểm kê định kỳ hoạt động thế nào? Có ghi đè nhầm số đang cho mượn không?
**Đ:** Không — đây là điểm chúng em xử lý cẩn thận. Kiểm kê **chỉ đếm phần vật tư trong kho**, phần đang cho mượn (ở ngoài) được trừ ra khỏi con số kỳ vọng. Ví dụ: lô 25 áo phao, cho mượn 10 → kiểm kê đếm 15 trong kho là **đúng khớp**, không báo thiếu. Nếu tính cả phần mượn vào, hệ thống sẽ "làm mất" 10 chiếc đang cho mượn khỏi sổ — lỗi này chúng em đã tránh. Đã kiểm thử.

### H: Vật tư cho đội cứu hộ mượn được quản lý thế nào?
**Đ:** Vật tư **tái sử dụng** (áo phao, xuồng, đèn, bộ đàm) khi giao cho đội = **phiếu mượn**, không phải mất kho. Tổng kho không đổi, chỉ đánh dấu "đang lưu hành". Khi đội trả, ghi rõ **từng phần**: bao nhiêu còn tốt, bao nhiêu hỏng, bao nhiêu mất. Chỉ phần mất mới trừ khỏi tổng kho. Đã kiểm thử: mượn 20 áo phao (kho vẫn 96) → trả 15 tốt + 3 hỏng + 2 mất → kho còn 94, hàng trả đánh dấu "cần kiểm tra".

### H: Vật tư tiêu hao (nước, pin) cũng cho mượn à?
**Đ:** Không. Hệ thống phân biệt **tiêu hao** (nước, lương thực, pin — dùng là hết) vs **tái sử dụng** (áo phao, xuồng — dùng xong trả lại). Vật tư tiêu hao xuất là mất luôn, không tạo phiếu mượn. Đã kiểm thử: thử mượn nước → hệ thống chặn "vật tư tiêu hao không mượn được, dùng xuất kho".

### H: Sao không bắt duyệt 2 bước cho xuất lô lớn để chống gian lận?
**Đ:** Kho cấp xã thường chỉ 1 người phụ trách — không có "người thứ 2" để duyệt, và khẩn cấp cần nhanh (duyệt trước làm chậm cứu hộ). Chúng em dùng **hậu kiểm**: phân quyền chặt + nhật ký lý do bắt buộc + quản trị tra soát sau. Phù hợp quy mô xã. Duyệt 2 bước là hướng phát triển cho kho tỉnh nhiều tầng. (Chi tiết ở Q&A phân quyền.)

### H: Mỗi giao dịch có ghi nguồn không? Để làm gì?
**Đ:** Có — mỗi giao dịch đánh dấu nguồn (quét tay, xuất lô, cảm biến loadcell, RFID, sửa tay). Khi các nguồn khác nhau cho số liệu lệch nhau, độ lệch đó **hạ điểm "độ tin cậy dữ liệu"** trong Readiness Score — hệ thống tự biết dữ liệu chỗ nào đáng ngờ. Đây là cách biến "nhiều nguồn không hoàn hảo" thành tín hiệu chất lượng.

// Khung ảnh thực tế dùng trong slide: tên slot -> kích thước khung (inch) + nhãn khung chờ.
// Thêm ảnh: đặt file <slot>.jpg (hoặc .png) vào thư mục anh/ rồi chạy `node prep-anh.js`.
// position: vùng ưu tiên giữ lại khi cắt ('attention' = vùng nhiều chi tiết nhất).
module.exports = {
  'boi-canh': { w: 5.3, h: 2.9, label: 'ẢNH NGẬP LỤT TẠI ĐỊA PHƯƠNG' },
  'hien-truong-1': { w: 3.72, h: 2.7, label: 'ẢNH HIỆN TRƯỜNG 1' },
  'hien-truong-2': { w: 3.72, h: 2.7, label: 'ẢNH HIỆN TRƯỜNG 2' },
  'hien-truong-3': { w: 3.72, h: 2.7, label: 'ẢNH HIỆN TRƯỜNG 3' },
  // văn bản A4 dọc: khung để đúng tỷ lệ dọc và cắt từ mép trên để không mất phần đầu thư
  // extract: cắt bỏ lề trắng của bản scan (vùng chữ + lề 50px) trước khi đưa về khung, để chữ trong thư to hơn
  'thu-quan-tam': { w: 3.29, h: 4.38, label: 'ẢNH CHỤP THƯ QUAN TÂM', position: 'top', extract: { left: 194, top: 142, width: 1331, height: 1774 } },
  // slide 9: hai ảnh chụp màn hình thật giữ NGUYÊN VẸN (không cắt), cao hết vùng thân slide (5.04in), nối bằng mũi tên:
  // form AI tham mưu kèm ghi âm người báo (722×970) → phân tích tình huống và tham mưu điều phối (1435×1143); dpi = độ phân giải gốc
  'ai-tham-muu': { w: 3.751, h: 5.04, label: 'ẢNH MÀN HÌNH AI THAM MƯU', position: 'top', dpi: 192 },
  'phan-tich-tinh-huong': { w: 6.328, h: 5.04, label: 'ẢNH PHÂN TÍCH TÌNH HUỐNG', position: 'top', dpi: 227 },
  // ảnh chụp màn hình 1797×972 cho slide 11 (thứ tự lấy hàng + bản đồ tuyến): bỏ dòng tiêu đề khung "Điều phối kho…"
  // ở trên và lề hai bên (extract 1762×885); khung cao hết cỡ chỉ chừa một dòng ghi chú bên dưới
  'chon-kho': { w: 9.248, h: 4.645, label: 'ẢNH MÀN HÌNH THỨ TỰ LẤY HÀNG', position: 'top', dpi: 191, extract: { left: 18, top: 72, width: 1762, height: 885 } },
  // slide 13 (không card): ba ảnh điện thoại cao bằng nhau 4.452in, nằm trong hai khung màu theo vai trò.
  // Bộ phận kho (gốc 438×885, nhiệm vụ 856): bỏ phần "Quay lại / Chi tiết nhiệm vụ", giữ hai dòng vật tư đầu.
  // Đội cứu hộ: bản đồ điểm gặp nạn (gốc 440×618, bỏ nút "Thu gọn bản đồ") và danh sách kho kèm trạng thái
  // (gốc 438×817, 8 kho; bỏ dòng tiêu đề và mô tả phía trên). Cả ba bỏ lề trắng hai bên; dpi = độ phân giải gốc
  'kho-chuan-bi': { w: 3.184, h: 4.452, label: 'ẢNH KHO CHUẨN BỊ VẬT TƯ', position: 'top', dpi: 133, extract: { left: 8, top: 66, width: 422, height: 590 } },
  'doi-cuu-ho-ban-do': { src: 'doi-cuu-ho', w: 3.341, h: 4.452, label: 'ẢNH BẢN ĐỒ ĐỘI CỨU HỘ', position: 'top', dpi: 127, extract: { left: 8, top: 0, width: 424, height: 565 } },
  'doi-cuu-ho-kho': { w: 2.528, h: 4.452, label: 'ẢNH TRẠNG THÁI TỪNG KHO', position: 'top', dpi: 165, extract: { left: 10, top: 78, width: 418, height: 736 } },
  // ảnh chụp màn hình trợ lý AI cho slide 23, đã cắt còn 758×530 (bỏ nền trống và ô nhập): khung giữ đúng tỷ lệ gốc
  'tro-ly-ai': { w: 4.577, h: 3.2, label: 'ẢNH MÀN HÌNH TRỢ LÝ AI', position: 'top', dpi: 166 },
  // ảnh cán bộ kiểm đếm vật tư bằng sổ tay cho slide 5, gốc 888×666: cắt từ mép trên để giữ gương mặt và cuốn sổ
  'kho-khan': { w: 4.45, h: 2.6, label: 'ẢNH KIỂM ĐẾM VẬT TƯ THỦ CÔNG', position: 'top', dpi: 199, format: 'jpg' },
};

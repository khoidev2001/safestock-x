// Khung ảnh thực tế dùng trong slide: tên slot -> kích thước khung (inch) + nhãn khung chờ.
// Thêm ảnh: đặt file <slot>.jpg (hoặc .png) vào thư mục anh/ rồi chạy `node prep-anh.js`.
// position: vùng ưu tiên giữ lại khi cắt ('attention' = vùng nhiều chi tiết nhất).
module.exports = {
  'boi-canh': { w: 5.3, h: 2.9, label: 'ẢNH NGẬP LỤT TẠI ĐỊA PHƯƠNG' },
  'hien-truong-1': { w: 3.72, h: 2.7, label: 'ẢNH HIỆN TRƯỜNG 1' },
  'hien-truong-2': { w: 3.72, h: 2.7, label: 'ẢNH HIỆN TRƯỜNG 2' },
  'hien-truong-3': { w: 3.72, h: 2.7, label: 'ẢNH HIỆN TRƯỜNG 3' },
  // văn bản A4 dọc: khung để đúng tỷ lệ dọc và cắt từ mép trên để không mất phần đầu thư
  'thu-quan-tam': { w: 3.2, h: 4.05, label: 'ẢNH CHỤP THƯ QUAN TÂM', position: 'top' },
};

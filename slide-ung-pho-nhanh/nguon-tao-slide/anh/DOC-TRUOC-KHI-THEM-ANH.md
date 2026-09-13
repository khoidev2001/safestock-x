# Thêm ảnh thực tế vào slide

Đặt ảnh vào chính thư mục này, **đặt tên đúng như bảng dưới** (`.jpg`, `.png`,
`.jpeg` hoặc `.webp` đều được), rồi chạy:

```bash
node prep-anh.js      # cắt ảnh về đúng tỷ lệ khung, ghi vào anh/da-cat/
node render-pptx.js && node render-pdf.js && node render-svg.js
```

Chưa có ảnh nào thì slide vẫn dựng được — chỗ đó hiện khung chờ có ghi tên file cần thả vào.

| Tên file | Dùng ở slide | Ảnh cần dùng | Nguồn |
|---|---|---|---|
| `boi-canh.jpg` | 02 — Bối cảnh | Cứu hộ chở người dân trên xuồng giữa vùng ngập | Báo Dân Trí |
| `kho-khan.png` | 05 — Vấn đề | Cán bộ kiểm đếm vật tư phòng chống thiên tai bằng sổ ghi chép tay | — |
| `hien-truong-1.jpg` | 04 — Hiện trường | Người mặc áo phao đứng trên mái nhà, nước ngập gần tới mái | — |
| `hien-truong-2.jpg` | 04 — Hiện trường | Mặt đường bị nước xé toạc, giao thông bị chia cắt | Báo Thanh Niên |
| `hien-truong-3.jpg` | 04 — Hiện trường | Trao vật tư cứu trợ từ xuồng cho người dân đứng dưới nước | Báo Thanh Niên |
| `ai-tham-muu.png` | 09 — AI tham mưu | Chụp màn hình form “Quy mô ảnh hưởng” sau khi AI đã phân tích lời kể | Chụp màn hình hệ thống |
| `phan-tich-tinh-huong.png` | 09 — AI tham mưu (ảnh 2/3) | Chụp màn hình “Phân tích tình huống và tham mưu điều phối” (script tự cắt bỏ cột Sửa/Xoá và dòng phân trang) | Chụp màn hình hệ thống |
| `dieu-phoi-noi-xa.png` | 09 — AI tham mưu (ảnh 3/3) | Chụp màn hình “Điều phối nội xã” và “Mượn vật tư liên xã” | Chụp màn hình hệ thống |
| `chon-kho.png` | 11 — Chọn kho tiếp tế | Chụp màn hình “Điều phối kho”: thứ tự lấy hàng (gần đến xa) và bản đồ tuyến đường | Chụp màn hình hệ thống |
| `tro-ly-ai.png` | 23 — Trợ lý AI | Chụp màn hình khung chat trợ lý ảo (đã cắt bỏ nền trống và ô nhập) | Chụp màn hình hệ thống |
| `doi-cuu-ho.png` | 13 — Xác nhận & thông báo | Chụp màn hình điện thoại đội cứu hộ: bản đồ điểm gặp nạn + danh sách kho (script tách đôi) | Chụp màn hình hệ thống |
| `kho-chuan-bi.png` | 13 — Xác nhận & thông báo | Chụp màn hình điện thoại bộ phận kho: chuẩn bị theo vật tư | Chụp màn hình hệ thống |
| `thu-quan-tam.jpg` | 24 — Thư quan tâm | Ảnh chụp lá thư của Hội Chữ thập đỏ xã Đồng Xuân | Nhóm tự chụp |

Script tự xoay ảnh theo hướng chụp của điện thoại và tự cắt vào vùng có nội dung
chính, nên ảnh gốc cỡ nào cũng được — chỉ cần đủ nét (cạnh dài từ 1600 px trở lên).

## Ghi nguồn

Ảnh báo chí đang dùng được ghi nguồn ở hai chỗ trong slide:

- **Slide 2** — ngay trong dải chú thích dưới ảnh: *"Ảnh: Báo Dân Trí."*
- **Slide 4** — dòng nguồn chung dưới ba ảnh: *"Nguồn ảnh: Báo Thanh Niên, Báo Dân Trí."*

Đổi nguồn thì sửa chú thích ở tham số thứ tư của `photo(...)` trong `slides.js`.
Ảnh nhóm tự chụp được thì nên thay vào, vừa chắc về bản quyền vừa thuyết phục hơn
khi nói "đây là hiện trường quê em".

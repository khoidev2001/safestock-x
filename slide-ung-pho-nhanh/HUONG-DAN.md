# Slide thuyết trình — Ứng Phó Nhanh

26 slide, tỷ lệ 16:9 (13.333 × 7.5 inch), nền lấy từ ảnh brand của hệ thống,
chữ dùng font **Be Vietnam Pro** giống trang web ungphonhanh.life.

## File trong thư mục

| File | Dùng để làm gì |
|---|---|
| `Ung-Pho-Nhanh-Slide.pptx` | Bản PowerPoint — **mọi chữ đều sửa được** (text box thật, không phải ảnh) |
| `Ung-Pho-Nhanh-Slide.pdf` | Bản PDF để trình chiếu / gửi Ban Giám khảo (chữ vector, sắc nét khi phóng to) |
| `fonts/` | 5 file font Be Vietnam Pro (Regular → ExtraBold) |
| `xem-truoc-26-slide.jpg` | Ảnh xem trước toàn bộ 26 slide |

## Trước khi mở file .pptx — cài font

Máy chưa có Be Vietnam Pro thì PowerPoint sẽ thay bằng font khác và chữ sẽ lệch.

- **Windows**: mở thư mục `fonts/`, chọn cả 5 file `.ttf` → chuột phải → *Install for all users*.
- **macOS**: chọn cả 5 file → mở bằng Font Book → *Install Font*.

Mở lại PowerPoint sau khi cài.

## Nội dung 26 slide

**Phần 1 — Trình (slide 1–16)**

| # | Nội dung |
|---|---|
| 1 | Trang bìa |
| 2 | Bối cảnh — **có khung ảnh thực tế** bên trái |
| 3 | Thiệt hại đợt mưa lũ tháng 11/2025 (19 người chết · 85.700+ lượt nhà ngập · 9.730 tỷ đồng) |
| 4 | Hiện trường qua ảnh — **3 khung ảnh thực tế** |
| 5 | Vấn đề — bài toán trong những giờ khẩn cấp |
| 6 | Giải pháp — bốn mắt xích, người điều phối rẽ đôi tới kho và đội cứu hộ |
| 7 | Quy trình: tổng quan 6 bước |
| 8 | Quy trình: nhấn bước 1 + 2 |
| 9 | Đi sâu bước 2 — AI lập bản tham mưu |
| 10 | Quy trình: nhấn bước 3 |
| 11 | Đi sâu bước 3 — chọn kho tiếp tế |
| 12 | Quy trình: nhấn bước 4 |
| 13 | Đi sâu bước 4 — kho và đội cứu hộ nhận cùng lúc |
| 14 | Quy trình: nhấn bước 5 |
| 15 | Quy trình: nhấn bước 6 (khép vòng) |
| 16 | Dữ liệu & dự báo sau thiên tai |

**Phần 2 — Khôi (slide 17–24)** — bám theo `docs/SLIDE-OUTLINE-KHOI.md`

| # | Nội dung | Slide trong outline |
|---|---|---|
| 17 | Mở đầu phần kho — vì sao số liệu kho phải đúng, giới thiệu 6 phần sau | — |
| 18 | Quản lý kho tập trung — 1 kho tổng + 17 kho thôn, hai chiều trạng thái | 1 |
| 19 | Chỉ số sẵn sàng — 95/100 → khói → không điều phối được | 2 |
| 20 | Tồn kho toàn xã — kho tổng gần hết vs Long Châu hơn 1.600 bộ | 3 |
| 21 | IoT — 9 thiết bị · 9 sự cố, hai quy tắc, 3 mốc thời gian, ví dụ 2h sáng | 4 |
| 22 | Nói thẳng về phần cứng — bản sao số | 5 |
| 23 | Trợ lý AI — không được bịa số | 6 |
| 24 | Thư quan tâm Hội Chữ thập đỏ xã Đồng Xuân — **có khung ảnh thực tế** | 7 |

Theo ghi chú trong outline: **không làm slide riêng cho dự báo 72 giờ / bản tin đầu ngày** —
nói chèn ở slide 20 nếu dư thời gian.

**Phần kết (slide 25–26):** giá trị mang lại · cảm ơn và chuyển sang demo (mục 9).

### Ảnh thực tế — slide 2, 4 và 24

Bốn ảnh hiện trường đợt mưa lũ tháng 11/2025 và ảnh chụp thư quan tâm **đã được ghép sẵn**
vào slide. Ảnh gốc nằm ở `nguon-tao-slide/anh/`, bản đã cắt vừa khung ở `anh/da-cat/`.

| Slide | Ảnh | Nguồn |
|---|---|---|
| 2 | Toàn cảnh khu dân cư chìm trong nước lũ | Báo Dân Trí |
| 4 | Người dân trèo lên nóc nhà chờ cứu hộ | — |
| 4 | Cứu hộ đưa người già và trẻ nhỏ ra khỏi vùng ngập | — |
| 4 | Trao vật tư cứu trợ tới từng nhà bằng xuồng | Báo Thanh Niên |
| 24 | Thư quan tâm Hội Chữ thập đỏ xã Đồng Xuân | Nhóm tự chụp |

Nguồn ảnh báo chí được ghi ở dòng dưới ba ảnh slide 4:
*"Nguồn ảnh: Báo Thanh Niên, Báo Dân Trí — đợt mưa lũ tháng 11/2025."*

Đổi ảnh khác: thay file trong `nguon-tao-slide/anh/` (giữ nguyên tên), chạy `node prep-anh.js`
rồi render lại. Chi tiết ở `nguon-tao-slide/anh/DOC-TRUOC-KHI-THEM-ANH.md`.

Các slide quy trình (7, 8, 10, 12, 14, 15) dùng chung một sơ đồ 6 bước xếp 2 hàng × 3 cột
theo kiểu rắn bò, nên bước 4 nằm ngay dưới bước 3:

```
1  →  2  →  3
            ↓
6  ←  5  ←  4
```

Slide 7 hiện cả 6 bước ở trạng thái bình thường để giới thiệu sơ bộ.
Từ slide 8 trở đi, bước đang nói **sáng, viền xanh và có quầng sáng**, các bước còn lại mờ đi.

Mỗi slide đã kèm sẵn **ghi chú thuyết trình** (Notes) tóm tắt ý cần nói:
trong PowerPoint bấm *View → Notes Page*, hoặc dùng *Presenter View* khi trình chiếu.

## Hiệu ứng khi trình chiếu

Bộ slide có sẵn hai lớp hiệu ứng, đều đã nằm trong file `.pptx`:

**1. Chuyển slide** — Fade, tốc độ vừa, áp dụng cho cả 26 slide.

**2. Chữ hiện dần trong từng slide** — nội dung được gom thành từng khối (mỗi thẻ, mỗi ô
số liệu, mỗi bước quy trình là một khối) rồi mờ dần hiện ra lần lượt theo thứ tự đọc.

- Khung cố định **hiện sẵn ngay**: nền, logo, số trang, vạch kẻ, chân trang.
- Nhãn mục và tiêu đề hiện trước, rồi tới từng khối nội dung.
- Toàn bộ tự chạy khi vào slide, xong trong khoảng **2,4 giây** — người nói **không phải
  bấm thêm lần nào**, chỉ bấm để sang slide kế tiếp. Nhịp nói không bị hiệu ứng cầm chân.

Ví dụ slide 3: nhãn *"ĐỢT MƯA LŨ THÁNG 11/2025"* → tiêu đề → ô `19` → ô `85.700+` →
ô `12.800+` → ô `40` → dải `9.730 tỷ`.

Chỉnh nhịp nhanh/chậm: sửa `DUR`, `MAX_BUILD`, `MAX_STEP` ở đầu `nguon-tao-slide/hieu-ung-chu.js`
rồi chạy lại. Muốn bỏ hết hiệu ứng: chạy lại `node render-pptx.js` và không chạy hai script kia.

> Hiệu ứng chỉ có trong bản `.pptx`. Bản `.pdf` là ảnh tĩnh nên không có — khi thi nên
> trình chiếu bằng `.pptx`, giữ `.pdf` làm bản dự phòng.

## Mẹo khi chỉnh sửa

- Chữ trong slide xuống dòng sẵn theo đúng bố cục. Khi sửa nội dung dài hơn,
  tự xuống dòng bằng `Shift + Enter` để giữ khoảng cách dòng cho đều.
- Màu đang dùng: xanh lá `#22C55E`, xanh dương `#38BDF8`, vàng `#FBBF24`,
  cam `#FB923C`, nền xanh đậm `#04101F`.
- Sửa xong muốn xuất lại PDF: *File → Export → Create PDF/XPS*.

## Tạo lại slide bằng script

Thư mục `nguon-tao-slide/` chứa toàn bộ mã tạo slide (Node.js).
Sửa nội dung trong `slides.js` rồi chạy:

```bash
cd nguon-tao-slide
npm i pptxgenjs pdfkit sharp
node prep-anh.js      # (tuỳ chọn) cắt ảnh thực tế trong anh/ cho vừa khung
node render-pptx.js   # xuất .pptx
node them-hieu-ung.js # hiệu ứng chuyển slide
node hieu-ung-chu.js  # hiệu ứng chữ hiện dần trong từng slide
node render-pdf.js    # xuất .pdf
node render-svg.js    # xuất ảnh xem trước vào preview/
```

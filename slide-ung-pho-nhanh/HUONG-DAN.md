# Slide thuyết trình — Ứng Phó Nhanh

24 slide, tỷ lệ 16:9 (13.333 × 7.5 inch), nền lấy từ ảnh brand của hệ thống,
chữ dùng font **Be Vietnam Pro** giống trang web ungphonhanh.life.

## File trong thư mục

| File | Dùng để làm gì |
|---|---|
| `Ung-Pho-Nhanh-Slide.pptx` | Bản PowerPoint — **mọi chữ đều sửa được** (text box thật, không phải ảnh) |
| `Ung-Pho-Nhanh-Slide.pdf` | Bản PDF để trình chiếu / gửi Ban Giám khảo (chữ vector, sắc nét khi phóng to) |
| `fonts/` | 5 file font Be Vietnam Pro (Regular → ExtraBold) |
| `xem-truoc-24-slide.jpg` | Ảnh xem trước toàn bộ 24 slide |

## Trước khi mở file .pptx — cài font

Máy chưa có Be Vietnam Pro thì PowerPoint sẽ thay bằng font khác và chữ sẽ lệch.

- **Windows**: mở thư mục `fonts/`, chọn cả 5 file `.ttf` → chuột phải → *Install for all users*.
- **macOS**: chọn cả 5 file → mở bằng Font Book → *Install Font*.

Mở lại PowerPoint sau khi cài.

## Nội dung 24 slide

**Phần 1 — Trình (slide 1–14)**

| # | Nội dung |
|---|---|
| 1 | Trang bìa |
| 2 | Bối cảnh |
| 3 | Vấn đề — bài toán trong những giờ khẩn cấp |
| 4 | Giải pháp — bốn mắt xích, người điều phối rẽ đôi tới kho và đội cứu hộ |
| 5 | Quy trình: tổng quan 6 bước |
| 6 | Quy trình: nhấn bước 1 + 2 |
| 7 | Đi sâu bước 2 — AI lập bản tham mưu |
| 8 | Quy trình: nhấn bước 3 |
| 9 | Đi sâu bước 3 — chọn kho tiếp tế |
| 10 | Quy trình: nhấn bước 4 |
| 11 | Đi sâu bước 4 — kho và đội cứu hộ nhận cùng lúc |
| 12 | Quy trình: nhấn bước 5 |
| 13 | Quy trình: nhấn bước 6 (khép vòng) |
| 14 | Dữ liệu & dự báo sau thiên tai |

**Phần 2 — Khôi (slide 15–22)**

| # | Nội dung | Mục trong script |
|---|---|---|
| 15 | Kho tập trung toàn xã: 1 kho tổng + 17 kho thôn, ví dụ kho thôn Long Châu | 1 và 3 |
| 16 | "Còn bao nhiêu" chưa phải câu hỏi đúng — hai chiều trạng thái | 1 |
| 17 | Chỉ số sẵn sàng: 95/100 → nguy cơ cháy → không điều phối được | 2 |
| 18 | IoT: 9 thiết bị, 9 sự cố, hai quy tắc, hàng chờ ba mốc thời gian | 4 |
| 19 | Nói thẳng về phần cứng — bản sao số của kho | 5 |
| 20 | Trợ lý AI — không được bịa số | 6 |
| 21 | Biết trước thay vì biết sau — bản tin đầu ngày 12/9 | 7 |
| 22 | Thư quan tâm Hội Chữ thập đỏ xã Đồng Xuân | 8 |

**Phần kết (slide 23–24):** giá trị mang lại · cảm ơn và chuyển sang demo (mục 9).

> **Slide 22 có một khung trống chờ ảnh** — mở PowerPoint, bấm vào khung bên trái,
> chèn ảnh chụp lá thư quan tâm rồi xoá hai dòng chữ hướng dẫn trong khung.

Các slide quy trình (5, 6, 8, 10, 12, 13) dùng chung một sơ đồ 6 bước xếp 2 hàng × 3 cột
theo kiểu rắn bò, nên bước 4 nằm ngay dưới bước 3:

```
1  →  2  →  3
            ↓
6  ←  5  ←  4
```

Slide 5 hiện cả 6 bước ở trạng thái bình thường để giới thiệu sơ bộ.
Từ slide 6 trở đi, bước đang nói **sáng, viền xanh và có quầng sáng**, các bước còn lại mờ đi.

Mỗi slide đã kèm sẵn **ghi chú thuyết trình** (Notes) tóm tắt ý cần nói:
trong PowerPoint bấm *View → Notes Page*, hoặc dùng *Presenter View* khi trình chiếu.

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
node render-pptx.js   # xuất .pptx
node render-pdf.js    # xuất .pdf
node render-svg.js    # xuất ảnh xem trước vào preview/
```

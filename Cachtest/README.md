# Cách test — mục lục

Mỗi luồng nghiệp vụ một file. Đọc file nào cũng được, không cần theo thứ tự — trừ
[00-chuan-bi-moi-truong.md](00-chuan-bi-moi-truong.md) phải làm trước tiên.

Mỗi file viết theo cùng một khuôn:

- **Ai làm, ở đâu** — vai trò và ứng dụng
- **Các bước** — bấm gì, gõ gì
- **Kỳ vọng** — phải thấy gì, và **vì sao** hệ thống phải xử sự như vậy
- **Case biên** — thử phá xem hệ thống có chặn không
- **Cách kiểm chứng bằng lệnh** — cho ai muốn xem tận đáy

## Nền tảng

| File | Nội dung |
|---|---|
| [00-chuan-bi-moi-truong.md](00-chuan-bi-moi-truong.md) | Dựng hạ tầng, seed dữ liệu, chạy ba ứng dụng |
| [01-dang-nhap-va-phan-quyen.md](01-dang-nhap-va-phan-quyen.md) | Ba vai, ai thấy gì ở đâu, chốt chặn phân quyền |

## Điều phối cứu hộ

| File | Nội dung |
|---|---|
| [02-bao-cao-tinh-huong.md](02-bao-cao-tinh-huong.md) | Báo tình huống bằng gõ tay hoặc giọng nói |
| [03-lap-va-phat-hanh-phuong-an.md](03-lap-va-phat-hanh-phuong-an.md) | AI đề xuất vật tư, xã duyệt và phát hành |
| [04-kho-chuan-bi-theo-tung-vat-tu.md](04-kho-chuan-bi-theo-tung-vat-tu.md) | Tiếp nhận, chuẩn bị, báo thiếu — theo từng mã |
| [05-giao-hang-va-dong-nhiem-vu.md](05-giao-hang-va-dong-nhiem-vu.md) | Báo kết quả giao, hoàn kho khi thất bại |

## Nghiệp vụ kho

| File | Nội dung |
|---|---|
| [06-quet-qr-va-nghiep-vu-kho.md](06-quet-qr-va-nghiep-vu-kho.md) | In nhãn QR, quét để tra lô, nhập/xuất/chuyển |
| [07-muon-tra-vat-tu.md](07-muon-tra-vat-tu.md) | Cho mượn, hoàn trả tốt/hỏng/mất |
| [08-kiem-ke-thang.md](08-kiem-ke-thang.md) | Lập phiếu, đếm theo lô, xã duyệt |

## Cảm biến và cảnh báo

| File | Nội dung |
|---|---|
| [09-cam-bien-mo-phong-va-chuong.md](09-cam-bien-mo-phong-va-chuong.md) | Desktop kéo ngưỡng, chuông kêu, tắt chuông |
| [10-cam-bien-that-qua-gateway.md](10-cam-bien-that-qua-gateway.md) | Cấp khoá thiết bị, gửi số liệu, các chốt an toàn |
| [11-mat-tin-hieu-thiet-bi.md](11-mat-tin-hieu-thiet-bi.md) | Im lặng quá lâu cũng là sự cố |
| [12-xu-ly-su-co.md](12-xu-ly-su-co.md) | Tiếp nhận, phân công, xử lý xong |

## Trí tuệ nhân tạo

| File | Nội dung |
|---|---|
| [13-tro-ly-ai-va-ban-tin.md](13-tro-ly-ai-va-ban-tin.md) | Bóc tách mô tả, hỏi đáp kho, bản tin trong ngày |

## Hoạt động khi mất mạng

| File | Nội dung |
|---|---|
| [14-che-do-ngoai-tuyen.md](14-che-do-ngoai-tuyen.md) | Điện thoại giữ bản lưu, desktop giữ hàng chờ |
| [15-mot-ten-mien-hai-duong-di.md](15-mot-ten-mien-hai-duong-di.md) | Cùng địa chỉ chạy qua Internet lẫn mạng nội bộ |

## Kiểm thử tự động

| File | Nội dung |
|---|---|
| [16-bo-kiem-thu-tu-dong.md](16-bo-kiem-thu-tu-dong.md) | Lệnh chạy, con số kỳ vọng, cái bẫy thường gặp |

---

## Ba điều nên biết trước khi test bất cứ thứ gì

**Một nhiệm vụ thường cần hai tài khoản kho.** Hệ thống phân bổ vật tư theo kho gần
điểm sự cố, nên hay trải trên cả kho trung tâm lẫn kho thôn. Chỉ đăng nhập một tài
khoản thì nhiệm vụ đứng ở *Chờ kho chuẩn bị* và không đi tiếp được.

**Lần gọi trí tuệ nhân tạo đầu tiên có thể lỗi.** Mô hình chạy ngay trên máy, lần
nạp đầu vượt quá thời gian chờ nên trả lỗi hoặc rơi về bản mẫu. Hỏi một câu bất kỳ
trước khi trình diễn để làm nóng.

**Đăng xuất trên điện thoại xoá sạch bản lưu ngoại tuyến.** Nếu định trình diễn chế
độ mất mạng, đừng đăng xuất trước đó.

Tài khoản: [../docs/TAI-KHOAN-DEMO.md](../docs/TAI-KHOAN-DEMO.md)

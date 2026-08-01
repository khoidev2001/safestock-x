# 11 · Mất tín hiệu thiết bị

## Vấn đề mà luồng này giải quyết

Cảm biến hỏng, hết pin hoặc đứt dây thì **không gửi gì cả**. Nếu hệ thống chỉ phản
ứng với dữ liệu nhận được, sự im lặng sẽ bị hiểu nhầm thành *"mọi thứ bình thường"* —
đúng vào lúc kho không còn được giám sát.

Mọi quy tắc khác chạy khi **có** số liệu đi vào. Riêng mất tín hiệu thì ngược lại:
không có gì đi vào cả, nên phải có người chủ động hỏi *"đã bao lâu rồi không nghe
thấy gì?"*.

## Bước 1 — Bật giám sát cho một thiết bị

```bash
pnpm --filter @safestock/backend device:monitor -- \
  --warehouse <mã kho> --device temp_B --interval 10
```

Nghĩa là: thiết bị `temp_B` được kỳ vọng báo mỗi 10 giây.

**Kỳ vọng:** in ra *"Đã bật giám sát im lặng cho temp_B: báo sự cố nếu không có số
liệu quá ~30s"*.

## Bước 2 — Không làm gì cả

Đúng nghĩa đen. Không gửi số liệu cho thiết bị đó.

**Kỳ vọng:** sau khoảng một phút, sự cố **Mất tín hiệu thiết bị temp_B** tự xuất
hiện trên web ở mục **Sự cố**, không cần ai bấm gì.

Đã kiểm chứng thật: sự cố sinh ra với mức **cao**, độ tin cậy 0.95.

## Bước 3 — Tắt giám sát sau khi thử

```bash
pnpm --filter @safestock/backend device:monitor -- \
  --warehouse <mã kho> --device temp_B --interval off
```

Quên tắt thì sự cố sẽ tiếp tục sinh ra và làm nhiễu buổi trình diễn.

## Quy tắc phát hiện

| Tình huống | Kết quả |
|---|---|
| Trễ **dưới 3 chu kỳ** | chưa báo — một lần trễ là bình thường (mạng chậm, thiết bị bận) |
| Im lặng **từ 3 chu kỳ** | sự cố mức **trung bình** |
| Im lặng **từ 10 chu kỳ** | sự cố mức **cao** — không còn là trục trặc thoáng qua |
| Thiết bị **chưa từng gửi** lần nào | sự cố mức **cao** ngay |
| Thiết bị **không khai chu kỳ** | không giám sát, không báo gì |

Chỗ áp chót đáng chú ý: thiết bị đã khai báo nhưng chưa bao giờ lên tiếng là trường
hợp **lắp đặt hỏng**, không phải "đang chờ số liệu đầu tiên".

## Vì sao mặc định không giám sát thiết bị nào

Thiết bị mô phỏng do người kéo tay **không có nhịp báo cố định**. Bật giám sát sẵn
cho chúng sẽ đẻ ra cảnh báo giả mỗi lúc không ai ngồi trước máy.

Nên chỉ bật cho thiết bị thực sự báo theo chu kỳ.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Đặt chu kỳ bằng 0 hoặc số âm | bị từ chối |
| Bật giám sát cho thiết bị không tồn tại | báo lỗi rõ ràng |
| Thiết bị im lặng lâu | **chỉ sinh một** sự cố, không đẻ liên tục mỗi phút |
| Thiết bị báo lại sau khi đã có sự cố | sự cố cũ vẫn mở cho tới khi người xử lý |

Chỗ áp chót nhờ cơ chế chặn trùng: sự cố cùng loại trên cùng thiết bị mà đang mở thì
không tạo thêm.

## Đồng hồ canh chạy ở đâu

Chạy **ngay trong tiến trình máy chủ**, không qua hàng đợi ngoài.

**Vì sao:** kho mất Internet vẫn phải được canh, và cảnh báo an toàn không nên phụ
thuộc thêm một dịch vụ nữa có thể chết. Chạy nhiều bản sao cũng không sinh cảnh báo
trùng nhờ cơ chế chặn trùng ở trên.

Chu kỳ quét mặc định 60 giây, chỉnh bằng biến `INCIDENT_WATCHDOG_INTERVAL_SECONDS`.
Đặt đúng giá trị `0` mới tắt hẳn; gõ sai giá trị thì hệ thống **từ chối khởi động**
thay vì âm thầm bỏ canh cảm biến.

Thử: đặt biến đó thành `sáu mươi` rồi khởi động máy chủ → phải báo lỗi cấu hình.

---

Tiếp theo: [12 · Xử lý sự cố](12-xu-ly-su-co.md)

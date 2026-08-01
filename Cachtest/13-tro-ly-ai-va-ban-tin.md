# 13 · Trợ lý AI và bản tin trong ngày

Toàn bộ phần AI chạy **ngay tại máy trong hội trường** bằng mô hình `qwen3.5:4b` qua
Ollama. Không gọi ra Internet, không gửi dữ liệu kho đi đâu.

## Cảnh báo quan trọng nhất trước khi trình diễn

**Lần gọi AI đầu tiên sau khi khởi động sẽ chậm và có thể thất bại.** Mô hình phải
nạp vào bộ nhớ, mất khoảng 15–30 giây, trong khi hạn chờ chỉ 15 giây.

Đã đo thật:
- Lần đầu: hết giờ, trả về bản mẫu dựng sẵn.
- Sau khi mô hình đã nóng: khoảng **6 giây**, trả về đúng nội dung do AI sinh.

**Bắt buộc làm trước khi lên trình bày:**

```bash
curl -s http://localhost:8000/health
curl -s -X POST http://localhost:8000/parse \
  -H 'Content-Type: application/json' \
  -d '{"text":"Ngập tại thôn A, 20 hộ bị ảnh hưởng"}'
```

Chạy hai lệnh trên **trước giờ diễn ít nhất 5 phút**. Bỏ qua bước này là rủi ro trình
diễn lớn nhất của cả hệ thống.

## Test 1 — Bóc tách mô tả thành dữ liệu có cấu trúc

Đây là bước AI dùng trong [02 · Báo cáo tình huống](02-bao-cao-tinh-huong.md).

```bash
curl -s -X POST http://localhost:8000/parse \
  -H 'Content-Type: application/json' \
  -d '{"text":"Lũ quét thôn B, khoảng 45 hộ mất nhà, cần nước và thuốc"}'
```

**Kỳ vọng:** JSON có loại thiên tai, địa điểm, số hộ, nhóm nhu cầu.

Thử với câu vô nghĩa (`"abc xyz"`) → **không được bịa số**. Trường nào không suy ra
được thì để trống.

## Test 2 — Hỏi đáp về kho

**Ở đâu:** web, ô trợ lý.

Hỏi: *"Kho còn bao nhiêu nước uống?"*

**Kỳ vọng:** trả lời đúng theo tồn kho thật.

Hỏi: *"Giá vàng hôm nay bao nhiêu?"*

**Kỳ vọng:** trả lời **không biết**, không bịa.

**Vì sao đây là phép thử quan trọng nhất:** trợ lý chỉ được trả lời trong phạm vi ảnh
chụp dữ liệu kho được đưa vào. Một trợ lý dám bịa số tồn kho thì nguy hiểm hơn là
không có trợ lý.

Kiểm chứng bằng lệnh:

```bash
curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" \
  -d '{"question":"Kho còn bao nhiêu nước uống?"}' \
  http://localhost:3100/api/assistant/warehouses/<mã kho>/ask
```

Thử với kho không thuộc quyền → **403**.

## Test 3 — Bản tin trong ngày

**Ở đâu:** web, trang tổng quan kho.

```bash
curl -s -H "Authorization: Bearer $STAFF" \
  http://localhost:3100/api/insights/warehouses/<mã kho>/daily-briefing
```

**Kỳ vọng:** tóm tắt vài dòng: hàng sắp hết hạn, tồn thiếu, sự cố đang mở, nhiệm vụ
đang chờ.

**Điểm thiết kế cần nêu với giám khảo:** AI **chỉ chọn và xếp thứ tự** các dữ kiện.
Câu chữ do máy chủ dựng nguyên văn từ số liệu thật. Nghĩa là AI có thể xếp sai thứ tự
ưu tiên, nhưng **không thể bịa ra một con số không có trong kho**.

Thử: tắt hẳn dịch vụ AI rồi gọi lại → vẫn ra bản tin, chỉ là thứ tự theo quy tắc cố
định thay vì do AI xếp.

## Test 4 — Diễn giải phương án

Sau khi lập phương án ở [03](03-lap-va-phat-hanh-phuong-an.md), phần "vì sao chọn
kho này" là do AI viết.

**Kỳ vọng:** con số trong lời diễn giải **khớp** với bảng phân bổ ngay bên cạnh.

Đây là chỗ dễ lộ nhất nếu AI bịa: đọc lời văn rồi đối chiếu từng dòng với bảng.

## Test 5 — Tra cứu tri thức cứu trợ

```bash
curl -s -X POST http://localhost:8000/knowledge/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"định mức nước uống cho người dân vùng lũ","topK":3}'
```

**Kỳ vọng:** trả về đoạn trích kèm nguồn.

Phần tra cứu này **không cần mô hình ngôn ngữ**. Nghĩa là kể cả Ollama chết, tra cứu
tài liệu vẫn chạy.

## Test 6 — Nhập liệu bằng giọng nói

Chạy được nếu đã tải mô hình PhoWhisper về máy.

```bash
curl -s -X POST http://localhost:8000/transcribe \
  -H 'Content-Type: application/json' \
  -d '{"audioBase64":"<WAV mã hoá base64>"}'
```

**Kỳ vọng:** ra chữ tiếng Việt. Chưa tải mô hình thì báo lỗi rõ ràng, không treo.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Tắt Ollama rồi báo cáo tình huống | vẫn gửi được, dùng bóc tách theo quy tắc |
| Tắt hẳn dịch vụ AI rồi lập phương án | vẫn lập được, chỉ mất phần diễn giải |
| Hỏi câu quá 500 ký tự | bị từ chối |
| Hỏi câu 1 ký tự | bị từ chối |
| Lực lượng hiện trường gọi trợ lý kho | **403** |

Mấu chốt của cả nhóm này: **AI hỏng thì nghiệp vụ vẫn chạy**. Không có bước nào của
việc cứu trợ đứng lại chỉ vì mô hình không trả lời.

---

Tiếp theo: [14 · Chế độ ngoại tuyến](14-che-do-ngoai-tuyen.md)

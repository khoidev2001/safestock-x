# 12 · Xử lý sự cố

Sự cố sinh ra từ hai nguồn: **vượt ngưỡng cảm biến** (nóng, ẩm, ngập) và **mất tín
hiệu thiết bị**. Cả hai đi vào cùng một danh sách và xử lý theo cùng một vòng đời.

**Ai làm:** phụ trách kho và quản trị xã.
**Ở đâu:** web — mục **Sự cố**. Điện thoại cũng xem được ở thẻ **Cảnh báo**.

## Vòng đời

```
Mới  →  Đã tiếp nhận  →  Đã phân công  →  Đã xử lý
```

Không nhảy cóc: chưa tiếp nhận thì chưa phân công được.

**Vì sao bắt đi tuần tự:** mỗi bước ghi lại *ai* và *lúc nào*. Bỏ bước là mất dấu
trách nhiệm. Khi hậu kiểm hỏi "ai đã biết chuyện này lúc mấy giờ" thì phải trả lời
được.

## Test 1 — Tiếp nhận

1. Tạo một sự cố (kéo thanh trượt vượt ngưỡng ở [09](09-cam-bien-mo-phong-va-chuong.md)).
2. Đăng nhập `staff@` trên web, mở **Sự cố**.
3. Bấm **Tiếp nhận**.

**Kỳ vọng:** trạng thái đổi, có ghi tên người tiếp nhận và mốc thời gian.

## Test 2 — Phân công

1. Với sự cố đã tiếp nhận, bấm **Phân công**, chọn người xử lý.

**Kỳ vọng:** trạng thái đổi sang đã phân công, hiện tên người được giao.

Thử bấm **Phân công** cho sự cố còn ở trạng thái mới → **bị từ chối**.

## Test 3 — Xử lý xong

1. Bấm **Đã xử lý**, ghi cách xử lý.

**Kỳ vọng:** sự cố rời khỏi danh sách đang mở, vào lịch sử.

## Test 4 — Chặn trùng

1. Kéo nhiệt độ lên 40°C, gửi.
2. **Chưa xử lý sự cố vừa sinh ra.**
3. Kéo lên 42°C, gửi tiếp.

**Kỳ vọng:** vẫn **chỉ một** sự cố nhiệt độ đang mở, không đẻ ra cái thứ hai.

**Vì sao:** máy lạnh hỏng lúc 2 giờ sáng, cảm biến báo mỗi 10 giây. Không chặn trùng
thì tới sáng có 2.880 sự cố y hệt nhau, và người trực sẽ tắt hết cho đỡ phiền — kể cả
cái quan trọng.

4. Bấm **Đã xử lý** cho sự cố đó, rồi gửi lại 42°C.

**Kỳ vọng:** **sinh sự cố mới**. Đã đóng nghĩa là đã xong; hỏng lại là chuyện mới.

## Test 5 — Tắt chuông ≠ xử lý sự cố

1. Chuông kêu trên desktop, bấm **Tắt chuông**.
2. Mở web xem sự cố đó.

**Kỳ vọng:** sự cố **vẫn đang mở**.

**Vì sao tách hai việc:** tắt chuông là *"tôi đã nghe thấy"*. Xử lý là *"vấn đề đã
được giải quyết"*. Gộp lại thì chỉ cần với tay tắt tiếng ồn là hồ sơ tự ghi rằng kho
đã an toàn.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Xử lý một sự cố hai lần | lần hai bị từ chối |
| Người ở kho khác bấm tiếp nhận | **403** |
| Lực lượng hiện trường mở danh sách sự cố kho | không thấy mục này |
| Phân công cho người không có quyền xử lý | bị từ chối |
| Nhảy thẳng từ mới sang đã xử lý | bị từ chối |

## Mức độ và độ tin cậy

Mỗi sự cố mang **mức độ** (thấp / trung bình / cao) và **độ tin cậy** (0–1).

Độ tin cậy thấp nghĩa là phép đo đáng ngờ — cảm biến pin yếu, giá trị nhiễu. Sự cố
vẫn hiện ra nhưng người xử lý biết mà đi kiểm chứng bằng mắt trước khi hành động.

Giấu hẳn phép đo đáng ngờ thì có ngày giấu luôn một đám cháy thật.

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3100/api
STAFF=<mã đăng nhập của staff@>

# danh sách sự cố đang mở
curl -s -H "Authorization: Bearer $STAFF" $API/incidents

# tiếp nhận
curl -s -X POST -H "Authorization: Bearer $STAFF" $API/incidents/<mã>/acknowledge

# phân công
curl -s -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" \
  -d '{"assigneeId":"<mã người dùng>"}' $API/incidents/<mã>/assign

# xử lý xong
curl -s -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" \
  -d '{"resolution":"Đã thay quạt làm mát"}' $API/incidents/<mã>/resolve
```

---

Tiếp theo: [13 · Trợ lý AI và bản tin](13-tro-ly-ai-va-ban-tin.md)

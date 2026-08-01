# 02 · Báo cáo tình huống

Bước mở đầu của mọi nhiệm vụ cứu trợ: người ở hiện trường báo về xã.

**Ai làm:** lực lượng hiện trường **hoặc** phụ trách kho — ai đứng tại chỗ xảy ra sự
việc thì người đó báo. Không ai phải gọi điện nhờ người khác nhập hộ.

**Ở đâu:** điện thoại, thẻ **Báo cáo**.

## Cách 1 — Gõ tay

1. Đăng nhập `rescue@ungphonhanh.life`.
2. Vào thẻ **Báo cáo**.
3. Gõ mô tả, ví dụ: *"Thôn Phú Hòa ngập sâu 1 mét, 3 hộ cần di dời và thiếu nước uống"*.
4. Gửi.

**Kỳ vọng:** báo gửi thành công. Quản trị xã nhận được thông báo ngay.

## Cách 2 — Nói bằng giọng nói

1. Bấm giữ nút micro, nói tiếng Việt.
2. Thả tay, chờ hệ thống chuyển lời nói thành chữ.
3. **Đọc lại chữ hiện ra**, sửa nếu máy nghe nhầm.
4. Gửi.

**Kỳ vọng:** nội dung phải do người xác nhận trước khi gửi. Hệ thống **không** tự
gửi thẳng bản nhận dạng.

**Vì sao:** người đang đứng giữa mưa gió, gió ù tai, máy nghe nhầm là chuyện thường.
Một con số sai trong báo cáo cứu trợ dẫn tới điều sai lượng hàng. Bắt người xác nhận
là chậm hơn vài giây nhưng đúng hơn nhiều.

## Kiểm chéo trên web

1. Đăng nhập `admin` tại http://localhost:3200.
2. Vào **Sự cố** hoặc **Điều phối cứu hộ**.

**Kỳ vọng:** thấy báo cáo vừa gửi, kèm người gửi và thời điểm.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Gửi mô tả quá ngắn (dưới 5 ký tự) | bị từ chối |
| Gửi hai lần liên tiếp cùng nội dung | **chỉ tạo một** báo cáo, một thông báo |
| Gửi khi mất mạng | báo lỗi rõ ràng, không im lặng nuốt mất |
| Toạ độ ngoài vùng xã | bị chặn |
| Chỉ điền một nửa cặp toạ độ | bị chặn |

Chống trùng dựa trên khoá do ứng dụng sinh, nên bấm lại vì mạng chập chờn không đẻ
ra hai nhiệm vụ.

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3100/api
TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"rescue@ungphonhanh.life","password":"rescue123"}' \
  $API/auth/login | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"description":"Thôn Phú Hòa ngập sâu 1 mét, 3 hộ cần di dời","incidentLat":13.3721,"incidentLng":108.6123}' \
  $API/missions/report
```

**Kỳ vọng:** trả về `{"missionId":"..."}` với mã trạng thái `201`.

Nhiệm vụ mới sinh ra ở trạng thái **Nháp**, chưa có vật tư nào — đó là việc của bước
sau.

---

Tiếp theo: [03 · Lập và phát hành phương án](03-lap-va-phat-hanh-phuong-an.md)

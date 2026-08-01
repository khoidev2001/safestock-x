# 03 · Lập và phát hành phương án

**Ai làm:** quản trị xã. **Ở đâu:** web, mục **Điều phối cứu hộ**.

## Các bước

1. Đăng nhập `admin`, mở nhiệm vụ vừa nhận từ báo cáo.
2. Nhập thông tin sự việc:
   - Loại tình huống (lũ lụt, sạt lở…)
   - Số người bị ảnh hưởng
   - Thời lượng dự kiến
   - Số trẻ em, người già, ca cần hỗ trợ y tế
3. Hệ thống đề xuất danh sách vật tư kèm số lượng và kho lấy hàng.
4. Xem lại, rồi bấm **Duyệt và phát hành**.

## Kỳ vọng

- Danh sách vật tư có **số lượng cụ thể** cho từng mã, không phải mô tả chung chung.
- Sau khi phát hành, trạng thái chuyển sang **Chờ kho chuẩn bị**.
- Hệ thống sinh yêu cầu vật tư **theo từng mã, cho từng kho**.

Đã kiểm chứng thật với báo cáo ngập tại thôn Phú Hòa: hệ thống đề xuất **5 loại vật
tư**, chia thành **1 ở kho trung tâm** và **4 ở kho thôn Long Châu**.

## Điều quan trọng nhất khi trình diễn

Vật tư được phân bổ theo **kho gần điểm sự cố**, nên một nhiệm vụ thường trải trên
nhiều kho. Nghĩa là bước sau **cần hơn một tài khoản kho** mới hoàn tất được.

Nếu chỉ đăng nhập `staff@` (kho trung tâm), nhiệm vụ sẽ đứng mãi ở *Chờ kho chuẩn bị*
và không bao giờ tới *Sẵn sàng* — lúc đó không diễn được bước giao hàng.

Xem nhiệm vụ cần những kho nào bằng cách mở chi tiết trên web, phần tiến độ kho ghi
rõ `x/y đã chuẩn bị`.

## Vai trò của trí tuệ nhân tạo ở đây

Máy chủ tính số lượng dựa trên số người, thời lượng và tồn kho thực tế. Trí tuệ nhân
tạo **chỉ diễn giải và sắp xếp**, không tự bịa ra con số.

Kiểm chứng: mở nhiệm vụ, đối chiếu số lượng đề xuất với công thức số người × thời
lượng. Nếu trí tuệ nhân tạo không phản hồi, hệ thống vẫn phải đưa ra được phương án
theo quy tắc — chỉ mất phần lời văn.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Phát hành báo cáo **chưa lập phương án** | bị từ chối — không có phương án thì kho không biết chuẩn bị gì |
| Phát hành nhiệm vụ **chưa ghim toạ độ** | bị từ chối — không có điểm đến thì không tính được kho gần nhất |
| Hiện trường tự bấm duyệt | **403** |
| Phụ trách kho tự bấm duyệt | **403** |
| Phát hành hai lần | lần hai bị từ chối |
| Kho không đủ hàng cho vật tư thiết yếu | báo rõ vướng ở đâu, không phát hành được |

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3100/api
ADMIN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"admin","password":"admin123@"}' \
  $API/auth/login | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
MID=<mã nhiệm vụ từ bước báo cáo>

# lập phương án
curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN" \
  -d '{"incident":{"incidentType":"FLOOD","affectedPeople":12,"durationHours":24,"children":2,"elderly":1,"medicalSupportCases":0}}' \
  $API/missions/$MID/plan-from-report

# duyệt và phát hành
curl -s -X POST -H "Authorization: Bearer $ADMIN" $API/missions/$MID/approve
```

**Kỳ vọng:** lệnh sau trả trạng thái `PENDING_WAREHOUSE`.

---

Tiếp theo: [04 · Kho chuẩn bị theo từng vật tư](04-kho-chuan-bi-theo-tung-vat-tu.md)

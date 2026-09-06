# 04 · Kho chuẩn bị theo từng vật tư

**Ai làm:** phụ trách kho — thường là **nhiều hơn một người**, mỗi người một kho.
**Ở đâu:** web, mục **Điều phối cứu hộ**.

## Vì sao chia theo từng mã, không phải cả nhiệm vụ một lần

Một nhiệm vụ có thể lấy hàng từ nhiều kho. Nếu chuẩn bị cả gói một lần thì kho A
phải chờ kho B mới ghi nhận được phần việc của mình — trong khi hàng của kho A đã
sẵn sàng từ lâu. Chia theo từng mã cho phép mỗi kho làm xong phần mình rồi báo ngay.

## Các bước

1. Đăng nhập tài khoản kho, mở nhiệm vụ.
2. Với **từng mã vật tư** của kho mình:
   - **Tiếp nhận** — xác nhận đã đọc yêu cầu
   - **Đã chuẩn bị** — hàng đã lấy ra, sẵn sàng giao
   - hoặc **Báo thiếu/sai** kèm ghi chú, nếu không đủ hàng
3. Lặp lại cho kho còn lại bằng tài khoản tương ứng.

## Kỳ vọng

| Việc | Kết quả |
|---|---|
| Báo đã chuẩn bị một mã | tồn kho **giảm ngay** đúng phần đã cấp |
| Bấm lại lần hai cùng mã | **không trừ kho lần nữa** |
| Một kho xong, kho kia chưa | nhiệm vụ vẫn **Chờ kho chuẩn bị** |
| Kho **cuối cùng** xong | nhiệm vụ chuyển **Sẵn sàng** |

Tiến độ hiển thị dạng `x/y đã chuẩn bị` để biết còn chờ kho nào.

## Trình tự đầy đủ khi có hai kho

Ví dụ thật đã chạy:

```
Kho trung tâm  (staff@)         → 1 mã   → chuẩn bị xong → vẫn Chờ kho chuẩn bị
Kho thôn Long Châu (longchau@)   → 4 mã  → chuẩn bị xong → Sẵn sàng
```

Nếu bỏ sót kho thứ hai, nhiệm vụ **không bao giờ** tới Sẵn sàng.

## Case biên

| Thử | Kỳ vọng |
|---|---|
| Kho A đụng vào yêu cầu của kho B | **403** — không phải "không tìm thấy", mà là từ chối truy cập |
| Bấm chuẩn bị hai lần | lần hai không xuất kho thêm |
| Hai kho bấm cùng lúc | mỗi kho xuất đúng phần mình, chỉ **một lần** chuyển sang Sẵn sàng |
| Báo thiếu sau khi đã chuẩn bị | bị chặn — hàng đã ra khỏi kho rồi |
| Quản trị huỷ nhiệm vụ sau khi một kho đã xuất | **bị chặn** |

Chỗ cuối đáng chú ý: vật tư đã rời kho thì huỷ ngược sẽ để lại hàng lơ lửng ngoài sổ
sách. Muốn đóng nhiệm vụ thì phải báo kết quả giao, kể cả khi giao thất bại.

## Kiểm chứng bằng lệnh

```bash
API=http://localhost:3100/api
STAFF=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"staff","password":"staff123"}' \
  $API/auth/login | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

# xem việc của kho mình
curl -s -H "Authorization: Bearer $STAFF" $API/missions/warehouse-requests/own

# với từng mã: tiếp nhận rồi báo đã chuẩn bị
curl -s -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" -d '{}' \
  $API/missions/warehouse-requests/<mã yêu cầu>/accept
curl -s -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $STAFF" -d '{}' \
  $API/missions/warehouse-requests/<mã yêu cầu>/prepare
```

Danh sách trả về gồm cả yêu cầu **đã xong**, nên lọc theo trạng thái khác `PREPARED`
để biết còn việc gì.

---

Tiếp theo: [05 · Giao hàng và đóng nhiệm vụ](05-giao-hang-va-dong-nhiem-vu.md)

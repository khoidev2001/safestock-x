# Bộ dữ liệu chuẩn xã Đồng Xuân

_Cập nhật: 2026-07-28 · Catalog version: `2026.07`_

## Mục tiêu

Bộ seed dùng chung cho demo, kiểm thử và phát triển local. Dữ liệu đủ để các màn hình kho, Readiness, Mission, Insights, trợ lý, kiểm kê, mượn-trả, sự cố và báo cáo tháng đều có dữ liệu hợp lệ.

> Số lượng tồn trong seed là **baseline mô phỏng**, không phải số liệu kiểm kê hoặc định mức cấp phát chính thức của xã. Khi triển khai thật phải thay bằng biên bản kiểm kê đã xác nhận.

## Phạm vi địa bàn

Một kho cứu trợ trung tâm và 17 kho thôn cùng `communeId = dong-xuan`:

1. Long Châu
2. Long Thăng
3. Long Hà
4. Long Bình
5. Long Mỹ
6. Long Thạch
7. Long Hòa
8. Kỳ Đu
9. Phước Huệ
10. Tân Bình
11. Tân An
12. Tân Hòa
13. Tân Phước
14. Tân Phú
15. Tân Vinh
16. Phú Sơn
17. Triêm Đức

Danh sách bám theo công bố sắp xếp thôn ngày 01/07/2026 của [UBND xã Đồng Xuân](https://dongxuan.daklak.gov.vn/tin-tuc-su-kien/dong-xuan-cong-bo-nghi-quyet-quyet-dinh-ve-sap-xep-thon-va-cong-tac-can-bo-o-co-so.html).

Kho trung tâm đặt tại UBND Xã Đồng Xuân (`13.3782428, 109.1042590`). Trong 17 kho
thôn, seed chỉ gán tọa độ Nhà văn hóa/nhà sinh hoạt cộng đồng đã xác minh cho Kỳ Đu,
Phước Huệ, Tân Bình, Phú Sơn và Triêm Đức. Mười hai kho còn lại giữ `lat/lng = null`;
ADMIN dùng màn hình bản đồ để ghim sau, seed không gán tọa độ suy đoán. Danh mục và
nguồn xác minh nằm tại
[`DANH-MUC-VI-TRI-KHO-XA-VA-KHO-THON.md`](DANH-MUC-VI-TRI-KHO-XA-VA-KHO-THON.md).

## Danh mục vật tư

Catalog có 17 SKU thuộc 6 nhóm nghiệp vụ:

| Nhóm | Vật tư chính |
|---|---|
| WASH | Nước uống, can nước 20 lít, bộ vệ sinh gia đình |
| FOOD | Gạo, lương khô cứu trợ |
| RESCUE | Áo phao người lớn/trẻ em, xuồng, dây cứu hộ |
| SHELTER | Bạt chống thấm, chăn, màn chống muỗi |
| HEALTH | Bộ sơ cứu |
| COMMUNICATION | Đèn pin, pin, bộ đàm, pin sạc dự phòng |

Nhóm vật tư tham chiếu nhu cầu cứu trợ khẩn cấp của [IFRC](https://www.ifrc.org/our-work/disasters-climate-and-crises/supporting-local-humanitarian-action/emergency-needs), [IFRC Shelter Kit Guidelines](https://www.ifrc.org/document/shelter-kit-guidelines) và chuẩn nước tối thiểu của [Sphere](https://spherestandards.org/wise-scales-for-wash-standard-2-1/). Định mức Mission vẫn do `mission.config.ts` quản lý và phải được nghiệp vụ địa phương duyệt trước khi dùng thực tế.

## Trạng thái dữ liệu mẫu

- Kho trung tâm: 3 khu, 7 kệ, 24 lô; có lô khả dụng cho mọi SKU Mission.
- Mỗi kho thôn: 1 khu, 1 kệ và 6 SKU ứng trực tối thiểu.
- 126 lô đều có bản kiểm kê gần nhất.
- 2 phiếu mượn đang mở cho áo phao và bộ đàm.
- 68 thiết bị ảo; kho trung tâm có loadcell, nhiệt độ, độ ẩm, cửa, gateway, khói và nguồn điện.
- 2 sự cố có bằng chứng: một sự cố cảm biến đang mở và một sự cố độ ẩm đã xử lý.
- 190 giao dịch lịch sử; mỗi chuỗi có giao dịch nhập đầu kỳ và xuất kho, khớp tồn hiện tại.
- Một báo cáo tháng của thôn Long Hà ở trạng thái chờ duyệt.
- Một số lô hết hạn, cần kiểm tra và hư hỏng được tạo có chủ đích để kiểm thử bộ lọc cấp phát.

## Tài khoản

| Login | Password | Quyền/phạm vi |
|---|---|---|
| `admin` | `admin123@` | ADMIN toàn xã, mặc định mở kho trung tâm |
| `staff@safestock.vn` | `staff123` | WAREHOUSE kho trung tâm |
| `rescue@safestock.vn` | `rescue123` | RESCUE |
| `truongthon1@safestock.vn` ... `truongthon17@safestock.vn` | `truongthon123` | Mỗi tài khoản chỉ quản một kho thôn theo thứ tự danh sách trên |

## Chạy và kiểm tra

```bash
# Dừng backend và các tác vụ ghi DB trước khi reseed.
pnpm --filter @safestock/backend seed
pnpm --filter @safestock/backend test -- --runInBand
```

Seed reset toàn bộ dữ liệu demo trước khi nạp. Không chạy khi backend/frontend đang ghi vào DB và không chạy trên database cần giữ dữ liệu thật. Seed đã được kiểm tra chạy liên tiếp hai lần cho cùng kết quả: 18 kho, 20 user, 17 item, 126 batch, 126 inventory count, 68 device, 2 incident và 190 transaction.

# Ảnh thật của vật tư

Mỗi món vật tư một tệp ảnh. App dùng ảnh này cho ô nhận diện trong màn hình chi
tiết nhiệm vụ (danh sách vật tư cần, vật tư đã xuất, và các chặng lấy hàng ở kho).

Hiện đã đủ ảnh cho **cả 27 mã vật tư** trong seed — ảnh do chủ dự án cung cấp, đã
co về 256×256 trên nền trắng nên mỗi tệp chỉ 3–15KB.

## Cách thêm ảnh

1. Đặt tệp vào thư mục này, **tên tệp = mã vật tư viết thường** (đuôi `.jpg`,
   `.png` hay `.webp` đều được):

   ```
   assets/supplies/water-01.jpg
   assets/supplies/noodle-01.png
   ```

2. Sinh lại bảng ánh xạ:

   ```bash
   pnpm --filter @safestock/mobile supply-images
   ```

   Lệnh in ra món nào đã có ảnh, món nào còn thiếu. Đừng sửa tay
   `supply-images.ts` — lần chạy sau sẽ ghi đè.

3. Món **chưa có ảnh vẫn chạy bình thường**: ô nhận diện quay về icon emoji trên
   nền màu nhóm như trước. Không cần đủ 27 ảnh mới dùng được.

## Ảnh nên chọn

- Nền trắng hoặc nền trơn, chụp thẳng cả kiện hàng — ô hiển thị chỉ 30–52px nên
  chi tiết nhỏ sẽ mất, cái cần thấy là **hình khối và màu của kiện**.
- Vuông hoặc gần vuông. Ảnh dài sẽ được co theo chiều dài hơn (`contain`), không
  bị méo nhưng sẽ hụt hai bên.
- Nén dưới ~150KB mỗi tệp. Ảnh vào thẳng gói APK, 27 ảnh gốc 2000px là cộng thêm
  vài chục MB cho một ô 52px.

## Bảng tra mã vật tư

| Mã vật tư | Tên trong app | Tên tệp cần đặt |
|---|---|---|
| `WATER-01` | Nước uống đóng chai | `water-01.jpg` |
| `WATER-CAN-20L` | Can nước 20 lít | `water-can-20l.jpg` |
| `AQUATAB-01` | Viên khử khuẩn nước | `aquatab-01.jpg` |
| `RICE-01` | Gạo cứu trợ | `rice-01.jpg` |
| `NOODLE-01` | Mì tôm cứu trợ (thùng 30 gói) | `noodle-01.jpg` |
| `FOOD-RATION-01` | Lương khô cứu trợ | `food-ration-01.jpg` |
| `MILK-01` | Sữa hộp cho trẻ em (thùng 48 hộp) | `milk-01.jpg` |
| `HYGIENE-KIT-01` | Bộ vệ sinh gia đình | `hygiene-kit-01.jpg` |
| `LIFE-ADULT` | Áo phao người lớn | `life-adult.jpg` |
| `LIFE-CHILD` | Áo phao trẻ em | `life-child.jpg` |
| `RING-01` | Phao cứu sinh tròn | `ring-01.jpg` |
| `BOAT-01` | Xuồng cứu hộ | `boat-01.jpg` |
| `ROPE-01` | Dây cứu hộ 30 mét | `rope-01.jpg` |
| `CANVAS-01` | Bạt che chống thấm | `canvas-01.jpg` |
| `BLANKET-01` | Chăn cứu trợ | `blanket-01.jpg` |
| `MOSQUITO-NET-01` | Màn chống muỗi | `mosquito-net-01.jpg` |
| `RAINCOAT-01` | Áo mưa cứu trợ | `raincoat-01.jpg` |
| `BOOT-01` | Ủng lội nước | `boot-01.jpg` |
| `FIRSTAID-01` | Bộ sơ cứu | `firstaid-01.jpg` |
| `STRETCHER-01` | Cáng cứu thương | `stretcher-01.jpg` |
| `SHOVEL-01` | Xẻng xúc bùn đất | `shovel-01.jpg` |
| `TORCH-01` | Đèn pin | `torch-01.jpg` |
| `BATT-01` | Bộ pin | `batt-01.jpg` |
| `POWERBANK-01` | Pin sạc dự phòng | `powerbank-01.jpg` |
| `RADIO-01` | Bộ đàm cầm tay | `radio-01.jpg` |
| `MEGAPHONE-01` | Loa cầm tay | `megaphone-01.jpg` |
| `GENERATOR-01` | Máy phát điện mini 2kVA | `generator-01.jpg` |

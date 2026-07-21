# Kế hoạch: Seed dữ liệu giả "chuẩn đi thi thật"

> **Đã được thay thế ngày 2026-07-21:** implementation hiện hành mở rộng thành bộ dữ liệu 1 kho trung tâm + 17 thôn, có kiểm kê, mượn-trả, cảm biến, sự cố và sổ giao dịch khớp tồn. Xem [SEED-DATASET.md](SEED-DATASET.md). Nội dung bên dưới được giữ làm lịch sử quyết định.

> Mục tiêu: 1 file seed tổng thể — số liệu sinh động, hợp lý nghiệp vụ, KHÔNG trống ở bất kỳ view nào — để demo trước giám khảo chạy đủ 4 chế độ: Emergency (mission), Normal Mode (insights), Chatbot, Incident.

## Context — vì sao cần

Đã verify runtime thật (2026-07-17): seed hiện tại (`apps/backend/prisma/seed.ts`) đầy đủ cấu trúc (kho/kệ/batch/device/neighbor) nhưng **thiếu 2 thứ** khiến Normal Mode trống:
- **0 `InventoryTransaction`** → forecast `avgPerDay=0`/`daysLeft=null`, trends/monthly-report rỗng (rơi template fallback).
- **Lô sắp hết hạn gần nhất ~60 ngày** (ngoài cửa sổ 30) → expiryAlerts rỗng.

Code ĐÚNG — chỉ thiếu dữ liệu đầu vào. Bổ sung để mọi view có số thật khi trình diễn.

## Nguyên tắc "chuẩn đi thi"
1. **Hợp lý nghiệp vụ**: nước/pin xuất nhiều & đều (tiêu hao hằng ngày); áo phao/xuồng xuất ít (tái sử dụng, chỉ khi có sự kiện). Không random trơ.
2. **Rải thời gian tự nhiên**: giao dịch trải 60 ngày, tần suất khác nhau theo mặt hàng, có dao động (không phải mỗi ngày y hệt).
3. **Đa dạng tín hiệu** để mỗi tính năng có "đạn" demo:
   - Forecast: ≥1 SKU sắp cạn (đỏ), ≥1 SKU cạn hẳn (tồn 0 + có lịch sử → "Đã cạn"), vài SKU còn nhiều.
   - Trends: ≥1 SKU tăng rõ (kỳ này > kỳ trước), ≥1 giảm, ≥1 "mới phát sinh".
   - Expiry: 1-2 lô hết hạn trong 7 ngày, 1-2 lô trong 30 ngày, 1 lô đã quá hạn (ngày âm).
4. **Server-time đúng**: `createdAt` giao dịch đặt về quá khứ hợp lý (không mốc tương lai vô lý).
5. **Idempotent**: seed chạy lại được — reset sạch trước khi tạo (seed hiện tại `create` gây P2002 khi chạy lần 2).
6. **Không phá dữ liệu demo sẵn có**: giữ nguyên bối cảnh Đồng Xuân, 3 kho, catalog, neighbor, device — chỉ THÊM lịch sử giao dịch + tinh chỉnh vài expiryDate.

## Thiết kế

### 1. Reset đầu seed (idempotent)
Thêm block xoá sạch theo thứ tự phụ thuộc (con trước cha) ở đầu `main()`:
```
inventoryTransaction → inventoryCount → loanRecord → itemBatch → virtualDevice/sensorEvent
→ shelf → warehouseZone → neighborWarehouse → incident* → mission* → warehouse
→ item → itemCategory → notification → auditLog → user → organization → readiness*
```
Dùng `deleteMany({})` từng bảng (bọc try/catch cho bảng có thể trống). Giữ nguyên phần tạo hiện có phía sau.

### 2. Sinh lịch sử giao dịch (phần mới, đặt sau khi tạo batch)
Hàm `seedTransactionHistory()`:
- Actor: user WAREHOUSE (đã seed) làm người xuất/nhập.
- **Mẫu tiêu thụ mỗi SKU** (đơn vị/ngày trung bình, có dao động ±30%):
  | SKU | Loại | Nhịp xuất | Ý đồ demo |
  |---|---|---|---|
  | WATER-01 | tiêu hao | ~12 lít/ngày, đều | forecast ra ~40 ngày; trends tăng nhẹ |
  | BATT-01 | tiêu hao | ~1.5 bộ/ngày, tăng dần cuối kỳ | **trends TĂNG mạnh** |
  | FIRSTAID-01 | tiêu hao | ~0.3 bộ/ngày | sắp cạn (tồn 8) → **lowStock đỏ** |
  | LIFE-ADULT | tái sử dụng | xuất cụm 2 đợt sự kiện | trends có, không đều |
  | TORCH-01 | tái sử dụng | ~0.1/ngày, chỉ nửa đầu kỳ | **trends GIẢM** (kỳ này<kỳ trước) |
  | CANVAS-01 | tái sử dụng | vài giao dịch cuối kỳ | **"mới phát sinh"** trong trends |
  | RICE-01 (Gạo cứu trợ, MỚI) | tiêu hao | xuất hết tồn về 0 | forecast **"Đã cạn"** (chứng minh gap #1) |
- Mỗi giao dịch: `type=EXPORT`, `source` xen kẽ SCAN/BULK/LOADCELL (đa nguồn → hợp lý dataReliability), `createdAt` = mốc quá khứ rải đều, `quantity` dao động.
- **Nhất quán tồn (CHỐT: khớp tuyệt đối)**: mỗi SKU đặt **tồn đầu kỳ** (60 ngày trước), sinh chuỗi giao dịch xuất, rồi **quantity batch hiện tại = tồn đầu kỳ − tổng đã xuất**. Số tồn + lịch sử là 1 câu chuyện thật khớp 100% — giám khảo soi kỹ vẫn đúng (tồn thấp CHÍNH VÌ đã xuất bấy nhiêu). Đảm bảo tồn cuối ≥ 0.

### 3. Tinh chỉnh expiryDate vài lô (sửa nhỏ trong catalog/batch hiện có)
- FIRSTAID-01: đang `expiryMonths: 2` (~60 ngày) → đổi 1 lô về **~20 ngày** (trong cửa sổ 30).
- Thêm 1-2 lô cận hạn: 1 lô **~5 ngày** (đỏ gắt), 1 lô **đã quá hạn -3 ngày**.
- WATER-01 kho thôn: 1 lô ~25 ngày để expiry có nhiều mục.

### 4. In tổng kết mở rộng
`console.log` thêm: số transaction sinh ra, số SKU có forecast, số lô cận hạn — để verify nhanh sau seed.

## File đụng
- `apps/backend/prisma/seed.ts` — thêm reset đầu file, thêm `seedTransactionHistory()`, tinh chỉnh vài expiryDate. **Không tạo file mới** (giữ 1 nguồn seed duy nhất, đúng yêu cầu "1 file").

## Verify (chạy thật, không chỉ đọc code)
1. `pnpm --filter @safestock/backend seed` → chạy lại lần 2 vẫn OK (idempotent, không P2002).
2. Khởi động BE + login, gọi thật:
   - `GET /api/insights/warehouses/:id` → forecast có `daysLeft` số thật (có SKU đỏ + SKU "Đã cạn"); expiryAlerts có mục (gồm 1 quá hạn âm ngày).
   - `GET /api/insights/warehouses/:id/monthly-report` → trends có SKU tăng/giảm/mới, narrative LLM (hoặc template) không rỗng.
   - `POST /api/assistant/warehouses/:id/ask` "Vật tư nào sắp hết hạn?" → trả đúng lô cận hạn (chatbot có data phong phú).
3. Mở FE view "Ngày thường" + "Trợ lý" → không còn empty state.

## Quyết định đã chốt (user)
- **Tồn khớp tuyệt đối**: quantity batch = tồn đầu kỳ − tổng xuất (trực quan nhất, soi kỹ vẫn đúng).
- **Thêm SKU cạn hẳn**: `RICE-01` "Gạo cứu trợ" — xuất hết về 0, forecast báo "Đã cạn".

## Không làm (giữ scope)
- Không đụng logic service/controller (chỉ data).
- Không thêm kho mới; chỉ thêm 1 SKU RICE-01 cho demo "cạn hẳn".
- Không seed sự cố/mission lịch sử (Emergency demo tạo tại chỗ khi trình diễn).

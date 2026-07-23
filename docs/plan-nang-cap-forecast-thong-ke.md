# Kế hoạch: Nâng cấp forecast từ trung bình phẳng → dự báo thống kê

_Lập ngày: 2026-07-23 · Hướng A2 (đã chốt với người dùng)_

> Không phải nguồn trạng thái. Nguồn sự thật là code + [docs/PRD.md](PRD.md).

## 1. Vấn đề (điểm yếu tự nhận + plan đã chỉ ra)

`forecast.ts` hiện tính `avgPerDay = tổng_xuất / số_ngày` (trung bình phẳng) →
`daysLeft = tồn / avgPerDay`. Nhược điểm khi giám khảo hỏi xoáy:

- **Không phản ánh xu hướng gần đây**: xuất dồn 5 ngày qua bị pha loãng bởi 25 ngày im.
- **Không có độ tin cậy**: 1 con số cứng, không biết chắc hay đoán mò.
- **Không có điểm đặt hàng lại**: chỉ nói "còn ~N ngày", không nói "khi nào cần nhập".
- Dễ bị bắt bài "đây chỉ là phép chia, AI ở đâu?".

## 2. Giải pháp — dự báo thống kê (KHÔNG phóng đại thành ML)

Gọi trung thực là **"dự báo thống kê"**: EWMA + độ lệch chuẩn → khoảng tin cậy +
điểm đặt hàng lại. Thuần hàm số, test khóa công thức, chạy offline, không cần Ollama.

### 2.1. Thuật toán (trong `computeForecast`, giữ hàm thuần)

1. **Chuỗi nhu cầu ngày**: bin `exports` trong `windowDays` thành `daily[0..N-1]`
   (`daily[0]` = hôm nay, `daily[N-1]` = xa nhất). Ngày không xuất = 0.
2. **EWMA** (trung bình trượt trọng số mũ) trên chuỗi cũ→mới, `α = 0.35`:
   `S_t = α·x_t + (1-α)·S_{t-1}` → `ewmaPerDay` = tốc độ tiêu thụ gần đây đã làm mượt.
   Ngày gần đây trọng số cao hơn → nhạy với đợt xuất dồn dập.
3. **Độ lệch chuẩn** `dailyStdDev` của `daily[]` (population std) → đo biến động.
4. **daysLeft (trung tâm)** = `tồn / ewmaPerDay` (thay mean bằng EWMA — đây là nâng cấp lõi).
5. **Khoảng tin cậy ±1σ** (~68%):
   - Tiêu thụ nhanh: `rateHigh = ewmaPerDay + dailyStdDev` → `daysLeftLow = tồn / rateHigh`.
   - Tiêu thụ chậm: `rateLow = max(ewmaPerDay − dailyStdDev, ε)` → `daysLeftHigh = tồn / rateLow`.
6. **Điểm đặt hàng lại** (safety stock chuẩn ngành):
   `reorderPoint = ewmaPerDay·L + z·dailyStdDev·√L`, với `L = 3` ngày (thời gian nhập hàng về),
   `z = 1.28` (mức phục vụ ~90%). Nghĩa: nên nhập khi tồn ≤ mức này để không đứt hàng.
7. **Độ tin cậy** `confidence` ∈ [0,1] = `min(1, activeDays / 8)` với `activeDays` =
   số ngày có xuất > 0. Ít điểm dữ liệu → confidence thấp → UI nói rõ "dữ liệu chưa đủ".
8. **lowStock** = có tốc độ (`ewmaPerDay > 0`) **và** `tồn ≤ reorderPoint`
   (nguyên tắc hơn ngưỡng `daysLeft < 7` cũ), CỘNG trường hợp đã cạn sạch (tồn 0 + có lịch sử).

### 2.2. Bất biến giữ nguyên (không phá downstream)

- Giữ field cũ `avgPerDay` (mean phẳng) làm số **tham chiếu** hiển thị "trung bình".
- Giữ `daysLeft`, `lowStock`, `quantity`, `sku`, `itemName` → API + UI không vỡ hợp đồng.
- Thêm field mới: `ewmaPerDay`, `dailyStdDev`, `daysLeftLow`, `daysLeftHigh`,
  `reorderPoint`, `confidence`.
- Edge case cũ giữ nguyên hành vi: chưa xuất → `daysLeft null`, không lowStock;
  cạn sạch (tồn 0 + lịch sử) → `daysLeft 0`, lowStock true; export ngoài window bị bỏ.
- `computeForecasts` (action-plan.ts) là hàm KHÁC → không đụng.

## 3. Thay đổi cụ thể

**Backend:**
- [apps/backend/src/insights/forecast.ts](../apps/backend/src/insights/forecast.ts) — viết lại
  `computeForecast` theo 2.1; thêm helper thuần `ewma()`, `stdDev()`, `binDailyDemand()`.
  Mở rộng interface `ForecastResult`.
- [apps/backend/src/insights/__tests__/forecast.spec.ts](../apps/backend/src/insights/__tests__/forecast.spec.ts)
  — cập nhật test cũ (daysLeft nay theo EWMA) + thêm test khóa: EWMA nhạy xu hướng gần,
  reorderPoint, khoảng Low≤trung tâm≤High, confidence thấp khi ít dữ liệu, các edge case cũ.

**Frontend:**
- [apps/frontend/src/lib/insights-api.ts](../apps/frontend/src/lib/insights-api.ts) — bổ sung
  field mới vào `ForecastItem`.
- [apps/frontend/src/components/dashboard/insights-view.tsx](../apps/frontend/src/components/dashboard/insights-view.tsx)
  — `ForecastCard`/`DaysLeftBadge`: hiển thị **dải** "~X–Y ngày" thay vì 1 số, chip độ tin cậy
  (Cao/TB/Thấp), và gạch đầu dòng "Nên nhập khi tồn ≤ reorderPoint". Giữ sắp xếp ưu tiên hiện có.

## 4. Nghiệm thu

- `pnpm --filter @safestock/backend test` — forecast.spec khóa công thức mới, toàn bộ pass.
- `nest build` sạch; `frontend tsc --noEmit` exit 0.
- Seed sẵn 156+ giao dịch EXPORT 60 ngày (RICE-01 cạn) → mở Insights thấy dải tin cậy +
  điểm đặt lại thực tế, không phải số phẳng.

## 5. Câu trả lời khi giám khảo hỏi "AI ở đâu?"

"Phần này là **dự báo thống kê** (EWMA + độ lệch chuẩn → khoảng tin cậy + điểm đặt hàng lại
theo công thức safety-stock chuẩn ngành logistics), không phải phép chia trung bình. Chúng tôi
gọi đúng tên nó — không phóng đại thành deep learning — và nó chạy offline, kiểm chứng được
bằng unit test khóa công thức." (Trung thực = ghi điểm, đúng tinh thần "AI có trách nhiệm".)

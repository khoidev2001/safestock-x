# Báo cáo review tính năng và feature

**Dự án:** Ứng phó nhanh  
**Ngày review:** 2026-07-20  
**Phạm vi:** PRD, BUILD-PLAN, roadmap từng app, backend, frontend, AI service, mobile và kiểm thử hiện có  
**Loại review:** Read-only audit, không sửa source code

## 1. Kết luận tổng quan

Dự án chưa hoàn thiện toàn bộ feature.

- Backend đã triển khai phần lớn nghiệp vụ lõi và đủ nền tảng cho demo.
- Frontend đã có nhiều màn hình thật, nhưng một số luồng chỉ mới hiển thị hoặc chưa nối được giữa các vai trò.
- AI service đã có Gemini/Ollama, parse tình huống, giải thích, Action Plan và trợ lý kho; Claude và giải thích sự cố chuyên biệt chưa có.
- Mobile Expo chưa được scaffold; toàn bộ luồng QR, offline, camera và push notification chưa triển khai.
- Có lỗi contract frontend/backend, lỗ hổng phân quyền và rủi ro nhất quán dữ liệu cần xử lý trước khi gọi là MVP hoàn chỉnh.

Đánh giá hiện tại:

| Thành phần | Mức hoàn thiện thực tế |
|---|---|
| Backend | Demo-ready, chưa production-ready |
| Frontend web | Presentation-ready một phần, chưa workflow-ready |
| AI service | Đủ luồng AI chính, còn thiếu provider và safety hardening |
| Mobile | Chưa triển khai |
| Kiểm thử | Tốt ở rule/unit backend; thiếu integration, E2E và vận hành thật |

## 2. Phát hiện ưu tiên

### CRITICAL-01: WebSocket không xác thực

Notification và sensor gateway cho phép client tự khai role hoặc warehouse để join room. Không có xác thực JWT ở bước handshake và không kiểm tra role/kho từ token.

Tác động:

- Client ẩn danh có thể join room `role:ADMIN`, `role:RESCUE` hoặc `role:WAREHOUSE`.
- Client có thể theo dõi sensor event của kho bất kỳ nếu biết `warehouseId`.
- Dữ liệu thông báo nhiệm vụ và trạng thái kho có thể bị lộ.

Bằng chứng:

- [`notification.gateway.ts`](../apps/backend/src/notification/notification.gateway.ts)
- [`simulation.gateway.ts`](../apps/backend/src/simulation/simulation.gateway.ts)

### CRITICAL-02: UI hoàn vật tư gửi sai API contract

Frontend gửi:

```json
{
  "returnedOk": 1,
  "returnedDamaged": 0,
  "lost": 0
}
```

Backend yêu cầu:

```json
{
  "ok": 1,
  "damaged": 0,
  "lost": 0
}
```

Với `ValidationPipe`, thao tác hoàn vật tư từ web sẽ không qua validation.

Bằng chứng:

- [`dashboard-api.ts`](../apps/frontend/src/lib/dashboard-api.ts)
- [`loan/dto.ts`](../apps/backend/src/loan/dto.ts)

### HIGH-01: Warehouse scope chưa được áp dụng nhất quán

`assertBatchInScope` đang được dùng cho import, export, bulk export, adjust và reconcile. Tuy nhiên:

- Transfer không kiểm tra batch nguồn thuộc kho được phân công.
- Transfer không kiểm tra kệ đích thuộc kho được phép.
- Nhiều API đọc nhận trực tiếp warehouse/mission ID mà không đối chiếu scope người dùng.
- WAREHOUSE có thể thực hiện mission fulfillment bằng mission ID mà không kiểm tra kho được phân công.

Bằng chứng:

- [`warehouse-scope.ts`](../apps/backend/src/inventory/warehouse-scope.ts)
- [`inventory.service.ts`](../apps/backend/src/inventory/inventory.service.ts)
- [`inventory.controller.ts`](../apps/backend/src/inventory/inventory.controller.ts)
- [`mission.controller.ts`](../apps/backend/src/mission/mission.controller.ts)

### HIGH-02: Simulator và Incident dùng quyền quá rộng

Simulator chỉ yêu cầu JWT, không yêu cầu permission quản trị simulator. RESCUE cũng có thể phát event, chạy/pause/reset scenario và gián tiếp làm thay đổi Readiness hoặc sinh Incident.

Incident controller dùng `READINESS_VIEW` cho cả thao tác scan, acknowledge, assign và resolve. Đây là quyền xem nhưng đang được dùng cho thao tác thay đổi trạng thái.

Bằng chứng:

- [`simulation.controller.ts`](../apps/backend/src/simulation/simulation.controller.ts)
- [`incident.controller.ts`](../apps/backend/src/incident/incident.controller.ts)
- [`shared-types`](../packages/shared-types/src/index.ts)

### HIGH-03: Workflow liên vai trò chưa khép kín trên frontend

`missionId` chỉ được lưu trong state của trang hiện tại. Sau khi ADMIN tạo và dispatch mission:

- RESCUE đăng nhập ở phiên khác không có `missionId` để tải mission.
- Notification có `missionId` nhưng item thông báo không có hành động mở mission.
- Backend chưa có API danh sách mission theo role/trạng thái để tạo inbox công việc.
- WAREHOUSE gặp vấn đề tương tự khi nhận bước chuẩn bị kho.

Bằng chứng:

- [`mission-view.tsx`](../apps/frontend/src/components/mission/mission-view.tsx)
- [`notification-bell.tsx`](../apps/frontend/src/components/mission/notification-bell.tsx)
- [`mission-api.ts`](../apps/frontend/src/lib/mission-api.ts)

### HIGH-04: Một số workflow nhiều bước không atomic

Mission fulfillment thực hiện bulk export trước, sau đó mới cập nhật mission thành `READY`. Nếu bước cập nhật hoặc notification lỗi, tồn kho đã thay đổi nhưng mission vẫn ở trạng thái cũ.

Duyệt báo cáo tháng reconcile từng dòng trong vòng lặp, sau đó mới đổi report thành `APPROVED`. Nếu một dòng lỗi, các dòng trước có thể đã được áp dụng.

Bằng chứng:

- [`mission.service.ts`](../apps/backend/src/mission/mission.service.ts)
- [`report.service.ts`](../apps/backend/src/report/report.service.ts)

### MEDIUM-01: Quyền xem báo cáo không khớp frontend

WAREHOUSE có `REPORT_SUBMIT` nên gửi được báo cáo Excel. Frontend sau đó luôn gọi API danh sách báo cáo để hiển thị "Báo cáo đã gửi", nhưng backend chỉ cho `REPORT_APPROVE` gọi API này. WAREHOUSE sẽ nhận lỗi 403.

Bằng chứng:

- [`report-view.tsx`](../apps/frontend/src/components/dashboard/report-view.tsx)
- [`report.controller.ts`](../apps/backend/src/report/report.controller.ts)

### MEDIUM-02: Báo cáo tháng chưa xử lý đúng SKU có nhiều lô

Khi duyệt báo cáo, service tìm lô đầu tiên của SKU rồi ghi toàn bộ số lượng báo cáo vào lô đó. Nếu SKU có nhiều lô, các lô còn lại vẫn giữ số lượng cũ và tổng tồn có thể bị tăng sai.

Bằng chứng: [`report.service.ts`](../apps/backend/src/report/report.service.ts)

### MEDIUM-03: Tài liệu và roadmap chưa đồng bộ với source

- Frontend roadmap ghi FE-M Insights chưa làm nhưng `InsightsView` đã tồn tại và được gắn vào dashboard.
- Frontend roadmap ghi FE-G4 Chatbot chưa làm nhưng `AssistantView` đã tồn tại.
- README riêng của frontend và AI service vẫn ghi placeholder.
- Simulator có component trên Next.js nhưng chỉ đọc dữ liệu, chưa có control tương ứng FE-G2.

Bằng chứng:

- [`apps/frontend/ROADMAP.md`](../apps/frontend/ROADMAP.md)
- [`apps/frontend/README.md`](../apps/frontend/README.md)
- [`apps/ai-service/README.md`](../apps/ai-service/README.md)

## 3. Ma trận feature

| Feature | Backend | Frontend web | Mobile | Trạng thái |
|---|---|---|---|---|
| Auth access/refresh token | Có | Có login, refresh, route guard | Chưa | Một phần hoàn chỉnh |
| RBAC permission | Có | Ẩn một số UI theo role | Chưa | Có nhưng còn lỗ hổng scope |
| Audit 5W | Có | Có màn hậu kiểm | Chưa | Cơ bản hoàn chỉnh |
| Quản trị user | CRUD backend | Tạo, xem, xóa; chưa có sửa | Chưa | Một phần |
| Cấu trúc kho/khu/kệ/lô | Có | Xem cây kho và danh sách lô | Chưa | Một phần |
| Nhập/xuất QR | Có API | Chưa có UI quét/giao dịch | Chưa | Backend-only |
| Bulk export | Có, atomic theo batch list | Chưa có UI riêng | Chưa | Backend-only |
| Transfer | Có | Chưa có UI | Chưa | Có lỗi scope |
| Adjust thủ công | Có, audit + lý do | Chưa có UI | Chưa | Backend-only |
| Reconcile kiểm kê | Có | Có UI ghi đè | Chưa | Gần hoàn chỉnh |
| Mượn vật tư | Có | Chưa có UI tạo phiếu | Chưa | Backend-only |
| Hoàn vật tư | Có | Có UI nhưng sai contract | Chưa | Đang lỗi |
| Readiness 6 thành phần | Có | Có dashboard/breakdown | Chưa | Tốt |
| Readiness 4 cấp | Có | Có màu trạng thái | Chưa | Tốt |
| Readiness theo khu/kệ | Có API | Chưa hiển thị đầy đủ | Chưa | Một phần |
| Recommendation | Có | Có hiển thị | Chưa | Hoàn chỉnh cơ bản |
| Simulator scenario | Có 6 scenario | Next.js chưa có control đầy đủ | Chưa | Backend + sim.html |
| Realtime sensor | Có Socket.IO | Timeline polling/hiển thị | Chưa | Có nhưng WebSocket chưa an toàn |
| Loadcell transaction | Có | Không có UI cấu hình | Chưa | Một phần |
| RFID transaction | Chưa | Chưa | Chưa | Chưa làm |
| Incident rule engine | Có | Có danh sách/trạng thái | Chưa | Một phần |
| Z-score anomaly | Có + unit test | Có label | Chưa | Backend hoàn chỉnh |
| Predictive warning | Có + unit test | Có label | Chưa | Backend hoàn chỉnh |
| Incident evidence/timeline | Có API | Chưa có màn chi tiết | Chưa | Backend-only |
| Incident assign/explain | Có API | Chưa có UI | Chưa | Backend-only |
| Mission-to-Kit | Có rule, greedy, FEFO | Có form và kết quả | Chưa | Backend tốt, web một phần |
| Cụm kho cùng xã | Có | Có bản đồ kho | Chưa | Gần hoàn chỉnh |
| Geo/ETA | Haversine + Google fallback | Có map và ETA | Chưa | Gần hoàn chỉnh |
| Action Plan 8 mục | Rule + AI/template | Có màn hiển thị | Chưa | Hoàn chỉnh cơ bản |
| Workflow ADMIN/RESCUE/WAREHOUSE | Có API/state machine | Không mở được mission xuyên phiên | Chưa | Chưa khép kín |
| Notification DB | Có | Có chuông thông báo | Chưa | Có nhưng thiếu deep-link |
| Notification realtime | Có | Có Socket.IO client | Chưa | Có nhưng chưa xác thực |
| Forecast cạn kho | Có | Có InsightsView | Chưa | Hoàn chỉnh cơ bản |
| Expiry alert | Có | Có | Chưa | Hoàn chỉnh cơ bản |
| Rebalance cụm kho | Có | Có | Chưa | Hoàn chỉnh cơ bản |
| Weather alert | Có Open-Meteo fallback | Có | Chưa | Cần test vận hành mạng |
| Monthly insight report | Có AI/template | Có UI | Chưa | Một phần |
| Excel stock report | Có upload/approve/reject | Có UI | Chưa | Có lỗi quyền và multi-batch |
| Assistant hỏi đáp kho | Có snapshot + AI | Có chat UI | Chưa | Hoàn chỉnh cơ bản |
| Backup Supabase | Có BullMQ + pg_dump | Không cần UI | Không | Chưa verify môi trường thật |
| Gemini provider | Có | Thông qua backend | Không | Có |
| Ollama provider | Có | Thông qua backend | Không | Có |
| Claude provider | Chưa | Không | Không | Chưa làm |
| AI explain incident riêng | Chưa có endpoint AI riêng | Chưa | Chưa | Chưa làm |
| Voice mission | Không cần backend mới | Chưa | Chưa | Chưa làm |
| PDF report/warehouse health | Chưa | Chưa | Chưa | Chưa làm |
| Mobile scaffold/auth | Không áp dụng | Không áp dụng | Chưa | Chưa làm |
| Mobile QR/camera | API nền có một phần | Không áp dụng | Chưa | Chưa làm |
| Mobile offline-read | Không áp dụng | Không áp dụng | Chưa | Chưa làm |
| Mobile push notification | Backend device token chưa có | Không áp dụng | Chưa | Chưa làm |

## 4. Kết quả kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Backend unit test | 18/18 suites pass |
| Backend test case | 141/141 pass |
| Backend production build | Pass |
| Frontend TypeScript `tsc --noEmit` | Pass |
| Frontend `next build` | Treo tại `next build`, không có tiến triển; đã dừng process |
| AI Python syntax | Không phát hiện lỗi cú pháp trong lượt kiểm tra |
| Integration/E2E DB/API | Chưa có bằng chứng đầy đủ |
| WebSocket security test | Chưa có |
| Backup với Docker/Supabase thật | Chưa verify |
| Mobile build/device test | Không thể chạy vì chưa có source app |

Backend test hiện tập trung vào rule và hàm thuần: readiness, mission compute/workflow, geo, incident/anomaly, insights, RBAC map và env validation. Các module auth, inventory transaction, loan, report, notification, backup, assistant và admin chưa có coverage integration tương xứng.

## 5. Thứ tự xử lý đề xuất

### P0 - Chặn lỗi và rò rỉ dữ liệu

1. Xác thực JWT cho Socket.IO, lấy role và warehouse từ token thay vì payload client.
2. Sửa contract hoàn vật tư giữa frontend và backend.
3. Áp warehouse scope cho transfer, API đọc và mission fulfillment.
4. Tách permission simulator/incident manage khỏi permission xem Readiness.

### P1 - Khép workflow lõi

1. Thêm API danh sách mission theo role/trạng thái.
2. Cho notification mở trực tiếp mission bằng `missionId`.
3. Bảo đảm RESCUE và WAREHOUSE nhìn thấy nhiệm vụ sau khi đăng nhập ở phiên khác.
4. Gộp xuất kho + cập nhật mission vào workflow idempotent/transaction phù hợp.
5. Gộp duyệt báo cáo tháng vào transaction; xử lý đúng SKU nhiều lô.

### P2 - Hoàn thiện frontend nghiệp vụ

1. UI nhập, xuất, chuyển, bulk export và adjust.
2. UI tạo phiếu mượn và sửa luồng hoàn.
3. Simulator control trên Next.js.
4. Incident detail gồm evidence, timeline, assign và explanation.
5. Đồng bộ roadmap frontend với source hiện tại.

### P3 - Hoàn thiện deliverable

1. Điều tra nguyên nhân `next build` bị treo.
2. Bổ sung integration/E2E test cho các workflow chính.
3. Scaffold và triển khai Mobile F0-F4 nếu Mobile vẫn thuộc MVP.
4. Verify backup, Ollama offline và demo end-to-end trong môi trường thật.

## 6. Câu hỏi còn mở

1. Mobile có bắt buộc trong deliverable dự thi hay được chuyển sang hậu MVP?
2. WAREHOUSE được phép xem toàn bộ kho trong xã hay chỉ kho được gán?
3. Mission fulfillment do một kho điều phối toàn cụm hay từng kho chỉ xuất phần của mình?
4. Báo cáo Excel là tổng theo SKU hay chi tiết từng lô/hạn dùng?
5. Simulator có được phép cho RESCUE sử dụng trong bản demo hay chỉ ADMIN/WAREHOUSE?

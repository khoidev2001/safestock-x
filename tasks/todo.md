# Todo: Phạm vi PRD bắt buộc

- [x] P09.1 OSRM runtime + graph manifest/checksum + health/preflight
- [x] P09.2 Route snapshot/provenance + engine-down/NoRoute behavior
- [x] P09.3 ADMIN marker thôn/kho trên map
- [x] P09.4 Internet-off và continuity acceptance
- [x] M1.1 Android release profile/APK config
- [x] M1.2 SecureStore session + refresh/logout
- [x] M1.3 Offline-read cache + stale state
- [ ] M1.4 REPORTER/Lực lượng hiện trường retry/error/reference
- [ ] M1.5 Galaxy S23 Ultra device/LAN gate
- [x] W2.1 Export/adjust/transfer không dùng phần đang cho mượn; return không âm tồn
- [x] W2.2 Return hỏng tách số lượng NEEDS_CHECK và giữ đúng lineage
- [x] W2.3 Idempotency request cho inventory/loan mutation
- [x] W2.4 Tạo catalog/SKU/lô nhận hàng mới + hạn dùng/kệ + QR label
- [x] W2.5 Web import/export/bulk/transfer/adjust/reconcile/condition
- [x] W2.6 Web borrow/partial return + loading/error/empty đúng
- [x] W2.7 Organization/warehouse scope cho inventory/loan/audit
- [x] W2.8 Báo cáo kho xem được lịch sử gửi, không nuốt 403/5xx
- [ ] W2.9 API/browser/mobile acceptance workflow kho ngày thường
- [ ] W3 Incident/readiness/acknowledge/resolve/error workflows; không phân công lực lượng
- [x] M4 Mobile dashboard/readiness/alerts
- [x] M4 QR v1 + nhập tay
- [x] M4 Toàn bộ nghiệp vụ kho/loan trên mobile
- [x] A5 Forecast nhu cầu + mưa 72 giờ
- [x] A5 Semantic search vật tư local
- [x] A5 Bản tin AI đầu ngày
- [x] A5 Chuẩn hóa nhập liệu bằng embedding
- [ ] R6 Security, migrations, recovery, CI và full acceptance

## Hoàn thiện kho ngày thường — 2026-07-27

- [x] Idempotency fingerprint + reset form/requestId mỗi lần mở
- [x] Khóa đồng thời tình trạng lô với xuất/điều chỉnh/kiểm kê/điều chuyển
- [x] Preview báo cáo trước duyệt + lý do từ chối + scope liên tổ chức
- [x] Lịch sử giao dịch cho người vận hành
- [x] Error state kiểm kê
- [x] Điều chuyển liên kho cùng xã trên web và APK
- [x] Báo cáo kiểm kê tháng trên APK
- [x] Ledger snapshot kho nguồn/đích và backfill lịch sử cũ
- [x] Nhật ký gồm cả kiểm kê và thay đổi tình trạng
- [x] Chuyển liên kho: khóa quyền kho nguồn, cho phép kho đích cùng xã/đơn vị
- [x] Chặn báo cáo PENDING/APPROVED trùng kho-kỳ
- [x] APK nhập số đếm thực tế từng lô/kệ trước khi gửi báo cáo
- [ ] Nghiệm thu browser và Galaxy S23 Ultra qua LAN

## Khắc phục theo PM review — 2026-07-27

- [x] Readiness authorization theo actor + organization
- [x] Shelf lock invariant cho transfer/import/receive
- [x] Validation hạn dùng và tháng báo cáo
- [x] Kiểm kê chính xác theo batch/shelf, không phân bổ heuristic
- [x] QR giữ batch code và chọn đúng lô
- [x] Mobile ADMIN chọn kho rõ ràng, lưu lựa chọn theo user
- [x] Readiness retry/stale, audit/ledger và pagination hardening
- [x] Cache offline APK mã hóa AES-GCM bằng Android Keystore
- [x] Full automated verification + cập nhật điểm PM

## AI tham mưu điều phối — 2026-07-28

### Phase AI-0 — Contract và role

- [x] AI-0.1 Chuẩn hóa tên hiển thị Lực lượng hiện trường, giữ enum `RESCUE`
- [x] AI-0.2 Khóa contract provenance/analysis/assumption/delta/field intent
- [x] AI-0.3a Tra Google Maps và khóa danh mục nguồn địa danh/tuyến What-if V1
- [x] AI-0.3a2 Tra 7 UBND xã và đủ 17 Nhà văn hóa thôn; ghi rõ 5 verified/12 unresolved
- [x] AI-0.3b Đưa geo-reference registry có version vào runtime, map-match route
- [x] AI-0.3c Chuyển kho xã sang UBND, thêm 6 UBND external metadata, seed 5 Nhà văn hóa và test
- [x] AI-0.3d Giữ 12 kho thôn chưa xác minh ở null; ADMIN ghim sau, không lấy điểm trùng tên
- [x] AI-0.C Review golden fixture Phước Lộc và build shared-types

### Phase AI-1 — Persistence và API

- [x] AI-1.1 Thêm schema additive `MissionAnalysisSnapshot` và `MissionFieldUpdate`, generate/push DB
- [x] AI-1.2 Thêm permission/API analyses, simulations và field-updates (source + focused tests + DB activation)
- [ ] AI-1.C Chạy migration clone + RBAC/IDOR contract tests

### Phase AI-2 — Phân tích tình huống

- [x] AI-2.1 AI trích xuất fact/provenance/missing/conflict/câu hỏi ưu tiên (source + pytest)
- [x] AI-2.2 Tách coordination snapshot service thuần đọc, không mutation
- [x] AI-2.3 Compose và lưu bản phân tích baseline có version/provenance
- [x] AI-2.4 Web ADMIN hiển thị đủ 10 phần theo PRD 4.8 (source + lint)
- [x] AI-2.5 Khóa gợi ý liên xã availability `UNKNOWN`, không đọc tồn ngoài xã
- [ ] AI-2.C Chạy câu mẫu Word và xác minh không có claim/số vô căn cứ

### Phase AI-3 — What-if

- [x] AI-3.1 Parse giả định tự nhiên theo whitelist, unknown trả unresolved
- [x] AI-3.2 Simulation snapshot/fingerprint/delta/idempotency, không apply trực tiếp
- [x] AI-3.3 Web ADMIN hiển thị assumptions và baseline-vs-simulation (source + lint)
- [ ] AI-3.C DB before/after giống nhau cho operational tables

### Phase AI-4 — Trợ lý hiện trường

- [x] AI-4.1 Field-update API/evidence timeline đúng RBAC và idempotency (source + focused tests)
- [x] AI-4.2 APK text/voice → xem/sửa/xác nhận → gửi evidence (source; device/LAN gate còn mở)
- [x] AI-4.3 Intent extraction + What-if sơ bộ, không tự khóa route/replan (source + focused tests)
- [ ] AI-4.C Galaxy S23 Ultra voice/permission/LAN retry gate

### Phase AI-5 — Vòng thích ứng

- [x] AI-5.1 ADMIN thấy field update, delta và deep-link sau F5/relogin (source + state/security tests)
- [x] AI-5.2 Fallback/observability/redaction không log raw audio/PII
- [ ] AI-5.C Full multi-role adaptive loop qua UI độc lập

### Phase AI-6 — Hardening và nghiệm thu

- [x] AI-6.1 Prompt injection/number/tool/RBAC/concurrency automated gates
- [ ] AI-6.2 Browser + Galaxy S23 Ultra + private-LAN chạy hai lần
- [ ] AI-6.C Cập nhật PRD/checklist/bằng chứng chỉ sau acceptance thật

### Loại khỏi phạm vi

- [x] Không phân tích ảnh/video
- [x] Không phân công đội/cá nhân
- [x] Không theo dõi GPS liên tục
- [x] AI không tự duyệt/dispatch
- [x] AI không tự liên hệ xã khác
- [x] Không kiểm tra tồn kho xã khác

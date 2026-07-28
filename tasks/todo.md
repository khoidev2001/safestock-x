# Todo: Phạm vi PRD bắt buộc

- [x] P09.1 OSRM runtime + graph manifest/checksum + health/preflight
- [x] P09.2 Route snapshot/provenance + engine-down/NoRoute behavior
- [x] P09.3 ADMIN marker thôn/kho trên map
- [x] P09.4 Internet-off và continuity acceptance
- [x] M1.1 Android release profile/APK config
- [x] M1.2 SecureStore session + refresh/logout
- [x] M1.3 Offline-read cache + stale state
- [ ] M1.4 REPORTER/RESCUE retry/error/reference
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
- [ ] W3 Incident/readiness/permission/error workflows
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

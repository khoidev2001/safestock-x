---
title: "P0-4 Mission prepare atomic"
date: 2026-07-23
type: technical-journal
status: completed
authority: historical-only
---

# P0-4 Mission prepare atomic

## Context

Journal này ghi lại lịch sử hoàn tất P0-4 ngày 2026-07-23, không phải nguồn authority hiện hành. Trước thay đổi, xuất kho và chuyển mission sang `READY` nằm ở hai transaction khác nhau; lỗi giữa hai bước hoặc request đồng thời có thể gây trừ kho lặp, lệch trạng thái và thiếu kiểm soát scope kho từ JWT.

## What Happened

1. Tách `bulkExportInTx()` để caller dùng transaction có sẵn; giữ `bulkExport()` làm wrapper tương thích cho caller cũ.
2. Mở rộng kiểm tra scope để chạy với `Prisma.TransactionClient`, truyền `warehouseId` từ JWT xuống luồng prepare.
3. Đưa conditional claim `PENDING_WAREHOUSE -> READY`, kiểm tra mission/batch và toàn bộ xuất kho vào cùng một Prisma transaction. Retry hoặc request thua race đọc lại `READY` và không xuất/audit/notify lần hai.
4. Chuyển readiness recalculation và notification sang hậu commit, theo best-effort; bổ sung unit test và PostgreSQL E2E cho rollback, concurrency, retry, IDOR/scope và các race state-machine liên quan.
5. Cập nhật plan/checklist sau khi đủ bằng chứng. Không có schema/migration, seed hay reset dữ liệu.

## Key Decisions/Tradeoffs

- Dùng conditional `updateMany` làm claim trong transaction thay vì thêm idempotency key hoặc schema mới; giảm phạm vi nhưng gắn semantics idempotency với state `READY`.
- Sắp xếp batch trước khi mutate để giảm nguy cơ deadlock; vẫn trả kết quả theo thứ tự input.
- Hậu xử lý không giữ lock database và không đảo transaction đã commit. Đổi lại, notification/readiness có thể degrade độc lập.
- Notification/readiness chưa có outbox; đây là non-goal đã chấp nhận cho P0-4, không phải cam kết delivery bền vững sau commit.

## Verification

- Backend Jest: **215/215**; PostgreSQL E2E: **8/8**.
- Backend build và `git diff --check`: pass.
- Reviewer: không có finding.
- Fixture E2E `missions/requirements/batches`: **0/0/0 -> 0/0/0** sau cleanup cô lập; không seed/reset.

## Residual Risks

- Không có outbox cho notification/readiness hậu commit; retry nghiệp vụ vẫn idempotent nhưng delivery hậu xử lý không có bảo đảm bền vững.
- Security audit ghi nhận dependency advisories có sẵn từ trước, ngoài phạm vi mission P0-4; journal này không thay thế việc triage ở owner hiện hành.

## Next

- Tiếp tục theo checklist/plan authority hiện hành; không dùng journal này để suy trạng thái backlog sau thời điểm ghi.
- AgentWiki publish/share đã bỏ qua vì controller không tìm thấy CLI/MCP được cấu hình trong runtime; không cài đặt hoặc network-discover.
- Câu hỏi chưa giải quyết: không có.

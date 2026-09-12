-- Thêm cột "returnAcceptedQuantity" cho bảng InterCommuneLoan.
--
-- VÌ SAO CÓ FILE NÀY: schema.prisma đã khai báo cột này và inter-commune-loan.service.ts
-- đã đọc/ghi nó, nhưng cơ sở dữ liệu chưa có. Hệ quả là MỌI lần mở tab "Mượn, trả"
-- đều ném PrismaClientKnownRequestError ngay ở list(), web hiện "Internal server error".
--
-- KHÔNG dùng `prisma db push` để thay thế file này. Trên cơ sở dữ liệu hiện tại,
-- `migrate diff` cho ra kịch bản có DROP TABLE "RescueSupplyHolding", xoá 7 cột của
-- "MissionRequirement", 2 cột của "Mission" và 3 enum — nghĩa là mất dữ liệu thật.
-- Cột này là phần thêm thuần tuý, chạy riêng thì không đụng gì tới phần còn lại.
--
-- Chạy lại nhiều lần vô hại: đã có sẵn thì bỏ qua.
--
-- Mặc định 0 là đúng nghĩa nghiệp vụ: khoản mượn cũ chưa từng ghi nhận hàng về,
-- nên phần đã nhận lại bằng 0, không phải bằng returnedQuantity.

ALTER TABLE "InterCommuneLoan"
  ADD COLUMN IF NOT EXISTS "returnAcceptedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Tạo riêng bảng PushDevice cho thông báo đẩy.
--
-- KHÔNG dùng `prisma db push` để thay thế file này. Trên cơ sở dữ liệu hiện tại,
-- `migrate diff` cho ra một kịch bản có DROP TABLE "RescueSupplyHolding", xoá 7 cột
-- của "MissionRequirement", 2 cột của "Mission" và 3 enum — nghĩa là mất dữ liệu.
-- Bảng này là phần thêm thuần tuý, chạy riêng thì không đụng gì tới phần còn lại.
--
-- Chạy lại nhiều lần vô hại: đã có sẵn thì bỏ qua.

CREATE TABLE IF NOT EXISTS "PushDevice" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "token"          TEXT NOT NULL,
    "platform"       TEXT NOT NULL DEFAULT 'android',
    "deviceName"     TEXT,
    "lastSeenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureCount"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- Mỗi token FCM chỉ thuộc về một bản ghi: `registerDevice` upsert theo cột này,
-- không có ràng buộc duy nhất thì một máy đăng nhập lại sẽ đẻ ra bản ghi trùng
-- và người dùng nghe chuông hai lần.
CREATE UNIQUE INDEX IF NOT EXISTS "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX IF NOT EXISTS "PushDevice_userId_idx" ON "PushDevice"("userId");
CREATE INDEX IF NOT EXISTS "PushDevice_organizationId_idx" ON "PushDevice"("organizationId");

-- Xoá tài khoản là gỡ luôn máy của họ khỏi danh sách nhận. Không có CASCADE thì
-- token ở lại và người mượn máy sau vẫn nghe lệnh điều phối không thuộc về mình.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PushDevice_userId_fkey'
  ) THEN
    ALTER TABLE "PushDevice"
      ADD CONSTRAINT "PushDevice_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

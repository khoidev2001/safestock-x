import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveEnvFilePaths } from "../src/config/env-file-path";

config({ path: resolveEnvFilePaths() });

const prisma = new PrismaClient();

/**
 * Đánh lại số hiệu nhiệm vụ theo đúng thứ tự tạo.
 *
 * Cột `missionNo` được thêm vào một bảng ĐÃ CÓ DỮ LIỆU bằng `ALTER TABLE ... SERIAL`.
 * Postgres cấp số cho các dòng cũ theo thứ tự VẬT LÝ trong heap, không theo thời
 * gian tạo — mà dòng nào từng bị cập nhật thì đã bị dời xuống cuối heap. Kết quả:
 * 93 trên 104 nhiệm vụ có số hiệu không khớp thứ tự tạo, nên danh sách xếp "mới
 * nhất trước" hiện ra số hiệu nhảy loạn và người trực không đọc được gì từ nó.
 *
 * Chỉ sửa DỮ LIỆU CŨ. Nhiệm vụ tạo từ nay lấy số từ sequence ngay lúc chèn nên số
 * hiệu và thời gian tạo luôn cùng chiều — chạy script này lần hai không đổi gì.
 *
 * Ba bước trong MỘT giao dịch:
 *  1. Dời tạm mọi số ra vùng cao. Gán thẳng số mới sẽ đụng ràng buộc unique ngay
 *     giữa chừng, vì số đích của dòng này đang là số hiện tại của dòng khác.
 *  2. Gán số mới theo thứ tự `createdAt` tăng dần.
 *  3. Kéo sequence lên quá số lớn nhất, nếu không lượt tạo tiếp theo xin đúng một
 *     số vừa dùng và bị từ chối vì trùng.
 */
async function main() {
  const mismatch = await prisma.$queryRaw<{ mismatched_rows: bigint }[]>`
    WITH x AS (
      SELECT row_number() OVER (ORDER BY "createdAt", "missionNo") AS theo_thoi_gian,
             row_number() OVER (ORDER BY "missionNo") AS theo_so_hieu
      FROM "Mission")
    SELECT count(*) FILTER (WHERE theo_thoi_gian <> theo_so_hieu) AS mismatched_rows FROM x`;
  const mismatchedBefore = Number(mismatch[0]?.mismatched_rows ?? 0);
  if (mismatchedBefore === 0) {
    console.log("Số hiệu nhiệm vụ đã khớp thứ tự tạo — không cần đánh lại.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT max("missionNo") AS max FROM "Mission"`;
    const shift = (max ?? 0) + 1;
    await tx.$executeRaw`UPDATE "Mission" SET "missionNo" = "missionNo" + ${shift}`;
    await tx.$executeRaw`
      WITH xep AS (
        SELECT id, row_number() OVER (ORDER BY "createdAt", "missionNo") AS so_moi
        FROM "Mission")
      UPDATE "Mission" m SET "missionNo" = xep.so_moi FROM xep WHERE m.id = xep.id`;
    // `setval` là một SELECT nên phải đi qua $queryRaw; $executeRaw dành cho lệnh
    // không trả dòng và sẽ báo lỗi ở đây.
    await tx.$queryRaw`
      SELECT setval('"Mission_missionNo_seq"', (SELECT max("missionNo") FROM "Mission"))`;
  });

  const total = await prisma.mission.count();
  console.log(
    `Đã đánh lại số hiệu cho ${total} nhiệm vụ theo thứ tự tạo (trước đó ${mismatchedBefore} dòng lệch).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

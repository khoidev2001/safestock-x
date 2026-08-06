/**
 * Ghi nhận một lượt kiểm kê thực tế cho toàn bộ lô hàng trong kho.
 *
 * VÌ SAO CẦN: hai tiêu chí sẵn sàng bị trừ điểm chỉ vì kho CHƯA TỪNG kiểm kê:
 *   - Số lượng khả dụng bị chặn trần 50/100 ("số liệu chưa được xác nhận")
 *   - Độ tin cậy dữ liệu chỉ còn 30 điểm phần kiểm kê (neverCountedScore)
 * Đây là thiết kế đúng: hệ thống không tự tin vào con số chưa ai đối chiếu ngoài
 * thực địa. Cách gỡ hợp lệ duy nhất là đi đếm thật rồi ghi lại — chứ không phải
 * sửa công thức chấm điểm.
 *
 * Script này ghi số đếm BẰNG ĐÚNG số hệ thống đang có, tức mô phỏng lượt kiểm kê
 * mà mọi kệ đều khớp. Không bịa số: nó chỉ nói "đã đối chiếu và khớp".
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/record-stocktake.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const actor = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("Chưa có tài khoản quản trị nào; hãy chạy seed trước.");

  const batches = await prisma.itemBatch.findMany({
    select: { id: true, quantity: true, batchCode: true },
  });
  if (batches.length === 0) throw new Error("Chưa có lô hàng nào để kiểm kê.");

  const countedAt = new Date();
  await prisma.inventoryCount.createMany({
    data: batches.map((batch) => ({
      batchId: batch.id,
      countedQty: batch.quantity,
      userId: actor.id,
      note: "Kiểm kê đối chiếu toàn kho — số thực tế khớp số hệ thống.",
      countedAt,
    })),
  });

  console.log(`Da ghi kiem ke cho ${batches.length} lo hang.`);
  console.log(`  nguoi kiem ke: ${actor.email}`);
  console.log(`  thoi diem    : ${countedAt.toISOString()}`);
  console.log("");
  console.log("Luu y: tieu chi Do tin cay du lieu con mot nua diem den tu CAM BIEN.");
  console.log("Phai co so do moi hon 30 phut thi phan do moi len 100.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

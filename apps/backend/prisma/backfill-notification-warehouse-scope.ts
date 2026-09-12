/**
 * Gắn địa chỉ KHO cho những thông báo nhiệm vụ cũ gửi cho vai kho.
 *
 * Trước bản vá, thông báo "chuẩn bị vật tư" chỉ được đánh địa chỉ theo tổ chức và
 * vai, nên mọi kho trong xã đều đọc được — nhiệm vụ chỉ huy động kho thôn Long
 * Châu vẫn nổ chuông ở kho Đồng Xuân và kho Tân Bình. Bản vá gửi đúng kho kể từ
 * lần phát hành TIẾP THEO; những bản ghi đã nằm sẵn trong cơ sở dữ liệu thì vẫn
 * không ghi kho, và thông báo không ghi kho được hiểu là tin chung của cả xã —
 * tức là chúng còn rò đúng như cũ.
 *
 * Script này đọc phiếu chuẩn bị của từng nhiệm vụ để biết kho nào thật sự có phần
 * việc, rồi:
 *   - đúng MỘT kho tham gia: ghi thẳng địa chỉ kho đó vào bản ghi cũ;
 *   - NHIỀU kho tham gia: tách thành mỗi kho một bản sao, rồi xoá bản gốc không
 *     địa chỉ — một hàng không mang được hai địa chỉ, mà giữ lại bản gốc thì nó
 *     vẫn là tin chung và mọi kho vẫn đọc được.
 *
 * Chạy lại nhiều lần cũng an toàn: lượt sau không còn bản ghi nào thiếu địa chỉ
 * để mà sửa.
 *
 *   pnpm --filter @safestock/backend backfill:notification-warehouse-scope
 */
import { NotificationKind, PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Chỉ những loại thông báo nói về PHẦN VIỆC CỦA MỘT KHO.
 *
 * Cố ý không đụng tới các loại khác: một thông báo vai kho không nằm trong danh
 * sách này có thể là tin chung thật, và gắn địa chỉ nhầm là giấu tin khỏi người
 * đáng được đọc — hỏng theo chiều ngược lại, im lặng hơn và khó thấy hơn.
 */
const WAREHOUSE_TASK_KINDS: NotificationKind[] = [
  NotificationKind.MISSION_ASSIGNED,
  NotificationKind.RESCUE_CONFIRMED,
  NotificationKind.MISSION_REJECTED,
  NotificationKind.MISSION_CANCELLED,
];

async function main() {
  const orphans = await prisma.notification.findMany({
    where: {
      recipientRole: UserRole.WAREHOUSE,
      warehouseId: null,
      missionId: { not: null },
      kind: { in: WAREHOUSE_TASK_KINDS },
    },
  });

  let addressed = 0;
  let split = 0;
  let skipped = 0;

  for (const notification of orphans) {
    const missionId = notification.missionId as string;
    const preparations = await prisma.missionWarehousePreparation.findMany({
      where: { missionId },
      select: { warehouseId: true },
    });
    const warehouseIds = preparations.map((preparation) => preparation.warehouseId);

    if (warehouseIds.length === 0) {
      // Không biết kho nào có việc thì không đoán: để nguyên làm tin chung, đúng
      // như nó đang được hiểu hôm nay.
      skipped += 1;
      continue;
    }

    if (warehouseIds.length === 1) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { warehouseId: warehouseIds[0] },
      });
      addressed += 1;
      continue;
    }

    const { id: _id, ...fields } = notification;
    await prisma.$transaction([
      prisma.notification.createMany({
        data: warehouseIds.map((warehouseId) => ({ ...fields, warehouseId })),
      }),
      prisma.notification.delete({ where: { id: notification.id } }),
    ]);
    split += 1;
  }

  console.log(
    [
      `Thông báo kho thiếu địa chỉ: ${orphans.length}`,
      `Đã gắn địa chỉ: ${addressed}`,
      `Đã tách theo nhiều kho: ${split}`,
      `Bỏ qua (không có phiếu chuẩn bị nào): ${skipped}`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

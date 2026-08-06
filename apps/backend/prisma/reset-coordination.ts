/**
 * Dọn sạch mọi kế hoạch điều phối để diễn tập lại từ đầu, GIỮ NGUYÊN kho, tồn kho,
 * người dùng, thôn đã ghim và toạ độ trên bản đồ.
 *
 * Khác `pnpm be:db`: lệnh đó dựng lại toàn bộ cơ sở dữ liệu, cuốn theo cả toạ độ
 * thôn đã ghim tay lẫn tài khoản đã đổi tên. Ở đây chỉ đụng đúng nhánh nhiệm vụ.
 *
 * Vật tư đã xuất thì hoàn lại: nếu có nhiệm vụ nào đã tới bước kho chuẩn bị, số
 * lượng đã trừ khỏi lô hàng được cộng trả trước khi xoá dấu vết. Không hoàn thì
 * tồn kho hụt vĩnh viễn mà không còn nhiệm vụ nào giải thích vì sao — lần diễn tập
 * sau sẽ tính nhu cầu trên một kho nghèo hơn thực tế.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/reset-coordination.ts
 */
import { PrismaClient, TransactionType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = {
    mission: await prisma.mission.count(),
    snapshot: await prisma.missionAnalysisSnapshot.count(),
    requirement: await prisma.missionRequirement.count(),
    fieldUpdate: await prisma.missionFieldUpdate.count(),
    preparation: await prisma.missionWarehousePreparation.count(),
    warehouseRequest: await prisma.missionWarehouseRequest.count(),
    incident: await prisma.incident.count(),
  };
  console.log("Truoc khi don:", before);

  await prisma.$transaction(async (tx) => {
    // 1. Hoan vat tu da xuat ve dung lo hang cu.
    //
    // Bang giao dich khong co cot missionId; nhiem vu duoc ghi vao `note`. Co HAI
    // duong xuat kho, moi duong mot tien to: xuat ca nhiem vu ghi `Nhiem vu <id>`
    // (mission.service.prepareByWarehouse), con xuat theo tung SKU ghi `Yeu cau
    // vat tu <id>` (mission-warehouse-request.service.prepare). Bo sot duong thu
    // hai thi ton kho hut vinh vien ma khong con nhiem vu nao giai thich.
    const missionNote = {
      OR: [{ note: { startsWith: "Nhiệm vụ " } }, { note: { startsWith: "Yêu cầu vật tư " } }],
    };
    const outbound = await tx.inventoryTransaction.findMany({
      where: { AND: [missionNote], type: TransactionType.EXPORT },
      select: { batchId: true, quantity: true },
    });
    for (const move of outbound) {
      await tx.itemBatch.update({
        where: { id: move.batchId },
        data: { quantity: { increment: move.quantity } },
      });
    }
    if (outbound.length > 0) {
      console.log(`Da hoan ${outbound.length} luot xuat kho ve lo hang.`);
    }

    // 2. Xoa tu la ve goc de khong vuong khoa ngoai.
    await tx.inventoryTransaction.deleteMany({ where: missionNote });
    await tx.notification.deleteMany({ where: { missionId: { not: null } } });
    await tx.missionAnalysisSnapshot.deleteMany({});
    await tx.missionFieldUpdate.deleteMany({});
    await tx.missionRequirement.deleteMany({});
    await tx.missionWarehousePreparation.deleteMany({});
    await tx.missionWarehouseRequest.deleteMany({});
    await tx.mission.deleteMany({});

    // 3. Bao cao su co da sinh ra nhiem vu: xoa theo, khong de bao cao mo coi.
    await tx.incidentEvidence.deleteMany({});
    await tx.incidentAction.deleteMany({});
    await tx.incident.deleteMany({});
  });

  const after = {
    mission: await prisma.mission.count(),
    snapshot: await prisma.missionAnalysisSnapshot.count(),
    requirement: await prisma.missionRequirement.count(),
    incident: await prisma.incident.count(),
    // Doi chieu: nhung thu PHAI con nguyen.
    warehouse: await prisma.warehouse.count(),
    itemBatch: await prisma.itemBatch.count(),
    hamletDaGhim: await prisma.hamlet.count({ where: { lat: { not: null } } }),
    user: await prisma.user.count(),
  };
  console.log("Sau khi don:", after);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

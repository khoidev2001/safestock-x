/**
 * Dọn sạch mọi dấu vết của một lượt chạy thử, để diễn tập lại từ đầu.
 *
 * GIỮ NGUYÊN: kho, khu, kệ, thiết bị IoT, tồn kho, toạ độ thôn đã ghim, tài khoản.
 * XOÁ: nhiệm vụ điều phối, sự cố, số liệu cảm biến, thông báo, thư cảnh báo.
 *
 * Khác `pnpm be:db`: lệnh đó dựng lại toàn bộ cơ sở dữ liệu, cuốn theo cả toạ độ
 * thôn ghim tay, tài khoản đã đổi tên lẫn tài khoản riêng của app IoT.
 *
 * Vật tư đã xuất được hoàn lại đúng lô. Không hoàn thì tồn kho hụt vĩnh viễn mà
 * không còn nhiệm vụ nào giải thích vì sao — lượt diễn tập sau sẽ tính nhu cầu
 * trên một kho nghèo hơn thực tế.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/reset-demo-data.ts
 */
import { PrismaClient, TransactionType } from "@prisma/client";

const prisma = new PrismaClient();

/** Hai đường xuất kho, mỗi đường một tiền tố ghi chú; bỏ sót là tồn kho hụt. */
const MISSION_EXPORT_NOTE = {
  OR: [{ note: { startsWith: "Nhiệm vụ " } }, { note: { startsWith: "Yêu cầu vật tư " } }],
};

async function main() {
  const before = {
    nhiemVu: await prisma.mission.count(),
    suCo: await prisma.incident.count(),
    loSoLieu: await prisma.sensorSubmission.count(),
    suKienCamBien: await prisma.sensorEvent.count(),
    thongBao: await prisma.notification.count(),
    thuCanhBao: await prisma.alertEmailOutbox.count(),
  };
  console.log("Truoc khi don:", before);

  await prisma.$transaction(async (tx) => {
    // 1. Hoàn vật tư đã xuất về đúng lô hàng.
    const outbound = await tx.inventoryTransaction.findMany({
      where: { AND: [MISSION_EXPORT_NOTE], type: TransactionType.EXPORT },
      select: { batchId: true, quantity: true },
    });
    for (const move of outbound) {
      await tx.itemBatch.update({
        where: { id: move.batchId },
        data: { quantity: { increment: move.quantity } },
      });
    }
    if (outbound.length > 0) console.log(`Da hoan ${outbound.length} luot xuat kho ve lo hang.`);
    await tx.inventoryTransaction.deleteMany({ where: MISSION_EXPORT_NOTE });

    // 2. Nhiệm vụ điều phối — xoá từ lá về gốc để không vướng khoá ngoại.
    await tx.missionAnalysisSnapshot.deleteMany({});
    await tx.missionFieldUpdate.deleteMany({});
    await tx.missionRequirement.deleteMany({});
    await tx.missionWarehousePreparation.deleteMany({});
    await tx.missionWarehouseRequest.deleteMany({});
    await tx.mission.deleteMany({});

    // 3. Sự cố và thư cảnh báo. AlertEmailOutbox có onDelete: Cascade theo sự cố,
    //    nhưng xoá tường minh trước cho rõ ý và không phụ thuộc thứ tự cascade.
    await tx.alertEmailOutbox.deleteMany({});
    await tx.incidentEvidence.deleteMany({});
    await tx.incidentAction.deleteMany({});
    await tx.incident.deleteMany({});

    // 4. Số liệu cảm biến: sự kiện trước, lô sau (sự kiện trỏ vào lô).
    await tx.sensorEvent.deleteMany({});
    await tx.sensorSubmission.deleteMany({});
    // Thiết bị vẫn còn, chỉ trả về trạng thái "chưa từng gửi số liệu" — đúng như
    // lúc mới cài đặt, để lượt thử sau bắt đầu từ số 0 thật.
    await tx.virtualDevice.updateMany({ data: { lastSeenAt: null, online: true } });

    // 5. Thông báo: xoá hết, kể cả thông báo sự cố không gắn nhiệm vụ nào.
    await tx.notification.deleteMany({});
  });

  const after = {
    nhiemVu: await prisma.mission.count(),
    suCo: await prisma.incident.count(),
    loSoLieu: await prisma.sensorSubmission.count(),
    suKienCamBien: await prisma.sensorEvent.count(),
    thongBao: await prisma.notification.count(),
    thuCanhBao: await prisma.alertEmailOutbox.count(),
    // Đối chiếu: những thứ PHẢI còn nguyên.
    kho: await prisma.warehouse.count(),
    thietBi: await prisma.virtualDevice.count(),
    loHang: await prisma.itemBatch.count(),
    thonDaGhim: await prisma.hamlet.count({ where: { lat: { not: null } } }),
    taiKhoan: await prisma.user.count(),
  };
  console.log("Sau khi don:", after);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

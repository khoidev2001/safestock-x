import { MissionStatus, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveEnvFilePaths } from "../src/config/env-file-path";
import {
  UNEXPORTED_REQUEST_STATUSES,
  isRequestExported,
} from "../src/mission/mission-request-status";

config({ path: resolveEnvFilePaths() });
const prisma = new PrismaClient();

/**
 * Chữa các nhiệm vụ bị KẸT vì lỗi đếm tiến độ kho.
 *
 * Phép đếm cũ hỏi "yêu cầu nào khác PREPARED thì kho còn nợ", mà một yêu cầu vừa
 * được người đi lấy ký nhận đã chuyển sang PICKED_UP. Kho soạn xong món 1, có
 * người ký nhận ngay, rồi kho soạn nốt món 2 — lúc chốt, món 1 vẫn bị đếm là còn
 * nợ. Hậu quả: dòng "tiến độ kho" đứng ở 0/N dù kho đã xuất hết, và nhiệm vụ kẹt
 * vĩnh viễn ở PENDING_WAREHOUSE nên đội hiện trường không bao giờ đóng được.
 *
 * Mã đã sửa, nhưng phần đã hỏng thì KHÔNG tự lành: dấu "kho đã chuẩn bị xong"
 * chỉ được ghi đúng một lần, ngay lúc kho bấm xuất món cuối. Script này tính lại
 * từ chính các yêu cầu vật tư — nguồn sự thật duy nhất về việc hàng đã rời kho.
 *
 * MẶC ĐỊNH CHỈ XEM. Thêm `--sua` để ghi thật.
 */
const applyChanges = process.argv.includes("--sua");

async function main() {
  const missions = await prisma.mission.findMany({
    where: { status: { notIn: [MissionStatus.CANCELLED, MissionStatus.REJECTED] } },
    include: {
      warehousePreparations: true,
      warehouseRequests: {
        select: {
          warehouseId: true,
          status: true,
          preparedAt: true,
          preparedByUserId: true,
        },
      },
    },
    orderBy: { missionNo: "asc" },
  });

  const preparationFixes: { missionNo: number; warehouseId: string; preparedAt: Date }[] = [];
  const statusFixes: number[] = [];

  for (const mission of missions) {
    if (mission.warehouseRequests.length === 0) continue;

    for (const preparation of mission.warehousePreparations) {
      if (preparation.preparedAt) continue;
      const warehouseRequests = mission.warehouseRequests.filter(
        (request) => request.warehouseId === preparation.warehouseId,
      );
      if (warehouseRequests.length === 0 || !warehouseRequests.every((request) => isRequestExported(request.status))) {
        continue;
      }
      // Lấy đúng mốc kho xuất xong món cuối, không lấy giờ chạy script: dòng thời
      // gian của nhiệm vụ phải kể lại chuyện đã xảy ra, không phải chuyện vừa vá.
      const lastPreparedAt = warehouseRequests
        .map((request) => request.preparedAt)
        .filter((at): at is Date => at !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (!lastPreparedAt) continue;
      const preparedByUserId =
        warehouseRequests.find((request) => request.preparedAt?.getTime() === lastPreparedAt.getTime())
          ?.preparedByUserId ?? null;

      preparationFixes.push({
        missionNo: mission.missionNo,
        warehouseId: preparation.warehouseId,
        preparedAt: lastPreparedAt,
      });
      if (applyChanges) {
        await prisma.missionWarehousePreparation.updateMany({
          where: { missionId: mission.id, warehouseId: preparation.warehouseId, preparedAt: null },
          data: { preparedAt: lastPreparedAt, preparedByUserId: preparedByUserId },
        });
      }
    }

    const hasUnexportedRequest = mission.warehouseRequests.some((request) =>
      (UNEXPORTED_REQUEST_STATUSES as readonly string[]).includes(request.status),
    );
    if (!hasUnexportedRequest && mission.status === MissionStatus.PENDING_WAREHOUSE) {
      statusFixes.push(mission.missionNo);
      if (applyChanges) {
        await prisma.mission.updateMany({
          where: { id: mission.id, status: MissionStatus.PENDING_WAREHOUSE },
          data: { status: MissionStatus.READY },
        });
      }
    }
  }

  const prefix = applyChanges ? "Đã sửa" : "Sẽ sửa (chạy lại với --sua để ghi)";
  console.log(`${prefix}: ${preparationFixes.length} dấu "kho đã chuẩn bị xong" bị thiếu.`);
  for (const item of preparationFixes) {
    console.log(
      `  · Nhiệm vụ số ${item.missionNo} — kho ${item.warehouseId} — xuất xong lúc ${item.preparedAt.toISOString()}`,
    );
  }
  console.log(`${prefix}: ${statusFixes.length} nhiệm vụ kẹt ở "chờ kho" đáng lẽ đã sẵn sàng giao.`);
  for (const missionNo of statusFixes) {
    console.log(`  · Nhiệm vụ số ${missionNo} → READY`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

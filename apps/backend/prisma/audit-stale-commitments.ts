import { MissionStatus, MissionWarehouseRequestStatus, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveEnvFilePaths } from "../src/config/env-file-path";

config({ path: resolveEnvFilePaths() });
const prisma = new PrismaClient();

/**
 * Rà soát vật tư bị GIỮ CHỖ bởi các nhiệm vụ đã phát hành mà kho không xuất.
 *
 * Nhiệm vụ phát hành xong sẽ giữ chỗ phần vật tư của nó cho tới khi kho xuất hàng
 * hoặc nhiệm vụ bị huỷ. Đúng như vậy — nếu không thì hai nhiệm vụ cùng hứa một
 * đống hàng. Nhưng nhiệm vụ nằm im nhiều ngày thì phần giữ chỗ đó thành nợ xấu:
 * hàng vẫn trên kệ, không ai lấy, mà nhiệm vụ mới thì không lập được.
 *
 * Còn một nguồn nợ xấu nữa: dữ liệu cũ từ thời định mức nước tính nhầm LÍT thành
 * CHAI (15 lít/người/ngày → 15 chai). Một nhiệm vụ như vậy vét sạch tồn của cả xã.
 * Script này chỉ ra chúng bằng cách so phần đã hứa với quy mô thật của nhiệm vụ.
 *
 * MẶC ĐỊNH CHỈ ĐỌC. Muốn huỷ thật thì thêm `--huy --qua <số ngày>`; huỷ nhiệm vụ
 * là cách duy nhất trả lại chỗ, nên đó phải là quyết định có chủ ý của người dùng.
 */
const args = process.argv.slice(2);
const applyCancellation = args.includes("--huy");
const olderThanDaysArg = Number.parseInt(args[args.indexOf("--qua") + 1] ?? "", 10);
const STALE_AFTER_DAYS = Number.isFinite(olderThanDaysArg) && olderThanDaysArg > 0 ? olderThanDaysArg : 2;

async function main() {
  const requests = await prisma.missionWarehouseRequest.findMany({
    where: {
      status: {
        in: [MissionWarehouseRequestStatus.PENDING, MissionWarehouseRequestStatus.ACCEPTED],
      },
      mission: { status: { notIn: [MissionStatus.COMPLETED, MissionStatus.CANCELLED] } },
    },
    select: {
      requestedQuantity: true,
      sku: true,
      itemName: true,
      mission: {
        select: { id: true, missionNo: true, affectedPeople: true, approvedAt: true, status: true },
      },
    },
  });

  const batches = await prisma.itemBatch.groupBy({ by: ["itemId"], _sum: { quantity: true } });
  const items = await prisma.item.findMany({ select: { id: true, sku: true, name: true } });
  const stockBySku = new Map<string, number>();
  for (const batch of batches) {
    const sku = items.find((item) => item.id === batch.itemId)?.sku;
    if (sku) stockBySku.set(sku, (stockBySku.get(sku) ?? 0) + (batch._sum.quantity ?? 0));
  }

  const promisedBySku = new Map<string, { itemName: string; promised: number }>();
  const promisedByMission = new Map<
    string,
    { missionNo: number; affectedPeople: number; approvedAt: Date | null; promised: number }
  >();
  for (const row of requests) {
    const sku = promisedBySku.get(row.sku) ?? { itemName: row.itemName, promised: 0 };
    sku.promised += row.requestedQuantity;
    promisedBySku.set(row.sku, sku);

    const entry = promisedByMission.get(row.mission.id) ?? {
      missionNo: row.mission.missionNo,
      affectedPeople: row.mission.affectedPeople,
      approvedAt: row.mission.approvedAt,
      promised: 0,
    };
    entry.promised += row.requestedQuantity;
    promisedByMission.set(row.mission.id, entry);
  }

  console.log("\n=== Vật tư: tồn thật so với phần đã hứa ===");
  for (const [sku, { itemName, promised }] of [...promisedBySku].sort((a, b) => b[1].promised - a[1].promised)) {
    const stock = stockBySku.get(sku) ?? 0;
    const shortfallNote = promised > stock ? `  ← HỨA QUÁ TỒN ${promised - stock}` : "";
    console.log(`  ${itemName} (${sku}): tồn ${stock}, đã hứa ${promised}${shortfallNote}`);
  }

  const now = Date.now();
  const staleMissions = [...promisedByMission.entries()]
    .map(([id, entry]) => ({
      id,
      ...entry,
      ageInDays: entry.approvedAt ? (now - entry.approvedAt.getTime()) / 86_400_000 : Infinity,
    }))
    .filter((entry) => entry.ageInDays >= STALE_AFTER_DAYS)
    .sort((a, b) => b.promised - a.promised);

  console.log(`\n=== Nhiệm vụ đã phát hành hơn ${STALE_AFTER_DAYS} ngày mà kho chưa xuất ===`);
  if (staleMissions.length === 0) console.log("  (không có)");
  for (const entry of staleMissions) {
    // Tỉ lệ đơn vị/người bóc trần dữ liệu hỏng: nhiệm vụ đòi hàng chục đơn vị cho
    // mỗi người gần như chắc chắn là bản ghi từ thời tính nhầm đơn vị.
    const perPerson = entry.affectedPeople > 0 ? (entry.promised / entry.affectedPeople).toFixed(1) : "?";
    console.log(
      `  Nhiệm vụ số ${entry.missionNo}: giữ ${entry.promised} đơn vị cho ${entry.affectedPeople} người ` +
        `(${perPerson}/người), phát hành ${entry.ageInDays.toFixed(1)} ngày trước`,
    );
  }

  if (!applyCancellation) {
    console.log(
      `\nChỉ đọc. Muốn huỷ ${staleMissions.length} nhiệm vụ trên để trả lại chỗ, chạy lại với:\n` +
        `  pnpm prisma:audit-stale-commitments -- --huy --qua ${STALE_AFTER_DAYS}\n`,
    );
    return;
  }

  const result = await prisma.mission.updateMany({
    where: { id: { in: staleMissions.map((entry) => entry.id) }, status: MissionStatus.PENDING_WAREHOUSE },
    data: {
      status: MissionStatus.CANCELLED,
      adminNote: `Huỷ khi rà soát: đã phát hành hơn ${STALE_AFTER_DAYS} ngày mà kho chưa xuất.`,
    },
  });
  console.log(`\nĐã huỷ ${result.count} nhiệm vụ; phần vật tư chúng giữ đã được trả lại.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

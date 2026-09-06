/**
 * Đổi tên kho trung tâm trên database đang chạy: "Kho cứu trợ trung tâm Đồng Xuân"
 * → "Kho xã Đồng Xuân".
 *
 * Tên cũ dài và nói sai vai: người dân và cán bộ xã gọi nó là "kho xã", còn "cứu
 * trợ trung tâm" nghe như một kho cấp tỉnh nằm ở đâu đó khác. Tên kho hiện khắp
 * nơi — nhãn trên bản đồ, cột đơn vị ở thanh chức năng, mọi phiếu xuất nhập — nên
 * chữ thừa ở đây bị cắt cụt đúng chỗ cần đọc.
 *
 * Seed đã sinh đúng tên mới cho máy mới; script này để môi trường đang có dữ liệu
 * không phải seed lại (seed xoá sạch tồn kho và lịch sử).
 *
 * Chỉ đụng phần đầu của tên, giữ nguyên phần tên xã đứng sau: mỗi xã một tên riêng,
 * và bảng kho của nhiều xã có thể nằm chung một database.
 *
 * Chạy một lần: pnpm --filter @safestock/backend prisma:rename-central-warehouses
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OLD_PREFIX = "Kho cứu trợ trung tâm";
const NEW_PREFIX = "Kho xã";

async function main() {
  const warehouses = await prisma.warehouse.findMany({
    where: { name: { startsWith: OLD_PREFIX } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (warehouses.length === 0) {
    console.log(`Không còn kho nào mang tên bắt đầu bằng "${OLD_PREFIX}".`);
    return;
  }

  for (const warehouse of warehouses) {
    const name = NEW_PREFIX + warehouse.name.slice(OLD_PREFIX.length);
    await prisma.warehouse.update({ where: { id: warehouse.id }, data: { name } });
    console.log(`  ${warehouse.name} -> ${name}`);
  }

  console.log(`\nĐã đổi tên ${warehouses.length} kho.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Sửa nhãn đơn vị của nước từ "lít" về "chai", KHÔNG đổi con số tồn.
 *
 * Vì sao chỉ sửa nhãn: mã seed và ghi chú trong đó đều nói kho đếm theo CHAI —
 * "kho xuất và trưởng thôn bốc từng chai, không ai đong 15 lít ra khỏi kệ". Con
 * số trong kho vốn là số chai; chỉ có nhãn bị ghi sai từ một bản cũ.
 *
 * Đổi con số mới là nguy hiểm: mọi báo cáo và phương án phân bổ lịch sử đều dựa
 * trên nó, và một phép chia ở đây làm chúng lệch hết mà không báo lỗi gì.
 *
 * Chạy lại nhiều lần được: đã đúng rồi thì không đụng tới.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/fix-water-units.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.itemCategory.findMany({
    where: { name: "Nước uống" },
    select: { id: true, name: true, unit: true },
  });
  if (categories.length === 0) {
    console.log("Không tìm thấy danh mục 'Nước uống' — không có gì để sửa.");
    return;
  }

  for (const category of categories) {
    if (category.unit === "chai") {
      console.log(`"${category.name}" đã là "chai" — bỏ qua.`);
      continue;
    }
    await prisma.itemCategory.update({ where: { id: category.id }, data: { unit: "chai" } });
    console.log(`"${category.name}": "${category.unit}" → "chai" (số lượng giữ nguyên)`);
  }

  const stock = await prisma.itemBatch.aggregate({
    where: { item: { category: { name: "Nước uống" } }, circulation: "IN_STOCK" },
    _sum: { quantity: true },
  });
  const bottles = stock._sum.quantity ?? 0;
  console.log(`Tồn: ${bottles} chai = ${Math.floor(bottles / 12)} lốc lẻ ${bottles % 12} = ${bottles * 5} lít`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

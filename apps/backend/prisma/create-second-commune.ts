/**
 * Dựng xã thứ hai để thử luồng mượn — trả liên xã.
 *
 * Cùng một máy chủ, cùng một cơ sở dữ liệu, nhưng là một ĐƠN VỊ khác: kho riêng,
 * tồn kho riêng, tài khoản quản trị riêng. Đủ để chạy trọn luồng nghiệp vụ giữa
 * hai xã mà không phải dựng máy chủ thứ hai.
 *
 * Chạy lại nhiều lần được: có rồi thì cập nhật, không đẻ thêm bản trùng.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/create-second-commune.ts
 */
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TEN_XA = "Xuân Thọ";
const EMAIL = "admin.xuantho@ungphonhanh.life";
const MAT_KHAU = "admin123@";

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "org-xuan-tho" },
    update: { name: `Hội Chữ thập đỏ xã ${TEN_XA}` },
    create: { id: "org-xuan-tho", name: `Hội Chữ thập đỏ xã ${TEN_XA}` },
  });

  const kho = await prisma.warehouse.upsert({
    where: { id: "kho-trung-tam-xuan-tho" },
    update: {},
    create: {
      id: "kho-trung-tam-xuan-tho",
      organizationId: org.id,
      name: `Kho cứu trợ trung tâm ${TEN_XA}`,
      kind: "CENTRAL",
      communeId: "xa-xuan-tho",
      lat: 13.4102,
      lng: 109.0431,
    },
  });

  const khu = await prisma.warehouseZone.upsert({
    where: { id: "khu-a-xuan-tho" },
    update: {},
    create: { id: "khu-a-xuan-tho", warehouseId: kho.id, code: "A", name: "Khu A" },
  });
  const ke = await prisma.shelf.upsert({
    where: { id: "ke-a1-xuan-tho" },
    update: {},
    create: { id: "ke-a1-xuan-tho", zoneId: khu.id, code: "A1" },
  });

  // Dùng lại đúng vật tư của xã kia: mượn liên xã chỉ có nghĩa khi hai bên cùng
  // một mã vật tư, nếu không thì con số trao đổi cho nhau không so được.
  const vatTu = await prisma.item.findMany({
    where: { sku: { in: ["WATER-01", "LIFE-ADULT", "FIRSTAID-01"] } },
    select: { id: true, sku: true, name: true },
  });
  for (const item of vatTu) {
    await prisma.itemBatch.upsert({
      where: { itemId_batchCode: { itemId: item.id, batchCode: `${item.sku}-XUAN-THO` } },
      update: {},
      create: {
        itemId: item.id,
        shelfId: ke.id,
        batchCode: `${item.sku}-XUAN-THO`,
        quantity: 500,
      },
    });
  }

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: bcrypt.hashSync(MAT_KHAU, 10), role: UserRole.ADMIN },
    create: {
      email: EMAIL,
      fullName: `Quản trị xã ${TEN_XA}`,
      passwordHash: bcrypt.hashSync(MAT_KHAU, 10),
      role: UserRole.ADMIN,
      organizationId: org.id,
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`Xã: ${org.name}  (org ${org.id})`);
  console.log(`Kho: ${kho.name}`);
  console.log(`Vật tư: ${vatTu.length} mã, mỗi mã 500 đơn vị`);
  console.log(`Tài khoản: ${user.email} / ${MAT_KHAU}  (${user.role})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

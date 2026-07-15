import { config } from "dotenv";
config(); // đọc apps/backend/.env — khớp DATABASE_URL với root
import { PrismaClient, ItemStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dữ liệu mẫu: kho cứu hộ CTĐ Đồng Xuân (bối cảnh thi Đắk Lắk / Phú Yên cũ).
async function main() {
  const org = await prisma.organization.create({
    data: { name: "Hội Chữ thập đỏ xã Đồng Xuân" },
  });

  // Hash bcrypt thật. Đăng nhập bằng "email" (admin dùng username "admin").
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  await prisma.user.createMany({
    data: [
      { organizationId: org.id, email: "admin", passwordHash: hash("admin123@"), fullName: "Quản trị hệ thống", role: "ADMIN" },
      { organizationId: org.id, email: "warehouse@safestock.vn", passwordHash: hash("warehouse123"), fullName: "Phụ trách kho", role: "WAREHOUSE" },
      { organizationId: org.id, email: "rescue@safestock.vn", passwordHash: hash("rescue123"), fullName: "Đội cứu hộ", role: "RESCUE" },
    ],
  });

  const warehouse = await prisma.warehouse.create({
    data: { organizationId: org.id, name: "Kho cứu trợ trung tâm Đồng Xuân", location: "Xã Đồng Xuân" },
  });

  const zoneA = await prisma.warehouseZone.create({
    data: { warehouseId: warehouse.id, code: "A", name: "Khu vật tư cứu hộ nước" },
  });
  const zoneB = await prisma.warehouseZone.create({
    data: { warehouseId: warehouse.id, code: "B", name: "Khu y tế & chiếu sáng" },
  });

  const shelfA1 = await prisma.shelf.create({ data: { zoneId: zoneA.id, code: "A1" } });
  const shelfA2 = await prisma.shelf.create({ data: { zoneId: zoneA.id, code: "A2" } });
  const shelfB1 = await prisma.shelf.create({ data: { zoneId: zoneB.id, code: "B1" } });
  const shelfB3 = await prisma.shelf.create({ data: { zoneId: zoneB.id, code: "B3" } });

  // Category + item + batch
  const catalog = [
    { cat: "Áo phao người lớn", unit: "chiếc", sku: "LIFE-ADULT", shelf: shelfA1, qty: 96, status: ItemStatus.AVAILABLE, expiryMonths: 24 },
    { cat: "Áo phao trẻ em", unit: "chiếc", sku: "LIFE-CHILD", shelf: shelfA1, qty: 25, status: ItemStatus.AVAILABLE, expiryMonths: 24 },
    { cat: "Xuồng cứu hộ", unit: "chiếc", sku: "BOAT-01", shelf: shelfA2, qty: 3, status: ItemStatus.AVAILABLE, expiryMonths: null },
    { cat: "Bộ sơ cứu", unit: "bộ", sku: "FIRSTAID-01", shelf: shelfB1, qty: 8, status: ItemStatus.EXPIRING_SOON, expiryMonths: 2 },
    { cat: "Đèn pin", unit: "chiếc", sku: "TORCH-01", shelf: shelfB3, qty: 12, status: ItemStatus.AVAILABLE, expiryMonths: null },
    { cat: "Bộ pin", unit: "bộ", sku: "BATT-01", shelf: shelfB3, qty: 30, status: ItemStatus.AVAILABLE, expiryMonths: 12 },
    { cat: "Thiết bị liên lạc", unit: "chiếc", sku: "RADIO-01", shelf: shelfB1, qty: 4, status: ItemStatus.MAINTENANCE, expiryMonths: null },
    { cat: "Nước uống đóng chai", unit: "lít", sku: "WATER-01", shelf: shelfA2, qty: 500, status: ItemStatus.AVAILABLE, expiryMonths: 6 },
  ];

  for (const c of catalog) {
    const category = await prisma.itemCategory.create({ data: { name: c.cat, unit: c.unit } });
    const item = await prisma.item.create({
      data: { categoryId: category.id, name: c.cat, sku: c.sku },
    });
    await prisma.itemBatch.create({
      data: {
        itemId: item.id,
        shelfId: c.shelf.id,
        batchCode: `${c.sku}-B001`,
        quantity: c.qty,
        status: c.status,
        expiryDate: c.expiryMonths
          ? new Date(Date.now() + c.expiryMonths * 30 * 24 * 3600 * 1000)
          : null,
        inspectedAt: new Date(),
      },
    });
  }

  // ===== Thiết bị ảo (Phase B) =====
  const wid = warehouse.id;
  const shelves = [
    { s: shelfA1, z: zoneA },
    { s: shelfA2, z: zoneA },
    { s: shelfB1, z: zoneB },
    { s: shelfB3, z: zoneB },
  ];
  // Loadcell mỗi kệ
  for (const { s, z } of shelves) {
    await prisma.virtualDevice.create({
      data: { warehouseId: wid, zoneId: z.id, shelfId: s.id, type: "LOADCELL", code: `scale_${s.code}`, unit: "kg", currentValue: 50 },
    });
  }
  // Nhiệt độ + độ ẩm mỗi khu
  for (const z of [zoneA, zoneB]) {
    await prisma.virtualDevice.create({
      data: { warehouseId: wid, zoneId: z.id, type: "TEMPERATURE", code: `temp_${z.code}`, unit: "°C", currentValue: 28 },
    });
    await prisma.virtualDevice.create({
      data: { warehouseId: wid, zoneId: z.id, type: "HUMIDITY", code: `humid_${z.code}`, unit: "%", currentValue: 60 },
    });
  }
  // Cửa + gateway cấp kho
  await prisma.virtualDevice.create({
    data: { warehouseId: wid, type: "DOOR", code: "door_main", unit: "bool", currentValue: 0 },
  });
  await prisma.virtualDevice.create({
    data: { warehouseId: wid, type: "GATEWAY", code: "gateway_01", unit: "bool", currentValue: 1, online: true },
  });

  await prisma.auditLog.create({
    data: { action: "SEED", entity: "Organization", entityId: org.id, metadata: { note: "Khởi tạo dữ liệu mẫu" } },
  });

  const counts = {
    org: await prisma.organization.count(),
    users: await prisma.user.count(),
    batches: await prisma.itemBatch.count(),
    devices: await prisma.virtualDevice.count(),
  };
  // eslint-disable-next-line no-console
  console.log("Seed xong:", counts);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

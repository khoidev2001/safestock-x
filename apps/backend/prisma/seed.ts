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

  // Cụm kho 1 xã (K1): 1 kho tổng ở trung tâm + 2 kho thôn. Cùng communeId, cùng DB.
  // Toạ độ thật quanh xã Đồng Xuân (Phú Yên) — ghim tay, không geocode.
  const COMMUNE = "dong-xuan";
  const warehouse = await prisma.warehouse.create({
    data: {
      organizationId: org.id,
      name: "Kho cứu trợ trung tâm Đồng Xuân",
      location: "Trung tâm hành chính xã Đồng Xuân",
      kind: "CENTRAL",
      communeId: COMMUNE,
      lat: 13.3667,
      lng: 109.0333,
    },
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
  // Bp3 dữ liệu bẩn: kệ B3 lối đi bị chặn → vật tư trên đó khó tiếp cận (hạ Readiness).
  const shelfB3 = await prisma.shelf.create({ data: { zoneId: zoneB.id, code: "B3", isBlocked: true } });

  // Category + item + batch. consumable: true=tiêu hao (xuất=mất), false=tái sử dụng (mượn-trả).
  const catalog = [
    { cat: "Áo phao người lớn", unit: "chiếc", sku: "LIFE-ADULT", shelf: shelfA1, qty: 96, status: ItemStatus.AVAILABLE, expiryMonths: 24, consumable: false, weight: 0.8 },
    { cat: "Áo phao trẻ em", unit: "chiếc", sku: "LIFE-CHILD", shelf: shelfA1, qty: 25, status: ItemStatus.AVAILABLE, expiryMonths: 24, consumable: false, weight: 0.5 },
    { cat: "Xuồng cứu hộ", unit: "chiếc", sku: "BOAT-01", shelf: shelfA2, qty: 3, status: ItemStatus.AVAILABLE, expiryMonths: null, consumable: false, weight: 25 },
    { cat: "Bộ sơ cứu", unit: "bộ", sku: "FIRSTAID-01", shelf: shelfB1, qty: 8, status: ItemStatus.EXPIRING_SOON, expiryMonths: 2, consumable: true, weight: 1.2 },
    { cat: "Đèn pin", unit: "chiếc", sku: "TORCH-01", shelf: shelfB3, qty: 12, status: ItemStatus.AVAILABLE, expiryMonths: null, consumable: false, weight: 0.3 },
    { cat: "Bộ pin", unit: "bộ", sku: "BATT-01", shelf: shelfB3, qty: 30, status: ItemStatus.AVAILABLE, expiryMonths: 12, consumable: true, weight: 0.1 },
    { cat: "Thiết bị liên lạc", unit: "chiếc", sku: "RADIO-01", shelf: shelfB1, qty: 4, status: ItemStatus.MAINTENANCE, expiryMonths: null, consumable: false, weight: 0.4 },
    { cat: "Nước uống đóng chai", unit: "lít", sku: "WATER-01", shelf: shelfA2, qty: 500, status: ItemStatus.AVAILABLE, expiryMonths: 6, consumable: true, weight: 1 },
  ];

  for (const c of catalog) {
    const category = await prisma.itemCategory.create({ data: { name: c.cat, unit: c.unit } });
    const item = await prisma.item.create({
      data: { categoryId: category.id, name: c.cat, sku: c.sku, consumable: c.consumable, unitWeightKg: c.weight },
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

  // ===== Kho thôn (HAMLET) — cùng communeId, gần điểm nạn hơn, tồn ít =====
  // Demo K1: kho thôn gần lấy trước, thiếu thì tràn sang kho tổng.
  const hamlets = [
    { name: "Kho thôn Phú Xuân", lat: 13.3800, lng: 109.0450, water: 80, lifeAdult: 20 },
    { name: "Kho thôn Long Hà", lat: 13.3500, lng: 109.0200, water: 40, lifeAdult: 10 },
  ];
  const waterItem = await prisma.item.findUnique({ where: { sku: "WATER-01" } });
  const lifeItem = await prisma.item.findUnique({ where: { sku: "LIFE-ADULT" } });

  for (const h of hamlets) {
    const hw = await prisma.warehouse.create({
      data: {
        organizationId: org.id,
        name: h.name,
        location: h.name,
        kind: "HAMLET",
        communeId: COMMUNE,
        lat: h.lat,
        lng: h.lng,
      },
    });
    const zone = await prisma.warehouseZone.create({
      data: { warehouseId: hw.id, code: "A", name: "Kho thôn" },
    });
    const shelf = await prisma.shelf.create({ data: { zoneId: zone.id, code: "A1" } });
    // Kho thôn chỉ trữ nước + áo phao (vật tư lũ lụt thiết yếu), số ít.
    if (waterItem) {
      await prisma.itemBatch.create({
        data: {
          itemId: waterItem.id,
          shelfId: shelf.id,
          batchCode: `WATER-01-${h.name.slice(-2)}`,
          quantity: h.water,
          status: ItemStatus.AVAILABLE,
          expiryDate: new Date(Date.now() + 6 * 30 * 24 * 3600 * 1000),
          inspectedAt: new Date(),
        },
      });
    }
    if (lifeItem) {
      await prisma.itemBatch.create({
        data: {
          itemId: lifeItem.id,
          shelfId: shelf.id,
          batchCode: `LIFE-ADULT-${h.name.slice(-2)}`,
          quantity: h.lifeAdult,
          status: ItemStatus.AVAILABLE,
          expiryDate: new Date(Date.now() + 24 * 30 * 24 * 3600 * 1000),
          inspectedAt: new Date(),
        },
      });
    }
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

  // ===== Bp3: dữ liệu "bẩn" thực tế (chứng minh xử lý lộn xộn + tôn Readiness) =====
  const canvasCat = await prisma.itemCategory.create({ data: { name: "Bạt che", unit: "tấm" } });
  const canvasItem = await prisma.item.create({
    data: { categoryId: canvasCat.id, name: "Bạt che", sku: "CANVAS-01", consumable: false, unitWeightKg: 2 },
  });
  await prisma.itemBatch.createMany({
    data: [
      // Không có hạn dùng + chưa kiểm kê bao giờ (dataReliability thấp).
      { itemId: canvasItem.id, shelfId: shelfA2.id, batchCode: "CANVAS-01-B001", quantity: 40, status: "AVAILABLE", condition: "NEW", expiryDate: null, inspectedAt: null },
      // Lô hư hỏng (condition DAMAGED → điểm tình trạng = 0).
      { itemId: canvasItem.id, shelfId: shelfA2.id, batchCode: "CANVAS-01-B002", quantity: 5, status: "DAMAGED", condition: "DAMAGED", expiryDate: null, inspectedAt: new Date() },
      // Lô sai vị trí (status MISPLACED).
      { itemId: canvasItem.id, shelfId: shelfB3.id, batchCode: "CANVAS-01-B003", quantity: 8, status: "MISPLACED", condition: "USED", expiryDate: null, inspectedAt: new Date() },
    ],
  });

  // ===== Bp3: kho lân cận (nhập tay) — lệch loại để Mission gợi ý mượn liên xã (#30) =====
  // Kho chính Đồng Xuân: nhiều áo phao, ÍT nước. Kho lân cận ngược lại.
  await prisma.neighborWarehouse.createMany({
    data: [
      {
        warehouseId: warehouse.id,
        name: "Kho cứu trợ xã Xuân Sơn",
        distanceKm: 8,
        contactInfo: "Bộ đàm kênh 3 / 0905xxxxxx",
        summary: [
          { sku: "WATER-01", name: "Nước uống đóng chai", quantity: 2000 },
          { sku: "FIRSTAID-01", name: "Bộ sơ cứu", quantity: 30 },
          { sku: "LIFE-ADULT", name: "Áo phao người lớn", quantity: 10 },
        ],
      },
      {
        warehouseId: warehouse.id,
        name: "Kho huyện (xa)",
        distanceKm: 35,
        contactInfo: "Điện thoại 0262xxxxxxx",
        summary: [
          { sku: "LIFE-ADULT", name: "Áo phao người lớn", quantity: 200 },
          { sku: "BOAT-01", name: "Xuồng cứu hộ", quantity: 12 },
          { sku: "WATER-01", name: "Nước uống đóng chai", quantity: 500 },
        ],
      },
    ],
  });

  await prisma.auditLog.create({
    data: { action: "SEED", entity: "Organization", entityId: org.id, metadata: { note: "Khởi tạo dữ liệu mẫu" } },
  });

  const counts = {
    org: await prisma.organization.count(),
    users: await prisma.user.count(),
    batches: await prisma.itemBatch.count(),
    devices: await prisma.virtualDevice.count(),
    neighbors: await prisma.neighborWarehouse.count(),
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

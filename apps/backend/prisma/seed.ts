import { config } from "dotenv";
config(); // đọc apps/backend/.env — khớp DATABASE_URL với root
import { PrismaClient, ItemStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Xoá sạch theo thứ tự phụ thuộc (con trước cha) → seed idempotent, chạy lại không P2002. */
async function resetDatabase() {
  // Thứ tự: bảng có FK trỏ đi xoá trước bảng được trỏ tới.
  await prisma.incidentAction.deleteMany();
  await prisma.incidentEvidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.missionRequirement.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryCount.deleteMany();
  await prisma.loanRecord.deleteMany();
  await prisma.sensorEvent.deleteMany();
  await prisma.simulationRun.deleteMany();
  await prisma.simulationScenario.deleteMany();
  await prisma.virtualDevice.deleteMany();
  await prisma.readinessRecommendation.deleteMany();
  await prisma.readinessComponent.deleteMany();
  await prisma.readinessScore.deleteMany();
  await prisma.readinessThreshold.deleteMany();
  await prisma.readinessRule.deleteMany();
  await prisma.itemBatch.deleteMany();
  await prisma.item.deleteMany();
  await prisma.itemCategory.deleteMany();
  await prisma.shelf.deleteMany();
  await prisma.warehouseZone.deleteMany();
  await prisma.neighborWarehouse.deleteMany();
  await prisma.apiUsage.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

// Dữ liệu mẫu: kho cứu hộ CTĐ Đồng Xuân (bối cảnh thi Đắk Lắk / Phú Yên cũ).
async function main() {
  await resetDatabase();

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
  // Actor cho lịch sử giao dịch giả (người phụ trách kho thực hiện xuất).
  const warehouseUser = await prisma.user.findFirst({ where: { role: "WAREHOUSE" } });

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
  // expiryDays: nếu có → dùng số NGÀY (ưu tiên hơn expiryMonths) để đặt lô cận hạn cho demo.
  const catalog = [
    { cat: "Áo phao người lớn", unit: "chiếc", sku: "LIFE-ADULT", shelf: shelfA1, qty: 96, status: ItemStatus.AVAILABLE, expiryMonths: 24, consumable: false, weight: 0.8 },
    { cat: "Áo phao trẻ em", unit: "chiếc", sku: "LIFE-CHILD", shelf: shelfA1, qty: 25, status: ItemStatus.AVAILABLE, expiryMonths: 24, consumable: false, weight: 0.5 },
    { cat: "Xuồng cứu hộ", unit: "chiếc", sku: "BOAT-01", shelf: shelfA2, qty: 3, status: ItemStatus.AVAILABLE, expiryMonths: null, consumable: false, weight: 25 },
    // Bộ sơ cứu: lô cận hạn 20 ngày (trong cửa sổ cảnh báo 30) + tiêu hao nhanh → lowStock đỏ.
    { cat: "Bộ sơ cứu", unit: "bộ", sku: "FIRSTAID-01", shelf: shelfB1, qty: 8, status: ItemStatus.EXPIRING_SOON, expiryDays: 20, consumable: true, weight: 1.2 },
    { cat: "Đèn pin", unit: "chiếc", sku: "TORCH-01", shelf: shelfB3, qty: 12, status: ItemStatus.AVAILABLE, expiryMonths: null, consumable: false, weight: 0.3 },
    { cat: "Bộ pin", unit: "bộ", sku: "BATT-01", shelf: shelfB3, qty: 30, status: ItemStatus.AVAILABLE, expiryMonths: 12, consumable: true, weight: 0.1 },
    { cat: "Thiết bị liên lạc", unit: "chiếc", sku: "RADIO-01", shelf: shelfB1, qty: 4, status: ItemStatus.MAINTENANCE, expiryMonths: null, consumable: false, weight: 0.4 },
    { cat: "Nước uống đóng chai", unit: "lít", sku: "WATER-01", shelf: shelfA2, qty: 500, status: ItemStatus.AVAILABLE, expiryMonths: 6, consumable: true, weight: 1 },
    // Gạo cứu trợ (MỚI): tồn 0 nhưng có lịch sử xuất → forecast báo "Đã cạn" (demo gap #1).
    { cat: "Gạo cứu trợ", unit: "kg", sku: "RICE-01", shelf: shelfA2, qty: 0, status: ItemStatus.AVAILABLE, expiryMonths: 6, consumable: true, weight: 1 },
  ];

  // Lưu ref item/batch theo SKU để sinh lịch sử giao dịch phía sau.
  const skuRef = new Map<string, { itemId: string; batchId: string }>();

  for (const c of catalog) {
    const category = await prisma.itemCategory.create({ data: { name: c.cat, unit: c.unit } });
    const item = await prisma.item.create({
      data: { categoryId: category.id, name: c.cat, sku: c.sku, consumable: c.consumable, unitWeightKg: c.weight },
    });
    const expiryDate =
      c.expiryDays != null
        ? new Date(Date.now() + c.expiryDays * 24 * 3600 * 1000)
        : c.expiryMonths
          ? new Date(Date.now() + c.expiryMonths * 30 * 24 * 3600 * 1000)
          : null;
    const batch = await prisma.itemBatch.create({
      data: {
        itemId: item.id,
        shelfId: c.shelf.id,
        batchCode: `${c.sku}-B001`,
        quantity: c.qty,
        status: c.status,
        expiryDate,
        inspectedAt: new Date(),
      },
    });
    skuRef.set(c.sku, { itemId: item.id, batchId: batch.id });
  }

  // Lô cận hạn thêm cho demo cảnh báo hết hạn: 1 lô còn 5 ngày (đỏ gắt), 1 lô ĐÃ quá hạn.
  const waterRef = skuRef.get("WATER-01");
  const firstaidRef = skuRef.get("FIRSTAID-01");
  if (waterRef) {
    await prisma.itemBatch.create({
      data: {
        itemId: waterRef.itemId, shelfId: shelfA2.id, batchCode: "WATER-01-B002",
        quantity: 40, status: ItemStatus.EXPIRING_SOON,
        expiryDate: new Date(Date.now() + 5 * 24 * 3600 * 1000), inspectedAt: new Date(),
      },
    });
  }
  if (firstaidRef) {
    await prisma.itemBatch.create({
      data: {
        itemId: firstaidRef.itemId, shelfId: shelfB1.id, batchCode: "FIRSTAID-01-B002",
        quantity: 3, status: ItemStatus.EXPIRING_SOON,
        expiryDate: new Date(Date.now() - 3 * 24 * 3600 * 1000), inspectedAt: new Date(),
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

  const hamletIds: { name: string; id: string }[] = [];
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
    hamletIds.push({ name: h.name, id: hw.id });
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

  // Trưởng thôn (WAREHOUSE + warehouseId scope) — mỗi kho thôn 1 người, chỉ quản kho mình.
  for (let i = 0; i < hamletIds.length; i++) {
    const h = hamletIds[i];
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `truongthon${i + 1}@safestock.vn`,
        passwordHash: hash("truongthon123"),
        fullName: `Trưởng ${h.name}`,
        role: "WAREHOUSE",
        warehouseId: h.id,
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
  await prisma.virtualDevice.create({
    data: { warehouseId: wid, zoneId: zoneB.id, type: "SMOKE", code: "smoke_B", unit: "ppm", currentValue: 0 },
  });
  await prisma.virtualDevice.create({
    data: { warehouseId: wid, type: "POWER", code: "power_main", unit: "bool", currentValue: 1 },
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

  // ===== Lịch sử giao dịch xuất 60 ngày (BE-M: forecast/trends có số thật) =====
  let txnCount = 0;
  if (warehouseUser) {
    txnCount = await seedTransactionHistory(warehouseUser.id, skuRef);
  }

  await prisma.auditLog.create({
    data: { action: "SEED", entity: "Organization", entityId: org.id, metadata: { note: "Khởi tạo dữ liệu mẫu" } },
  });

  const counts = {
    org: await prisma.organization.count(),
    users: await prisma.user.count(),
    batches: await prisma.itemBatch.count(),
    devices: await prisma.virtualDevice.count(),
    neighbors: await prisma.neighborWarehouse.count(),
    transactions: txnCount,
    expiryAlerts: await prisma.itemBatch.count({
      where: { expiryDate: { lte: new Date(Date.now() + 30 * 24 * 3600 * 1000) } },
    }),
  };
  // eslint-disable-next-line no-console
  console.log("Seed xong:", counts);
}

/**
 * Sinh lịch sử EXPORT 60 ngày cho vài SKU với nhịp khác nhau → forecast/trends có "đạn" demo.
 * Tồn batch cập nhật = tồn ĐẦU KỲ − tổng đã xuất (khớp tuyệt đối, không âm).
 * Deterministic (không Math.random — dùng nhịp cố định + dao động theo index) để seed lặp lại giống nhau.
 */
async function seedTransactionHistory(
  userId: string,
  skuRef: Map<string, { itemId: string; batchId: string }>,
): Promise<number> {
  const DAY = 24 * 3600 * 1000;
  const now = Date.now();
  const sources = ["SCAN", "BULK", "LOADCELL"] as const;

  // Mỗi SKU: tồn hiện tại (catalog) + kế hoạch xuất. avgPerDay & profile khác nhau cho đa dạng.
  // finalQty = tồn cuối mong muốn (khớp catalog); tổng xuất suy ra từ profile, tồn đầu kỳ = final + tổng xuất.
  const plans: {
    sku: string;
    finalQty: number;
    perExport: number; // số lượng mỗi lần xuất
    dailyChance: (dayAgo: number) => boolean; // có xuất ngày đó không
  }[] = [
    // Nước: xuất đều ~12 lít/ngày (2 lần × 6) suốt kỳ → forecast ~ vài chục ngày.
    { sku: "WATER-01", finalQty: 500, perExport: 6, dailyChance: () => true },
    // Pin: TĂNG dần cuối kỳ (30 ngày gần xuất dày hơn) → trends tăng mạnh.
    { sku: "BATT-01", finalQty: 30, perExport: 1, dailyChance: (d) => (d < 30 ? true : d % 3 === 0) },
    // Sơ cứu: xuất thưa ~mỗi 3 ngày, tồn thấp (8) → sắp cạn (lowStock).
    { sku: "FIRSTAID-01", finalQty: 8, perExport: 1, dailyChance: (d) => d % 3 === 0 },
    // Đèn pin: chỉ xuất NỬA ĐẦU kỳ (>30 ngày trước), gần đây ngưng → trends GIẢM.
    { sku: "TORCH-01", finalQty: 12, perExport: 1, dailyChance: (d) => d > 30 && d % 4 === 0 },
    // Áo phao: 2 đợt sự kiện (quanh ngày 45 và ngày 10) → không đều.
    { sku: "LIFE-ADULT", finalQty: 96, perExport: 4, dailyChance: (d) => (d >= 43 && d <= 47) || (d >= 8 && d <= 12) },
    // Gạo: xuất hết về 0 trong kỳ → forecast "Đã cạn". Xuất mạnh nửa đầu.
    { sku: "RICE-01", finalQty: 0, perExport: 20, dailyChance: (d) => d > 25 && d % 2 === 0 },
  ];

  let count = 0;
  for (const plan of plans) {
    const ref = skuRef.get(plan.sku);
    if (!ref) continue;

    // Gom các mốc xuất (từ 60 ngày trước → hôm qua).
    const exportDays: number[] = [];
    for (let d = 60; d >= 1; d--) {
      if (plan.dailyChance(d)) exportDays.push(d);
    }
    const totalExported = exportDays.length * plan.perExport;

    // Tồn đầu kỳ = tồn cuối + tổng xuất. Cập nhật batch về tồn cuối mong muốn.
    await prisma.itemBatch.update({
      where: { id: ref.batchId },
      data: { quantity: plan.finalQty },
    });

    for (let i = 0; i < exportDays.length; i++) {
      const dayAgo = exportDays[i];
      // Dao động ±1 quanh perExport (theo index, deterministic) cho tự nhiên, không âm.
      const qty = Math.max(1, plan.perExport + ((i % 3) - 1));
      await prisma.inventoryTransaction.create({
        data: {
          batchId: ref.batchId,
          userId,
          type: "EXPORT",
          source: sources[i % sources.length],
          quantity: qty,
          note: "Xuất định kỳ",
          createdAt: new Date(now - dayAgo * DAY),
        },
      });
      count++;
    }
    void totalExported; // tồn đầu kỳ chỉ để diễn giải; batch đã set finalQty.
  }
  return count;
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

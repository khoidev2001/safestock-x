import { PrismaClient, type Shelf, type Warehouse, type WarehouseZone } from "@prisma/client";
import type { SeedBatchDefinition } from "./seed-data";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedBatchRef {
  warehouseId: string;
  sku: string;
  batchId: string;
  quantity: number;
  definition: SeedBatchDefinition;
}

export function dateFromOffset(offsetDays: number | null): Date | null {
  return offsetDays == null ? null : new Date(Date.now() + offsetDays * DAY_MS);
}

export async function seedDevices(
  prisma: PrismaClient,
  context: {
    centralWarehouse: Warehouse;
    centralZones: Map<string, WarehouseZone>;
    centralShelves: Map<string, Shelf>;
  },
) {
  const deviceByCode = new Map<string, string>();
  const register = async (data: Parameters<typeof prisma.virtualDevice.create>[0]["data"]) => {
    const device = await prisma.virtualDevice.create({ data });
    deviceByCode.set(device.code, device.id);
  };

  for (const shelf of context.centralShelves.values()) {
    const zone = [...context.centralZones.values()].find(
      (candidate) => candidate.id === shelf.zoneId,
    );
    await register({
      warehouseId: context.centralWarehouse.id,
      zoneId: shelf.zoneId,
      shelfId: shelf.id,
      type: "LOADCELL",
      code: `scale_${shelf.code}`,
      unit: "kg",
      currentValue: shelf.code === "C3" ? 22 : 80,
      online: shelf.code !== "C3",
    });
    if (!zone) throw new Error(`Kệ ${shelf.code} không có khu`);
  }
  for (const zone of context.centralZones.values()) {
    await register({
      warehouseId: context.centralWarehouse.id,
      zoneId: zone.id,
      type: "TEMPERATURE",
      code: `temp_${zone.code}`,
      unit: "°C",
      currentValue: zone.code === "A" ? 27.5 : 28,
    });
    await register({
      warehouseId: context.centralWarehouse.id,
      zoneId: zone.id,
      type: "HUMIDITY",
      code: `humid_${zone.code}`,
      unit: "%",
      currentValue: zone.code === "A" ? 62 : 60,
    });
  }
  await register({
    warehouseId: context.centralWarehouse.id,
    type: "DOOR",
    code: "door_main",
    unit: "bool",
    currentValue: 0,
  });
  await register({
    warehouseId: context.centralWarehouse.id,
    type: "GATEWAY",
    code: "gateway_01",
    unit: "bool",
    currentValue: 1,
  });
  await register({
    warehouseId: context.centralWarehouse.id,
    type: "SMOKE",
    code: "smoke_main",
    unit: "ppm",
    currentValue: 0,
  });
  await register({
    warehouseId: context.centralWarehouse.id,
    type: "POWER",
    code: "power_main",
    unit: "bool",
    currentValue: 1,
  });
  await register({
    warehouseId: context.centralWarehouse.id,
    type: "RFID_GATEWAY",
    code: "rfid_main",
    unit: "tag",
    currentValue: 0,
  });
  await register({
    warehouseId: context.centralWarehouse.id,
    type: "CAMERA_AI",
    code: "camera_main",
    unit: "detection",
    currentValue: 0,
  });

  return deviceByCode;
}

export async function seedOperationalRecords(
  prisma: PrismaClient,
  context: {
    centralWarehouse: Warehouse;
    centralBatchRefs: SeedBatchRef[];
    hamletBatchRefs: SeedBatchRef[];
    hamletWarehouses: Warehouse[];
    hamletLeaderIds: Map<string, string>;
    warehouseUserId: string;
    rescueUserId: string;
    deviceByCode: Map<string, string>;
  },
) {
  const centralByCode = new Map(
    context.centralBatchRefs.map((ref) => [ref.definition.batchCode, ref]),
  );
  const lifeJacket = centralByCode.get("LIFE-A-2026-01");
  const radio = centralByCode.get("RADIO-2026-01");
  if (!lifeJacket || !radio) throw new Error("Thiếu lô chuẩn để tạo phiếu mượn");

  await prisma.loanRecord.createMany({
    data: [
      {
        batchId: lifeJacket.batchId,
        quantity: 12,
        borrowedByUserId: context.rescueUserId,
        status: "ON_LOAN",
        borrowedAt: dateFromOffset(-4)!,
      },
      {
        batchId: radio.batchId,
        quantity: 2,
        borrowedByUserId: context.rescueUserId,
        status: "ON_LOAN",
        borrowedAt: dateFromOffset(-2)!,
      },
    ],
  });
  const loanByBatchId = new Map([
    [lifeJacket.batchId, 12],
    [radio.batchId, 2],
  ]);

  for (const ref of [...context.centralBatchRefs, ...context.hamletBatchRefs]) {
    const onLoan = loanByBatchId.get(ref.batchId) ?? 0;
    await prisma.inventoryCount.create({
      data: {
        batchId: ref.batchId,
        countedQty: Math.max(0, ref.quantity - onLoan + (ref.definition.countedDelta ?? 0)),
        userId: context.hamletLeaderIds.get(ref.warehouseId) ?? context.warehouseUserId,
        note: onLoan > 0 ? "Đã đối chiếu phần đang cấp cho lực lượng hiện trường" : "Kiểm kê định kỳ",
        countedAt: dateFromOffset(-(ref.definition.countedOffsetDays ?? 7))!,
      },
    });
  }

  await seedIncidents(prisma, context);
  await seedMonthlyReport(prisma, context);
}

async function seedIncidents(
  prisma: PrismaClient,
  context: {
    centralWarehouse: Warehouse;
    warehouseUserId: string;
    deviceByCode: Map<string, string>;
  },
) {
  const scaleC2 = context.deviceByCode.get("scale_C2");
  const humidityA = context.deviceByCode.get("humid_A");
  if (!scaleC2 || !humidityA) throw new Error("Thiếu thiết bị trung tâm để tạo bằng chứng");

  await prisma.sensorEvent.createMany({
    data: [
      {
        deviceId: scaleC2,
        warehouseId: context.centralWarehouse.id,
        eventType: "SIGNAL_UNSTABLE",
        value: 0.62,
        unit: "quality",
        quality: 0.62,
        createdAt: dateFromOffset(-1)!,
      },
      {
        deviceId: humidityA,
        warehouseId: context.centralWarehouse.id,
        eventType: "HUMIDITY_HIGH",
        value: 78,
        unit: "%",
        quality: 0.98,
        createdAt: dateFromOffset(-18)!,
      },
    ],
  });

  await prisma.incident.create({
    data: {
      warehouseId: context.centralWarehouse.id,
      kind: "SENSOR_FAULT",
      severity: "MEDIUM",
      confidence: 0.82,
      title: "Cảm biến tải kệ C2 cần kiểm tra",
      explanation: "Tín hiệu cân tải dao động; cần đối chiếu thủ công trước lần xuất tiếp theo.",
      state: "OPEN",
      detectedAt: dateFromOffset(-1)!,
      evidence: {
        create: {
          deviceCode: "scale_C2",
          eventType: "SIGNAL_UNSTABLE",
          value: 0.62,
          weight: 0.7,
          occurredAt: dateFromOffset(-1)!,
          note: "Chất lượng tín hiệu thấp hơn ngưỡng vận hành.",
        },
      },
    },
  });
  await prisma.incident.create({
    data: {
      warehouseId: context.centralWarehouse.id,
      kind: "BAD_STORAGE",
      severity: "HIGH",
      confidence: 0.94,
      title: "Độ ẩm khu A vượt ngưỡng",
      explanation: "Khu lương thực đã được thông gió và kiểm tra lại bao bì.",
      state: "RESOLVED",
      detectedAt: dateFromOffset(-18)!,
      resolvedAt: dateFromOffset(-17)!,
      evidence: {
        create: {
          deviceCode: "humid_A",
          eventType: "HUMIDITY_HIGH",
          value: 78,
          weight: 0.9,
          occurredAt: dateFromOffset(-18)!,
          note: "Độ ẩm vượt ngưỡng bảo quản trong 25 phút.",
        },
      },
      actions: {
        create: {
          action: "RESOLVE",
          actorId: context.warehouseUserId,
          note: "Thông gió, kê cao lô hàng và xác nhận độ ẩm trở lại bình thường.",
          createdAt: dateFromOffset(-17)!,
        },
      },
    },
  });
  await prisma.notification.create({
    data: {
      recipientRole: "WAREHOUSE",
      warehouseId: context.centralWarehouse.id,
      kind: "INCIDENT_DETECTED",
      title: "Thiết bị cần kiểm tra",
      body: "Cân tải kệ C2 đang có tín hiệu không ổn định.",
      createdAt: dateFromOffset(-1)!,
    },
  });
}

async function seedMonthlyReport(
  prisma: PrismaClient,
  context: {
    hamletBatchRefs: SeedBatchRef[];
    hamletWarehouses: Warehouse[];
    hamletLeaderIds: Map<string, string>;
  },
) {
  const longHa = context.hamletWarehouses.find((warehouse) => warehouse.name.endsWith("Long Hà"));
  if (!longHa) return;
  const leaderId = context.hamletLeaderIds.get(longHa.id);
  if (!leaderId) return;
  const rows = context.hamletBatchRefs
    .filter((ref) => ref.warehouseId === longHa.id)
    .map((ref) => ({ sku: ref.sku, quantity: ref.quantity, note: "Đã kiểm đếm tại kho thôn" }));
  const previousMonth = new Date();
  previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
  await prisma.monthlyStockReport.create({
    data: {
      warehouseId: longHa.id,
      submittedByUserId: leaderId,
      period: `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, "0")}`,
      status: "PENDING",
      rows,
      note: "Báo cáo mẫu chờ quản trị xã duyệt.",
      createdAt: dateFromOffset(-3)!,
    },
  });
}

export async function seedTransactionHistory(
  prisma: PrismaClient,
  userId: string,
  primaryBatchBySku: Map<string, SeedBatchRef>,
) {
  const plans = [
    { sku: "WATER-01", perExport: 8, active: (_day: number) => true },
    { sku: "BATT-01", perExport: 2, active: (day: number) => day < 30 || day % 3 === 0 },
    { sku: "FIRSTAID-01", perExport: 1, active: (day: number) => day % 3 === 0 },
    { sku: "TORCH-01", perExport: 1, active: (day: number) => day > 30 && day % 4 === 0 },
    {
      sku: "LIFE-ADULT",
      perExport: 4,
      active: (day: number) => (day >= 43 && day <= 47) || (day >= 8 && day <= 12),
    },
    { sku: "RICE-01", perExport: 10, active: (day: number) => day % 2 === 0 },
    { sku: "HYGIENE-KIT-01", perExport: 3, active: (day: number) => day % 4 === 0 },
  ];
  const sources = ["SCAN", "BULK", "LOADCELL"] as const;
  let transactionCount = 0;

  for (const plan of plans) {
    const ref = primaryBatchBySku.get(plan.sku);
    if (!ref) continue;
    const exports: { dayAgo: number; quantity: number }[] = [];
    for (let dayAgo = 60; dayAgo >= 1; dayAgo--) {
      if (!plan.active(dayAgo)) continue;
      const quantity = Math.max(1, plan.perExport + ((exports.length % 3) - 1));
      exports.push({ dayAgo, quantity });
    }
    const totalExported = exports.reduce((sum, row) => sum + row.quantity, 0);
    await prisma.inventoryTransaction.create({
      data: {
        batchId: ref.batchId,
        userId,
        type: "IMPORT",
        source: "BULK",
        quantity: ref.quantity + totalExported,
        note: "Tồn đầu kỳ và nhập kho theo biên bản",
        createdAt: dateFromOffset(-61)!,
      },
    });
    transactionCount++;

    for (let index = 0; index < exports.length; index++) {
      const row = exports[index];
      await prisma.inventoryTransaction.create({
        data: {
          batchId: ref.batchId,
          userId,
          type: "EXPORT",
          source: sources[index % sources.length],
          quantity: row.quantity,
          note: "Xuất phục vụ ứng trực và hỗ trợ dân cư",
          createdAt: dateFromOffset(-row.dayAgo)!,
        },
      });
      transactionCount++;
    }
  }
  return transactionCount;
}

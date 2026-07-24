import { ForbiddenException, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  Prisma,
  TransactionSource,
  VirtualDevice,
  VirtualDeviceType,
  WarehouseKind,
} from "@prisma/client";
import { Permission } from "@safestock/shared-types";
import { IncidentService } from "../incident/incident.service";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { SimulationAccessService } from "./simulation-access.service";
import { SimulationSystemActorService } from "./simulation-system-actor.service";

// Ngưỡng lọc: chỉ lưu event khi giá trị đổi đủ lớn so với current (tránh phình bảng).
const SIGNIFICANT_DELTA: Partial<Record<VirtualDeviceType, number>> = {
  TEMPERATURE: 0.5, // °C
  HUMIDITY: 1, // %
  LOADCELL: 0.1, // kg
  SMOKE: 5,
};

// Cảm biến ảnh hưởng điểm môi trường → đổi thì tính lại Readiness.
const ENV_DEVICE_TYPES: VirtualDeviceType[] = [
  VirtualDeviceType.TEMPERATURE,
  VirtualDeviceType.HUMIDITY,
];

// Gộp nhiều event môi trường liên tiếp thành 1 lần recalc (tránh dồn dập lúc chạy scenario).
const RECALC_DEBOUNCE_MS = 300;

// Quét sự cố nặng hơn recalc (3 query + 300 điểm lịch sử), nên debounce dài hơn để
// gộp cả burst event của 1 lần chỉnh/1 scenario thành 1 lần scan.
const INCIDENT_SCAN_DEBOUNCE_MS = 1200;

export interface EmitInput {
  warehouseId: string;
  deviceCode: string;
  eventType: string;
  value: number;
  scenarioId?: string;
  runId?: string;
  quality?: number;
}

@Injectable()
export class SimulationService implements OnModuleDestroy {
  private readonly log = new Logger(SimulationService.name);
  private recalcTimers = new Map<string, NodeJS.Timeout>();
  private incidentScanTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private readiness: ReadinessService,
    private inventory: InventoryService,
    private incidents: IncidentService,
    private access: SimulationAccessService,
    private systemActors: SimulationSystemActorService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.recalcTimers.values()) clearTimeout(timer);
    for (const timer of this.incidentScanTimers.values()) clearTimeout(timer);
    this.recalcTimers.clear();
    this.incidentScanTimers.clear();
  }

  async firstWarehouse(userId: string) {
    const actor = await this.access.assertPermission(userId, Permission.SIMULATION_VIEW);
    if (actor.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: actor.warehouseId, organizationId: actor.organizationId },
        select: { id: true, name: true },
      });
      if (!warehouse) throw new ForbiddenException("Kho được gán không còn hợp lệ");
      return warehouse;
    }

    return this.prisma.warehouse.findFirst({
      where: { kind: WarehouseKind.CENTRAL, organizationId: actor.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  }

  async listDevices(userId: string, warehouseId: string) {
    await this.access.assertWarehouseAccess(userId, warehouseId, Permission.SIMULATION_VIEW);
    return this.prisma.virtualDevice.findMany({
      where: { warehouseId },
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });
  }

  async getDevice(userId: string, warehouseId: string, code: string) {
    await this.access.assertWarehouseAccess(userId, warehouseId, Permission.SIMULATION_VIEW);
    return this.prisma.virtualDevice.findUnique({
      where: { warehouseId_code: { warehouseId, code } },
    });
  }

  /**
   * Ghi 1 sự kiện cảm biến. Cập nhật DeviceState (current) LUÔN, nhưng chỉ LƯU SensorEvent
   * khi vượt ngưỡng (đổi trạng thái door/online, hoặc delta đủ lớn). Trả về event nếu đã lưu.
   */
  async emit(userId: string, input: EmitInput) {
    await this.access.assertMutationAccess(userId, input.warehouseId);
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize readings for one device so concurrent loadcell deltas cannot double-apply.
      await tx.$queryRaw`
        SELECT "id"
        FROM "VirtualDevice"
        WHERE "warehouseId" = ${input.warehouseId} AND "code" = ${input.deviceCode}
        FOR UPDATE
      `;
      const device = await tx.virtualDevice.findUnique({
        where: { warehouseId_code: { warehouseId: input.warehouseId, code: input.deviceCode } },
        include: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
      });
      if (!device) throw new Error(`Device không tồn tại: ${input.deviceCode}`);
      if (device.shelfId && device.shelf?.zone.warehouseId !== input.warehouseId) {
        throw new ForbiddenException("Thiết bị và kệ không cùng kho");
      }

      const prev = device.currentValue;
      const delta = SIGNIFICANT_DELTA[device.type] ?? 0;
      const significant = prev == null || Math.abs(input.value - prev) >= delta || delta === 0;
      const inventoryBatchId =
        device.type === VirtualDeviceType.LOADCELL && prev != null && device.shelfId
          ? await this.applyLoadcellTxnInTx(tx, device, prev, input.value)
          : null;

      await tx.virtualDevice.update({
        where: { id: device.id },
        data: { currentValue: input.value },
      });

      if (!significant) {
        return { saved: null, deviceType: device.type, inventoryBatchId };
      }

      const saved = await tx.sensorEvent.create({
        data: {
          deviceId: device.id,
          warehouseId: input.warehouseId,
          zoneId: device.zoneId,
          eventType: input.eventType,
          value: input.value,
          unit: device.unit,
          quality: input.quality ?? 1.0,
          scenarioId: input.scenarioId,
          runId: input.runId,
        },
      });
      return { saved, deviceType: device.type, inventoryBatchId };
    });

    if (result.inventoryBatchId) {
      await this.inventory.recalcBatches([result.inventoryBatchId]);
    }
    if (ENV_DEVICE_TYPES.includes(result.deviceType)) {
      this.scheduleRecalc(input.warehouseId);
    }
    if (!result.saved) return null;

    // Event vừa persist → quét sự cố (debounce) để cảnh báo tự bật realtime
    // qua NotificationService/gateway. scanWarehouse đọc sensorEvent đã lưu.
    this.scheduleIncidentScan(input.warehouseId);

    return result.saved;
  }

  async timeline(userId: string, warehouseId: string, limit = 50) {
    await this.access.assertWarehouseAccess(userId, warehouseId, Permission.SIMULATION_VIEW);
    return this.prisma.sensorEvent.findMany({
      where: { warehouseId },
      include: { device: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Lên lịch tính lại Readiness cho 1 kho, gộp các event môi trường liên tiếp
   * trong RECALC_DEBOUNCE_MS thành 1 lần (tránh recalc dồn dập khi chạy scenario).
   */
  private scheduleRecalc(warehouseId: string): void {
    const existing = this.recalcTimers.get(warehouseId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.recalcTimers.delete(warehouseId);
      this.readiness.recalculateWarehouse(warehouseId).catch((error) => {
        this.log.warn(`Recalc readiness lỗi cho kho ${warehouseId}: ${error.message}`);
      });
    }, RECALC_DEBOUNCE_MS);
    this.recalcTimers.set(warehouseId, timer);
  }

  /**
   * Lên lịch quét sự cố cho 1 kho, gộp burst event trong INCIDENT_SCAN_DEBOUNCE_MS
   * thành 1 lần scan. Không chặn luồng emit(): lỗi chỉ log warn. Cảnh báo mới (nếu có)
   * được scanWarehouse tự đẩy tới ADMIN qua NotificationService → gateway realtime.
   */
  private scheduleIncidentScan(warehouseId: string): void {
    const existing = this.incidentScanTimers.get(warehouseId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.incidentScanTimers.delete(warehouseId);
      this.incidents.scanWarehouse(warehouseId).catch((error) => {
        this.log.warn(`Quét sự cố lỗi cho kho ${warehouseId}: ${error.message}`);
      });
    }, INCIDENT_SCAN_DEBOUNCE_MS);
    this.incidentScanTimers.set(warehouseId, timer);
  }

  /**
   * Loadcell đổi cân nặng đáng kể → suy số lượng qua Item.unitWeightKg → tự sinh
   * InventoryTransaction (Bp1). Chỉ hỗ trợ kệ có batch, đơn giản hoá lấy batch đầu
   * tiên tạo trên kệ nếu có nhiều batch (ponytail: đủ cho demo 1 SKU/kệ, nâng cấp
   * khi cần map chính xác nhiều batch cùng kệ → thêm cảm biến/label riêng từng batch).
   * Chạy trong cùng transaction với device/event để không làm lệch baseline khi có lỗi.
   */
  private async applyLoadcellTxnInTx(
    tx: Prisma.TransactionClient,
    device: VirtualDevice,
    prev: number,
    newValue: number,
  ): Promise<string | null> {
    const deltaKg = prev - newValue;
    if (Math.abs(deltaKg) < SIGNIFICANT_DELTA.LOADCELL!) return null;

    const batch = await tx.itemBatch.findFirst({
      where: { shelfId: device.shelfId! },
      include: { item: true },
      orderBy: { createdAt: "asc" },
    });
    if (!batch || !batch.item.unitWeightKg) return null;

    const deltaQty = Math.round(Math.abs(deltaKg) / batch.item.unitWeightKg);
    if (deltaQty === 0) return null;

    const systemUserId = await this.systemActors.getActorId(device.warehouseId);
    if (deltaKg > 0) {
      await this.inventory.exportInTx(
        tx,
        systemUserId,
        batch.id,
        deltaQty,
        "Tự động từ loadcell",
        TransactionSource.LOADCELL,
        device.warehouseId,
      );
    } else {
      await this.inventory.importInTx(
        tx,
        systemUserId,
        batch.id,
        deltaQty,
        "Tự động từ loadcell",
        TransactionSource.LOADCELL,
        device.warehouseId,
      );
    }
    return batch.id;
  }
}

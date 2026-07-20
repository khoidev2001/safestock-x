import { Injectable, Logger } from "@nestjs/common";
import { TransactionSource, UserRole, VirtualDevice, VirtualDeviceType } from "@prisma/client";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";

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
export class SimulationService {
  private readonly log = new Logger(SimulationService.name);
  private recalcTimers = new Map<string, NodeJS.Timeout>();
  private systemUserId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private readiness: ReadinessService,
    private inventory: InventoryService,
  ) {}

  firstWarehouse() {
    return this.prisma.warehouse.findFirst({ select: { id: true, name: true } });
  }

  listDevices(warehouseId: string) {
    return this.prisma.virtualDevice.findMany({
      where: { warehouseId },
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });
  }

  getDevice(warehouseId: string, code: string) {
    return this.prisma.virtualDevice.findUnique({
      where: { warehouseId_code: { warehouseId, code } },
    });
  }

  /**
   * Ghi 1 sự kiện cảm biến. Cập nhật DeviceState (current) LUÔN, nhưng chỉ LƯU SensorEvent
   * khi vượt ngưỡng (đổi trạng thái door/online, hoặc delta đủ lớn). Trả về event nếu đã lưu.
   */
  async emit(input: EmitInput) {
    const device = await this.prisma.virtualDevice.findUnique({
      where: { warehouseId_code: { warehouseId: input.warehouseId, code: input.deviceCode } },
    });
    if (!device) throw new Error(`Device không tồn tại: ${input.deviceCode}`);

    const prev = device.currentValue;
    const delta = SIGNIFICANT_DELTA[device.type] ?? 0;
    const significant =
      prev == null || Math.abs(input.value - prev) >= delta || delta === 0;

    if (device.type === VirtualDeviceType.LOADCELL && prev != null && device.shelfId) {
      await this.autoGenerateLoadcellTxn(device, prev, input.value);
    }

    // Luôn cập nhật current
    await this.prisma.virtualDevice.update({
      where: { id: device.id },
      data: { currentValue: input.value },
    });

    // Recalc Readiness khi cảm biến môi trường đổi (điểm rớt <2s — khoảnh khắc vàng).
    if (ENV_DEVICE_TYPES.includes(device.type)) {
      this.scheduleRecalc(input.warehouseId);
    }

    if (!significant) return null;

    return this.prisma.sensorEvent.create({
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
  }

  timeline(warehouseId: string, limit = 50) {
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

  /** Actor hệ thống cho giao dịch tự sinh (loadcell không có user thật thao tác) — cache 1 lần. */
  private async getSystemUserId(): Promise<string | null> {
    if (this.systemUserId) return this.systemUserId;
    const admin = await this.prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    this.systemUserId = admin?.id ?? null;
    return this.systemUserId;
  }

  /**
   * Loadcell đổi cân nặng đáng kể → suy số lượng qua Item.unitWeightKg → tự sinh
   * InventoryTransaction (Bp1). Chỉ hỗ trợ kệ có batch, đơn giản hoá lấy batch đầu
   * tiên tạo trên kệ nếu có nhiều batch (ponytail: đủ cho demo 1 SKU/kệ, nâng cấp
   * khi cần map chính xác nhiều batch cùng kệ → thêm cảm biến/label riêng từng batch).
   * Lỗi không chặn luồng emit() chính — cảm biến vẫn phải cập nhật currentValue.
   */
  private async autoGenerateLoadcellTxn(device: VirtualDevice, prev: number, newValue: number): Promise<void> {
    try {
      const deltaKg = prev - newValue;
      if (Math.abs(deltaKg) < SIGNIFICANT_DELTA.LOADCELL!) return;

      const batch = await this.prisma.itemBatch.findFirst({
        where: { shelfId: device.shelfId! },
        include: { item: true },
        orderBy: { createdAt: "asc" },
      });
      if (!batch || !batch.item.unitWeightKg) return;

      const deltaQty = Math.round(Math.abs(deltaKg) / batch.item.unitWeightKg);
      if (deltaQty === 0) return;

      const systemUserId = await this.getSystemUserId();
      if (!systemUserId) return;

      if (deltaKg > 0) {
        await this.inventory.export(systemUserId, batch.id, deltaQty, "Tự động từ loadcell", TransactionSource.LOADCELL);
      } else {
        await this.inventory.import(systemUserId, batch.id, deltaQty, "Tự động từ loadcell", TransactionSource.LOADCELL);
      }
    } catch (error) {
      this.log.warn(`Tự sinh giao dịch loadcell lỗi (device ${device.code}): ${(error as Error).message}`);
    }
  }
}

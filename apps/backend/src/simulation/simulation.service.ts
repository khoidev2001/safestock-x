import { Injectable } from "@nestjs/common";
import { VirtualDeviceType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

// Ngưỡng lọc: chỉ lưu event khi giá trị đổi đủ lớn so với current (tránh phình bảng).
const SIGNIFICANT_DELTA: Partial<Record<VirtualDeviceType, number>> = {
  TEMPERATURE: 0.5, // °C
  HUMIDITY: 1, // %
  LOADCELL: 0.1, // kg
  SMOKE: 5,
};

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
  constructor(private prisma: PrismaService) {}

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

    // Luôn cập nhật current
    await this.prisma.virtualDevice.update({
      where: { id: device.id },
      data: { currentValue: input.value },
    });

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
}

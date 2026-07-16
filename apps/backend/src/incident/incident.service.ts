import { Injectable, NotFoundException } from "@nestjs/common";
import { IncidentSeverity, IncidentState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { detectIncidents, DetectedIncident, SensorSignal } from "./incident.rules";

@Injectable()
export class IncidentService {
  constructor(private prisma: PrismaService) {}

  /**
   * Quét sự kiện cảm biến gần đây của 1 kho, phát hiện sự cố + lưu.
   * Gọi sau khi chạy scenario (hoặc định kỳ). Trả về sự cố mới tạo.
   */
  async scanWarehouse(warehouseId: string, sinceMinutes = 60) {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    const events = await this.prisma.sensorEvent.findMany({
      where: { warehouseId, createdAt: { gte: since } },
      include: { device: true },
      orderBy: { createdAt: "asc" },
    });

    const signals: SensorSignal[] = events.map((e) => ({
      deviceCode: e.device.code,
      deviceType: e.device.type,
      eventType: e.eventType,
      value: e.value,
      occurredAt: e.createdAt,
    }));

    const detected = detectIncidents(signals);
    const created = [] as Awaited<ReturnType<typeof this.persist>>[];
    for (const incident of detected) {
      created.push(await this.persist(warehouseId, incident));
    }
    return { warehouseId, detected: created.length, incidents: created };
  }

  /** Danh sách sự cố của 1 kho. */
  list(warehouseId: string, state?: IncidentState) {
    return this.prisma.incident.findMany({
      where: { warehouseId, ...(state ? { state } : {}) },
      orderBy: { detectedAt: "desc" },
    });
  }

  /** Chi tiết sự cố + timeline bằng chứng (theo thời gian). */
  async getWithTimeline(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        evidence: { orderBy: { occurredAt: "asc" } },
        actions: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!incident) throw new NotFoundException("Không tìm thấy sự cố");
    return incident;
  }

  /** Ghi giải thích LLM (proxy ai-service). */
  setExplanation(id: string, explanation: string) {
    return this.prisma.incident.update({ where: { id }, data: { explanation } });
  }

  /** Chuyển trạng thái xử lý + ghi hành động. */
  async transition(id: string, action: "acknowledge" | "assign" | "resolve", actorId: string, note?: string) {
    const nextState: Record<string, IncidentState> = {
      acknowledge: IncidentState.ACKNOWLEDGED,
      assign: IncidentState.ASSIGNED,
      resolve: IncidentState.RESOLVED,
    };
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException("Không tìm thấy sự cố");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.incident.update({
        where: { id },
        data: {
          state: nextState[action],
          resolvedAt: action === "resolve" ? new Date() : incident.resolvedAt,
        },
      });
      await tx.incidentAction.create({
        data: { incidentId: id, action: action.toUpperCase(), actorId, note },
      });
      return updated;
    });
  }

  // ---- lưu ----

  private persist(warehouseId: string, incident: DetectedIncident) {
    return this.prisma.incident.create({
      data: {
        warehouseId,
        kind: incident.kind,
        severity: incident.severity as IncidentSeverity,
        confidence: incident.confidence,
        title: incident.title,
        state: IncidentState.OPEN,
        evidence: {
          create: incident.evidence.map((e) => ({
            deviceCode: e.deviceCode,
            eventType: e.eventType,
            value: e.value,
            weight: e.weight,
            occurredAt: e.occurredAt,
            note: e.note,
          })),
        },
      },
      include: { evidence: true },
    });
  }
}

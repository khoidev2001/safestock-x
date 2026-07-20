import { Injectable, NotFoundException } from "@nestjs/common";
import { IncidentSeverity, IncidentState, NotificationKind, UserRole, VirtualDeviceType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { detectIncidents, DetectedIncident, SensorSignal } from "./incident.rules";
import { detectStatisticalAnomaly, detectPredictiveWarning, CONTINUOUS_DEVICE_TYPES } from "./anomaly.rules";

@Injectable()
export class IncidentService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

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

    // Anomaly/predictive cần baseline lịch sử dài hơn cửa sổ scan thường (60ph) —
    // query riêng, giới hạn 300 điểm/loại liên tục để chặn phình query theo thời gian.
    const historyEvents = await this.prisma.sensorEvent.findMany({
      where: { warehouseId, device: { type: { in: CONTINUOUS_DEVICE_TYPES as VirtualDeviceType[] } } },
      include: { device: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const history: SensorSignal[] = historyEvents
      .reverse()
      .map((e) => ({
        deviceCode: e.device.code,
        deviceType: e.device.type,
        eventType: e.eventType,
        value: e.value,
        occurredAt: e.createdAt,
      }));
    detected.push(...detectStatisticalAnomaly(history));
    detected.push(...detectPredictiveWarning(history));

    // Chống spam trùng lặp: sự cố cùng kind+thiết bị đang mở (chưa RESOLVED) thì không tạo mới.
    const openIncidents = await this.prisma.incident.findMany({
      where: { warehouseId, state: { not: IncidentState.RESOLVED } },
      include: { evidence: true },
    });
    const openKeys = new Set(
      openIncidents.flatMap((i) => i.evidence.map((e) => `${i.kind}|${e.deviceCode}`)),
    );

    const created = [] as Awaited<ReturnType<typeof this.persist>>[];
    for (const incident of detected) {
      const isDuplicate = incident.evidence.some((e) => openKeys.has(`${incident.kind}|${e.deviceCode}`));
      if (isDuplicate) continue;

      const saved = await this.persist(warehouseId, incident);
      created.push(saved);
      await this.notifications.create({
        recipientRole: UserRole.ADMIN,
        kind: NotificationKind.INCIDENT_DETECTED,
        title: saved.title,
        body: `Mức độ ${saved.severity} · độ tin cậy ${Math.round(saved.confidence * 100)}%`,
        warehouseId,
      });
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

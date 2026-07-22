import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { IncidentSeverity, IncidentState, NotificationKind, UserRole, VirtualDeviceType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { AiClientService } from "../ai/ai-client.service";
import { AlertMailService } from "../mail/alert-mail.service";
import { buildIncidentContext } from "./incident.context";
import { detectIncidents, DetectedIncident, SensorSignal } from "./incident.rules";
import { detectStatisticalAnomaly, detectPredictiveWarning, CONTINUOUS_DEVICE_TYPES } from "./anomaly.rules";

const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

@Injectable()
export class IncidentService {
  private readonly log = new Logger(IncidentService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
    private ai: AiClientService,
    private mail: AlertMailService,
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
      // Cảnh báo rule-based NỔ TỨC THÌ (không chờ AI). Giữ id để enrich đè body sau.
      const notification = await this.notifications.create({
        recipientRole: UserRole.ADMIN,
        kind: NotificationKind.INCIDENT_DETECTED,
        title: saved.title,
        body: `Mức độ ${SEVERITY_LABEL[saved.severity] ?? saved.severity} · độ tin cậy ${Math.round(saved.confidence * 100)}%`,
        warehouseId,
      });
      // AI giải thích + email chạy NỀN (fire-and-forget) — không chặn scan 90s, lỗi chỉ log.
      void this.enrichNewIncident(saved.id, notification.id).catch((error) => {
        this.log.warn(`Enrich sự cố ${saved.id} lỗi: ${(error as Error).message}`);
      });
    }
    return { warehouseId, detected: created.length, incidents: created };
  }

  /**
   * Làm giàu 1 sự cố MỚI bằng AI + đẩy đa kênh + email. Chạy nền sau khi cảnh báo
   * rule-based đã nổ. AI/SMTP lỗi KHÔNG làm mất sự cố:
   *  - AI ok → lưu explanation, đè body notification (đẩy lại cùng id), email kèm text AI.
   *  - AI lỗi → KHÔNG lưu explanation (không mạo danh AI), vẫn email bản rule-based.
   */
  async enrichNewIncident(incidentId: string, notificationId: string): Promise<void> {
    const incident = await this.getWithTimeline(incidentId);
    let explanation: string | null = null;
    try {
      explanation = await this.ai.explain(buildIncidentContext(incident));
      await this.setExplanation(incidentId, explanation);
      await this.notifications.updateAndPush(notificationId, {
        body: `Mức độ ${SEVERITY_LABEL[incident.severity] ?? incident.severity} · độ tin cậy ${Math.round(
          incident.confidence * 100,
        )}% — ${explanation}`,
      });
    } catch (error) {
      // Ollama/ai-service tắt → cảnh báo tức thì vẫn còn; email dùng bản rule-based.
      this.log.warn(`AI giải thích sự cố ${incidentId} lỗi: ${(error as Error).message}`);
    }
    const recipients = await this.resolveEmailRecipients(incident.warehouseId);
    await this.mail.sendIncidentAlert(
      { title: incident.title, severity: incident.severity, confidence: incident.confidence, kind: incident.kind, evidence: incident.evidence },
      explanation,
      recipients,
    );
  }

  private async resolveEmailRecipients(warehouseId: string): Promise<string[]> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { organizationId: true },
    });
    if (!warehouse) return [];

    const users = await this.prisma.user.findMany({
      where: {
        organizationId: warehouse.organizationId,
        notificationEmail: { not: null },
        OR: [
          { role: UserRole.ADMIN },
          { role: UserRole.RESCUE },
          { role: UserRole.WAREHOUSE, warehouseId },
        ],
      },
      select: { notificationEmail: true },
    });
    return users.flatMap((user) => (user.notificationEmail ? [user.notificationEmail] : []));
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

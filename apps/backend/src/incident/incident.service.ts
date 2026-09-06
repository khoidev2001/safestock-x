import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  IncidentSeverity,
  IncidentState,
  NotificationKind,
  UserRole,
  VirtualDeviceType,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { AiClientService } from "../ai/ai-client.service";
import { AlertEmailOutboxService } from "../mail/alert-email-outbox.service";
import { assertWarehouseInScope } from "../inventory/warehouse-scope";
import { buildIncidentContext } from "./incident.context";
import {
  detectIncidents,
  detectSilentDevices,
  DetectedIncident,
  SensorSignal,
} from "./incident.rules";
import {
  detectStatisticalAnomaly,
  detectPredictiveWarning,
  CONTINUOUS_DEVICE_TYPES,
} from "./anomaly.rules";

const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

export interface IncidentScanSource {
  submissionId: string;
  observedAt: Date;
  receivedAt: Date;
}

@Injectable()
export class IncidentService {
  private readonly log = new Logger(IncidentService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
    private ai: AiClientService,
    private outbox: AlertEmailOutboxService,
  ) {}

  /**
   * Quét sự kiện cảm biến gần đây của 1 kho, phát hiện sự cố + lưu.
   * Gọi sau event cảm biến (hoặc định kỳ). Trả về sự cố mới tạo.
   */
  async scanWarehouse(warehouseId: string, sinceMinutes = 60, source?: IncidentScanSource) {
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
      occurredAt: e.observedAt,
    }));

    const detected = detectIncidents(signals);

    // Anomaly/predictive cần baseline lịch sử dài hơn cửa sổ scan thường (60ph) —
    // query riêng, giới hạn 300 điểm/loại liên tục để chặn phình query theo thời gian.
    const historyEvents = await this.prisma.sensorEvent.findMany({
      where: {
        warehouseId,
        device: { type: { in: CONTINUOUS_DEVICE_TYPES as VirtualDeviceType[] } },
      },
      include: { device: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const history: SensorSignal[] = historyEvents.reverse().map((e) => ({
      deviceCode: e.device.code,
      deviceType: e.device.type,
      eventType: e.eventType,
      value: e.value,
      occurredAt: e.observedAt,
    }));
    detected.push(...detectStatisticalAnomaly(history));
    detected.push(...detectPredictiveWarning(history));
    detected.push(...(await this.detectSilence(warehouseId)));

    return this.persistDetected(warehouseId, detected, source);
  }

  /**
   * Chỉ quét mất tín hiệu thiết bị. Đây là thứ duy nhất cần chạy theo đồng hồ,
   * vì mọi quy tắc khác đều được kích hoạt bởi số liệu đi vào.
   *
   * Cố tình KHÔNG gọi `scanWarehouse` từ đồng hồ nền: quét lại toàn bộ cửa sổ 60
   * phút mỗi lượt sẽ dựng lại những sự cố vừa được người vận hành xử lý, khi sự
   * kiện gốc còn nằm trong cửa sổ. Báo động lặp lại vô cớ là cách nhanh nhất để
   * người ta bắt đầu phớt lờ chuông.
   */
  async scanSilentDevices(warehouseId: string) {
    return this.persistDetected(warehouseId, await this.detectSilence(warehouseId));
  }

  /** Lưu sự cố mới, bắn thông báo realtime và xếp email; bỏ qua bản trùng đang mở. */
  private async persistDetected(
    warehouseId: string,
    detected: DetectedIncident[],
    source?: IncidentScanSource,
  ) {
    // Chống spam trùng lặp: sự cố cùng kind+thiết bị đang mở (chưa RESOLVED) thì không tạo mới.
    const openIncidents = await this.prisma.incident.findMany({
      where: { warehouseId, state: { not: IncidentState.RESOLVED } },
      include: { evidence: true },
    });
    const openKeys = new Set(
      openIncidents.flatMap((i) => i.evidence.map((e) => `${i.kind}|${e.deviceCode}`)),
    );

    const recipients = await this.resolveEmailRecipients(warehouseId);
    const created = [] as Awaited<ReturnType<typeof this.persist>>[];
    let suppressed = 0;
    for (const incident of detected) {
      const isDuplicate = incident.evidence.some((e) =>
        openKeys.has(`${incident.kind}|${e.deviceCode}`),
      );
      if (isDuplicate) {
        // Không tạo sự cố mới thì cũng KHÔNG có thư nào được gửi. Trước đây bước
        // này im lặng hoàn toàn, nên người vận hành kéo lại thanh trượt, không
        // nhận được gì, và kết luận nhầm là email hoặc cảnh báo đã hỏng — trong
        // khi hệ thống đang làm đúng việc chống báo động trùng. Đếm và ghi log để
        // "không có gì xảy ra" có lý do nhìn thấy được.
        suppressed += 1;
        this.log.log(
          `Bỏ qua ${incident.kind} ở kho ${warehouseId}: sự cố cùng loại trên cùng thiết bị đang mở. ` +
            `Đóng sự cố cũ rồi mới kích lại được.`,
        );
        continue;
      }

      const saved = await this.persist(warehouseId, incident, recipients, source);
      created.push(saved);
      // Cảnh báo rule-based NỔ TỨC THÌ (không chờ AI). Giữ id để enrich đè body sau.
      const notification = await this.notifications.create({
        recipientRole: UserRole.ADMIN,
        kind: NotificationKind.INCIDENT_DETECTED,
        title: saved.title,
        body: `Mức độ ${SEVERITY_LABEL[saved.severity] ?? saved.severity} · độ tin cậy ${Math.round(saved.confidence * 100)}%`,
        warehouseId,
      });
      // AI enrichment runs in the background. The independently durable email
      // outbox can deliver immediately or retry without blocking incident creation.
      void this.enrichNewIncident(saved.id, notification.id).catch((error) => {
        this.log.warn(`Enrich sự cố ${saved.id} lỗi: ${(error as Error).message}`);
      });
    }
    if (created.length > 0) void this.outbox.processDue();
    return { warehouseId, detected: created.length, suppressed, incidents: created };
  }

  /**
   * Thiết bị nào đã im lặng quá lâu so với chu kỳ báo của chính nó.
   *
   * Đọc mốc `lastSeenAt` — mốc này được cập nhật ở đúng một chỗ (khi nhận số
   * liệu), nên cảm biến thật và thiết bị mô phỏng được giám sát hệt như nhau.
   */
  private async detectSilence(warehouseId: string): Promise<DetectedIncident[]> {
    const devices = await this.prisma.virtualDevice.findMany({
      where: { warehouseId, expectedIntervalSeconds: { not: null } },
      select: {
        code: true,
        type: true,
        lastSeenAt: true,
        expectedIntervalSeconds: true,
      },
    });
    return detectSilentDevices(
      devices.map((device) => ({
        deviceCode: device.code,
        deviceType: device.type,
        lastSeenAt: device.lastSeenAt,
        expectedIntervalSeconds: device.expectedIntervalSeconds,
      })),
      new Date(),
    );
  }

  /**
   * Enrich a new incident asynchronously. Email delivery is intentionally not
   * coupled to AI: the committed outbox carries the rule-based incident even
   * when AI is unavailable or finishes after the first delivery attempt.
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
      // AI failure never removes the rule-based incident or its pending outbox job.
      this.log.warn(`AI giải thích sự cố ${incidentId} lỗi: ${(error as Error).message}`);
    }
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
        // Chỉ email đã xác minh bằng mã 6 số: cảnh báo sự cố không được rơi vào
        // một địa chỉ gõ sai rồi không ai đọc.
        notificationEmailVerifiedAt: { not: null },
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

  /**
   * Chi tiết sự cố + timeline bằng chứng (theo thời gian).
   * scopeWarehouseId: truyền từ JWT khi gọi từ controller — trưởng thôn chỉ xem
   * được sự cố kho mình (chặn IDOR). undefined = caller nội bộ (enrich) không giới hạn.
   */
  async getWithTimeline(id: string, scopeWarehouseId?: string | null) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        evidence: { orderBy: { occurredAt: "asc" } },
        actions: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!incident) throw new NotFoundException("Không tìm thấy sự cố");
    assertWarehouseInScope(scopeWarehouseId, incident.warehouseId);
    return incident;
  }

  /** Ghi giải thích LLM (proxy ai-service). */
  setExplanation(id: string, explanation: string) {
    return this.prisma.incident.update({ where: { id }, data: { explanation } });
  }

  /** Chuyển trạng thái xử lý + ghi hành động. */
  async transition(
    id: string,
    action: "acknowledge" | "assign" | "resolve",
    actorId: string,
    note?: string,
    scopeWarehouseId?: string | null,
  ) {
    const nextState: Record<string, IncidentState> = {
      acknowledge: IncidentState.ACKNOWLEDGED,
      assign: IncidentState.ASSIGNED,
      resolve: IncidentState.RESOLVED,
    };
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException("Không tìm thấy sự cố");
    // Chặn IDOR: trưởng thôn chỉ chuyển trạng thái sự cố thuộc kho mình.
    assertWarehouseInScope(scopeWarehouseId, incident.warehouseId);

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

  private persist(
    warehouseId: string,
    incident: DetectedIncident,
    recipientEmails: string[],
    source?: IncidentScanSource,
  ) {
    const observedAt = source?.observedAt ?? earliestEvidenceAt(incident);
    const receivedAt = source?.receivedAt ?? new Date();
    return this.prisma.incident.create({
      data: {
        warehouseId,
        sourceSubmissionId: source?.submissionId,
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
        emailOutbox: {
          create: {
            warehouseId,
            recipientEmails,
            observedAt,
            receivedAt,
          },
        },
      },
      include: { evidence: true },
    });
  }
}

function earliestEvidenceAt(incident: DetectedIncident): Date {
  return incident.evidence.reduce(
    (earliest, evidence) =>
      evidence.occurredAt.getTime() < earliest.getTime() ? evidence.occurredAt : earliest,
    incident.evidence[0]?.occurredAt ?? new Date(),
  );
}

import { createHash } from "crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TelemetrySource, VirtualDeviceType, WarehouseKind } from "@prisma/client";
import { Permission } from "@safestock/shared-types";
import { IncidentService } from "../incident/incident.service";
import { PrismaService } from "../prisma/prisma.service";
import { SimulationAccessService } from "./simulation-access.service";
import { SIMULATOR_ALARM_POLICY, type SimulatorAlarmPolicy } from "./simulation-policy";
import {
  submissionOwnerColumns,
  type HardwareTelemetryActor,
  type TelemetryActor,
} from "./telemetry-actor";

const MAX_OBSERVED_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export interface ConfirmedReadingInput {
  deviceCode: string;
  value: number;
  /** Mốc đo riêng của cảm biến này; thiếu thì dùng mốc chung của lô. */
  observedAt?: string;
  /** Độ tin cậy phép đo 0..1 (pin yếu, nhiễu, ngoài dải). Thiếu thì coi là 1. */
  quality?: number;
}

export interface ConfirmedSnapshotInput {
  warehouseId: string;
  idempotencyKey: string;
  observedAt: string;
  readings: ConfirmedReadingInput[];
}

export interface AlarmAcknowledgementInput {
  warehouseId: string;
  /** Lô số liệu do chính người vận hành gửi (luồng desktop cũ). */
  submissionKey?: string;
  /** Sự cố nhận realtime, không sinh ra từ thao tác của chính máy này. */
  incidentIds?: string[];
  acknowledgementKey: string;
  acknowledgedAt: string;
}

interface NormalizedReading {
  deviceCode: string;
  value: number;
  observedAt?: string;
  quality?: number;
}

@Injectable()
export class SimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentService,
    private readonly access: SimulationAccessService,
  ) {}

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

  /** Device masters plus the newest historical reading; no current-value row is stored. */
  async listDevices(userId: string, warehouseId: string) {
    const actor = await this.access.assertWarehouseAccess(
      userId,
      warehouseId,
      Permission.SIMULATION_VIEW,
    );
    if (actor.warehouseKind !== WarehouseKind.CENTRAL) return [];

    const devices = await this.prisma.virtualDevice.findMany({
      where: { warehouseId },
      orderBy: [{ type: "asc" }, { code: "asc" }],
      include: {
        events: {
          orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { value: true, observedAt: true },
        },
      },
    });
    return devices.map(({ events, ...device }) => ({
      ...device,
      currentValue: events[0]?.value ?? null,
      currentAt: events[0]?.observedAt ?? null,
    }));
  }

  async timeline(userId: string, warehouseId: string, limit = 50) {
    const actor = await this.access.assertWarehouseAccess(
      userId,
      warehouseId,
      Permission.SIMULATION_VIEW,
    );
    if (actor.warehouseKind !== WarehouseKind.CENTRAL) return [];
    return this.prisma.sensorEvent.findMany({
      where: { warehouseId },
      include: { device: true, submission: { select: { receivedAt: true, idempotencyKey: true } } },
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
      take: normalizeLimit(limit),
    });
  }

  async getPolicy(userId: string, warehouseId: string): Promise<SimulatorAlarmPolicy> {
    await this.access.assertWarehouseAccess(userId, warehouseId, Permission.SIMULATION_VIEW);
    return SIMULATOR_ALARM_POLICY;
  }

  /** Luồng người vận hành: desktop xác nhận giá trị rồi gửi. */
  async submit(userId: string, input: ConfirmedSnapshotInput) {
    const actor = await this.access.assertMutationAccess(userId, input.warehouseId);
    return this.ingest(
      {
        source: TelemetrySource.OPERATOR,
        userId: actor.userId,
        warehouseId: input.warehouseId,
      },
      input,
    );
  }

  /**
   * Luồng phần cứng: gateway đã xác thực bằng khoá thiết bị tự đẩy số liệu.
   *
   * Cố tình KHÔNG đi qua `assertMutationAccess`: cờ tắt simulator là công tắc của
   * luồng mô phỏng, không được phép làm câm cảm biến thật. Phạm vi kho đã bị khoá
   * cứng theo chính khoá thiết bị.
   */
  async ingestFromDevice(actor: HardwareTelemetryActor, input: ConfirmedSnapshotInput) {
    if (input.warehouseId !== actor.warehouseId) {
      throw new ForbiddenException("Thiết bị chỉ gửi được số liệu của kho được cấp khoá");
    }
    return this.ingest(actor, input);
  }

  /**
   * Đường ống dùng chung. Từ đây trở đi không có nhánh nào rẽ theo nguồn: cùng
   * cách ghi sự kiện, cùng quét sự cố, cùng phản hồi.
   */
  private async ingest(actor: TelemetryActor, input: ConfirmedSnapshotInput) {
    const observedAt = parseObservedAt(input.observedAt);
    const readings = normalizeReadings(input.readings, observedAt);
    const payloadHash = hashPayload(input.warehouseId, observedAt, readings);

    const existing = await this.prisma.sensorSubmission.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return this.responseForExistingSubmission(existing, input.warehouseId, payloadHash);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const devices = await tx.virtualDevice.findMany({
          where: {
            warehouseId: input.warehouseId,
            code: { in: readings.map((item) => item.deviceCode) },
          },
          select: { id: true, code: true, type: true, unit: true, zoneId: true },
        });
        if (devices.length !== readings.length) {
          const found = new Set(devices.map((device) => device.code));
          const missing = readings.find((reading) => !found.has(reading.deviceCode));
          throw new NotFoundException(
            `Thiết bị không tồn tại trong kho: ${missing?.deviceCode ?? "?"}`,
          );
        }

        const submission = await tx.sensorSubmission.create({
          data: {
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            warehouseId: input.warehouseId,
            ...submissionOwnerColumns(actor),
            observedAt,
            policyVersion: SIMULATOR_ALARM_POLICY.version,
          },
        });
        const deviceByCode = new Map(devices.map((device) => [device.code, device]));
        const events = await Promise.all(
          readings.map((reading) => {
            const device = deviceByCode.get(reading.deviceCode)!;
            return tx.sensorEvent.create({
              data: {
                submissionId: submission.id,
                deviceId: device.id,
                warehouseId: input.warehouseId,
                zoneId: device.zoneId,
                eventType: eventTypeForDevice(device.type),
                value: reading.value,
                unit: device.unit,
                quality: reading.quality ?? 1,
                observedAt: reading.observedAt ? new Date(reading.observedAt) : observedAt,
              },
            });
          }),
        );
        // Heartbeat: mốc "lần cuối thực sự có tin" của từng thiết bị. Im lặng quá
        // lâu sau đó sẽ thành sự cố, thay vì bị hiểu nhầm là mọi thứ bình thường.
        //
        // Gom theo mốc thời gian: một gateway thật gửi hàng chục cảm biến chung
        // một mốc, nên đây thường là đúng MỘT câu lệnh thay vì mỗi thiết bị một câu.
        const deviceIdsBySeenAt = new Map<number, string[]>();
        for (const reading of readings) {
          const device = deviceByCode.get(reading.deviceCode)!;
          const seenAt = reading.observedAt ? new Date(reading.observedAt) : observedAt;
          const bucket = deviceIdsBySeenAt.get(seenAt.getTime()) ?? [];
          bucket.push(device.id);
          deviceIdsBySeenAt.set(seenAt.getTime(), bucket);
        }
        await Promise.all(
          [...deviceIdsBySeenAt].map(([seenAtMs, deviceIds]) => {
            const seenAt = new Date(seenAtMs);
            // Chỉ tiến, không lùi: gateway gửi bù dữ liệu cũ không được phép làm
            // thiết bị trông "vừa mới báo".
            return tx.virtualDevice.updateMany({
              where: {
                id: { in: deviceIds },
                OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: seenAt } }],
              },
              data: { lastSeenAt: seenAt, online: true },
            });
          }),
        );
        return { submission, events };
      });

      const scan = await this.incidents.scanWarehouse(input.warehouseId, 60, {
        submissionId: created.submission.id,
        observedAt: created.submission.observedAt,
        receivedAt: created.submission.receivedAt,
      });
      return {
        accepted: true,
        duplicate: false,
        submission: summarizeSubmission(created.submission),
        events: created.events.map((event) => ({
          id: event.id,
          deviceId: event.deviceId,
          eventType: event.eventType,
          value: event.value,
          observedAt: event.observedAt,
        })),
        incidents: scan.incidents.map((incident) => ({ id: incident.id, title: incident.title })),
      };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const winner = await this.prisma.sensorSubmission.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!winner) throw error;
      return this.responseForExistingSubmission(winner, input.warehouseId, payloadHash);
    }
  }

  /**
   * Tắt chuông theo QUYỀN TRÊN KHO, không theo "ai đã gửi lô số liệu".
   *
   * Cảm biến thật tự gửi số liệu, nên nếu vẫn khoá theo người gửi thì sẽ không
   * còn ai tắt được chuông do phần cứng kích hoạt. Người vận hành có quyền trên
   * kho phải tắt được mọi chuông của kho đó, bất kể nguồn nào sinh ra.
   */
  async acknowledgeAlarm(userId: string, input: AlarmAcknowledgementInput) {
    const actor = await this.access.assertAlarmAccess(userId, input.warehouseId);
    const acknowledgedAt = parseObservedAt(input.acknowledgedAt);
    const incidents = await this.resolveAcknowledgeableIncidents(input);
    if (incidents === null) {
      // Lô số liệu chưa lên tới server (hàng chờ offline): giữ nguyên để gửi lại.
      return { pending: true, acknowledgedIncidentIds: [] as string[] };
    }
    if (incidents.length === 0) return { pending: false, acknowledgedIncidentIds: [] as string[] };

    await this.prisma.incidentAction.createMany({
      data: incidents.map((incident) => ({
        incidentId: incident.id,
        action: "ALARM_ACKNOWLEDGED",
        actorId: actor.userId,
        idempotencyKey: `${input.acknowledgementKey}:${incident.id}`,
        note: `Desktop xác nhận tắt chuông lúc ${acknowledgedAt.toISOString()}`,
      })),
      skipDuplicates: true,
    });
    return { pending: false, acknowledgedIncidentIds: incidents.map((incident) => incident.id) };
  }

  /**
   * Trả về danh sách sự cố được phép tắt chuông, hoặc null khi lô số liệu tham
   * chiếu chưa tồn tại trên server. Mọi sự cố đều bị giới hạn trong đúng kho đã
   * qua kiểm tra quyền, nên id lạ không thể chạm sang kho khác.
   */
  private async resolveAcknowledgeableIncidents(
    input: AlarmAcknowledgementInput,
  ): Promise<{ id: string }[] | null> {
    if (input.incidentIds?.length) {
      return this.prisma.incident.findMany({
        where: { id: { in: input.incidentIds }, warehouseId: input.warehouseId },
        select: { id: true },
      });
    }
    if (!input.submissionKey) return [];

    const submission = await this.prisma.sensorSubmission.findUnique({
      where: { idempotencyKey: input.submissionKey },
      select: { id: true, warehouseId: true },
    });
    if (!submission) return null;
    if (submission.warehouseId !== input.warehouseId) {
      throw new ForbiddenException("Snapshot không thuộc kho này");
    }
    return this.prisma.incident.findMany({
      where: { sourceSubmissionId: submission.id },
      select: { id: true },
    });
  }

  private async responseForExistingSubmission(
    submission: {
      id: string;
      warehouseId: string;
      payloadHash: string;
      idempotencyKey: string;
      observedAt: Date;
      receivedAt: Date;
      policyVersion: string;
    },
    warehouseId: string,
    payloadHash: string,
  ) {
    if (submission.warehouseId !== warehouseId) {
      throw new ForbiddenException("Snapshot không thuộc kho này");
    }
    if (submission.payloadHash !== payloadHash) {
      throw new ConflictException("Idempotency key đã được dùng cho nội dung snapshot khác");
    }
    const incidents = await this.prisma.incident.findMany({
      where: { sourceSubmissionId: submission.id },
      select: { id: true, title: true },
    });
    return {
      accepted: true,
      duplicate: true,
      submission: summarizeSubmission(submission),
      events: [],
      incidents,
    };
  }
}

/**
 * Chuẩn hoá và kiểm tra lô số liệu.
 *
 * `observedAt` và `quality` chỉ xuất hiện trong kết quả khi client thực sự gửi,
 * nên chữ ký payload của lô cũ (chỉ có deviceCode + value) giữ nguyên giá trị —
 * hàng chờ offline gửi lại sau khi nâng cấp vẫn khớp idempotency cũ.
 */
function normalizeReadings(
  readings: ConfirmedReadingInput[],
  submissionObservedAt: Date,
): NormalizedReading[] {
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new BadRequestException("Snapshot phải có ít nhất một giá trị cảm biến");
  }
  const seen = new Set<string>();
  const normalized = readings.map((reading) => {
    const deviceCode = String(reading.deviceCode ?? "").trim();
    const value = Number(reading.value);
    if (!deviceCode || !Number.isFinite(value)) {
      throw new BadRequestException("Giá trị cảm biến không hợp lệ");
    }
    if (seen.has(deviceCode)) throw new BadRequestException("Một thiết bị chỉ xuất hiện một lần");
    seen.add(deviceCode);

    const item: NormalizedReading = { deviceCode, value };
    if (reading.observedAt !== undefined) {
      const readingObservedAt = parseObservedAt(reading.observedAt);
      if (readingObservedAt.getTime() > submissionObservedAt.getTime() + MAX_FUTURE_SKEW_MS) {
        throw new BadRequestException("Mốc đo của thiết bị vượt quá mốc của lô số liệu");
      }
      item.observedAt = readingObservedAt.toISOString();
    }
    if (reading.quality !== undefined) {
      const quality = Number(reading.quality);
      if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
        throw new BadRequestException("Độ tin cậy phép đo phải nằm trong khoảng 0..1");
      }
      item.quality = quality;
    }
    return item;
  });
  return normalized.sort((left, right) => left.deviceCode.localeCompare(right.deviceCode));
}

function parseObservedAt(value: string): Date {
  const observedAt = new Date(value);
  if (Number.isNaN(observedAt.getTime())) throw new BadRequestException("observedAt không hợp lệ");
  const delta = observedAt.getTime() - Date.now();
  if (delta < -MAX_OBSERVED_AGE_MS || delta > MAX_FUTURE_SKEW_MS) {
    throw new BadRequestException("observedAt nằm ngoài khoảng thời gian cho phép");
  }
  return observedAt;
}

function hashPayload(warehouseId: string, observedAt: Date, readings: NormalizedReading[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ warehouseId, observedAt: observedAt.toISOString(), readings }))
    .digest("hex");
}

function eventTypeForDevice(type: VirtualDeviceType): string {
  switch (type) {
    case VirtualDeviceType.TEMPERATURE:
      return "TEMP_READING";
    case VirtualDeviceType.HUMIDITY:
      return "HUMID_READING";
    case VirtualDeviceType.SMOKE:
      return "SMOKE_READING";
    case VirtualDeviceType.LOADCELL:
      return "WEIGHT_CHANGED";
    default:
      return "DEVICE_READING";
  }
}

function summarizeSubmission(submission: {
  id: string;
  idempotencyKey: string;
  observedAt: Date;
  receivedAt: Date;
  policyVersion: string;
}) {
  return {
    id: submission.id,
    idempotencyKey: submission.idempotencyKey,
    observedAt: submission.observedAt,
    receivedAt: submission.receivedAt,
    policyVersion: submission.policyVersion,
  };
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(Math.floor(value), 200));
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

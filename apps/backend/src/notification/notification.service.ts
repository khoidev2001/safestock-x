import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NotificationKind, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const NOTIFICATION_NOT_FOUND = "Không tìm thấy thông báo";
const ORGANIZATION_SCOPED_KINDS = new Set<NotificationKind>([
  NotificationKind.INCIDENT_REPORTED,
  NotificationKind.WAREHOUSE_REQUESTED,
  NotificationKind.WAREHOUSE_REQUEST_ACCEPTED,
  NotificationKind.WAREHOUSE_REQUEST_REVIEW,
]);
const WAREHOUSE_TARGETED_KINDS = new Set<NotificationKind>([
  NotificationKind.WAREHOUSE_REQUESTED,
  NotificationKind.WAREHOUSE_REQUEST_ACCEPTED,
  NotificationKind.WAREHOUSE_REQUEST_REVIEW,
]);

export interface CreateNotification {
  recipientRole: UserRole;
  kind: NotificationKind;
  title: string;
  body: string;
  missionId?: string;
  warehouseId?: string | null;
  recipientUserId?: string;
  organizationId?: string | null;
}

export interface NotificationActorScope {
  role: UserRole;
  organizationId: string;
  userId?: string;
  warehouseId?: string | null;
}

export interface NotificationDelivery {
  role: UserRole;
  organizationId: string | null;
  warehouseId: string | null;
  recipientUserId: string | null;
  kind: NotificationKind;
  notification: unknown;
}

/** Hàm đẩy realtime (gateway gán vào) — service không phụ thuộc Socket.IO. */
export type NotificationPusher = (delivery: NotificationDelivery) => void;

export interface NotificationRecord {
  id: string;
  recipientRole: UserRole;
  missionId: string | null;
  warehouseId: string | null;
  recipientUserId: string | null;
  organizationId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

type NotificationPatch = { title?: string; body?: string };

interface NotificationWhereInput {
  id?: string;
  recipientRole?: UserRole;
  kind?: NotificationKind | { not: NotificationKind } | { notIn: NotificationKind[] };
  organizationId?: string | null;
  warehouseId?: string | null;
  recipientUserId?: string | null;
  read?: boolean;
  OR?: NotificationWhereInput[];
  AND?: NotificationWhereInput[];
}

/**
 * Minimal delegate contract keeps this module type-safe while the additive
 * organizationId Prisma migration and generated client are deployed together.
 */
interface OrganizationScopedNotificationDelegate {
  create(args: { data: CreateNotification }): Promise<NotificationRecord>;
  findUnique(args: { where: { id: string } }): Promise<NotificationRecord | null>;
  findFirst(args: { where: NotificationWhereInput }): Promise<NotificationRecord | null>;
  findMany(args: {
    where: NotificationWhereInput;
    orderBy: { createdAt: "desc" };
    take: number;
  }): Promise<NotificationRecord[]>;
  update(args: { where: { id: string }; data: NotificationPatch }): Promise<NotificationRecord>;
  updateMany(args: {
    where: NotificationWhereInput;
    data: NotificationPatch | { read: true };
  }): Promise<{ count: number }>;
}

@Injectable()
export class NotificationService {
  /** Gateway gán để đẩy WebSocket; mặc định no-op (test không cần socket). */
  push: NotificationPusher = () => {};

  private readonly store: OrganizationScopedNotificationDelegate;

  constructor(prisma: PrismaService) {
    this.store = prisma.notification as unknown as OrganizationScopedNotificationDelegate;
  }

  /** Tạo thông báo + đẩy realtime theo role hoặc organization + role. */
  async create(input: CreateNotification): Promise<NotificationRecord> {
    const organizationId = this.normalizeOrganizationId(input.organizationId);
    if (
      organizationId === null &&
      ORGANIZATION_SCOPED_KINDS.has(input.kind)
    ) {
      throw new BadRequestException("Thông báo nghiệp vụ phải có organizationId");
    }

    const notification = await this.store.create({
      data: { ...input, organizationId },
    });
    this.deliver(notification);
    return notification;
  }

  /**
   * Cập nhật 1 thông báo đã có + đẩy lại realtime (cùng id → client thay tại chỗ,
   * không nhân đôi). Mọi thông báo mới đều gắn organization; bản ghi legacy null
   * không được cập nhật qua bề mặt người dùng cho tới khi backfill đáng tin cậy.
   */
  async updateAndPush(
    id: string,
    data: NotificationPatch,
    actor?: NotificationActorScope,
  ): Promise<NotificationRecord> {
    const current = await this.store.findUnique({ where: { id } });
    if (!current) throw this.notFound();

    const requiresOrganizationScope =
      current.kind === NotificationKind.INCIDENT_REPORTED || current.organizationId !== null;

    let notification: NotificationRecord;
    if (requiresOrganizationScope) {
      if (
        !actor ||
        !current.organizationId ||
        current.recipientRole !== actor.role ||
        current.organizationId !== actor.organizationId ||
        !this.matchesTarget(current, actor)
      ) {
        throw this.notFound();
      }

      const where: NotificationWhereInput = {
        id,
        ...this.actorAccessWhere(actor),
      };
      const updated = await this.store.updateMany({ where, data });
      if (updated.count === 0) throw this.notFound();

      const scoped = await this.store.findFirst({ where });
      if (!scoped) throw this.notFound();
      notification = scoped;
    } else {
      notification = await this.store.update({ where: { id }, data });
    }

    this.deliver(notification);
    return notification;
  }

  /** Danh sách thông báo trong role và organization hiện tại (mới nhất trước). */
  list(actor: NotificationActorScope, onlyUnread = false): Promise<NotificationRecord[]> {
    return this.store.findMany({
      where: {
        ...this.actorAccessWhere(actor),
        ...(onlyUnread ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /** Đánh dấu một thông báo có thể truy cập; mọi trường hợp từ chối đều như không tồn tại. */
  async markRead(id: string, actor: NotificationActorScope): Promise<NotificationRecord> {
    const where: NotificationWhereInput = { id, ...this.actorAccessWhere(actor) };
    const updated = await this.store.updateMany({ where, data: { read: true } });
    if (updated.count === 0) throw this.notFound();

    const notification = await this.store.findFirst({ where });
    if (!notification) throw this.notFound();
    return notification;
  }

  markAllRead(actor: NotificationActorScope): Promise<{ count: number }> {
    return this.store.updateMany({
      where: { ...this.actorAccessWhere(actor), read: false },
      data: { read: true },
    });
  }

  private actorAccessWhere(actor: NotificationActorScope): NotificationWhereInput {
    const targetFilters: NotificationWhereInput[] = [];
    if (actor.userId) {
      targetFilters.push({ OR: [{ recipientUserId: actor.userId }, { recipientUserId: null }] });
    }
    if (actor.role === UserRole.WAREHOUSE) {
      if (!actor.warehouseId) return this.denyAllWhere(actor.role);
      targetFilters.push({
        OR: [
          { warehouseId: actor.warehouseId },
          {
            warehouseId: null,
            kind: { notIn: [...WAREHOUSE_TARGETED_KINDS] },
          },
        ],
      });
    }
    return {
      recipientRole: actor.role,
      AND: [
        {
          OR: [
            { kind: { not: NotificationKind.INCIDENT_REPORTED } },
            { kind: NotificationKind.INCIDENT_REPORTED, organizationId: actor.organizationId },
          ],
        },
        ...(actor.role === UserRole.WAREHOUSE || actor.role === UserRole.ADMIN || actor.role === UserRole.RESCUE
          ? [{
              OR: [
                { organizationId: actor.organizationId },
                { kind: { not: NotificationKind.INCIDENT_REPORTED }, organizationId: null },
              ],
            }]
          : []),
        ...targetFilters,
      ],
    };
  }

  private denyAllWhere(role: UserRole): NotificationWhereInput {
    return {
      recipientRole: role,
      AND: [{ id: "" }, { id: "__unreachable__" }],
    };
  }

  private matchesTarget(current: NotificationRecord, actor: NotificationActorScope): boolean {
    if (current.recipientUserId && current.recipientUserId !== actor.userId) return false;
    if (
      current.recipientRole === UserRole.WAREHOUSE &&
      (WAREHOUSE_TARGETED_KINDS.has(current.kind)
        ? !current.warehouseId || current.warehouseId !== actor.warehouseId
        : current.warehouseId && current.warehouseId !== actor.warehouseId)
    ) return false;
    return true;
  }

  private deliver(notification: NotificationRecord): void {
    const organizationId = notification.organizationId ?? null;
    if (organizationId === null) {
      if (
        ORGANIZATION_SCOPED_KINDS.has(notification.kind)
      ) return;
      this.push({
        role: notification.recipientRole,
        organizationId: null,
        warehouseId: notification.warehouseId,
        recipientUserId: notification.recipientUserId,
        kind: notification.kind,
        notification,
      });
      return;
    }
    this.push({
      role: notification.recipientRole,
      organizationId,
      warehouseId: notification.warehouseId,
      recipientUserId: notification.recipientUserId,
      kind: notification.kind,
      notification,
    });
  }

  private normalizeOrganizationId(organizationId: string | null | undefined): string | null {
    if (organizationId == null) return null;
    if (!organizationId.trim() || organizationId !== organizationId.trim()) {
      throw new BadRequestException("organizationId không hợp lệ");
    }
    return organizationId;
  }

  private notFound(): NotFoundException {
    return new NotFoundException(NOTIFICATION_NOT_FOUND);
  }
}

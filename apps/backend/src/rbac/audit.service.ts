import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Bản ghi nhật ký 5W: ai (actorId) · gì (action) · trên gì (entity/entityId) · vì sao (reason). */
export interface AuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  reason: string;
  warehouseId?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Ghi nhật ký không thể chối bỏ cho thao tác nhạy cảm (CODING-STANDARDS §12).
 * Reason BẮT BUỘC — mô hình hậu kiểm thay cho duyệt 2 bước (quy mô xã).
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    if (!entry.reason || entry.reason.trim().length === 0) {
      throw new BadRequestException("Thao tác nhạy cảm bắt buộc có lý do");
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: entry.actorId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người thực hiện");
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        organizationId: actor.organizationId,
        warehouseId: entry.warehouseId,
        correlationId: entry.correlationId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: {
          reason: entry.reason,
          ...(entry.metadata && typeof entry.metadata === "object"
            ? (entry.metadata as Record<string, unknown>)
            : {}),
        },
      },
    });
  }

  /**
   * Tra soát nhật ký — chỉ ADMIN (quyền audit:view) gọi được qua controller.
   * Lọc tùy chọn theo entity (vd "ItemBatch") và người thực hiện.
   */
  async list(
    actorUserId: string,
    params: { entity?: string; actorId?: string; limit?: number },
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người tra soát");
    const organizationUsers = await this.prisma.user.findMany({
      where: { organizationId: actor.organizationId },
      select: { id: true, fullName: true, email: true },
    });
    const allowedActorIds = organizationUsers.map((user) => user.id);
    if (params.actorId && !allowedActorIds.includes(params.actorId)) {
      return [];
    }
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(params.entity ? { entity: params.entity } : {}),
        ...(params.actorId
          ? { actorId: params.actorId }
          : {
              OR: [
                { organizationId: actor.organizationId },
                {
                  organizationId: null,
                  actorId: { in: allowedActorIds },
                },
              ],
            }),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(params.limit ?? 100, 1), 500),
    });
    const userById = new Map(organizationUsers.map((user) => [user.id, user]));
    return logs.map((log) => ({
      ...log,
      actor: log.actorId ? (userById.get(log.actorId) ?? null) : null,
    }));
  }
}

import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Bản ghi nhật ký 5W: ai (actorId) · gì (action) · trên gì (entity/entityId) · vì sao (reason). */
export interface AuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  reason: string;
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
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
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
  list(params: { entity?: string; actorId?: string; limit?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.entity ? { entity: params.entity } : {}),
        ...(params.actorId ? { actorId: params.actorId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params.limit ?? 100,
    });
  }
}

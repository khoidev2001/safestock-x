import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  MissionStatus,
  MissionWarehouseRequestStatus,
  NotificationKind,
  Prisma,
  UserRole,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { InventoryService } from "../inventory/inventory.service";
import { assertWarehouseInScope } from "../inventory/warehouse-scope";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { requestBatchItems, resizeRequestAllocations } from "./mission-warehouse-request";

@Injectable()
export class MissionWarehouseRequestService {
  private readonly log = new Logger(MissionWarehouseRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
  ) {}

  async list(userId: string, scopeWarehouseId?: string | null) {
    const warehouseId = await this.resolveWarehouseId(userId, scopeWarehouseId);
    return this.prisma.missionWarehouseRequest.findMany({
      where: { warehouseId },
      include: {
        warehouse: { select: { id: true, name: true } },
        mission: {
          select: {
            id: true,
            incidentType: true,
            location: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  }

  /** Kho xác nhận đã đọc và tiếp nhận một SKU; retry là idempotent. */
  async accept(requestId: string, userId: string, scopeWarehouseId?: string | null, note?: string) {
    const warehouseId = await this.resolveWarehouseId(userId, scopeWarehouseId);
    const accepted = await this.prisma.missionWarehouseRequest.updateMany({
      where: {
        id: requestId,
        warehouseId,
        status: MissionWarehouseRequestStatus.PENDING,
        preparationClaimToken: null,
        mission: { status: MissionStatus.PENDING_WAREHOUSE },
      },
      data: {
        status: MissionWarehouseRequestStatus.ACCEPTED,
        acceptedByUserId: userId,
        acceptedAt: new Date(),
        warehouseNote: normalizeNote(note),
      },
    });
    const current = await this.prisma.missionWarehouseRequest.findFirst({
      where: { id: requestId, warehouseId },
      include: { warehouse: { select: { organizationId: true, name: true } } },
    });
    if (!current) throw new NotFoundException("Không tìm thấy yêu cầu vật tư");
    if (
      accepted.count === 0 &&
      current.status !== MissionWarehouseRequestStatus.ACCEPTED &&
      current.status !== MissionWarehouseRequestStatus.PREPARED
    ) {
      throw new BadRequestException("Yêu cầu không còn ở trạng thái chờ tiếp nhận");
    }
    if (accepted.count === 1) {
      await this.notify(
        {
          recipientRole: UserRole.ADMIN,
          kind: NotificationKind.WAREHOUSE_REQUEST_ACCEPTED,
          title: "Kho đã tiếp nhận yêu cầu vật tư",
          body: `${current.warehouse.name}: ${current.itemName} ${current.requestedQuantity} ${current.unit}.`,
          missionId: current.missionId,
          warehouseId,
          organizationId: current.warehouse.organizationId,
        },
        `tiếp nhận ${requestId}`,
      );
    }
    return current;
  }

  /** CAS ngăn ghi chú chênh lệch đè lên SKU đã PREPARED. */
  async reportDiscrepancy(
    requestId: string,
    userId: string,
    scopeWarehouseId: string | null | undefined,
    note: string,
  ) {
    const warehouseId = await this.resolveWarehouseId(userId, scopeWarehouseId);
    const normalizedNote = normalizeNote(note);
    if (!normalizedNote) throw new BadRequestException("Cần ghi rõ thiếu hoặc sai thông tin");
    const changed = await this.prisma.missionWarehouseRequest.updateMany({
      where: {
        id: requestId,
        warehouseId,
        status: {
          in: [MissionWarehouseRequestStatus.PENDING, MissionWarehouseRequestStatus.ACCEPTED],
        },
        preparationClaimToken: null,
      },
      data: { warehouseNote: normalizedNote },
    });
    if (changed.count !== 1) {
      throw new BadRequestException("Không thể báo chênh lệch sau khi vật tư đã xuất");
    }
    const current = await this.prisma.missionWarehouseRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { warehouse: { select: { organizationId: true, name: true } } },
    });
    await this.notify(
      {
        recipientRole: UserRole.ADMIN,
        kind: NotificationKind.WAREHOUSE_REQUEST_REVIEW,
        title: "Kho báo chênh lệch vật tư",
        body: `${current.warehouse.name}: ${current.itemName} — ${normalizedNote}`,
        missionId: current.missionId,
        warehouseId,
        organizationId: current.warehouse.organizationId,
      },
      `chênh lệch ${requestId}`,
    );
    return current;
  }

  /**
   * ADMIN chỉ được giảm lượng chưa xuất. CAS status + token + updatedAt làm
   * stale review thất bại nếu prepare đã claim hoặc finalize.
   */
  async review(
    requestId: string,
    actorUserId: string,
    input: { requestedQuantity: number; adminNote?: string },
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.missionWarehouseRequest.findFirst({
        where: {
          id: requestId,
          warehouse: { organizationId: actor.organizationId },
          mission: { warehouse: { organizationId: actor.organizationId } },
        },
      });
      if (!request) throw new NotFoundException("Không tìm thấy yêu cầu vật tư");
      if (request.status === MissionWarehouseRequestStatus.PREPARED) {
        throw new BadRequestException("Không thể chỉnh sửa yêu cầu đã chuẩn bị xong");
      }
      const allocations = resizeRequestAllocations(request.allocations, input.requestedQuantity);
      const changed = await tx.missionWarehouseRequest.updateMany({
        where: {
          id: requestId,
          status: {
            in: [MissionWarehouseRequestStatus.PENDING, MissionWarehouseRequestStatus.ACCEPTED],
          },
          preparationClaimToken: null,
          updatedAt: request.updatedAt,
          warehouse: { organizationId: actor.organizationId },
          mission: { warehouse: { organizationId: actor.organizationId } },
        },
        data: {
          requestedQuantity: input.requestedQuantity,
          allocations: allocations as unknown as Prisma.InputJsonValue,
          status: MissionWarehouseRequestStatus.PENDING,
          warehouseNote: null,
          adminNote: normalizeNote(input.adminNote),
          acceptedByUserId: null,
          acceptedAt: null,
        },
      });
      if (changed.count !== 1) {
        const current = await tx.missionWarehouseRequest.findUnique({
          where: { id: requestId },
        });
        if (current?.status === MissionWarehouseRequestStatus.PREPARED) {
          throw new BadRequestException("Không thể chỉnh sửa yêu cầu đã chuẩn bị xong");
        }
        throw new BadRequestException(
          "Yêu cầu vừa được cập nhật, vui lòng tải lại trước khi duyệt",
        );
      }
      return tx.missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { warehouse: { select: { organizationId: true, name: true } } },
      });
    });
    await this.notify(
      {
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.WAREHOUSE_REQUESTED,
        title: "Yêu cầu vật tư đã được cập nhật",
        body: `${result.itemName}: ${result.requestedQuantity} ${result.unit}. Vui lòng tiếp nhận lại.`,
        missionId: result.missionId,
        warehouseId: result.warehouseId,
        organizationId: result.warehouse.organizationId,
      },
      `cập nhật ${requestId}`,
    );
    return result;
  }

  /**
   * Claim, ledger export, request finalize, summary kho và mission READY cùng
   * transaction; retry không thể xuất cùng batch lần hai.
   */
  async prepare(requestId: string, userId: string, scopeWarehouseId?: string | null) {
    const warehouseId = await this.resolveWarehouseId(userId, scopeWarehouseId);
    const claimToken = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.missionWarehouseRequest.findFirst({
        where: { id: requestId, warehouseId },
        include: {
          warehouse: { select: { organizationId: true, name: true } },
          mission: { select: { status: true } },
        },
      });
      if (!request) throw new NotFoundException("Không tìm thấy yêu cầu vật tư");
      if (request.status === MissionWarehouseRequestStatus.PREPARED) {
        return {
          request,
          exported: false,
          becameReady: false,
          items: [] as { batchId: string; quantity: number }[],
        };
      }

      // H2: serialize final per-SKU preparation của cùng một mission. Không có lock này,
      // hai SKU cuối cùng chuẩn bị đồng thời (READ COMMITTED) đều đếm `remainingForMission`
      // trước khi thấy PREPARED của nhau → không lần nào chuyển mission sang READY (kẹt
      // PENDING_WAREHOUSE). Advisory xact lock trên missionId buộc finalize chạy tuần tự.
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        `mission-prepare:${request.missionId}`,
      );
      if (
        request.status !== MissionWarehouseRequestStatus.ACCEPTED ||
        request.mission.status !== MissionStatus.PENDING_WAREHOUSE
      ) {
        throw new BadRequestException("Kho phải tiếp nhận yêu cầu trước khi xuất");
      }
      const items = requestBatchItems(request.allocations);
      if (items.length === 0) {
        throw new BadRequestException("Yêu cầu không có lô vật tư hợp lệ");
      }
      const claimed = await tx.missionWarehouseRequest.updateMany({
        where: {
          id: requestId,
          warehouseId,
          status: MissionWarehouseRequestStatus.ACCEPTED,
          preparationClaimToken: null,
          mission: { status: MissionStatus.PENDING_WAREHOUSE },
        },
        data: { preparationClaimToken: claimToken, preparationClaimedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException("Yêu cầu đang được xử lý, vui lòng tải lại");
      }

      await this.inventory.bulkExportInTx(
        tx,
        userId,
        items,
        `Yêu cầu vật tư ${requestId}`,
        warehouseId,
      );

      const preparedAt = new Date();
      const finalized = await tx.missionWarehouseRequest.updateMany({
        where: {
          id: requestId,
          warehouseId,
          status: MissionWarehouseRequestStatus.ACCEPTED,
          preparationClaimToken: claimToken,
        },
        data: {
          status: MissionWarehouseRequestStatus.PREPARED,
          preparedQuantity: request.requestedQuantity,
          preparedAllocations: request.allocations as Prisma.InputJsonValue,
          preparedByUserId: userId,
          preparedAt,
          preparationClaimToken: null,
          preparationClaimedAt: null,
        },
      });
      if (finalized.count !== 1) {
        throw new BadRequestException("Không thể hoàn tất yêu cầu vật tư");
      }

      const remainingForWarehouse = await tx.missionWarehouseRequest.count({
        where: {
          missionId: request.missionId,
          warehouseId,
          status: { not: MissionWarehouseRequestStatus.PREPARED },
        },
      });
      if (remainingForWarehouse === 0) {
        await tx.missionWarehousePreparation.updateMany({
          where: { missionId: request.missionId, warehouseId, preparedAt: null },
          data: { preparedByUserId: userId, preparedAt },
        });
      }

      const remainingForMission = await tx.missionWarehouseRequest.count({
        where: {
          missionId: request.missionId,
          status: { not: MissionWarehouseRequestStatus.PREPARED },
        },
      });
      let becameReady = false;
      if (remainingForMission === 0) {
        const ready = await tx.mission.updateMany({
          where: { id: request.missionId, status: MissionStatus.PENDING_WAREHOUSE },
          data: { status: MissionStatus.READY },
        });
        becameReady = ready.count === 1;
      }
      const updated = await tx.missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { warehouse: { select: { organizationId: true, name: true } } },
      });
      return { request: updated, exported: true, becameReady, items };
    });

    if (!result.exported) return result.request;
    await this.inventory
      .recalcBatches(result.items.map((item) => item.batchId))
      .catch((error) =>
        this.log.warn(`Recalc sau prepare SKU ${requestId} lỗi: ${message(error)}`),
      );
    await Promise.all([
      this.notify(
        {
          recipientRole: UserRole.ADMIN,
          kind: NotificationKind.WAREHOUSE_READY,
          title: "Kho đã chuẩn bị xong một vật tư",
          body: `${result.request.warehouse.name}: ${result.request.itemName} ${result.request.preparedQuantity} ${result.request.unit}.`,
          missionId: result.request.missionId,
          warehouseId: result.request.warehouseId,
          organizationId: result.request.warehouse.organizationId,
        },
        `prepare SKU ${requestId}`,
      ),
      ...(result.becameReady
        ? [
            this.notify(
              {
                recipientRole: UserRole.RESCUE,
                kind: NotificationKind.WAREHOUSE_READY,
                title: "Toàn bộ vật tư đã sẵn sàng",
                body: "Tất cả kho tham gia đã hoàn tất chuẩn bị theo phương án.",
                missionId: result.request.missionId,
                organizationId: result.request.warehouse.organizationId,
              },
              `mission sẵn sàng sau SKU ${requestId}`,
            ),
          ]
        : []),
    ]);
    return result.request;
  }

  private async resolveWarehouseId(
    userId: string,
    scopeWarehouseId?: string | null,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true },
    });
    if (!user?.warehouseId) {
      throw new BadRequestException("Tài khoản kho chưa được gán kho phụ trách");
    }
    assertWarehouseInScope(scopeWarehouseId, user.warehouseId);
    return user.warehouseId;
  }

  private async notify(input: Parameters<NotificationService["create"]>[0], context: string) {
    await this.notifications.create(input).catch((error) => {
      this.log.warn(`Tạo thông báo ${context} lỗi: ${message(error)}`);
    });
  }
}

function normalizeNote(value?: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > 1_000) {
    throw new BadRequestException("Ghi chú không được dài quá 1000 ký tự");
  }
  return normalized;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

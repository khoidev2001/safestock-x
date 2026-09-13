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
import { PickupError, validatePickup } from "./mission-pickup";
import { UNEXPORTED_REQUEST_STATUSES, isRequestExported } from "./mission-request-status";
import { requestBatchItems, resizeRequestAllocations } from "./mission-warehouse-request";

@Injectable()
export class MissionWarehouseRequestService {
  private readonly log = new Logger(MissionWarehouseRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Người đi lấy ký nhận: cầm đi bao nhiêu, thiếu thì vì sao.
   *
   * Chỉ ghi SỔ, KHÔNG đụng tới tồn kho. Hàng đã trừ khỏi kho ở bước chuẩn bị rồi;
   * trừ thêm lần nữa ở đây là trừ hai lần cho một lần xuất. Phần thiếu là hàng
   * chưa từng rời kho, nên nó vẫn còn nằm đó và không cần cộng lại — cộng lại mới
   * là làm sai, vì bước chuẩn bị đã trừ đúng số soạn ra.
   *
   * Không cho ký lại: ký nhận là chữ ký, sửa được thì nó không còn là chữ ký nữa.
   */
  async confirmPickup(
    requestId: string,
    userId: string,
    receivedQuantity: number,
    note: string | null | undefined,
    scopeWarehouseId?: string | null,
    options: PerItemNoticeOptions = {},
  ) {
    const request = await this.prisma.missionWarehouseRequest.findUnique({
      where: { id: requestId },
      include: { warehouse: { select: { id: true, name: true, organizationId: true } } },
    });
    if (!request) throw new NotFoundException("Không tìm thấy yêu cầu vật tư");
    assertWarehouseInScope(scopeWarehouseId, request.warehouseId);
    /*
     * Người ký nhận phải thuộc CHÍNH đơn vị giữ phiếu.
     *
     * Scope kho một mình không đủ: điều phối xã mang scope rỗng nên trước đây
     * chỉ cần biết id phiếu là ký thay được cho kho của xã bên cạnh — mà ký nhận
     * là chữ ký bàn giao, không sửa lại được sau khi đã ghi.
     */
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!actor || actor.organizationId !== request.warehouse.organizationId) {
      throw new NotFoundException("Không tìm thấy yêu cầu vật tư");
    }
    if (request.status !== MissionWarehouseRequestStatus.PREPARED) {
      throw new BadRequestException(
        request.status === MissionWarehouseRequestStatus.PICKED_UP
          ? "Yêu cầu này đã có người ký nhận rồi"
          : "Kho chưa chuẩn bị xong, chưa lấy hàng được",
      );
    }

    let validated: ReturnType<typeof validatePickup>;
    try {
      validated = validatePickup({
        preparedQuantity: request.preparedQuantity,
        receivedQuantity,
        note,
      });
    } catch (error) {
      if (error instanceof PickupError) throw new BadRequestException(error.message);
      throw error;
    }

    // Chốt bằng điều kiện trạng thái: hai người cùng bấm ký nhận thì chỉ một người
    // thắng, người kia nhận câu báo rõ ràng thay vì ghi đè im lặng lên chữ ký trước.
    const confirmed = await this.prisma.missionWarehouseRequest.updateMany({
      where: { id: requestId, status: MissionWarehouseRequestStatus.PREPARED },
      data: {
        status: MissionWarehouseRequestStatus.PICKED_UP,
        pickedUpQuantity: validated.receivedQuantity,
        pickupNote: validated.note,
        pickedUpByUserId: userId,
        pickedUpAt: new Date(),
      },
    });
    if (confirmed.count !== 1) {
      throw new BadRequestException("Yêu cầu vừa được ký nhận ở nơi khác, vui lòng tải lại");
    }

    // Ký nhận xong là báo điều phối, ĐỦ hay THIẾU đều báo — nhưng chỉ MỘT thông báo
    // và hai cách nói khác hẳn nhau.
    //
    // Trước đây chỉ báo khi thiếu, nên hàng rời kho đúng hẹn thì bảng điều phối im
    // lặng: người trực không biết chuyến đó đã đi hay còn nằm chờ, phải tự mở nhiệm
    // vụ ra dò. Nhưng gửi hai thông báo cho cùng một lần ký (một "đã lấy", một
    // "thiếu") thì lần thiếu chìm ngay trong tiếng ồn của lần đủ — đúng cái bẫy mà
    // việc chỉ-báo-khi-thiếu ngày trước sinh ra để tránh. Nên tách ở đây: dòng chữ
    // của ca thiếu nói thẳng "THIẾU" ngay ở tiêu đề, còn ca đủ đọc như một dòng
    // tiến độ.
    if (validated.shortage > 0) {
      await this.notify(
        {
          recipientRole: UserRole.ADMIN,
          kind: NotificationKind.WAREHOUSE_READY,
          title: "Lấy hàng THIẾU so với số đã soạn",
          body: `${request.warehouse.name}: ${request.itemName} lấy ${validated.receivedQuantity}/${request.preparedQuantity} ${request.unit} — thiếu ${validated.shortage}. Lý do: ${validated.note}`,
          missionId: request.missionId,
          warehouseId: request.warehouseId,
          organizationId: request.warehouse.organizationId,
        },
        `pickup thiếu SKU ${requestId}`,
      );
    } else if (options.notifyAdmin !== false) {
      // Ca THIẾU ở trên luôn báo, kể cả trong lượt hàng loạt: thiếu là chuyện của
      // riêng dòng đó và không được gộp chìm vào câu tổng "đã ký nhận tất cả".
      await this.notify(
        {
          recipientRole: UserRole.ADMIN,
          kind: NotificationKind.WAREHOUSE_READY,
          title: "Đội cứu hộ đã lấy hàng",
          body: `${request.warehouse.name}: ${request.itemName} ${validated.receivedQuantity} ${request.unit} — đã ký nhận đủ.`,
          missionId: request.missionId,
          warehouseId: request.warehouseId,
          organizationId: request.warehouse.organizationId,
        },
        `pickup đủ SKU ${requestId}`,
      );
    }

    /*
     * Ký nhận xong TẤT CẢ vật tư của nhiệm vụ: gọi đội báo kết quả.
     *
     * Đây mới là lúc hàng thật sự nằm trong tay người đi giao — `READY` chỉ nói
     * kho đã xuất ra khỏi sổ. Và đây cũng là tín hiệu để màn chi tiết trên máy
     * họ mở ô báo cáo kết quả ra ngay, không phải thoát ra rồi vào lại.
     *
     * Chỉ báo ở phiếu CUỐI CÙNG: một nhiệm vụ vài ba phiếu, báo từng phiếu là
     * mấy lần rung điện thoại cho một lần đủ hàng.
     */
    const awaitingPickupCount = await this.prisma.missionWarehouseRequest.count({
      where: {
        missionId: request.missionId,
        status: { not: MissionWarehouseRequestStatus.PICKED_UP },
      },
    });
    if (awaitingPickupCount === 0) {
      const mission = await this.prisma.mission.findUnique({
        where: { id: request.missionId },
        select: { missionNo: true },
      });
      await this.notify(
        {
          recipientRole: UserRole.RESCUE,
          kind: NotificationKind.WAREHOUSE_READY,
          title: "Đã nhận đủ vật tư — báo kết quả để đóng nhiệm vụ",
          body: `${missionLabel(mission?.missionNo)}: các kho đã ký nhận bàn giao toàn bộ vật tư. Giao xong thì mở nhiệm vụ, nhập kết quả kèm ảnh bằng chứng rồi xác nhận hoàn thành.`,
          missionId: request.missionId,
          organizationId: request.warehouse.organizationId,
        },
        `nhận đủ vật tư sau SKU ${requestId}`,
      );
    }

    return this.prisma.missionWarehouseRequest.findUniqueOrThrow({ where: { id: requestId } });
  }

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
  async accept(
    requestId: string,
    userId: string,
    scopeWarehouseId?: string | null,
    note?: string,
    options: PerItemNoticeOptions = {},
  ) {
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
      !isRequestExported(current.status)
    ) {
      throw new BadRequestException("Yêu cầu không còn ở trạng thái chờ tiếp nhận");
    }
    if (accepted.count === 1 && options.notifyAdmin !== false) {
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
      if (isRequestExported(request.status)) {
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
        if (current && isRequestExported(current.status)) {
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
  async prepare(
    requestId: string,
    userId: string,
    scopeWarehouseId?: string | null,
    options: PerItemNoticeOptions = {},
  ) {
    const warehouseId = await this.resolveWarehouseId(userId, scopeWarehouseId);
    const claimToken = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.missionWarehouseRequest.findFirst({
        where: { id: requestId, warehouseId },
        include: {
          warehouse: { select: { organizationId: true, name: true } },
          // Số hiệu để câu thông báo gọi đúng tên nhiệm vụ. Người trực có nhiều
          // nhiệm vụ cùng chạy, "toàn bộ vật tư đã sẵn sàng" mà không nói của
          // nhiệm vụ nào thì họ phải mở từng cái ra dò.
          mission: { select: { status: true, missionNo: true } },
        },
      });
      if (!request) throw new NotFoundException("Không tìm thấy yêu cầu vật tư");
      if (request.status === MissionWarehouseRequestStatus.PREPARED) {
        return {
          request,
          exported: false,
          becameReady: false,
          warehouseCompleted: false,
          items: [] as { batchId: string; quantity: number }[],
          missionNo: request.mission.missionNo,
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

      // Đếm phần CHƯA XUẤT, không đếm "khác PREPARED": yêu cầu vừa được ký nhận
      // đã chuyển sang PICKED_UP, hỏi kiểu cũ là đếm nó thành món kho còn nợ.
      const remainingForWarehouse = await tx.missionWarehouseRequest.count({
        where: {
          missionId: request.missionId,
          warehouseId,
          status: { in: [...UNEXPORTED_REQUEST_STATUSES] },
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
          status: { in: [...UNEXPORTED_REQUEST_STATUSES] },
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
      return {
        request: updated,
        exported: true,
        becameReady,
        // Kho này vừa xuất nốt món cuối của mình — tín hiệu để gọi đội tới lấy
        // hàng, không phải chờ cho tới khi TẤT CẢ các kho xong.
        warehouseCompleted: remainingForWarehouse === 0,
        items,
        missionNo: request.mission.missionNo,
      };
    });

    if (!result.exported) return result.request;
    await this.inventory
      .recalcBatches(result.items.map((item) => item.batchId))
      .catch((error) =>
        this.log.warn(`Recalc sau prepare SKU ${requestId} lỗi: ${message(error)}`),
      );
    await Promise.all([
      ...(options.notifyAdmin !== false
        ? [
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
          ]
        : []),
      /*
       * Gọi đội hiện trường NGAY KHI MỘT KHO xong phần của mình, không đợi cả
       * phương án xong.
       *
       * Một nhiệm vụ thường trải qua nhiều kho, và kho xong sớm nhất có thể xong
       * trước kho cuối cả buổi. Đợi đủ mới báo là bắt hàng nằm chờ trên kệ trong
       * khi đội hoàn toàn có thể chạy trước một chuyến — mà đường vào vùng vừa có
       * thiên tai thì mỗi giờ trôi qua lại xấu đi.
       *
       * Báo theo KHO chứ không theo từng vật tư: một kho vài ba món, báo từng món
       * là ba lần rung điện thoại cho đúng một chuyến đi.
       *
       * Kho cuối cùng thì gộp thành MỘT câu "toàn bộ đã sẵn sàng" thay vì gửi hai
       * thông báo sát nhau nói gần như cùng một điều.
       */
      ...(result.becameReady
        ? [
            this.notify(
              {
                recipientRole: UserRole.RESCUE,
                kind: NotificationKind.WAREHOUSE_READY,
                title: "Toàn bộ vật tư đã sẵn sàng",
                body: `${missionLabel(result.missionNo)}: ${result.request.warehouse.name} vừa xuất xong, tất cả kho tham gia đã chuẩn bị đủ theo phương án. Tới các kho nhận hàng rồi báo kết quả để đóng nhiệm vụ.`,
                missionId: result.request.missionId,
                organizationId: result.request.warehouse.organizationId,
              },
              `mission sẵn sàng sau SKU ${requestId}`,
            ),
          ]
        : result.warehouseCompleted
          ? [
              this.notify(
                {
                  recipientRole: UserRole.RESCUE,
                  kind: NotificationKind.WAREHOUSE_READY,
                  title: "Kho đã chuẩn bị xong — tới lấy hàng",
                  body: `${missionLabel(result.missionNo)}: ${result.request.warehouse.name} đã xuất xong phần vật tư của kho. Tới kho nhận hàng; người giữ kho bấm ký nhận sau khi bàn giao. Các kho còn lại vẫn đang chuẩn bị.`,
                  missionId: result.request.missionId,
                  warehouseId: result.request.warehouseId,
                  organizationId: result.request.warehouse.organizationId,
                },
                `kho xong phần của mình sau SKU ${requestId}`,
              ),
            ]
          : []),
    ]);
    return result.request;
  }

  /**
   * Tiếp nhận / xuất / ký nhận cả loạt vật tư của MỘT kho trong MỘT nhiệm vụ, và báo
   * điều phối đúng MỘT lần.
   *
   * Trước đây web và app tự lặp gọi từng dòng, mà mỗi dòng tự bắn một thông báo:
   * bấm "xuất tất cả" cho mười món là chuông trên bảng điều phối kêu mười lần liền,
   * và người trực phải tắt từng cái cho đúng một việc. Nay các dòng vẫn chạy đúng
   * đường của từng dòng (cùng kiểm tra, cùng giao dịch kho) nhưng tắt câu báo riêng,
   * rồi gửi một câu tổng cho cả kho.
   *
   * TUẦN TỰ và dừng ở lỗi đầu tiên, như vòng lặp cũ ở máy khách: mỗi dòng đụng vào
   * tồn kho thật, chạy song song là tranh nhau đúng những lô hàng đó. Vỡ giữa chừng
   * thì vẫn báo phần ĐÃ làm xong — những dòng đó là thay đổi thật ở kho.
   *
   * Những thông báo không theo từng dòng vẫn đi như cũ, vì chúng vốn chỉ nổ một lần:
   * gọi đội tới lấy khi kho xuất nốt món cuối, gọi đội báo kết quả khi ký nhận nốt
   * phiếu cuối, và báo THIẾU khi ký nhận hụt.
   */
  async bulk(
    kind: BulkWarehouseRequestKind,
    requestIds: string[],
    userId: string,
    scopeWarehouseId?: string | null,
    notes: Record<string, string> = {},
  ) {
    const ids = [...new Set(requestIds)];
    if (ids.length === 0) throw new BadRequestException("Chưa chọn vật tư nào");
    const requests = await this.prisma.missionWarehouseRequest.findMany({
      where: { id: { in: ids } },
      include: {
        warehouse: { select: { name: true, organizationId: true } },
        mission: { select: { missionNo: true } },
      },
    });
    if (requests.length !== ids.length) {
      throw new NotFoundException("Không tìm thấy yêu cầu vật tư");
    }
    // Câu tổng nói "kho X đã xuất tất cả" — chỉ đúng khi cả loạt thuộc một kho của
    // một nhiệm vụ. Loạt trộn nhiều kho thì không có câu tổng nào nói thật được.
    const first = requests[0];
    if (
      requests.some(
        (request) =>
          request.warehouseId !== first.warehouseId || request.missionId !== first.missionId,
      )
    ) {
      throw new BadRequestException(
        "Chỉ làm hàng loạt cho vật tư của cùng một kho trong cùng một nhiệm vụ",
      );
    }
    assertWarehouseInScope(scopeWarehouseId, first.warehouseId);

    const byId = new Map(requests.map((request) => [request.id, request]));
    const done: typeof requests = [];
    let failure: { itemName: string; reason: string } | null = null;
    for (const id of ids) {
      const request = byId.get(id)!;
      try {
        if (kind === "accept") {
          const note = typeof notes[id] === "string" ? notes[id] : undefined;
          await this.accept(id, userId, scopeWarehouseId, note, { notifyAdmin: false });
        } else if (kind === "prepare") {
          await this.prepare(id, userId, scopeWarehouseId, { notifyAdmin: false });
        } else {
          // Hàng loạt = LẤY ĐỦ số đã soạn. Dòng lấy thiếu phải ký riêng kèm lý do.
          await this.confirmPickup(id, userId, request.preparedQuantity, null, scopeWarehouseId, {
            notifyAdmin: false,
          });
        }
        done.push(request);
      } catch (error) {
        failure = { itemName: request.itemName, reason: message(error) };
        break;
      }
    }

    if (done.length > 0) {
      await this.notify(
        bulkSummaryNotice(kind, done, ids.length),
        `${kind} hàng loạt ${done.length}/${ids.length} SKU của kho ${first.warehouseId}`,
      );
    }
    if (failure) {
      throw new BadRequestException(
        done.length === 0
          ? `Không làm được dòng nào: ${failure.reason}`
          : `Đã xong ${done.length}/${ids.length} dòng rồi dừng ở “${failure.itemName}”: ${failure.reason}`,
      );
    }
    return { done: done.length, total: ids.length };
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

  /**
   * Gửi thông báo, và báo mọi màn hình đang mở nhiệm vụ đó tải lại.
   *
   * Mọi thay đổi trạng thái của yêu cầu vật tư đều đi qua đây (lượt hàng loạt tắt
   * câu báo của từng dòng nhưng luôn gửi câu tổng), nên đây là chỗ duy nhất phải
   * nhớ phát tín hiệu. Thông báo chỉ tới vai được gọi tên — ký nhận bàn giao chỉ
   * báo điều phối — còn tín hiệu tải lại tới cả xã: đội cứu hộ đang xem danh sách
   * điểm lấy hàng phải thấy kho vừa bàn giao xong mà không cần một tiếng chuông.
   */
  private async notify(input: Parameters<NotificationService["create"]>[0], context: string) {
    await this.notifications.create(input).catch((error) => {
      this.log.warn(`Tạo thông báo ${context} lỗi: ${message(error)}`);
    });
    if (input.organizationId && input.missionId) {
      try {
        this.notifications.broadcastMissionUpdate?.(input.organizationId, input.missionId);
      } catch (error) {
        this.log.warn(`Phát tín hiệu cập nhật ${context} lỗi: ${message(error)}`);
      }
    }
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

/** "Nhiệm vụ số 145" — tên người trực gọi nhau; bản ghi cũ chưa có số thì lùi về tên chung. */
function missionLabel(missionNo?: number | null): string {
  return missionNo != null ? `Nhiệm vụ số ${missionNo}` : "Nhiệm vụ";
}

export type BulkWarehouseRequestKind = "accept" | "prepare" | "pickup";

/** Tắt câu báo điều phối của riêng từng dòng — lượt hàng loạt tự gửi một câu tổng. */
interface PerItemNoticeOptions {
  notifyAdmin?: boolean;
}

/** Số vật tư kể tên trong câu tổng; dài hơn thì gói thành "và N vật tư khác". */
const BULK_NOTICE_ITEM_LIMIT = 5;

function bulkSummaryNotice(
  kind: BulkWarehouseRequestKind,
  done: {
    missionId: string;
    warehouseId: string;
    itemName: string;
    unit: string;
    requestedQuantity: number;
    preparedQuantity: number;
    warehouse: { name: string; organizationId: string };
    mission: { missionNo: number | null };
  }[],
  total: number,
): Parameters<NotificationService["create"]>[0] {
  const first = done[0];
  const complete = done.length === total;
  const verb = kind === "accept" ? "tiếp nhận" : kind === "prepare" ? "xuất" : "ký nhận";
  const scope = complete ? "tất cả" : `${done.length}/${total}`;
  const title =
    kind === "accept"
      ? `Kho đã tiếp nhận ${scope} yêu cầu vật tư`
      : kind === "prepare"
        ? `Kho đã xuất ${scope} vật tư`
        : `Đội cứu hộ đã ký nhận ${scope} vật tư`;
  const listed = done
    .slice(0, BULK_NOTICE_ITEM_LIMIT)
    .map((request) => {
      const quantity = kind === "accept" ? request.requestedQuantity : request.preparedQuantity;
      return `${request.itemName} ${quantity} ${request.unit}`;
    })
    .join(", ");
  const rest =
    done.length > BULK_NOTICE_ITEM_LIMIT
      ? ` và ${done.length - BULK_NOTICE_ITEM_LIMIT} vật tư khác`
      : "";
  // Dừng giữa chừng thì nói luôn trong câu: điều phối đọc "3/10" mà không biết là
  // kho còn đang làm hay đã vỡ thì sẽ ngồi chờ bảy dòng không bao giờ tới.
  const stopped = complete ? "" : " Lượt hàng loạt dừng giữa chừng, các dòng còn lại chưa xong.";
  return {
    recipientRole: UserRole.ADMIN,
    kind:
      kind === "accept"
        ? NotificationKind.WAREHOUSE_REQUEST_ACCEPTED
        : NotificationKind.WAREHOUSE_READY,
    title,
    body: `${missionLabel(first.mission.missionNo)}: ${first.warehouse.name} đã ${verb} ${done.length} vật tư — ${listed}${rest}.${stopped}`,
    missionId: first.missionId,
    warehouseId: first.warehouseId,
    organizationId: first.warehouse.organizationId,
  };
}

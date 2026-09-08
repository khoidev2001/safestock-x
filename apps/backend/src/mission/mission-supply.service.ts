import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MissionStatus,
  NotificationKind,
  PickupDecision,
  Prisma,
  RequirementSource,
  RescueHoldingStatus,
  UserRole,
} from "@prisma/client";
import { FIELD_FORCE_ROLE_LABEL, incidentTypeLabel } from "@safestock/shared-types";
import { InventoryService } from "../inventory/inventory.service";
import { assertWarehouseInScope } from "../inventory/warehouse-scope";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { MissionService } from "./mission.service";
import { requestBatchItems } from "./mission-warehouse-request";

/** Một thay đổi ADMIN áp lên bản tham mưu. */
export interface RequirementChange {
  sku: string;
  /** Số cần; 0 nghĩa là bỏ món này khỏi bản tham mưu. */
  required: number;
}

/** Một quyết định của lực lượng hiện trường cho một món. */
export interface FieldDecisionInput {
  sku: string;
  decision: PickupDecision;
  /** Chỉ dùng cho TAKE_PARTIAL. */
  quantity?: number;
}

/**
 * Ba việc quanh VẬT TƯ mà luồng cũ không có chỗ nào để làm:
 *
 *  1. ADMIN rà lại bản tham mưu — sửa số, bỏ món thừa, thêm món AI không nghĩ tới.
 *  2. Lực lượng hiện trường chốt từng món phải lấy bao nhiêu từ kho.
 *  3. Sổ vật tư đội còn cầm sau khi đóng nhiệm vụ, và đường trả nó về kho.
 *
 * Tách khỏi `MissionService` vì file đó đã gánh trọn vòng đời nhiệm vụ; ba việc
 * trên đều xoay quanh DANH SÁCH VẬT TƯ chứ không phải trạng thái nhiệm vụ.
 */
@Injectable()
export class MissionSupplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly missions: MissionService,
    private readonly notifications: NotificationService,
    private readonly inventory: InventoryService,
  ) {}

  // ===== 1. ADMIN rà soát bản tham mưu =====

  /**
   * Những món ADMIN có thể THÊM vào bản tham mưu.
   *
   * Chỉ liệt kê món cụm kho còn hàng dùng được: mời người ta thêm một món không có
   * trong kho là hứa một thứ tới bước phát hành mới vỡ. Món đã có trong bản tham
   * mưu thì loại khỏi danh sách — thêm lần nữa là sửa số, không phải thêm mới.
   */
  async listAddableItems(missionId: string, actorUserId: string, scopeWarehouseId?: string | null) {
    const mission = await this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
    const catalog = await this.prisma.item.findMany({
      select: { sku: true, name: true, consumable: true, category: { select: { unit: true } } },
    });
    const alreadyListed = new Set(mission.requirements.map((requirement) => requirement.sku));
    const candidates = catalog.filter((item) => !alreadyListed.has(item.sku));
    const stock = await this.missions.availableStockBySku(
      mission.warehouseId,
      candidates.map((item) => item.sku),
      missionId,
    );
    return candidates
      .map((item) => ({
        sku: item.sku,
        itemName: item.name,
        unit: item.category.unit,
        consumable: item.consumable,
        available: stock.get(item.sku) ?? 0,
      }))
      .filter((item) => item.available >= 1)
      .sort((left, right) => left.itemName.localeCompare(right.itemName, "vi"));
  }

  /**
   * ADMIN sửa bản tham mưu: đổi số, bỏ món, thêm món.
   *
   * Chỉ làm được khi còn ở bản nháp. Sau khi đã gửi cho lực lượng hiện trường thì
   * danh sách là thứ hai bên đang cùng nhìn — sửa dưới chân người đang trả lời là
   * cách chắc chắn nhất để hai bên chốt hai con số khác nhau.
   */
  async updateRequirements(
    missionId: string,
    changes: RequirementChange[],
    actorUserId: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
    if (mission.status !== MissionStatus.DRAFT) {
      throw new BadRequestException("Chỉ sửa được bản tham mưu khi còn ở trạng thái nháp");
    }
    if (changes.length === 0) return mission;

    const existing = new Map(
      mission.requirements.map((requirement) => [requirement.sku, requirement] as const),
    );
    const additions = changes.filter((change) => change.required > 0 && !existing.has(change.sku));

    // Kiểm tồn cho phần THÊM MỚI, dùng đúng định nghĩa "còn thật sự có" của lúc
    // lập kế hoạch. Kiểm bằng `ItemBatch.quantity` thô sẽ cho thêm một món đã bị
    // nhiệm vụ khác đặt gạch hết, và lỗi chỉ nổ ở bước phát hành.
    const catalog = additions.length
      ? await this.prisma.item.findMany({
          where: { sku: { in: additions.map((change) => change.sku) } },
          select: { sku: true, name: true, category: { select: { unit: true } } },
        })
      : [];
    const catalogBySku = new Map(catalog.map((item) => [item.sku, item] as const));
    const stock = additions.length
      ? await this.missions.availableStockBySku(
          mission.warehouseId,
          additions.map((change) => change.sku),
          missionId,
        )
      : new Map<string, number>();
    for (const change of additions) {
      const item = catalogBySku.get(change.sku);
      if (!item) throw new NotFoundException(`Không có vật tư mã ${change.sku} trong danh mục`);
      if ((stock.get(change.sku) ?? 0) < 1) {
        throw new BadRequestException(
          `${item.name} hiện không còn tồn khả dụng ở kho nào trong xã — chưa thêm được vào bản tham mưu.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const change of changes) {
        if (!Number.isInteger(change.required) || change.required < 0) {
          throw new BadRequestException(`Số lượng của ${change.sku} phải là số nguyên không âm`);
        }
        const current = existing.get(change.sku);
        if (change.required === 0) {
          if (current) await tx.missionRequirement.delete({ where: { id: current.id } });
          continue;
        }
        if (current) {
          await tx.missionRequirement.update({
            where: { id: current.id },
            data: { required: change.required },
          });
          continue;
        }
        const item = catalogBySku.get(change.sku);
        if (!item) continue;
        await tx.missionRequirement.create({
          data: {
            missionId,
            sku: change.sku,
            itemName: item.name,
            unit: item.category.unit,
            required: change.required,
            allocated: 0,
            shortage: 0,
            allocations: [],
            neighborSuggestion: Prisma.JsonNull,
            // Đánh dấu để lượt tính lại định mức sau này KHÔNG xoá mất nó: định
            // mức không biết gì về món này, người ta thêm nó chính vì lý do đó.
            source: RequirementSource.ADMIN_ADDED,
          },
        });
      }
    });
    return this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
  }

  // ===== 2. Lực lượng hiện trường chốt số cần lấy =====

  /** ADMIN gửi bản tham mưu cho lực lượng hiện trường chốt số. */
  async requestFieldDecision(
    missionId: string,
    actorUserId: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
    if (mission.status !== MissionStatus.DRAFT) {
      throw new BadRequestException("Chỉ gửi được bản tham mưu ở trạng thái nháp");
    }
    if (mission.requirements.length === 0) {
      throw new BadRequestException(
        "Bản tham mưu chưa có vật tư nào — không có gì để hiện trường chốt.",
      );
    }
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({
      where: { id: mission.warehouseId },
      select: { organizationId: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mission.updateMany({
        where: { id: missionId, status: MissionStatus.DRAFT },
        data: { status: MissionStatus.PENDING_FIELD_DECISION },
      });
      if (claimed.count === 0) {
        throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
      }
      const notification = await tx.notification.create({
        data: {
          recipientRole: UserRole.RESCUE,
          kind: NotificationKind.MISSION_ASSIGNED,
          title: "Cần chốt số vật tư phải lấy từ kho",
          body: `${incidentTypeLabel(mission.incidentType)} — ${mission.affectedPeople} người. Xem từng món và cho biết cần lấy hết, lấy một phần hay không cần lấy.`,
          missionId,
          organizationId: warehouse.organizationId,
          missionNo: mission.missionNo,
          incidentType: mission.incidentType,
          affectedPeople: mission.affectedPeople,
          locationName: mission.hamletName ?? mission.location ?? null,
        },
      });
      return notification;
    });
    this.notifications.pushPersisted(result);
    return this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
  }

  /** ADMIN thu hồi bản tham mưu về nháp để sửa tiếp. */
  async withdrawFieldDecision(
    missionId: string,
    actorUserId: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
    if (mission.status !== MissionStatus.PENDING_FIELD_DECISION) {
      throw new BadRequestException("Chỉ thu hồi được bản tham mưu đang chờ hiện trường trả lời");
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mission.updateMany({
        where: { id: missionId, status: MissionStatus.PENDING_FIELD_DECISION },
        data: { status: MissionStatus.DRAFT },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          "Hiện trường vừa gửi câu trả lời — tải lại để xem trước khi sửa.",
        );
      }
      // Thu hồi để SỬA SỐ, nên câu trả lời cũ không còn ý nghĩa: nó trả lời cho
      // một bản tham mưu sắp không còn tồn tại.
      await tx.missionRequirement.updateMany({
        where: { missionId },
        data: {
          pickupDecision: null,
          warehouseQuantity: 0,
          heldQuantity: 0,
          heldFromHoldingId: null,
          decidedAt: null,
          decidedByUserId: null,
        },
      });
    });
    return this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
  }

  /**
   * Vật tư đội đang giữ mà bản tham mưu của nhiệm vụ này cũng đang cần.
   *
   * Đây là thứ lực lượng hiện trường cần nhìn thấy TRƯỚC khi trả lời: không có nó
   * thì họ chỉ đoán, và kho lại soạn thêm đúng số hàng đang nằm trên xe của họ.
   */
  async overlappingHoldings(
    missionId: string,
    actorUserId: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
    const organizationId = await this.organizationOf(actorUserId);
    const skus = mission.requirements.map((requirement) => requirement.sku);
    if (skus.length === 0) return [];
    return this.prisma.rescueSupplyHolding.findMany({
      where: {
        organizationId,
        status: RescueHoldingStatus.HELD,
        sku: { in: skus },
        // Phần đang giữ của CHÍNH nhiệm vụ này thì không phải là hàng có sẵn để
        // dùng lại — nó sinh ra từ chính nhiệm vụ này.
        missionId: { not: missionId },
      },
      select: {
        id: true,
        sku: true,
        itemName: true,
        unit: true,
        quantity: true,
        heldSince: true,
        mission: { select: { id: true, missionNo: true } },
      },
      orderBy: [{ sku: "asc" }, { heldSince: "asc" }],
    });
  }

  /**
   * Lực lượng hiện trường chốt từng món. Trả lời đủ mọi món thì nhiệm vụ sang bước
   * ADMIN lập kế hoạch.
   *
   * Phần đội đang giữ chỉ được GHI Ý ĐỊNH ở đây, chưa chuyển sổ. Chuyển ngay lúc
   * này thì ADMIN huỷ nhiệm vụ là phần đang giữ mắc kẹt ở một nhiệm vụ đã huỷ,
   * trong khi nhiệm vụ cũ đã kịp ghi "đã hoàn vật tư".
   */
  async submitFieldDecisions(
    missionId: string,
    decisions: FieldDecisionInput[],
    actorUserId: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
    if (mission.status !== MissionStatus.PENDING_FIELD_DECISION) {
      throw new BadRequestException("Nhiệm vụ này không đang chờ hiện trường chốt số");
    }
    const bySku = new Map(
      mission.requirements.map((requirement) => [requirement.sku, requirement] as const),
    );
    const organizationId = await this.organizationOf(actorUserId);
    const holdings = await this.prisma.rescueSupplyHolding.findMany({
      where: {
        organizationId,
        status: RescueHoldingStatus.HELD,
        sku: { in: [...bySku.keys()] },
        missionId: { not: missionId },
      },
      orderBy: [{ heldSince: "asc" }],
    });
    const heldBySku = new Map<string, (typeof holdings)[number][]>();
    for (const holding of holdings) {
      heldBySku.set(holding.sku, [...(heldBySku.get(holding.sku) ?? []), holding]);
    }

    const now = new Date();
    for (const decision of decisions) {
      const requirement = bySku.get(decision.sku);
      if (!requirement) {
        throw new NotFoundException(`Bản tham mưu không có vật tư mã ${decision.sku}`);
      }
      const warehouseQuantity = this.resolveWarehouseQuantity(decision, requirement.required);
      // Phần bù bằng hàng đang giữ: nhiều nhất là phần bản tham mưu còn thiếu sau
      // khi trừ số sẽ lấy từ kho, và không quá số đội thật sự đang cầm.
      const holdingsForSku = heldBySku.get(decision.sku) ?? [];
      const heldAvailable = holdingsForSku.reduce((sum, row) => sum + row.quantity, 0);
      /*
       * KHO + ĐANG GIỮ phải phủ kín số cần. Đây là chốt chặn thật, không phải máy.
       *
       * Đội chỉ được hạ số xuống bằng đúng phần họ đang cầm sẵn — đó là thứ duy
       * nhất họ biết mà điều phối không biết. Hạ thấp hơn là tự sửa một định mức
       * đã tính theo số người, và cú sửa đó không hiện ra ở đâu cả: kho soạn theo
       * số mới, bản tham mưu vẫn ghi số cũ, còn màn hình điều phối đọc ra "Không
       * cần lấy từ kho · đội đang giữ 1 cuộn" cho một nhiệm vụ cần 2 — nghe như
       * đã đủ. Chênh lệch chỉ lộ ra lúc phát tận tay dân.
       *
       * Máy đã ẩn nút không hợp lệ, nhưng máy có thể đang chạy bản cũ hoặc vừa
       * online lại với câu trả lời soạn từ lúc sổ tạm giữ còn khác.
       */
      const minimumFromWarehouse = Math.max(0, requirement.required - heldAvailable);
      if (warehouseQuantity < minimumFromWarehouse) {
        throw new BadRequestException(
          `${requirement.itemName}: đội đang giữ ${heldAvailable} ${requirement.unit}, nên phải lấy ít nhất ${minimumFromWarehouse} ${requirement.unit} từ kho cho đủ ${requirement.required}.`,
        );
      }
      const heldQuantity = Math.min(
        Math.max(0, requirement.required - warehouseQuantity),
        heldAvailable,
      );
      const claimed = await this.prisma.missionRequirement.updateMany({
        where: {
          id: requirement.id,
          missionId,
          mission: { status: MissionStatus.PENDING_FIELD_DECISION },
        },
        data: {
          pickupDecision: decision.decision,
          warehouseQuantity,
          heldQuantity,
          heldFromHoldingId: heldQuantity > 0 ? (holdingsForSku[0]?.id ?? null) : null,
          decidedAt: now,
          decidedByUserId: actorUserId,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
      }
    }

    const remaining = await this.prisma.missionRequirement.count({
      where: { missionId, pickupDecision: null },
    });
    if (remaining > 0) {
      return this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
    }

    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({
      where: { id: mission.warehouseId },
      select: { organizationId: true },
    });
    const answered = await this.prisma.missionRequirement.findMany({ where: { missionId } });
    const notification = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mission.updateMany({
        where: { id: missionId, status: MissionStatus.PENDING_FIELD_DECISION },
        data: { status: MissionStatus.FIELD_DECIDED },
      });
      if (claimed.count === 0) {
        throw new ConflictException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
      }
      return tx.notification.create({
        data: {
          recipientRole: UserRole.ADMIN,
          kind: NotificationKind.RESCUE_CONFIRMED,
          title: `${FIELD_FORCE_ROLE_LABEL} đã chốt số vật tư cần lấy`,
          body: summarizeDecisions(answered),
          missionId,
          organizationId: warehouse.organizationId,
          missionNo: mission.missionNo,
          incidentType: mission.incidentType,
          affectedPeople: mission.affectedPeople,
          locationName: mission.hamletName ?? mission.location ?? null,
        },
      });
    });
    this.notifications.pushPersisted(notification);
    return this.missions.getMission(missionId, actorUserId, scopeWarehouseId);
  }

  // ===== 3. Sổ vật tư đang tạm giữ =====

  /** Vật tư đội cứu hộ của xã đang cầm, chưa trả về kho. */
  async listHoldings(actorUserId: string, includeReturned = false) {
    const organizationId = await this.organizationOf(actorUserId);
    return this.prisma.rescueSupplyHolding.findMany({
      where: {
        organizationId,
        ...(includeReturned ? {} : { status: RescueHoldingStatus.HELD }),
      },
      select: {
        id: true,
        sku: true,
        itemName: true,
        unit: true,
        quantity: true,
        status: true,
        heldSince: true,
        returnedAt: true,
        warehouse: { select: { id: true, name: true } },
        mission: { select: { id: true, missionNo: true, incidentType: true } },
      },
      orderBy: [{ status: "asc" }, { heldSince: "asc" }],
    });
  }

  /**
   * Xác nhận vật tư đã về kho → cộng lại tồn đúng lô đã xuất.
   *
   * HAI bên bấm được: thủ kho (người đối chiếu hàng thật với sổ) và chính đội cứu
   * hộ (người biết mình đã chở trả hay chưa). Trước đây chỉ thủ kho — an toàn hơn
   * về sổ sách, nhưng khoản nợ nằm trên tay đội và họ phải chờ thủ kho ngồi vào
   * máy, nên sổ tạm giữ treo hàng tuần và tồn kho hiện thiếu đúng số hàng đang
   * nằm sẵn trên kệ.
   *
   * Ai bấm cũng ghi lại được: `confirmedByUserId` giữ đúng người đã xác nhận, và
   * thông báo bắn về điều phối ngay để có người soát lại nếu số không khớp.
   */
  async confirmHoldingReturn(
    holdingId: string,
    actorUserId: string,
    scopeWarehouseId?: string | null,
  ) {
    const holding = await this.prisma.rescueSupplyHolding.findUnique({
      where: { id: holdingId },
      include: { warehouse: { select: { id: true, name: true, organizationId: true } } },
    });
    if (!holding) throw new NotFoundException("Không tìm thấy phần vật tư đang tạm giữ");
    const organizationId = await this.organizationOf(actorUserId);
    if (holding.organizationId !== organizationId) {
      throw new NotFoundException("Không tìm thấy phần vật tư đang tạm giữ");
    }
    // Kho nào xuất thì kho đó nhận lại. `bulkImportInTx` cộng thẳng vào lô mà
    // KHÔNG kèm phạm vi kho, nên chốt chặn duy nhất nằm ở đây.
    assertWarehouseInScope(scopeWarehouseId, holding.warehouseId);
    if (scopeWarehouseId && scopeWarehouseId !== holding.warehouseId) {
      throw new ForbiddenException(`Phần vật tư này phải hoàn về ${holding.warehouse.name}`);
    }
    if (holding.status === RescueHoldingStatus.RETURNED) {
      // Bấm lại lần hai là no-op, không phải lỗi: mạng chập chờn thì người ta bấm
      // lại, và lần bấm thứ hai không được cộng thêm một lượt tồn nữa.
      return holding;
    }

    const items = requestBatchItems(holding.batches);
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.rescueSupplyHolding.updateMany({
        where: { id: holdingId, status: RescueHoldingStatus.HELD },
        data: {
          status: RescueHoldingStatus.RETURNED,
          returnedAt: new Date(),
          confirmedByUserId: actorUserId,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException("Phần vật tư này vừa được người khác xác nhận hoàn trả");
      }
      if (items.length > 0) {
        await this.inventory.bulkImportInTx(
          tx,
          actorUserId,
          items,
          `Hoàn kho: ${FIELD_FORCE_ROLE_LABEL} trả vật tư nhiệm vụ ${holding.missionId}`,
        );
      }
      return tx.rescueSupplyHolding.findUniqueOrThrow({ where: { id: holdingId } });
    });
    // Ngoài transaction: giữ khoá trên các lô trong lúc tính lại mức sẵn sàng là
    // kéo dài thời gian khoá mà không đổi được kết quả.
    if (items.length > 0) {
      await this.inventory.recalcBatches(items.map((item) => item.batchId));
    }

    await this.notifications.create({
      recipientRole: UserRole.ADMIN,
      kind: NotificationKind.MISSION_COMPLETED,
      title: `${FIELD_FORCE_ROLE_LABEL} đã hoàn trả vật tư`,
      body: `${holding.itemName} ${holding.quantity} ${holding.unit} đã về ${holding.warehouse.name}.`,
      missionId: holding.missionId,
      warehouseId: holding.warehouseId,
    });
    return updated;
  }

  // ---- helpers ----

  private resolveWarehouseQuantity(decision: FieldDecisionInput, required: number): number {
    switch (decision.decision) {
      case PickupDecision.TAKE_ALL:
        return required;
      case PickupDecision.TAKE_NONE:
        return 0;
      case PickupDecision.TAKE_PARTIAL: {
        const quantity = decision.quantity;
        if (!Number.isInteger(quantity) || quantity == null || quantity < 1) {
          throw new BadRequestException(
            `Lấy một phần thì phải ghi rõ số lượng cho ${decision.sku}`,
          );
        }
        if (quantity >= required) {
          // Gõ đúng bằng hoặc hơn số cần thì đó là "lấy hết", và người ta nên bấm
          // đúng nút đó — hai con số giống nhau nhưng ý nghĩa khác nhau lúc đọc lại.
          throw new BadRequestException(
            `Số lấy một phần phải nhỏ hơn ${required}; cần lấy đủ thì chọn "lấy hết từ kho".`,
          );
        }
        return quantity;
      }
      default:
        throw new BadRequestException("Lựa chọn không hợp lệ");
    }
  }

  private async organizationOf(actorUserId: string): Promise<string> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    return actor.organizationId;
  }
}

/** Một dòng tóm tắt cho thông báo gửi điều phối. */
function summarizeDecisions(
  requirements: { itemName: string; unit: string; warehouseQuantity: number }[],
): string {
  const toDraw = requirements.filter((requirement) => requirement.warehouseQuantity > 0);
  if (toDraw.length === 0) {
    return "Không cần lấy vật tư nào từ kho — có thể bỏ qua bước kho chuẩn bị.";
  }
  return `Cần lấy từ kho: ${toDraw
    .map(
      (requirement) =>
        `${requirement.itemName} ${requirement.warehouseQuantity} ${requirement.unit}`,
    )
    .join("; ")}.`;
}

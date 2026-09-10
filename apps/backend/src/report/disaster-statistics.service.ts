import { Injectable, NotFoundException } from "@nestjs/common";
import { MissionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Thống kê sau thiên tai: mỗi đợt thiên tai đã tiêu tốn bao nhiêu vật tư, mất
 * bao nhiêu và thu hồi lại được bao nhiêu.
 *
 * Nguyên tắc "không bịa số" của sản phẩm áp vào đây thành ba ràng buộc:
 *
 * 1. Mọi con số đều lấy thẳng từ sổ nghiệp vụ đã có (yêu cầu kho theo từng mã
 *    hàng và phiếu mượn), KHÔNG ước lượng và KHÔNG suy diễn.
 * 2. "Đã xuất kho" và "đã ký nhận" là hai con số tách rời, không gộp. Khoảng
 *    giữa hai con số đó là chỗ hàng bị thiếu, nên gộp lại là xoá mất đúng thứ
 *    người điều phối cần nhìn.
 * 3. Chênh lệch khi ký nhận KHÔNG được gọi là thất thoát. Kho xuất 100 mà đội
 *    ký nhận 80 có thể vì xe không chở hết — chuyến sau lấy nốt. Chỉ phần đã
 *    ghi nhận mất hoặc hỏng trên phiếu mượn mới là thất thoát thật.
 */

/** Nhóm hàng chưa gắn danh mục — hiện tên này thay vì bỏ trống cho người đọc đoán. */
const UNCATEGORIZED_LABEL = "Chưa phân loại";
const UNKNOWN_UNIT = "đơn vị";

/**
 * DRAFT bị loại khỏi thống kê.
 *
 * Phương án còn nháp thì chưa phát hành, chưa kho nào được yêu cầu xuất, nên
 * mọi con số vật tư của nó bằng 0. Đưa vào chỉ làm loãng danh sách bằng những
 * dòng rỗng, che mất các đợt thật sự đã tiêu hàng.
 *
 * CANCELLED thì GIỮ LẠI: nhiệm vụ bị huỷ giữa chừng vẫn có thể đã xuất hàng
 * thật trước lúc huỷ, và số hàng đó vẫn phải được kê.
 */
const EXCLUDED_STATUSES: MissionStatus[] = [MissionStatus.DRAFT];

export interface DisasterStatisticsQuery {
  /** Mốc đầu khoảng thống kê (ISO). Lọc theo thời điểm lập nhiệm vụ. */
  from?: string;
  to?: string;
}

export interface CategoryTotals {
  categoryName: string;
  unit: string;
  consumable: boolean;
  requested: number;
  issued: number;
  pickedUp: number;
  pickupGap: number;
  loanedOut: number;
  returnedOk: number;
  returnedDamaged: number;
  lost: number;
  stillOnLoan: number;
}

type MutableCategory = CategoryTotals & { items: Map<string, ItemTotals> };

export interface ItemTotals {
  sku: string;
  itemName: string;
  unit: string;
  consumable: boolean;
  requested: number;
  issued: number;
  pickedUp: number;
  pickupGap: number;
  loanedOut: number;
  returnedOk: number;
  returnedDamaged: number;
  lost: number;
  stillOnLoan: number;
}

export interface SkuMetadata {
  categoryName: string;
  unit: string;
  consumable: boolean;
}

@Injectable()
export class DisasterStatisticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Bảng thống kê cho toàn bộ đợt thiên tai trong phạm vi người dùng.
   *
   * scopeWarehouseId có giá trị (phụ trách kho thôn) → chỉ kê phần việc của kho
   * đó: kho thôn không được nhìn số liệu kho khác, kể cả trong cùng một nhiệm vụ.
   */
  async getStatistics(
    actorUserId: string,
    scopeWarehouseId?: string | null,
    query: DisasterStatisticsQuery = {},
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");

    const createdAtFilter = buildDateRange(query.from, query.to);
    const missions = await this.prisma.mission.findMany({
      where: {
        status: { notIn: EXCLUDED_STATUSES },
        warehouse: { organizationId: actor.organizationId },
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        // Kho thôn chỉ thấy đợt thiên tai mà chính kho mình có phần việc.
        ...(scopeWarehouseId
          ? { warehouseRequests: { some: { warehouseId: scopeWarehouseId } } }
          : {}),
      },
      select: {
        id: true,
        missionNo: true,
        incidentType: true,
        location: true,
        hamletName: true,
        status: true,
        affectedPeople: true,
        durationHours: true,
        deliveryOutcome: true,
        deliveryNote: true,
        createdAt: true,
        approvedAt: true,
        completedAt: true,
        warehouseRequests: {
          ...(scopeWarehouseId ? { where: { warehouseId: scopeWarehouseId } } : {}),
          select: {
            sku: true,
            itemName: true,
            unit: true,
            requestedQuantity: true,
            preparedQuantity: true,
            pickedUpQuantity: true,
            status: true,
            preparedAt: true,
            pickedUpAt: true,
            updatedAt: true,
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (missions.length === 0) {
      return { generatedAt: new Date().toISOString(), events: [], totals: emptyTotals() };
    }

    const missionIds = missions.map((mission) => mission.id);
    const loans = await this.prisma.loanRecord.findMany({
      where: {
        missionId: { in: missionIds },
        ...(scopeWarehouseId
          ? { batch: { shelf: { zone: { warehouseId: scopeWarehouseId } } } }
          : {}),
      },
      select: {
        missionId: true,
        quantity: true,
        returnedOk: true,
        returnedDamaged: true,
        lost: true,
        status: true,
        borrowedAt: true,
        closedAt: true,
        batch: {
          select: {
            item: { select: { sku: true, name: true } },
            shelf: { select: { zone: { select: { warehouseId: true } } } },
          },
        },
      },
    });

    const metadataBySku = await this.loadSkuMetadata([
      ...missions.flatMap((mission) => mission.warehouseRequests.map((request) => request.sku)),
      ...loans.map((loan) => loan.batch.item.sku),
    ]);

    const loansByMission = new Map<string, typeof loans>();
    for (const loan of loans) {
      if (!loan.missionId) continue;
      const bucket = loansByMission.get(loan.missionId);
      if (bucket) bucket.push(loan);
      else loansByMission.set(loan.missionId, [loan]);
    }

    const events = missions.map((mission) =>
      this.buildEvent(mission, loansByMission.get(mission.id) ?? [], metadataBySku),
    );

    return {
      // Mốc chốt số của chính lần gọi này. Màn hình hiện lại đúng mốc đó để
      // người đọc biết bảng đang cũ bao nhiêu, thay vì tin là luôn tươi.
      generatedAt: new Date().toISOString(),
      events,
      totals: sumTotals(events.map((event) => event.totals)),
    };
  }

  /** Tra danh mục + đơn vị + tính tiêu hao theo SKU; thiếu thì để nhãn "chưa phân loại". */
  private async loadSkuMetadata(skus: string[]): Promise<Map<string, SkuMetadata>> {
    const unique = [...new Set(skus)];
    if (unique.length === 0) return new Map();
    const items = await this.prisma.item.findMany({
      where: { sku: { in: unique } },
      select: {
        sku: true,
        consumable: true,
        category: { select: { name: true, unit: true } },
      },
    });
    return new Map(
      items.map((item) => [
        item.sku,
        {
          categoryName: item.category?.name ?? UNCATEGORIZED_LABEL,
          unit: item.category?.unit ?? UNKNOWN_UNIT,
          consumable: item.consumable,
        },
      ]),
    );
  }

  private buildEvent(
    mission: MissionRow,
    loans: LoanRow[],
    metadataBySku: Map<string, SkuMetadata>,
  ) {
    const categories = new Map<string, MutableCategory>();
    const warehouses = new Map<string, { id: string; name: string }>();
    /** Mốc hoạt động mới nhất — dùng cho cột "cập nhật lúc" của từng đợt. */
    let lastActivityAt = mission.createdAt;

    for (const request of mission.warehouseRequests) {
      const metadata = metadataBySku.get(request.sku);
      const unit = request.unit || metadata?.unit || UNKNOWN_UNIT;
      const category = ensureCategory(
        categories,
        metadata?.categoryName ?? UNCATEGORIZED_LABEL,
        unit,
        metadata?.consumable ?? true,
      );
      const item = ensureItem(category, request.sku, request.itemName, unit, category.consumable);

      // pickedUpQuantity để rỗng nghĩa là CHƯA AI KÝ NHẬN — khác hẳn ký nhận 0.
      // Cộng null thành 0 sẽ biến "chưa lấy" thành "lấy về tay không", tức là
      // bịa ra một khoản thiếu chưa hề xảy ra.
      const pickedUp = request.pickedUpQuantity ?? 0;
      const gap =
        request.pickedUpQuantity === null ? 0 : Math.max(0, request.preparedQuantity - pickedUp);

      addRequest(category, request.requestedQuantity, request.preparedQuantity, pickedUp, gap);
      addRequest(item, request.requestedQuantity, request.preparedQuantity, pickedUp, gap);

      warehouses.set(request.warehouse.id, request.warehouse);
      lastActivityAt = latest(
        lastActivityAt,
        request.updatedAt,
        request.preparedAt,
        request.pickedUpAt,
      );
    }

    for (const loan of loans) {
      const sku = loan.batch.item.sku;
      const metadata = metadataBySku.get(sku);
      const unit = metadata?.unit ?? UNKNOWN_UNIT;
      const category = ensureCategory(
        categories,
        metadata?.categoryName ?? UNCATEGORIZED_LABEL,
        unit,
        metadata?.consumable ?? false,
      );
      const item = ensureItem(category, sku, loan.batch.item.name, unit, category.consumable);
      const stillOnLoan = Math.max(
        0,
        loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost,
      );

      addLoan(category, loan, stillOnLoan);
      addLoan(item, loan, stillOnLoan);
      lastActivityAt = latest(lastActivityAt, loan.borrowedAt, loan.closedAt);
    }

    const categoryList = [...categories.values()]
      .map((category) => ({
        ...stripItems(category),
        items: [...category.items.values()].sort((a, b) => b.issued - a.issued),
      }))
      .sort((a, b) => b.issued - a.issued || a.categoryName.localeCompare(b.categoryName, "vi"));

    return {
      missionId: mission.id,
      missionNo: mission.missionNo,
      incidentType: mission.incidentType,
      location: mission.location,
      hamletName: mission.hamletName,
      status: mission.status,
      affectedPeople: mission.affectedPeople,
      durationHours: mission.durationHours,
      deliveryOutcome: mission.deliveryOutcome,
      deliveryNote: mission.deliveryNote,
      startedAt: mission.createdAt.toISOString(),
      approvedAt: mission.approvedAt?.toISOString() ?? null,
      completedAt: mission.completedAt?.toISOString() ?? null,
      lastActivityAt: lastActivityAt.toISOString(),
      warehouses: [...warehouses.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")),
      categories: categoryList,
      totals: sumTotals(categoryList.map(toTotals)),
    };
  }
}

type MissionRow = {
  id: string;
  missionNo: number;
  incidentType: string;
  location: string | null;
  hamletName: string | null;
  status: MissionStatus;
  affectedPeople: number;
  durationHours: number;
  deliveryOutcome: string | null;
  deliveryNote: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
  warehouseRequests: {
    sku: string;
    itemName: string;
    unit: string;
    requestedQuantity: number;
    preparedQuantity: number;
    pickedUpQuantity: number | null;
    status: string;
    preparedAt: Date | null;
    pickedUpAt: Date | null;
    updatedAt: Date;
    warehouse: { id: string; name: string };
  }[];
};

type LoanRow = {
  missionId: string | null;
  quantity: number;
  returnedOk: number;
  returnedDamaged: number;
  lost: number;
  status: string;
  borrowedAt: Date;
  closedAt: Date | null;
  batch: {
    item: { sku: string; name: string };
    shelf: { zone: { warehouseId: string } } | null;
  };
};

export interface Totals {
  requested: number;
  issued: number;
  pickedUp: number;
  pickupGap: number;
  loanedOut: number;
  returnedOk: number;
  returnedDamaged: number;
  lost: number;
  stillOnLoan: number;
}

function emptyTotals(): Totals {
  return {
    requested: 0,
    issued: 0,
    pickedUp: 0,
    pickupGap: 0,
    loanedOut: 0,
    returnedOk: 0,
    returnedDamaged: 0,
    lost: 0,
    stillOnLoan: 0,
  };
}

function toTotals(source: Totals): Totals {
  return {
    requested: source.requested,
    issued: source.issued,
    pickedUp: source.pickedUp,
    pickupGap: source.pickupGap,
    loanedOut: source.loanedOut,
    returnedOk: source.returnedOk,
    returnedDamaged: source.returnedDamaged,
    lost: source.lost,
    stillOnLoan: source.stillOnLoan,
  };
}

function sumTotals(parts: Totals[]): Totals {
  return parts.reduce<Totals>((accumulator, part) => {
    accumulator.requested += part.requested;
    accumulator.issued += part.issued;
    accumulator.pickedUp += part.pickedUp;
    accumulator.pickupGap += part.pickupGap;
    accumulator.loanedOut += part.loanedOut;
    accumulator.returnedOk += part.returnedOk;
    accumulator.returnedDamaged += part.returnedDamaged;
    accumulator.lost += part.lost;
    accumulator.stillOnLoan += part.stillOnLoan;
    return accumulator;
  }, emptyTotals());
}

function ensureCategory(
  categories: Map<string, MutableCategory>,
  categoryName: string,
  unit: string,
  consumable: boolean,
): MutableCategory {
  const existing = categories.get(categoryName);
  if (existing) return existing;
  const created: MutableCategory = {
    categoryName,
    unit,
    consumable,
    ...emptyTotals(),
    items: new Map(),
  };
  categories.set(categoryName, created);
  return created;
}

function ensureItem(
  category: MutableCategory,
  sku: string,
  itemName: string,
  unit: string,
  consumable: boolean,
): ItemTotals {
  const existing = category.items.get(sku);
  if (existing) return existing;
  const created: ItemTotals = { sku, itemName, unit, consumable, ...emptyTotals() };
  category.items.set(sku, created);
  return created;
}

function addRequest(
  target: Totals,
  requested: number,
  issued: number,
  pickedUp: number,
  gap: number,
): void {
  target.requested += requested;
  target.issued += issued;
  target.pickedUp += pickedUp;
  target.pickupGap += gap;
}

function addLoan(target: Totals, loan: LoanRow, stillOnLoan: number): void {
  target.loanedOut += loan.quantity;
  target.returnedOk += loan.returnedOk;
  target.returnedDamaged += loan.returnedDamaged;
  target.lost += loan.lost;
  target.stillOnLoan += stillOnLoan;
}

function stripItems(category: MutableCategory): CategoryTotals {
  const { items: _items, ...rest } = category;
  return rest;
}

function latest(current: Date, ...candidates: (Date | null | undefined)[]): Date {
  return candidates.reduce<Date>(
    (newest, candidate) => (candidate && candidate > newest ? candidate : newest),
    current,
  );
}

/** Khoảng ngày cho Prisma; bỏ qua mốc không đọc được thay vì ném lỗi ra người dùng. */
function buildDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const gte = parseDate(from);
  const lte = parseDate(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

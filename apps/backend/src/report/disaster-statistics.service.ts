import { Injectable, NotFoundException } from "@nestjs/common";
import { MissionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EPISODE_GAP_DAYS, groupIntoEpisodes, isEpisodeOngoing } from "./disaster-episodes";

/**
 * Thống kê sau thiên tai: mỗi đợt thiên tai đã tiêu tốn bao nhiêu vật tư, mất
 * bao nhiêu và thu hồi lại được bao nhiêu.
 *
 * ĐỢT ở đây là một cơn bão, một trận lũ — không phải một nhiệm vụ. Một cơn bão
 * sinh ra hàng chục nhiệm vụ rải suốt nhiều ngày, và câu hỏi người ta mang tới
 * báo cáo này luôn là "cơn bão vừa rồi xã tiêu hết bao nhiêu", chứ không phải
 * "nhiệm vụ số 820 tiêu hết bao nhiêu". Luật gộp nằm ở `disaster-episodes.ts`.
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

    const now = new Date();
    // Nhiệm vụ gộp thành đợt TRƯỚC khi cộng số: bảng phải kê theo cơn bão, và
    // mỗi dòng "tổng đợt" phải là tổng của đúng những nhiệm vụ thuộc cơn bão đó.
    const events = groupIntoEpisodes(
      missions.map((mission) => ({ id: mission.id, startedAt: mission.createdAt, mission })),
    ).map((group) =>
      this.buildEpisode(
        group.map((member) => member.mission),
        loansByMission,
        metadataBySku,
        now,
      ),
    );

    return {
      // Mốc chốt số của chính lần gọi này. Màn hình hiện lại đúng mốc đó để
      // người đọc biết bảng đang cũ bao nhiêu, thay vì tin là luôn tươi.
      generatedAt: now.toISOString(),
      /** Số ngày im lặng để khép một đợt — màn hình nói lại cho người đọc. */
      episodeGapDays: EPISODE_GAP_DAYS,
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

  /**
   * Một ĐỢT thiên tai: cộng số của mọi nhiệm vụ trong đợt, kèm danh sách nhiệm vụ.
   *
   * Cộng thẳng từ nhiệm vụ chứ không cộng lại các dòng tổng của từng nhiệm vụ:
   * hai nhiệm vụ cùng lấy một mã hàng phải nhập vào CÙNG một dòng mã hàng của
   * đợt, nếu không bảng chi tiết hiện hai dòng "Mì tôm cứu trợ" và người đọc phải
   * tự cộng bằng mắt. Dùng lại đúng bộ tích luỹ của từng nhiệm vụ
   * (`accumulateMission`) nên hai mức số liệu không thể lệch nhau về luật.
   */
  private buildEpisode(
    missions: MissionRow[],
    loansByMission: Map<string, LoanRow[]>,
    metadataBySku: Map<string, SkuMetadata>,
    now: Date,
  ) {
    const categories = new Map<string, MutableCategory>();
    const warehouses = new Map<string, { id: string; name: string }>();
    // Nhiệm vụ trong đợt: mới nhất trước, giống mọi danh sách khác của sản phẩm.
    const ordered = [...missions].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
    let lastActivityAt = ordered[ordered.length - 1].createdAt;
    for (const mission of ordered) {
      lastActivityAt = latest(
        lastActivityAt,
        accumulateMission(
          categories,
          warehouses,
          mission,
          loansByMission.get(mission.id) ?? [],
          metadataBySku,
        ),
      );
    }

    const missionSummaries = ordered.map((mission) =>
      this.buildMission(mission, loansByMission.get(mission.id) ?? [], metadataBySku),
    );
    const firstMission = ordered[ordered.length - 1];
    const lastMission = ordered[0];
    const categoryList = sortCategories(categories);

    return {
      /*
        Khoá của đợt là id nhiệm vụ MỞ MÀN.

        Nó bền đúng chừng nào cần: thêm nhiệm vụ mới vào đợt đang chạy thì khoá
        giữ nguyên, nên khối người dùng đang mở không bị đóng sập lại sau mỗi lần
        làm tươi. Lấy nhiệm vụ cuối làm khoá thì mỗi tình huống mới lại đổi khoá
        của cả đợt.
      */
      episodeId: `dot-${firstMission.id}`,
      /** Các loại tình huống có trong đợt, nhiều nhất trước — tên gọi của đợt. */
      incidentTypes: rankIncidentTypes(ordered),
      missionCount: ordered.length,
      /** Số người ảnh hưởng lớn nhất ghi nhận trong đợt. */
      peakAffectedPeople: Math.max(...ordered.map((mission) => mission.affectedPeople)),
      /** Mốc lập nhiệm vụ ĐẦU TIÊN của đợt. */
      startedAt: firstMission.createdAt.toISOString(),
      /** Mốc lập nhiệm vụ GẦN NHẤT — chính là mốc bắt đầu đếm 7 ngày im lặng. */
      lastMissionAt: lastMission.createdAt.toISOString(),
      /** Mốc mới nhất có thao tác thật (xuất kho, ký nhận, hoàn trả) trong đợt. */
      lastActivityAt: lastActivityAt.toISOString(),
      /**
       * Đợt còn có thể nhận thêm nhiệm vụ không.
       *
       * Con số của đợt đang diễn ra CÒN ĐỔI, nên người đọc phải biết trước khi
       * mang nó đi quyết toán hay đi xin cấp bù.
       */
      ongoing: isEpisodeOngoing(lastMission.createdAt, now),
      warehouses: [...warehouses.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")),
      categories: categoryList,
      totals: sumTotals(categoryList.map(toTotals)),
      missions: missionSummaries,
    };
  }

  /** Một nhiệm vụ trong đợt — cùng bộ cột, để mở ra xem việc nào tiêu gì. */
  private buildMission(
    mission: MissionRow,
    loans: LoanRow[],
    metadataBySku: Map<string, SkuMetadata>,
  ) {
    const categories = new Map<string, MutableCategory>();
    const warehouses = new Map<string, { id: string; name: string }>();
    const lastActivityAt = accumulateMission(categories, warehouses, mission, loans, metadataBySku);
    const categoryList = sortCategories(categories);

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

/**
 * Dồn số của MỘT nhiệm vụ vào bộ tích luỹ đang mở, trả về mốc hoạt động muộn nhất.
 *
 * Nhận `categories` và `warehouses` từ bên ngoài để cùng một hàm dùng được cho cả
 * hai mức: gọi với bộ riêng thì ra số của một nhiệm vụ, gọi lần lượt vào cùng một
 * bộ thì ra số của cả đợt. Chép ra hai vòng cộng riêng là chỗ để hai mức số liệu
 * âm thầm lệch nhau — mà lệch ở đây thì không ai phát hiện được bằng mắt.
 */
function accumulateMission(
  categories: Map<string, MutableCategory>,
  warehouses: Map<string, { id: string; name: string }>,
  mission: MissionRow,
  loans: LoanRow[],
  metadataBySku: Map<string, SkuMetadata>,
): Date {
  /** Mốc hoạt động mới nhất — dùng cho cột "cập nhật lúc". */
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

  return lastActivityAt;
}

/** Nhóm hàng tiêu nhiều nhất lên đầu; bằng nhau thì xếp theo tên tiếng Việt. */
function sortCategories(categories: Map<string, MutableCategory>) {
  return [...categories.values()]
    .map((category) => ({
      ...stripItems(category),
      items: [...category.items.values()].sort((a, b) => b.issued - a.issued),
    }))
    .sort((a, b) => b.issued - a.issued || a.categoryName.localeCompare(b.categoryName, "vi"));
}

/**
 * Các loại tình huống trong đợt, loại có nhiều nhiệm vụ nhất đứng trước.
 *
 * Một đợt thường pha nhiều thứ: bão đổ bộ rồi ngập, ngập rồi sạt lở. Màn hình
 * gọi tên đợt bằng loại đứng đầu và nói thêm "+2 loại" nếu còn, thay vì bịa ra
 * một cái tên chung chung mà không dữ liệu nào chống lưng.
 */
function rankIncidentTypes(missions: MissionRow[]): string[] {
  const counts = new Map<string, number>();
  for (const mission of missions) {
    counts.set(mission.incidentType, (counts.get(mission.incidentType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([incidentType]) => incidentType);
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

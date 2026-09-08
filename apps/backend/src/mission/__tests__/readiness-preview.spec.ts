import { MissionService } from "../mission.service";

/**
 * "Khả năng đáp ứng nhiệm vụ" ở chặng lập tham mưu — tính xong rồi vứt.
 *
 * Khối này tính lại sau MỖI lần ADMIN sửa một ô số, nên hai tính chất phải được
 * khoá bằng test: nó KHÔNG ghi gì xuống nhiệm vụ (ghi thì mỗi lượt xem trang là
 * một lần phương án bị viết lại dưới chân người đang đọc), và nó đọc theo con số
 * `required` của ADMIN chứ không theo phần hiện trường chốt lấy từ kho.
 */

interface RequirementFixture {
  sku: string;
  itemName: string;
  unit: string;
  required: number;
  /** Phần hiện trường chốt lấy từ kho — cố tình khác `required` để bắt lỗi đọc nhầm cột. */
  warehouseQuantity: number;
}

function makeService(requirements: RequirementFixture[], stockBySku: Record<string, number>) {
  const mission = {
    id: "mission-1",
    warehouseId: "warehouse-a",
    incidentLat: 13.4,
    incidentLng: 109.1,
    requirements,
    warehouseRequests: [],
    _count: { coordinationAnalyses: 0 },
  };
  // Một lô cho mỗi SKU, tất cả ở cùng một kho và đều đủ điều kiện lấy ngay —
  // xem `assessBatchEligibility` để biết vì sao từng trường phải có giá trị này.
  const batches = Object.entries(stockBySku).map(([sku, quantity], index) => ({
    id: `batch-${index}`,
    batchCode: `LO-${index}`,
    quantity,
    expiryDate: null,
    condition: "NEW",
    circulation: "IN_STOCK",
    item: { sku, name: sku, consumable: true },
    shelf: { isLocked: false, zone: { warehouseId: "warehouse-a" } },
    loans: [],
  }));
  const prisma = {
    mission: { findUnique: jest.fn().mockResolvedValue(mission), update: jest.fn() },
    // `getMission` đối chiếu người gọi với đơn vị của kho trước khi trả nhiệm vụ.
    user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
    warehouse: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ organizationId: "org-1", communeId: "commune-1" }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: "warehouse-a", name: "Kho thôn Long Châu", lat: null, lng: null, distanceKm: 2 },
        ]),
    },
    itemBatch: { findMany: jest.fn().mockResolvedValue(batches) },
    missionWarehouseRequest: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  const readiness = {
    getWarehouseScore: jest.fn().mockResolvedValue({ operationalStatus: "READY", blockers: [] }),
  };
  const localRouting = { route: jest.fn() };
  const service = new MissionService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    readiness as never,
    localRouting as never,
    {} as never,
  );
  return { service, prisma, localRouting };
}

function requirement(
  sku: string,
  required: number,
  warehouseQuantity = required,
): RequirementFixture {
  return { sku, itemName: sku, unit: "chiếc", required, warehouseQuantity };
}

describe("previewReadiness", () => {
  it("đọc theo số CẦN của điều phối, không theo phần hiện trường chốt lấy từ kho", async () => {
    // Hiện trường chỉ lấy 2 vì đang cầm sẵn 8 — nhưng khối "khả năng đáp ứng" trả
    // lời câu khác: kho có đủ 10 cho nhu cầu này không. Đọc nhầm sang cột kia thì
    // bảng hiện "đủ" cho một nhu cầu kho không gánh nổi.
    const { service } = makeService([requirement("VEST", 10, 2)], { VEST: 6 });

    const assessment = await service.previewReadiness("mission-1", "admin-1");

    expect(assessment.items).toHaveLength(1);
    expect(assessment.items[0].required).toBe(10);
    expect(assessment.items[0].allocated).toBe(6);
    expect(assessment.items[0].shortage).toBe(4);
    expect(assessment.status).toBe("NEEDS_ACTION");
  });

  it("đủ hàng thì báo đủ, và KHÔNG ghi gì xuống nhiệm vụ", async () => {
    const { service, prisma } = makeService([requirement("VEST", 3)], { VEST: 9 });

    const assessment = await service.previewReadiness("mission-1", "admin-1");

    expect(assessment.status).toBe("READY");
    expect(assessment.fulfillment).toBe(100);
    // Đây là điểm khác biệt duy nhất với `planAllocation`, và cũng là lý do khối
    // này gọi được sau mỗi lần gõ.
    expect(prisma.mission.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("không dò tuyến — quãng đường không đổi tổng lấy được", async () => {
    // Mỗi lượt dò là một vòng gọi OSRM cho cả cụm kho, đổi lấy đúng con số vừa có.
    const { service, localRouting } = makeService([requirement("VEST", 3)], { VEST: 9 });

    await service.previewReadiness("mission-1", "admin-1");

    expect(localRouting.route).not.toHaveBeenCalled();
  });

  it("bản tham mưu rỗng thì trả về đánh giá rỗng, không đi hỏi kho", async () => {
    const { service, prisma } = makeService([], {});

    const assessment = await service.previewReadiness("mission-1", "admin-1");

    expect(assessment.items).toEqual([]);
    expect(prisma.itemBatch.findMany).not.toHaveBeenCalled();
  });
});

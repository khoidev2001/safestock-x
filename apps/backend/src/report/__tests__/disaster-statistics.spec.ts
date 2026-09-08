import { MissionStatus } from "@prisma/client";
import { DisasterStatisticsService } from "../disaster-statistics.service";

/**
 * Khoá hai luật dễ trôi nhất của bảng thống kê sau thiên tai:
 *
 *  - Chưa ai ký nhận (pickedUpQuantity = null) KHÁC ký nhận 0. Nhầm chỗ này là
 *    bịa ra một khoản thiếu chưa hề xảy ra.
 *  - Chênh lệch khi ký nhận KHÔNG được cộng vào thất thoát. Hai con số này trả
 *    lời hai câu hỏi khác nhau và dẫn tới hai hành động khác nhau.
 */

const ORGANIZATION_ID = "org-1";

function makeMission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mission-1",
    missionNo: 12,
    incidentType: "FLOOD",
    location: "Long Châu",
    hamletName: "Long Châu",
    status: MissionStatus.COMPLETED,
    affectedPeople: 150,
    durationHours: 48,
    deliveryOutcome: null,
    deliveryNote: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    approvedAt: new Date("2026-09-01T01:00:00.000Z"),
    completedAt: null,
    warehouseRequests: [],
    ...overrides,
  };
}

function makeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sku: "WATER-5L",
    itemName: "Nước uống chai 5 lít",
    unit: "chai",
    requestedQuantity: 100,
    preparedQuantity: 100,
    pickedUpQuantity: 100,
    status: "PICKED_UP",
    preparedAt: new Date("2026-09-01T02:00:00.000Z"),
    pickedUpAt: new Date("2026-09-01T03:00:00.000Z"),
    updatedAt: new Date("2026-09-01T03:00:00.000Z"),
    warehouse: { id: "warehouse-1", name: "Kho trung tâm" },
    ...overrides,
  };
}

function makeService(missions: object[], loans: object[] = []) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ organizationId: ORGANIZATION_ID }) },
    mission: { findMany: jest.fn().mockResolvedValue(missions) },
    loanRecord: { findMany: jest.fn().mockResolvedValue(loans) },
    item: {
      findMany: jest.fn().mockResolvedValue([
        {
          sku: "WATER-5L",
          consumable: true,
          category: { name: "Nước uống", unit: "chai" },
        },
        {
          sku: "VEST-ADULT",
          consumable: false,
          category: { name: "Thiết bị cứu sinh", unit: "chiếc" },
        },
      ]),
    },
  };
  return { service: new DisasterStatisticsService(prisma as never), prisma };
}

describe("DisasterStatisticsService", () => {
  it("treats an unsigned pickup as not-yet-collected instead of a shortfall", async () => {
    const state = makeService([
      makeMission({
        warehouseRequests: [
          makeRequest({ pickedUpQuantity: null, status: "PREPARED", pickedUpAt: null }),
        ],
      }),
    ]);

    const result = await state.service.getStatistics("actor-1");

    expect(result.totals.issued).toBe(100);
    expect(result.totals.pickedUp).toBe(0);
    // Chưa ký nhận thì chưa có chênh lệch — không được coi là thiếu 100.
    expect(result.totals.pickupGap).toBe(0);
  });

  it("records a pickup shortfall without counting it as loss", async () => {
    const state = makeService([
      makeMission({
        warehouseRequests: [makeRequest({ preparedQuantity: 100, pickedUpQuantity: 80 })],
      }),
    ]);

    const result = await state.service.getStatistics("actor-1");

    expect(result.totals.pickupGap).toBe(20);
    expect(result.totals.lost).toBe(0);
    expect(result.totals.returnedDamaged).toBe(0);
  });

  it("counts loan losses and returns against the mission that borrowed them", async () => {
    const state = makeService(
      [makeMission({ warehouseRequests: [makeRequest()] })],
      [
        {
          missionId: "mission-1",
          quantity: 30,
          returnedOk: 28,
          returnedDamaged: 1,
          lost: 1,
          status: "CLOSED",
          borrowedAt: new Date("2026-09-01T04:00:00.000Z"),
          closedAt: new Date("2026-09-03T04:00:00.000Z"),
          batch: {
            item: { sku: "VEST-ADULT", name: "Áo phao người lớn" },
            shelf: { zone: { warehouseId: "warehouse-1" } },
          },
        },
      ],
    );

    const result = await state.service.getStatistics("actor-1");

    expect(result.totals.loanedOut).toBe(30);
    expect(result.totals.returnedOk).toBe(28);
    expect(result.totals.returnedDamaged).toBe(1);
    expect(result.totals.lost).toBe(1);
    expect(result.totals.stillOnLoan).toBe(0);

    const [event] = result.events;
    // Mốc "cập nhật gần nhất" phải chạy theo thao tác muộn nhất, kể cả khi thao
    // tác đó nằm ở phiếu mượn chứ không phải ở yêu cầu kho.
    expect(event.lastActivityAt).toBe(new Date("2026-09-03T04:00:00.000Z").toISOString());
  });

  it("keeps a warehouse-scoped actor inside their own warehouse", async () => {
    const state = makeService([makeMission({ warehouseRequests: [makeRequest()] })]);

    await state.service.getStatistics("actor-1", "warehouse-1");

    const missionArgs = state.prisma.mission.findMany.mock.calls[0][0];
    expect(missionArgs.where.warehouseRequests).toEqual({ some: { warehouseId: "warehouse-1" } });
    expect(missionArgs.select.warehouseRequests.where).toEqual({ warehouseId: "warehouse-1" });

    const loanArgs = state.prisma.loanRecord.findMany.mock.calls[0][0];
    expect(loanArgs.where.batch).toEqual({ shelf: { zone: { warehouseId: "warehouse-1" } } });
  });

  it("excludes draft missions, which have never released stock", async () => {
    const state = makeService([]);

    await state.service.getStatistics("actor-1");

    const missionArgs = state.prisma.mission.findMany.mock.calls[0][0];
    expect(missionArgs.where.status).toEqual({ notIn: [MissionStatus.DRAFT] });
  });

  it("groups quantities under the item category so food and water read separately", async () => {
    const state = makeService([
      makeMission({
        warehouseRequests: [
          makeRequest(),
          makeRequest({
            sku: "VEST-ADULT",
            itemName: "Áo phao người lớn",
            unit: "chiếc",
            requestedQuantity: 150,
            preparedQuantity: 150,
            pickedUpQuantity: 150,
          }),
        ],
      }),
    ]);

    const result = await state.service.getStatistics("actor-1");
    const names = result.events[0].categories.map((category) => category.categoryName);

    expect(names).toContain("Nước uống");
    expect(names).toContain("Thiết bị cứu sinh");
  });
});

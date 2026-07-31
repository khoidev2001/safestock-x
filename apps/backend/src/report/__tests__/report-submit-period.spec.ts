import { BadRequestException, ConflictException } from "@nestjs/common";
import { ReportService } from "../report.service";

describe("ReportService monthly period invariant", () => {
  it.each(["2026-00", "2026-13", "2026-99"])(
    "rejects invalid calendar month %s",
    async (period) => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-a" }) },
        warehouse: {
          findUnique: jest.fn().mockResolvedValue({ id: "warehouse-a", organizationId: "org-a" }),
        },
      };
      const service = new ReportService(prisma as never, {} as never);

      await expect(
        service.submitRows(
          "user-1",
          "warehouse-a",
          period,
          [
            {
              sku: "RICE-01",
              itemName: "Gạo",
              quantity: 7,
              unit: "kg",
              expiryDate: null,
              condition: "NEW",
              note: null,
            },
          ],
          "warehouse-a",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("rejects a second active report for the same warehouse and period", async () => {
    const reports: Array<Record<string, unknown>> = [];
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      monthlyStockReport: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) =>
            reports.find(
              (report) =>
                report.warehouseId === where.warehouseId &&
                report.period === where.period &&
                ["PENDING", "APPROVED"].includes(String(report.status)),
            ),
          ),
        create: jest.fn().mockImplementation(({ data }) => {
          const report = { id: `report-${reports.length + 1}`, createdAt: new Date(), ...data };
          reports.push(report);
          return report;
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-a" }) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: "warehouse-a", organizationId: "org-a" }),
      },
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    };
    const service = new ReportService(prisma as never, {} as never);
    const rows = [
      {
        sku: "RICE-01",
        itemName: "Gạo",
        quantity: 7,
        unit: "kg",
        expiryDate: null,
        condition: "NEW",
        note: null,
      },
    ];

    await service.submitRows("user-1", "warehouse-a", "2026-07", rows, "warehouse-a");
    await expect(
      service.submitRows("user-1", "warehouse-a", "2026-07", rows, "warehouse-a"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(reports).toHaveLength(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});

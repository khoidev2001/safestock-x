import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ReportStatus } from "@prisma/client";
import { ReportService } from "../report.service";

function makeService(options?: { actorExists?: boolean; visibleReport?: object | null }) {
  const visibleReport = options?.visibleReport ?? null;
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options?.actorExists === false ? null : { organizationId: "org-actor" }),
    },
    warehouse: {
      findUnique: jest.fn().mockResolvedValue({
        id: "warehouse-foreign",
        organizationId: "org-foreign",
      }),
    },
    monthlyStockReport: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const warehouse = where.warehouse as { organizationId?: string } | undefined;
        return warehouse?.organizationId === "org-actor" ? [] : [{ id: "report-foreign" }];
      }),
      findFirst: jest.fn().mockResolvedValue(visibleReport),
      create: jest.fn(),
    },
  };
  return {
    service: new ReportService(prisma as never, {} as never),
    prisma,
  };
}

describe("ReportService read organization scope", () => {
  it("omits reports from other organizations in list results", async () => {
    const state = makeService();

    await expect(
      state.service.list("actor-1", ReportStatus.PENDING),
    ).resolves.toEqual([]);
  });

  it("hides a report from another organization on direct lookup", async () => {
    const state = makeService();

    await expect(state.service.get("report-foreign", "actor-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("combines organization and assigned-warehouse scope for list and get", async () => {
    const state = makeService();

    await state.service.list("actor-1", ReportStatus.PENDING, "warehouse-assigned");
    await expect(
      state.service.get("report-foreign", "actor-1", "warehouse-assigned"),
    ).rejects.toBeInstanceOf(NotFoundException);

    const expectedScope = {
      status: ReportStatus.PENDING,
      warehouse: { organizationId: "org-actor" },
      warehouseId: "warehouse-assigned",
    };
    expect(state.prisma.monthlyStockReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedScope }),
    );
    expect(state.prisma.monthlyStockReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "report-foreign",
          warehouse: { organizationId: "org-actor" },
          warehouseId: "warehouse-assigned",
        },
      }),
    );
  });

  it("rejects an unknown actor before querying reports", async () => {
    const state = makeService({ actorExists: false });

    await expect(state.service.list("missing-actor")).rejects.toBeInstanceOf(NotFoundException);
    expect(state.prisma.monthlyStockReport.findMany).not.toHaveBeenCalled();
  });

  it("rejects an unscoped actor submitting to another organization", async () => {
    const state = makeService();

    await expect(
      state.service.submit(
        "actor-1",
        "warehouse-foreign",
        "2026-07",
        Buffer.from("not-an-xlsx"),
        null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.prisma.monthlyStockReport.create).not.toHaveBeenCalled();
  });
});

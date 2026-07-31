import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CirculationStatus, LoanStatus, Prisma, ReportStatus } from "@prisma/client";
import { InventoryAdjustmentService } from "../inventory/inventory-adjustment.service";
import { mutationFingerprint, withMutationIdempotency } from "../inventory/mutation-idempotency";
import { lockLoanTableForApproval } from "../loan/loan-table-lock";
import { PrismaService } from "../prisma/prisma.service";
import { parseReportExcel, ReportRow } from "./excel.parser";

type ApprovalRow = Pick<ReportRow, "batchId" | "batchCode" | "shelfCode" | "sku" | "quantity">;

type ApprovalBatch = {
  id: string;
  quantity: number;
  circulation: CirculationStatus;
};

type AppliedReportItem = {
  sku: string;
  batchId: string;
  countedQty: number;
};

/**
 * Báo cáo kiểm kê tháng của kho thôn (Luồng 2):
 *  1. Trưởng thôn upload Excel → parse → lưu PENDING (chưa đụng tồn).
 *  2. ADMIN xã duyệt → áp reconcile TỪNG SKU (đối soát tồn = số báo cáo) → APPROVED.
 * Reconcile tái dùng nguyên logic Bp2 (đối soát + audit + trừ ON_LOAN).
 */
@Injectable()
export class ReportService {
  constructor(
    private prisma: PrismaService,
    private adjustment: InventoryAdjustmentService,
  ) {}

  /** Trưởng thôn gửi báo cáo. scopeWarehouseId (nếu có) PHẢI khớp kho báo cáo — chống nộp hộ kho khác. */
  async submit(
    userId: string,
    warehouseId: string,
    period: string,
    fileBuffer: Buffer,
    scopeWarehouseId?: string | null,
  ) {
    if (scopeWarehouseId && scopeWarehouseId !== warehouseId) {
      throw new ForbiddenException("Bạn chỉ được nộp báo cáo cho kho thôn của mình");
    }
    const [actor, wh] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, organizationId: true },
      }),
    ]);
    if (!actor) throw new NotFoundException("Không tìm thấy người gửi báo cáo");
    if (!wh) throw new NotFoundException("Không tìm thấy kho");
    if (actor.organizationId !== wh.organizationId) {
      throw new ForbiddenException("Bạn không được nộp báo cáo cho kho ngoài đơn vị");
    }
    assertValidReportPeriod(period);

    const rows = await parseReportExcel(fileBuffer);

    return this.createPendingReport(userId, warehouseId, period, rows);
  }

  async submitRows(
    userId: string,
    warehouseId: string,
    period: string,
    rows: ReportRow[],
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    await this.assertSubmitScope(userId, warehouseId, period, scopeWarehouseId);
    validateApprovalRows(rows as unknown as Prisma.JsonValue);
    const normalizedRows = rows.map((row) => ({
      batchId: row.batchId?.trim() || null,
      batchCode: row.batchCode?.trim() || null,
      shelfCode: row.shelfCode?.trim() || null,
      sku: row.sku.trim(),
      itemName: row.itemName.trim(),
      quantity: row.quantity,
      unit: row.unit.trim(),
      expiryDate: row.expiryDate ?? null,
      condition: row.condition?.trim() || null,
      note: row.note?.trim() || null,
    }));
    return this.createPendingReport(userId, warehouseId, period, normalizedRows, requestId);
  }

  async list(actorUserId: string, status?: ReportStatus, scopeWarehouseId?: string | null) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    return this.prisma.monthlyStockReport.findMany({
      where: {
        ...(status ? { status } : {}),
        warehouse: { organizationId: actor.organizationId },
        ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
      },
      include: {
        warehouse: { select: { name: true } },
        submittedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(id: string, actorUserId: string, scopeWarehouseId?: string | null) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    const report = await this.prisma.monthlyStockReport.findFirst({
      where: {
        id,
        warehouse: { organizationId: actor.organizationId },
        ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
      },
      include: {
        warehouse: { select: { name: true } },
        submittedBy: { select: { fullName: true } },
      },
    });
    if (!report) throw new NotFoundException("Không tìm thấy báo cáo");
    return report;
  }

  /** ADMIN duyệt: reconcile đúng lô đã kiểm đếm; dữ liệu mơ hồ phải fail-closed. */
  async approve(id: string, adminUserId: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const [actor, report] = await Promise.all([
        tx.user.findUnique({ where: { id: adminUserId }, select: { organizationId: true } }),
        tx.monthlyStockReport.findUnique({
          where: { id },
          include: { warehouse: { select: { organizationId: true } } },
        }),
      ]);
      if (!actor) throw new NotFoundException("Không tìm thấy người duyệt báo cáo");
      if (!report) throw new NotFoundException("Không tìm thấy báo cáo");
      if (report.warehouse.organizationId !== actor.organizationId) {
        throw new ForbiddenException("Bạn chỉ được duyệt báo cáo trong tổ chức của mình");
      }
      if (report.status === ReportStatus.APPROVED) {
        return {
          result: { id, status: ReportStatus.APPROVED, applied: [] as AppliedReportItem[] },
          warehouseId: null,
        };
      }
      if (report.status !== ReportStatus.PENDING) {
        throw new BadRequestException("Chỉ duyệt được báo cáo đang chờ (PENDING)");
      }

      const claimed = await tx.monthlyStockReport.updateMany({
        where: { id, status: ReportStatus.PENDING },
        data: {
          status: ReportStatus.APPROVED,
          approvedByUserId: adminUserId,
          approvedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        const current = await tx.monthlyStockReport.findUnique({
          where: { id },
          select: { status: true },
        });
        if (current?.status === ReportStatus.APPROVED) {
          return {
            result: { id, status: ReportStatus.APPROVED, applied: [] as AppliedReportItem[] },
            warehouseId: null,
          };
        }
        throw new BadRequestException("Báo cáo vừa được xử lý; hãy tải lại trạng thái");
      }

      const rows = validateApprovalRows(report.rows);
      const orderedRows = rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .sort((left, right) => compareApprovalRows(left.row, right.row));
      await lockLoanTableForApproval(tx);
      const appliedWithOrder: Array<AppliedReportItem & { rowIndex: number }> = [];
      const note = `Duyệt báo cáo tháng ${report.period} (${report.id})`;

      for (const { row, rowIndex } of orderedRows) {
        let batch: ApprovalBatch | null;
        if (row.batchId || row.batchCode) {
          batch = await tx.itemBatch.findFirst({
            where: {
              ...(row.batchId ? { id: row.batchId } : {}),
              ...(row.batchCode ? { batchCode: row.batchCode } : {}),
              item: { sku: row.sku },
              shelf: {
                ...(row.shelfCode ? { code: row.shelfCode } : {}),
                zone: { warehouseId: report.warehouseId },
              },
            },
            include: {
              loans: {
                where: {
                  status: {
                    in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED],
                  },
                },
              },
            },
          });
          if (!batch) {
            throw new ConflictException(
              `Lô ${row.batchCode ?? row.batchId} của SKU ${row.sku} không còn ở vị trí đã kiểm đếm`,
            );
          }
        } else {
          const candidates = await tx.itemBatch.findMany({
            where: {
              item: { sku: row.sku },
              shelf: { zone: { warehouseId: report.warehouseId } },
            },
            include: {
              loans: {
                where: {
                  status: {
                    in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED],
                  },
                },
              },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 2,
          });
          if (candidates.length === 0) {
            throw new ConflictException(`SKU ${row.sku} không có lô trong kho báo cáo`);
          }
          if (candidates.length > 1) {
            throw new ConflictException(
              `SKU ${row.sku} có nhiều lô; báo cáo phải ghi rõ lô đã kiểm đếm`,
            );
          }
          batch = candidates[0];
        }

        await this.adjustment.reconcileInTx(
          tx,
          adminUserId,
          batch.id,
          row.quantity,
          true,
          note,
          report.warehouseId,
          {
            requireStableSnapshot: true,
            expectedBatch: {
              quantity: batch.quantity,
              circulation: batch.circulation,
            },
          },
        );
        appliedWithOrder.push({
          sku: row.sku,
          batchId: batch.id,
          countedQty: row.quantity,
          rowIndex,
        });
      }
      const applied = appliedWithOrder
        .sort((left, right) => left.rowIndex - right.rowIndex)
        .map(({ rowIndex: _rowIndex, ...item }) => item);

      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          action: "REPORT_APPROVE",
          entity: "MonthlyStockReport",
          entityId: report.id,
          metadata: {
            warehouseId: report.warehouseId,
            period: report.period,
            reason: note,
            beforeStatus: ReportStatus.PENDING,
            afterStatus: ReportStatus.APPROVED,
            skuCount: rows.length,
            reconciledBatchCount: applied.length,
            skippedSkus: [],
          },
        },
      });

      return {
        result: { id, status: ReportStatus.APPROVED, applied },
        warehouseId: report.warehouseId,
      };
    });
    if (outcome.warehouseId) {
      await this.adjustment.recalculateWarehousesAfterCommit([outcome.warehouseId]);
    }
    return outcome.result;
  }

  async reject(id: string, adminUserId: string, note?: string) {
    const normalizedNote = note?.trim() ?? "";
    if (normalizedNote.length < 3) {
      throw new BadRequestException("Lý do từ chối phải có ít nhất 3 ký tự");
    }
    return this.prisma.$transaction(async (tx) => {
      const [actor, report] = await Promise.all([
        tx.user.findUnique({ where: { id: adminUserId }, select: { organizationId: true } }),
        tx.monthlyStockReport.findUnique({
          where: { id },
          include: { warehouse: { select: { organizationId: true } } },
        }),
      ]);
      if (!actor) throw new NotFoundException("Không tìm thấy người duyệt báo cáo");
      if (!report) throw new NotFoundException("Không tìm thấy báo cáo");
      if (report.warehouse.organizationId !== actor.organizationId) {
        throw new ForbiddenException("Bạn chỉ được xử lý báo cáo trong tổ chức của mình");
      }
      if (report.status !== ReportStatus.PENDING) {
        throw new BadRequestException("Chỉ từ chối được báo cáo đang chờ (PENDING)");
      }

      const claimed = await tx.monthlyStockReport.updateMany({
        where: { id, status: ReportStatus.PENDING },
        data: {
          status: ReportStatus.REJECTED,
          approvedByUserId: adminUserId,
          approvedAt: new Date(),
          note: normalizedNote,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException("Báo cáo vừa được xử lý; hãy tải lại trạng thái");
      }
      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          action: "REPORT_REJECT",
          entity: "MonthlyStockReport",
          entityId: report.id,
          metadata: {
            warehouseId: report.warehouseId,
            period: report.period,
            reason: normalizedNote,
            beforeStatus: ReportStatus.PENDING,
            afterStatus: ReportStatus.REJECTED,
          },
        },
      });
      return tx.monthlyStockReport.findUnique({ where: { id } });
    });
  }

  private createPendingReport(
    userId: string,
    warehouseId: string,
    period: string,
    rows: ReportRow[],
    requestId?: string,
  ) {
    return this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation: "report.submit",
          requestId,
          fingerprint: mutationFingerprint({ warehouseId, period, rows }),
        },
        async () => {
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            `monthly-stock-report:${warehouseId}:${period}`,
          );
          const activeReport = await tx.monthlyStockReport.findFirst({
            where: {
              warehouseId,
              period,
              status: { in: [ReportStatus.PENDING, ReportStatus.APPROVED] },
            },
            select: { id: true, status: true },
          });
          if (activeReport) {
            throw new ConflictException(
              `Kho đã có báo cáo kỳ ${period} ở trạng thái ${activeReport.status}`,
            );
          }
          const report = await tx.monthlyStockReport.create({
            data: {
              warehouseId,
              submittedByUserId: userId,
              period,
              status: ReportStatus.PENDING,
              rows: rows as unknown as Prisma.InputJsonValue,
            },
            select: {
              id: true,
              warehouseId: true,
              period: true,
              status: true,
              createdAt: true,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: userId,
              action: "REPORT_SUBMIT",
              entity: "MonthlyStockReport",
              entityId: report.id,
              metadata: {
                warehouseId,
                period,
                rowCount: rows.length,
                afterStatus: ReportStatus.PENDING,
              },
            },
          });
          return report;
        },
      ),
    );
  }

  private async assertSubmitScope(
    userId: string,
    warehouseId: string,
    period: string,
    scopeWarehouseId?: string | null,
  ) {
    if (scopeWarehouseId && scopeWarehouseId !== warehouseId) {
      throw new ForbiddenException("Bạn chỉ được nộp báo cáo cho kho thôn của mình");
    }
    const [actor, warehouse] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, organizationId: true },
      }),
    ]);
    if (!actor) throw new NotFoundException("Không tìm thấy người gửi báo cáo");
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");
    if (actor.organizationId !== warehouse.organizationId) {
      throw new ForbiddenException("Bạn không được nộp báo cáo cho kho ngoài đơn vị");
    }
    assertValidReportPeriod(period);
  }
}

function assertValidReportPeriod(period: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new BadRequestException("Kỳ báo cáo phải là tháng hợp lệ dạng YYYY-MM");
  }
}

function validateApprovalRows(value: Prisma.JsonValue): ApprovalRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException("Dữ liệu báo cáo không hợp lệ");
  }

  const seenRows = new Set<string>();
  const skuModes = new Map<string, "BATCH" | "LEGACY">();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BadRequestException(`Dòng báo cáo ${index + 1} không hợp lệ`);
    }
    const sku = typeof raw.sku === "string" ? raw.sku.trim() : "";
    const batchId =
      typeof raw.batchId === "string" && raw.batchId.trim() ? raw.batchId.trim() : null;
    const batchCode =
      typeof raw.batchCode === "string" && raw.batchCode.trim() ? raw.batchCode.trim() : null;
    const shelfCode =
      typeof raw.shelfCode === "string" && raw.shelfCode.trim() ? raw.shelfCode.trim() : null;
    const quantity = raw.quantity;
    if (!sku || !Number.isInteger(quantity) || (quantity as number) < 0) {
      throw new BadRequestException(`Dòng báo cáo ${index + 1} không hợp lệ`);
    }
    const skuKey = approvalSkuKey(sku);
    const mode = batchId || batchCode ? "BATCH" : "LEGACY";
    const previousMode = skuModes.get(skuKey);
    if (previousMode && previousMode !== mode) {
      throw new BadRequestException(`SKU ${sku} không được trộn dòng theo lô và dòng tổng hợp`);
    }
    skuModes.set(skuKey, mode);
    const rowKey = batchId
      ? `batch:${batchId}`
      : batchCode
        ? `code:${skuKey}:${batchCode.toUpperCase()}`
        : `sku:${skuKey}`;
    if (seenRows.has(rowKey)) {
      throw new BadRequestException(
        batchId || batchCode
          ? `Lô ${batchCode ?? batchId} bị lặp trong báo cáo`
          : `SKU ${sku} bị lặp trong báo cáo`,
      );
    }
    seenRows.add(rowKey);
    return {
      sku,
      batchId,
      batchCode,
      shelfCode,
      quantity: quantity as number,
    };
  });
}

function approvalSkuKey(sku: string): string {
  return sku.toUpperCase();
}

function compareApprovalRows(left: ApprovalRow, right: ApprovalRow): number {
  const leftKey = approvalSkuKey(left.sku);
  const rightKey = approvalSkuKey(right.sku);
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return (left.batchId ?? left.batchCode ?? "").localeCompare(
    right.batchId ?? right.batchCode ?? "",
  );
}

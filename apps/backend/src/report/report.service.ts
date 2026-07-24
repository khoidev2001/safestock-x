import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LoanStatus, Prisma, ReportStatus } from "@prisma/client";
import { InventoryAdjustmentService } from "../inventory/inventory-adjustment.service";
import { sumOutstanding } from "../inventory/loan-math";
import { lockLoanTableForApproval } from "../loan/loan-table-lock";
import { PrismaService } from "../prisma/prisma.service";
import { parseReportExcel, ReportRow } from "./excel.parser";

type ApprovalRow = Pick<ReportRow, "sku" | "quantity">;

type ApprovalBatch = {
  id: string;
  quantity: number;
  loans: Parameters<typeof sumOutstanding>[0];
};

type AppliedReportItem = {
  sku: string;
  batchId?: string;
  countedQty: number;
  skipped?: string;
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
    const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new NotFoundException("Không tìm thấy kho");
    if (!/^\d{4}-\d{2}$/.test(period))
      throw new BadRequestException("Kỳ báo cáo phải dạng YYYY-MM");

    const rows = await parseReportExcel(fileBuffer);

    return this.prisma.monthlyStockReport.create({
      data: {
        warehouseId,
        submittedByUserId: userId,
        period,
        status: ReportStatus.PENDING,
        rows: rows as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, warehouseId: true, period: true, status: true, createdAt: true },
    });
  }

  list(status?: ReportStatus) {
    return this.prisma.monthlyStockReport.findMany({
      where: status ? { status } : undefined,
      include: {
        warehouse: { select: { name: true } },
        submittedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  get(id: string) {
    return this.prisma.monthlyStockReport.findUnique({ where: { id } });
  }

  /**
   * ADMIN duyệt: phân bổ số đếm SKU qua mọi batch trong kho báo cáo rồi reconcile atomically.
   * SKU không có batch trong kho vẫn giữ hành vi bỏ qua và ghi rõ trong kết quả.
   */
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
      const rowOrder = new Map(rows.map((row, index) => [approvalSkuKey(row.sku), index]));
      const orderedRows = [...rows].sort(compareApprovalRows);
      await lockLoanTableForApproval(tx);
      const applied: AppliedReportItem[] = [];
      const note = `Duyệt báo cáo tháng ${report.period} (${report.id})`;

      for (const row of orderedRows) {
        const batches = await tx.itemBatch.findMany({
          where: {
            item: { sku: row.sku },
            shelf: { zone: { warehouseId: report.warehouseId } },
          },
          include: {
            loans: {
              where: { status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] } },
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        if (batches.length === 0) {
          applied.push({
            sku: row.sku,
            countedQty: row.quantity,
            skipped: "SKU không có lô trong kho",
          });
          continue;
        }

        const allocations = allocateCountedQuantity(row.quantity, batches);
        for (let index = 0; index < batches.length; index += 1) {
          const batch = batches[index];
          const countedQty = allocations[index];
          await this.adjustment.reconcileInTx(
            tx,
            adminUserId,
            batch.id,
            countedQty,
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
          applied.push({ sku: row.sku, batchId: batch.id, countedQty });
        }
      }
      applied.sort(
        (left, right) =>
          (rowOrder.get(approvalSkuKey(left.sku)) ?? 0) -
          (rowOrder.get(approvalSkuKey(right.sku)) ?? 0),
      );

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
            reconciledBatchCount: applied.filter((item) => item.batchId).length,
            skippedSkus: applied.filter((item) => item.skipped).map((item) => item.sku),
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
          note,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException("Báo cáo vừa được xử lý; hãy tải lại trạng thái");
      }
      return tx.monthlyStockReport.findUnique({ where: { id } });
    });
  }
}

function validateApprovalRows(value: Prisma.JsonValue): ApprovalRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException("Dữ liệu báo cáo không hợp lệ");
  }

  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BadRequestException(`Dòng báo cáo ${index + 1} không hợp lệ`);
    }
    const sku = typeof raw.sku === "string" ? raw.sku.trim() : "";
    const quantity = raw.quantity;
    if (!sku || !Number.isInteger(quantity) || (quantity as number) < 0) {
      throw new BadRequestException(`Dòng báo cáo ${index + 1} không hợp lệ`);
    }
    const key = approvalSkuKey(sku);
    if (seen.has(key)) throw new BadRequestException(`SKU ${sku} bị lặp trong báo cáo`);
    seen.add(key);
    return { sku, quantity: quantity as number };
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
  return 0;
}

function allocateCountedQuantity(total: number, batches: ApprovalBatch[]): number[] {
  let remaining = total;
  return batches.map((batch, index) => {
    if (index === batches.length - 1) return remaining;
    const expectedInStock = Math.max(0, batch.quantity - sumOutstanding(batch.loans));
    const allocated = Math.min(remaining, expectedInStock);
    remaining -= allocated;
    return allocated;
  });
}

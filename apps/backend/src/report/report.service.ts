import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReportStatus } from "@prisma/client";
import { InventoryAdjustmentService } from "../inventory/inventory-adjustment.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseReportExcel, ReportRow } from "./excel.parser";

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
    if (!/^\d{4}-\d{2}$/.test(period)) throw new BadRequestException("Kỳ báo cáo phải dạng YYYY-MM");

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
      include: { warehouse: { select: { name: true } }, submittedBy: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  get(id: string) {
    return this.prisma.monthlyStockReport.findUnique({ where: { id } });
  }

  /**
   * ADMIN duyệt: áp reconcile từng dòng theo SKU. Tìm batch của SKU đó TRONG kho báo cáo,
   * ghi đè tồn về số báo cáo (applyOverride=true). SKU không có batch trong kho → bỏ qua, ghi vào kết quả.
   */
  async approve(id: string, adminUserId: string) {
    const report = await this.prisma.monthlyStockReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Không tìm thấy báo cáo");
    if (report.status !== ReportStatus.PENDING) {
      throw new BadRequestException("Chỉ duyệt được báo cáo đang chờ (PENDING)");
    }

    const rows = report.rows as unknown as ReportRow[];
    const applied: { sku: string; batchId?: string; countedQty: number; skipped?: string }[] = [];

    for (const row of rows) {
      // Batch IN_STOCK của SKU trong đúng kho báo cáo (lấy lô đầu tiên — ponytail: đủ 1 SKU/kho thôn nhỏ).
      const batch = await this.prisma.itemBatch.findFirst({
        where: {
          item: { sku: row.sku },
          shelf: { zone: { warehouseId: report.warehouseId } },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!batch) {
        applied.push({ sku: row.sku, countedQty: row.quantity, skipped: "SKU không có lô trong kho" });
        continue;
      }
      await this.adjustment.reconcile(adminUserId, batch.id, row.quantity, true, `Duyệt báo cáo tháng ${report.period}`);
      applied.push({ sku: row.sku, batchId: batch.id, countedQty: row.quantity });
    }

    await this.prisma.monthlyStockReport.update({
      where: { id },
      data: { status: ReportStatus.APPROVED, approvedByUserId: adminUserId, approvedAt: new Date() },
    });
    return { id, status: ReportStatus.APPROVED, applied };
  }

  async reject(id: string, adminUserId: string, note?: string) {
    const report = await this.prisma.monthlyStockReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Không tìm thấy báo cáo");
    if (report.status !== ReportStatus.PENDING) {
      throw new BadRequestException("Chỉ từ chối được báo cáo đang chờ (PENDING)");
    }
    return this.prisma.monthlyStockReport.update({
      where: { id },
      data: { status: ReportStatus.REJECTED, approvedByUserId: adminUserId, approvedAt: new Date(), note },
    });
  }
}

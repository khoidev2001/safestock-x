import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ReportStatus } from "@prisma/client";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { ReportService } from "./report.service";
import { RejectReportDto, SubmitStockReportDto } from "./dto";

interface UploadedExcel {
  buffer: Buffer;
  originalname: string;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("reports")
export class ReportController {
  constructor(private reports: ReportService) {}

  /** Trưởng thôn upload Excel kiểm kê tháng → PENDING. multipart field "file", body: warehouseId, period. */
  @RequirePermission(Permission.REPORT_SUBMIT)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        const validExtension = /\.xlsx$/i.test(file.originalname);
        const validMime = [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
        ].includes(file.mimetype);
        callback(
          validExtension && validMime
            ? null
            : new BadRequestException("Chỉ chấp nhận tệp Excel .xlsx"),
          validExtension && validMime,
        );
      },
    }),
  )
  upload(
    @Request() req: AuthenticatedRequest,
    @UploadedFile() file: UploadedExcel | undefined,
    @Body("warehouseId") warehouseId: string,
    @Body("period") period: string,
  ) {
    if (!file) throw new BadRequestException("Chưa chọn tệp Excel");
    return this.reports.submit(
      req.user.userId,
      warehouseId,
      period,
      file.buffer,
      req.user.warehouseId,
    );
  }

  @RequirePermission(Permission.REPORT_VIEW)
  @Get()
  list(@Request() req: AuthenticatedRequest, @Query("status") status?: ReportStatus) {
    return this.reports.list(req.user.userId, status, req.user.warehouseId);
  }

  @RequirePermission(Permission.REPORT_VIEW)
  @Get(":id")
  get(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.reports.get(id, req.user.userId, req.user.warehouseId);
  }

  /** ADMIN duyệt → áp reconcile từng SKU. */
  @RequirePermission(Permission.REPORT_APPROVE)
  @Post(":id/approve")
  approve(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.reports.approve(id, req.user.userId);
  }

  @RequirePermission(Permission.REPORT_APPROVE)
  @Post(":id/reject")
  reject(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RejectReportDto,
  ) {
    return this.reports.reject(id, req.user.userId, dto.note);
  }

  /** APK gửi snapshot kiểm kê JSON, không phụ thuộc bộ chọn tệp Excel. */
  @RequirePermission(Permission.REPORT_SUBMIT)
  @Post()
  submitSnapshot(@Request() req: AuthenticatedRequest, @Body() dto: SubmitStockReportDto) {
    return this.reports.submitRows(
      req.user.userId,
      dto.warehouseId,
      dto.period,
      dto.rows.map((row) => ({
        ...row,
        expiryDate: row.expiryDate ?? null,
        condition: row.condition ?? null,
        note: row.note ?? null,
      })),
      req.user.warehouseId,
      dto.requestId,
    );
  }
}

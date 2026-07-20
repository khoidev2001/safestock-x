import {
  Body,
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
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @Request() req: AuthenticatedRequest,
    @UploadedFile() file: UploadedExcel,
    @Body("warehouseId") warehouseId: string,
    @Body("period") period: string,
  ) {
    return this.reports.submit(req.user.userId, warehouseId, period, file.buffer, req.user.warehouseId);
  }

  @RequirePermission(Permission.REPORT_APPROVE)
  @Get()
  list(@Query("status") status?: ReportStatus) {
    return this.reports.list(status);
  }

  @RequirePermission(Permission.REPORT_APPROVE)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.reports.get(id);
  }

  /** ADMIN duyệt → áp reconcile từng SKU. */
  @RequirePermission(Permission.REPORT_APPROVE)
  @Post(":id/approve")
  approve(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.reports.approve(id, req.user.userId);
  }

  @RequirePermission(Permission.REPORT_APPROVE)
  @Post(":id/reject")
  reject(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body("note") note?: string) {
    return this.reports.reject(id, req.user.userId, note);
  }
}

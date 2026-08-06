import { Body, Controller, Get, Param, Post, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import {
  AdvanceInterCommuneLoanDto,
  BorrowDto,
  RecordManualInterCommuneLoanDto,
  RequestInterCommuneLoanDto,
  ReturnDto,
} from "./dto";
import { InterCommuneLoanService } from "./inter-commune-loan.service";
import { LoanService } from "./loan.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.LOAN_MANAGE)
@Controller("loans")
export class LoanController {
  constructor(
    private loans: LoanService,
    private interCommune: InterCommuneLoanService,
  ) {}

  // ---- Mượn giữa hai xã ----
  // Mỗi xã một cơ sở dữ liệu riêng nên các endpoint này chỉ đọc/ghi bản ghi
  // PHÍA MÌNH; đồng bộ với xã kia là việc của lớp truyền tin, không phải ở đây.

  /** Hàng đang cho mượn / đang mượn, gom theo mã vật tư — để tab Vật tư gắn nhãn. */
  @Get("inter-commune/stock-marks")
  interCommuneStockMarks(@Request() req: AuthenticatedRequest) {
    return this.interCommune.stockMarks(req.user.userId);
  }

  @Get("inter-commune")
  listInterCommune(@Request() req: AuthenticatedRequest) {
    return this.interCommune.list(req.user.userId);
  }

  @Post("inter-commune/request")
  requestInterCommune(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RequestInterCommuneLoanDto,
  ) {
    return this.interCommune.requestFromPeer({
      userId: req.user.userId,
      // null chứ KHÔNG phải chuỗi rỗng: ADMIN xã không gắn với kho nào, mà chuỗi
      // rỗng thì vi phạm khoá ngoại và đổ lỗi 500 ngay ở người dùng hay gửi yêu
      // cầu nhất.
      warehouseId: req.user.warehouseId ?? null,
      ...dto,
    });
  }

  @Post("inter-commune/manual")
  recordManualInterCommune(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RecordManualInterCommuneLoanDto,
  ) {
    return this.interCommune.recordManually({
      userId: req.user.userId,
      scopeWarehouseId: req.user.warehouseId,
      ...dto,
    });
  }

  @Post("inter-commune/:id/advance")
  advanceInterCommune(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: AdvanceInterCommuneLoanDto,
  ) {
    return this.interCommune.advance({
      loanId: id,
      userId: req.user.userId,
      scopeWarehouseId: req.user.warehouseId,
      ...dto,
    });
  }

  @Get("warehouses/:id/open")
  listOpen(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.loans.listOpen(id, req.user.warehouseId, req.user.userId);
  }

  @Post()
  borrow(@Request() req: AuthenticatedRequest, @Body() dto: BorrowDto) {
    return this.loans.borrow(
      req.user.userId,
      dto.batchId,
      dto.quantity,
      dto.missionId,
      req.user.warehouseId,
      dto.requestId,
    );
  }

  @Post(":id/return")
  returnItems(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: ReturnDto,
  ) {
    return this.loans.returnItems(
      req.user.userId,
      id,
      dto.ok,
      dto.damaged,
      dto.lost,
      req.user.warehouseId,
      dto.requestId,
    );
  }
}

import { Body, Controller, Get, Param, Post, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { BorrowDto, ReturnDto } from "./dto";
import { LoanService } from "./loan.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.LOAN_MANAGE)
@Controller("loans")
export class LoanController {
  constructor(private loans: LoanService) {}

  @Get("warehouses/:id/open")
  listOpen(@Param("id") id: string) {
    return this.loans.listOpen(id);
  }

  @Post()
  borrow(@Request() req: AuthenticatedRequest, @Body() dto: BorrowDto) {
    return this.loans.borrow(req.user.userId, dto.batchId, dto.quantity, dto.missionId);
  }

  @Post(":id/return")
  returnItems(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: ReturnDto,
  ) {
    return this.loans.returnItems(req.user.userId, id, dto.ok, dto.damaged, dto.lost);
  }
}

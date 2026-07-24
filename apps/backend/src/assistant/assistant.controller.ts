import { Body, Controller, Param, Post, Request, UseGuards } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { assertWarehouseInScope } from "../inventory/warehouse-scope";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AssistantService } from "./assistant.service";

class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question!: string;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.READINESS_VIEW)
@Controller("assistant")
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  /** Hỏi-đáp kho: LLM trả lời dựa trên snapshot JSON kho, ngoài phạm vi → "không biết". */
  @Post("warehouses/:id/ask")
  ask(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: AskDto) {
    // Chặn IDOR: trưởng thôn (warehouseId có giá trị) chỉ hỏi được snapshot kho mình.
    assertWarehouseInScope(req.user.warehouseId, id);
    return this.assistant.ask(id, dto.question);
  }
}

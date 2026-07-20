import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Permission } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
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
  ask(@Param("id") id: string, @Body() dto: AskDto) {
    return this.assistant.ask(id, dto.question);
  }
}

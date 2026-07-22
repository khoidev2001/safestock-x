import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { IncidentState } from "@prisma/client";
import { Permission } from "@safestock/shared-types";
import { AiClientService } from "../ai/ai-client.service";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { buildIncidentContext } from "./incident.context";
import { IncidentService } from "./incident.service";

class ActionDto {
  note?: string;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.READINESS_VIEW)
@Controller("incidents")
export class IncidentController {
  constructor(
    private incidents: IncidentService,
    private ai: AiClientService,
  ) {}

  /** Quét sự kiện cảm biến → phát hiện + lưu sự cố. */
  @Post("scan/:warehouseId")
  scan(@Param("warehouseId") warehouseId: string) {
    return this.incidents.scanWarehouse(warehouseId);
  }

  @Get("warehouses/:id")
  list(@Param("id") id: string, @Query("state") state?: IncidentState) {
    return this.incidents.list(id, state);
  }

  @Get(":id/timeline")
  timeline(@Param("id") id: string) {
    return this.incidents.getWithTimeline(id);
  }

  /** Sinh giải thích LLM cho sự cố (proxy AI, không tự kết luận số). */
  @Post(":id/explain")
  async explain(@Param("id") id: string) {
    const incident = await this.incidents.getWithTimeline(id);
    const explanation = await this.ai.explain(buildIncidentContext(incident));
    await this.incidents.setExplanation(id, explanation);
    return { explanation };
  }

  @Post(":id/acknowledge")
  acknowledge(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: ActionDto) {
    return this.incidents.transition(id, "acknowledge", req.user.userId, dto.note);
  }

  @Post(":id/assign")
  assign(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: ActionDto) {
    return this.incidents.transition(id, "assign", req.user.userId, dto.note);
  }

  @Post(":id/resolve")
  resolve(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: ActionDto) {
    return this.incidents.transition(id, "resolve", req.user.userId, dto.note);
  }
}

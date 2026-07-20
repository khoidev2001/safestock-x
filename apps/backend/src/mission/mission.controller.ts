import { Body, Controller, Get, Param, Post, Request, UseGuards } from "@nestjs/common";
import { IncidentType, Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AiClientService } from "../ai/ai-client.service";
import { GeneratePlanDto, ParseDto } from "./dto";
import { IncidentInput } from "./mission.compute";
import { MissionService } from "./mission.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("missions")
export class MissionController {
  constructor(
    private missions: MissionService,
    private ai: AiClientService,
  ) {}

  /** Parse mô tả → tình huống JSON (proxy AI, có cache). */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post("parse")
  parse(@Body() dto: ParseDto) {
    return this.ai.parse(dto.description);
  }

  /**
   * Lập phương án: nếu có description → parse trước; nếu có incident → dùng luôn.
   * Rồi tính nhu cầu + phân bổ greedy + gợi ý kho lân cận.
   */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post("generate-plan")
  async generatePlan(@Request() req: AuthenticatedRequest, @Body() dto: GeneratePlanDto) {
    const incident = await this.resolveIncident(dto);
    const incidentPoint =
      dto.incidentLat != null && dto.incidentLng != null
        ? { lat: dto.incidentLat, lng: dto.incidentLng }
        : undefined;
    return this.missions.generatePlan(dto.warehouseId, incident, req.user.userId, incidentPoint);
  }

  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.missions.getMission(id);
  }

  /** Kho tổng + thôn trong cụm xã (có toạ độ) — cho map ghim điểm nạn trước khi lập phương án. */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":warehouseId/warehouses")
  clusterWarehouses(@Param("warehouseId") warehouseId: string) {
    return this.missions.listClusterWarehouses(warehouseId);
  }

  /**
   * Sinh Incident Action Plan (8 mục): backend chấm severity/forecasts bằng rule,
   * LLM viết diễn giải, fallback template khi mất mạng. Lưu vào mission.actionPlan.
   */
  @RequirePermission(Permission.MISSION_VIEW)
  @Post(":id/action-plan")
  actionPlan(@Param("id") id: string) {
    return this.missions.generateActionPlan(id);
  }

  /** Sinh giải thích tiếng Việt cho phương án (proxy AI). */
  @RequirePermission(Permission.MISSION_VIEW)
  @Post(":id/explain")
  async explain(@Param("id") id: string) {
    const mission = await this.missions.getMission(id);
    const context = this.buildExplainContext(mission);
    const explanation = await this.ai.explain(context);
    await this.missions.setExplanation(id, explanation);
    return { explanation };
  }

  @RequirePermission(Permission.MISSION_APPROVE)
  @Post(":id/approve")
  approve(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.approve(id, req.user.userId);
  }

  // ===== Workflow liên role (BE-L) =====

  /** ADMIN gửi phương án cho đội cứu hộ (DRAFT → PENDING_RESCUE). */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/dispatch")
  dispatch(@Param("id") id: string) {
    return this.missions.dispatch(id);
  }

  /** RESCUE xác nhận lấy vật tư (PENDING_RESCUE → PENDING_WAREHOUSE). */
  @RequirePermission(Permission.MISSION_CONFIRM)
  @Post(":id/confirm")
  confirm(@Param("id") id: string) {
    return this.missions.confirmByRescue(id);
  }

  /** WAREHOUSE chuẩn bị + xuất kho (PENDING_WAREHOUSE → READY). */
  @RequirePermission(Permission.MISSION_FULFILL)
  @Post(":id/prepare")
  prepare(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.prepareByWarehouse(id, req.user.userId);
  }

  // ---- helpers ----

  private async resolveIncident(dto: GeneratePlanDto): Promise<IncidentInput> {
    if (dto.incident) {
      return {
        incidentType: dto.incident.incidentType as IncidentType,
        affectedPeople: dto.incident.affectedPeople,
        durationHours: dto.incident.durationHours,
        children: dto.incident.children ?? 0,
        elderly: dto.incident.elderly ?? 0,
        medicalSupportCases: dto.incident.medicalSupportCases ?? 0,
      };
    }
    if (dto.description) {
      return this.ai.parse(dto.description);
    }
    throw new Error("Cần description hoặc incident");
  }

  private buildExplainContext(mission: {
    incidentType: string;
    affectedPeople: number;
    fulfillment: number;
    requirements: { itemName: string; required: number; allocated: number; shortage: number; unit: string }[];
  }): string {
    const lines = mission.requirements.map(
      (r) => `${r.itemName}: cần ${r.required} ${r.unit}, cấp được ${r.allocated}, thiếu ${r.shortage}`,
    );
    return [
      `Tình huống ${mission.incidentType}, ${mission.affectedPeople} người.`,
      `Mức đáp ứng ${mission.fulfillment}%.`,
      ...lines,
    ].join("\n");
  }
}

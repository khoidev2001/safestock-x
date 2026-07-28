import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { MissionStatus } from "@prisma/client";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AiClientService } from "../ai/ai-client.service";
import {
  AdminNoteDto,
  CompleteMissionDto,
  GeneratePlanDto,
  ParseDto,
  PlanFromReportDto,
  RejectMissionDto,
  SubmitReportDto,
  TranscribeDto,
} from "./dto";
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
  @RequirePermission(Permission.INCIDENT_REPORT_SUBMIT)
  @Post("parse")
  parse(@Body() dto: ParseDto) {
    return this.ai.parse(dto.description);
  }

  /** Giọng nói (WAV base64) → text tiếng Việt bằng PhoWhisper local (proxy AI). */
  @RequirePermission(Permission.INCIDENT_REPORT_SUBMIT)
  @Post("transcribe")
  transcribe(@Body() dto: TranscribeDto) {
    return this.ai.transcribe(dto.audioBase64, dto.mimeType ?? "audio/wav");
  }

  /**
   * Trưởng thôn (mobile) gửi báo cáo tình huống từ hiện trường → tạo DRAFT "hộp thư"
   * (lưu mô tả thô, CHƯA phân tích) → báo ADMIN. Admin mở tin trên web sẽ tự điền +
   * tự phân tích AI (nhu cầu vật tư, tình huống, địa điểm). Trả { missionId }.
   */
  @RequirePermission(Permission.INCIDENT_REPORT_SUBMIT)
  @Post("report")
  async report(@Request() req: AuthenticatedRequest, @Body() dto: SubmitReportDto) {
    const warehouseId = await this.missions.resolveReportWarehouseId(
      req.user.warehouseId,
      dto.warehouseId,
    );
    const incidentPoint =
      dto.incidentLat != null && dto.incidentLng != null
        ? { lat: dto.incidentLat, lng: dto.incidentLng }
        : undefined;
    const mission = await this.missions.createReportDraft({
      warehouseId,
      description: dto.description,
      userId: req.user.userId,
      requestId: dto.requestId,
      incidentPoint,
    });
    return { missionId: mission.id };
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
    return this.missions.generatePlan(
      dto.warehouseId,
      incident,
      req.user.userId,
      incidentPoint,
      req.user.warehouseId,
    );
  }

  /**
   * ADMIN phân tích BÁO CÁO của trưởng thôn: parse mô tả (ưu tiên body → reportText)
   * → tính nhu cầu + phân bổ NGAY TRÊN mission báo cáo (không tạo DRAFT mới). Trả về
   * mission đã cập nhật (kèm requirements) để web hiển thị phương án.
   */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/plan-from-report")
  async planFromReport(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: PlanFromReportDto,
  ) {
    const actor = req.user;
    const mission = await this.missions.getMission(id, actor.userId, actor.warehouseId);
    const incident = await this.resolveIncident({
      incident: dto.incident,
      description: dto.description ?? mission.reportText ?? undefined,
    });
    const incidentPoint =
      dto.incidentLat != null && dto.incidentLng != null
        ? { lat: dto.incidentLat, lng: dto.incidentLng }
        : undefined;
    return this.missions.planFromReport(id, incident, incidentPoint, actor.userId, actor.warehouseId);
  }

  /** Danh sách nhiệm vụ, lọc theo trạng thái (vd ?status=DEFERRED,REJECTED). */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get()
  list(@Request() req: AuthenticatedRequest, @Query("status") status?: string) {
    const statuses = status
      ? (status.split(",").filter((s) => s in MissionStatus) as MissionStatus[])
      : undefined;
    return this.missions.listMissions(statuses, req.user.userId, req.user.warehouseId);
  }

  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id")
  get(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.getMission(id, req.user.userId, req.user.warehouseId);
  }

  /** Kho tổng + thôn trong cụm xã (có toạ độ) — cho map ghim điểm nạn trước khi lập phương án. */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":warehouseId/warehouses")
  clusterWarehouses(@Request() req: AuthenticatedRequest, @Param("warehouseId") warehouseId: string) {
    return this.missions.listClusterWarehouses(warehouseId, req.user.userId, req.user.warehouseId);
  }

  /**
   * Sinh Incident Action Plan (8 mục): backend chấm severity/forecasts bằng rule,
   * LLM viết diễn giải, fallback template khi mất mạng. Lưu vào mission.actionPlan.
   */
  @RequirePermission(Permission.MISSION_VIEW)
  @Post(":id/action-plan")
  actionPlan(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.generateActionPlan(id, req.user.userId, req.user.warehouseId);
  }

  /** Sinh giải thích tiếng Việt cho phương án (proxy AI). */
  @RequirePermission(Permission.MISSION_VIEW)
  @Post(":id/explain")
  async explain(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const mission = await this.missions.getMission(id, req.user.userId, req.user.warehouseId);
    const context = this.buildExplainContext(mission);
    const explanation = await this.ai.explain(context);
    await this.missions.setExplanation(id, explanation, req.user.userId, req.user.warehouseId);
    return { explanation };
  }

  @RequirePermission(Permission.MISSION_APPROVE)
  @Post(":id/approve")
  approve(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.approve(id, req.user.userId, req.user.warehouseId);
  }

  // ===== Workflow liên role (BE-L) =====

  /** ADMIN gửi phương án cho đội cứu hộ (DRAFT → PENDING_RESCUE). */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/dispatch")
  dispatch(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.dispatch(id, req.user.userId, req.user.warehouseId);
  }

  /** RESCUE xác nhận lấy vật tư (PENDING_RESCUE → PENDING_WAREHOUSE). */
  @RequirePermission(Permission.MISSION_CONFIRM)
  @Post(":id/confirm")
  confirm(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.confirmByRescue(id, req.user.warehouseId);
  }

  /** RESCUE từ chối nhiệm vụ kèm lý do (PENDING_RESCUE → REJECTED), báo ADMIN. */
  @RequirePermission(Permission.MISSION_CONFIRM)
  @Post(":id/reject")
  reject(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: RejectMissionDto) {
    return this.missions.rejectByRescue(id, dto.reason, req.user.warehouseId);
  }

  /** ADMIN tiếp nhận đơn từ chối → tạm hoãn (REJECTED → DEFERRED), báo RESCUE. */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/defer")
  defer(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.deferByAdmin(id, dto.note, req.user.warehouseId);
  }

  /** ADMIN gửi lại nhiệm vụ tạm hoãn cho RESCUE (DEFERRED → PENDING_RESCUE). */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/resend")
  resend(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.resendByAdmin(id, dto.note, req.user.warehouseId);
  }

  /** ADMIN huỷ nhiệm vụ (REJECTED|DEFERRED → CANCELLED), báo RESCUE kèm lý do. */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/cancel")
  cancel(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.cancelByAdmin(id, dto.note, req.user.warehouseId);
  }

  /** WAREHOUSE chuẩn bị + xuất kho (PENDING_WAREHOUSE → READY). */
  @RequirePermission(Permission.MISSION_FULFILL)
  @Post(":id/prepare")
  prepare(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.prepareByWarehouse(id, req.user.userId, req.user.warehouseId);
  }

  /** RESCUE xác nhận đã giao hiện trường + kết quả (READY → COMPLETED). */
  @RequirePermission(Permission.MISSION_CONFIRM)
  @Post(":id/complete")
  complete(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: CompleteMissionDto,
  ) {
    return this.missions.completeByRescue(id, dto.outcome, req.user.userId, dto.note, req.user.warehouseId);
  }

  // ---- helpers ----

  private async resolveIncident(dto: {
    incident?: GeneratePlanDto["incident"];
    description?: string;
  }): Promise<IncidentInput> {
    if (dto.incident) {
      return {
        incidentType: dto.incident.incidentType,
        location: dto.incident.location ?? null,
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
    throw new BadRequestException("Cần description hoặc incident");
  }

  private buildExplainContext(mission: {
    incidentType: string;
    affectedPeople: number;
    fulfillment: number;
    requirements: {
      itemName: string;
      required: number;
      allocated: number;
      shortage: number;
      unit: string;
    }[];
  }): string {
    const lines = mission.requirements.map(
      (r) =>
        `${r.itemName}: cần ${r.required} ${r.unit}, cấp được ${r.allocated}, thiếu ${r.shortage}`,
    );
    return [
      `Tình huống ${mission.incidentType}, ${mission.affectedPeople} người.`,
      `Mức đáp ứng ${mission.fulfillment}%.`,
      ...lines,
    ].join("\n");
  }
}

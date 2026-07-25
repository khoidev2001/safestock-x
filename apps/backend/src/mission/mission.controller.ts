import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { MissionStatus, NotificationKind, UserRole } from "@prisma/client";
import { IncidentType, Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AiClientService } from "../ai/ai-client.service";
import { NotificationService } from "../notification/notification.service";
import {
  AdminNoteDto,
  CompleteMissionDto,
  GeneratePlanDto,
  ParseDto,
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
    private notifications: NotificationService,
  ) {}

  /** Parse mô tả → tình huống JSON (proxy AI, có cache). */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post("parse")
  parse(@Body() dto: ParseDto) {
    return this.ai.parse(dto.description);
  }

  /** Giọng nói (WAV base64) → text tiếng Việt bằng PhoWhisper local (proxy AI). */
  @RequirePermission(Permission.MISSION_CREATE)
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
      incidentPoint,
    });
    const excerpt = dto.description.length > 140 ? `${dto.description.slice(0, 140)}…` : dto.description;
    await this.notifications.create({
      recipientRole: UserRole.ADMIN,
      kind: NotificationKind.INCIDENT_REPORTED,
      title: "Báo cáo mới từ trưởng thôn",
      body: excerpt,
      missionId: mission.id,
      warehouseId,
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
    return this.missions.generatePlan(dto.warehouseId, incident, req.user.userId, incidentPoint);
  }

  /** Danh sách nhiệm vụ, lọc theo trạng thái (vd ?status=DEFERRED,REJECTED). */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get()
  list(@Query("status") status?: string) {
    const statuses = status
      ? (status.split(",").filter((s) => s in MissionStatus) as MissionStatus[])
      : undefined;
    return this.missions.listMissions(statuses);
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

  /** RESCUE từ chối nhiệm vụ kèm lý do (PENDING_RESCUE → REJECTED), báo ADMIN. */
  @RequirePermission(Permission.MISSION_CONFIRM)
  @Post(":id/reject")
  reject(@Param("id") id: string, @Body() dto: RejectMissionDto) {
    return this.missions.rejectByRescue(id, dto.reason);
  }

  /** ADMIN tiếp nhận đơn từ chối → tạm hoãn (REJECTED → DEFERRED), báo RESCUE. */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/defer")
  defer(@Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.deferByAdmin(id, dto.note);
  }

  /** ADMIN gửi lại nhiệm vụ tạm hoãn cho RESCUE (DEFERRED → PENDING_RESCUE). */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/resend")
  resend(@Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.resendByAdmin(id, dto.note);
  }

  /** ADMIN huỷ nhiệm vụ (REJECTED|DEFERRED → CANCELLED), báo RESCUE kèm lý do. */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.cancelByAdmin(id, dto.note);
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
    return this.missions.completeByRescue(id, dto.outcome, req.user.userId, dto.note);
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

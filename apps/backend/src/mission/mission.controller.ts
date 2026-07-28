import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { MissionStatus } from "@prisma/client";
import { Permission, UserRole } from "@safestock/shared-types";
import type { Response } from "express";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AiClientService } from "../ai/ai-client.service";
import {
  AdminNoteDto,
  GeneratePlanDto,
  OwnReportListQueryDto,
  ParseDto,
  ReviewReportDto,
  AdminReviewWarehouseRequestDto,
  SubmitReportDto,
  TranscribeDto,
  WarehouseRequestNoteDto,
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
  @RequirePermission(Permission.INCIDENT_REPORT_ANALYZE)
  @Post("parse")
  parse(@Body() dto: ParseDto) {
    return this.ai.parse(dto.description);
  }

  /** Giọng nói (WAV base64) → text tiếng Việt bằng PhoWhisper local. */
  @RequirePermission(Permission.INCIDENT_REPORT_TRANSCRIBE)
  @Post("transcribe")
  transcribe(@Request() req: AuthenticatedRequest, @Body() dto: TranscribeDto) {
    return this.missions.transcribeReportAudio(
      req.user.userId,
      dto.audioBase64,
      dto.mimeType ?? "audio/wav",
    );
  }

  /** Trưởng thôn gửi báo cáo thô, kèm WAV riêng tư tuỳ chọn. */
  @RequirePermission(Permission.INCIDENT_REPORT_SUBMIT)
  @Post("report")
  report(@Request() req: AuthenticatedRequest, @Body() dto: SubmitReportDto) {
    return this.missions.submitReport(req.user.userId, dto);
  }

  /** Danh sách báo cáo do actor REPORTER hiện tại tạo. */
  @RequirePermission(Permission.INCIDENT_REPORT_VIEW_OWN)
  @Get("reports/own")
  ownReports(@Request() req: AuthenticatedRequest, @Query() query: OwnReportListQueryDto) {
    return this.missions.listOwnReports(req.user.userId, query.cursor, query.limit);
  }

  /** Chi tiết báo cáo do actor REPORTER hiện tại tạo. */
  @RequirePermission(Permission.INCIDENT_REPORT_VIEW_OWN)
  @Get("reports/own/:id")
  ownReport(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.getOwnReport(req.user.userId, id);
  }

  /** Chi tiết báo cáo cho ADMIN cùng tổ chức. */
  @RequirePermission(Permission.INCIDENT_REPORT_ANALYZE)
  @Get("reports/:id")
  operatorReport(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.getOperatorReport(req.user.userId, id);
  }

  /** Phân tích in-place, giữ nguyên Mission ID và report gốc. */
  @RequirePermission(Permission.INCIDENT_REPORT_ANALYZE)
  @Post("reports/:id/analyze")
  analyzeReport(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.analyzeReport(req.user.userId, id);
  }

  /** ADMIN duyệt và phát hành phần vật tư theo từng kho. */
  @RequirePermission(Permission.MISSION_APPROVE)
  @Post("reports/:id/approve")
  approveReport(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.missions.approveReport(id, req.user.userId, dto);
  }

  /** Trả WAV riêng tư cho ADMIN cùng tổ chức, không tạo URL công khai. */
  @RequirePermission(Permission.INCIDENT_REPORT_AUDIO_READ)
  @Get("reports/:id/audio")
  async reportAudio(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Res() response: Response,
  ): Promise<void> {
    const audio = await this.missions.getReportAudio(req.user.userId, id);
    response.status(200);
    response.set({
      "Content-Type": "audio/wav",
      "Content-Length": String(audio.sizeBytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="report-${safeFilenamePart(id)}.wav"`,
    });
    response.send(audio.bytes);
  }

  @RequirePermission(Permission.MISSION_VIEW)
  @Get("warehouse-requests")
  warehouseRequests(@Request() req: AuthenticatedRequest) {
    return this.missions.listWarehouseRequests(req.user.userId);
  }

  @RequirePermission(Permission.MISSION_VIEW)
  @Get("warehouse-requests/:requestId")
  warehouseRequest(@Request() req: AuthenticatedRequest, @Param("requestId") requestId: string) {
    return this.missions.getWarehouseRequest(req.user.userId, requestId);
  }

  /** Lập phương án: parse rồi phân bổ, hoặc dùng tình huống đã parse sẵn. */
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

  /** Danh sách nhiệm vụ generic, lọc theo trạng thái. */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get()
  list(@Request() req: AuthenticatedRequest, @Query("status") status?: string) {
    if (req.user.role === UserRole.REPORTER) {
      throw new NotFoundException("Không tìm thấy nhiệm vụ");
    }
    const statuses = status
      ? (status.split(",").filter((s) => Object.values(MissionStatus).includes(s as MissionStatus)) as MissionStatus[])
      : undefined;
    return this.missions.listMissions(req.user.userId, statuses);
  }

  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id")
  get(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    if (req.user.role === UserRole.REPORTER) {
      throw new NotFoundException("Không tìm thấy nhiệm vụ");
    }
    return this.missions.getMission(id, req.user.userId);
  }

  /** Kho tổng + thôn trong cụm xã (có tọa độ). */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":warehouseId/warehouses")
  clusterWarehouses(@Request() req: AuthenticatedRequest, @Param("warehouseId") warehouseId: string) {
    if (req.user.role === UserRole.REPORTER) {
      throw new NotFoundException("Không tìm thấy nhiệm vụ");
    }
    return this.missions.listClusterWarehouses(warehouseId, req.user.userId);
  }

  /** Sinh Incident Action Plan với ETA logistics có provenance. */
  @RequirePermission(Permission.MISSION_VIEW)
  @Post(":id/action-plan")
  actionPlan(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    if (req.user.role === UserRole.REPORTER) {
      throw new NotFoundException("Không tìm thấy nhiệm vụ");
    }
    return this.missions.generateActionPlan(id, req.user.userId);
  }

  /** Sinh giải thích tiếng Việt cho phương án. */
  @RequirePermission(Permission.MISSION_VIEW)
  @Post(":id/explain")
  async explain(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    if (req.user.role === UserRole.REPORTER) {
      throw new NotFoundException("Không tìm thấy nhiệm vụ");
    }
    const mission = await this.missions.getMission(id, req.user.userId);
    const context = this.buildExplainContext(mission);
    const explanation = await this.ai.explain(context);
    await this.missions.setExplanation(id, explanation, req.user.userId);
    return { explanation };
  }

  @RequirePermission(Permission.MISSION_APPROVE)
  @Post(":id/approve")
  approve(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.approve(id, req.user.userId);
  }

  // ===== Workflow liên role =====

  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/cancel")
  cancel(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.cancelByAdmin(id, dto.note, req.user.userId);
  }

  @RequirePermission(Permission.MISSION_WAREHOUSE_REQUEST_ACCEPT)
  @Post("warehouse-requests/:requestId/accept")
  acceptWarehouseRequest(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: WarehouseRequestNoteDto,
  ) {
    return this.missions.acceptWarehouseRequest(requestId, req.user.userId, dto.note);
  }

  @RequirePermission(Permission.MISSION_FULFILL)
  @Post("warehouse-requests/:requestId/prepare")
  prepareWarehouseRequest(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: WarehouseRequestNoteDto,
  ) {
    return this.missions.prepareWarehouseRequest(requestId, req.user.userId, dto.note);
  }

  @RequirePermission(Permission.MISSION_FULFILL)
  @Post("warehouse-requests/:requestId/discrepancy")
  reportWarehouseDiscrepancy(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: WarehouseRequestNoteDto,
  ) {
    return this.missions.reportWarehouseDiscrepancy(requestId, req.user.userId, dto.note ?? "");
  }

  @RequirePermission(Permission.MISSION_APPROVE)
  @Post("warehouse-requests/:requestId/review")
  reviewWarehouseRequest(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: AdminReviewWarehouseRequestDto,
  ) {
    return this.missions.reviewWarehouseRequest(requestId, req.user.userId, dto);
  }

  private async resolveIncident(dto: GeneratePlanDto): Promise<IncidentInput> {
    if (dto.incident) {
      return {
        incidentType: dto.incident.incidentType as IncidentInput["incidentType"],
        affectedPeople: dto.incident.affectedPeople,
        durationHours: dto.incident.durationHours,
        children: dto.incident.children ?? 0,
        elderly: dto.incident.elderly ?? 0,
        medicalSupportCases: dto.incident.medicalSupportCases ?? 0,
      };
    }
    if (dto.description) return this.ai.parse(dto.description);
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
      (requirement) =>
        `${requirement.itemName}: cần ${requirement.required} ${requirement.unit}, cấp được ${requirement.allocated}, thiếu ${requirement.shortage}`,
    );
    return [
      `Tình huống ${mission.incidentType}, ${mission.affectedPeople} người.`,
      `Mức đáp ứng ${mission.fulfillment}%.`,
      ...lines,
    ].join("\n");
  }
}

function safeFilenamePart(id: string): string {
  const normalized = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return normalized || "unknown";
}

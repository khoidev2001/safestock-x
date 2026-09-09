import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { MissionStatus } from "@prisma/client";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AiClientService } from "../ai/ai-client.service";
import {
  AdminNoteDto,
  AnalyzeMissionDto,
  ChangeRequirementDto,
  CompleteMissionDto,
  FieldUpdateDto,
  GeneratePlanDto,
  ParseDto,
  PlanFromReportDto,
  ReviewWarehouseRequestDto,
  SubmitReportDto,
  TranscribeDto,
  WarehouseRequestDiscrepancyDto,
  WarehouseRequestNoteDto,
  WhatIfDto,
  ConfirmPickupDto,
} from "./dto";
import { IncidentInput } from "./mission.compute";
import {
  MissionService,
  type MissionListFilter,
  type MissionListSort,
  type MissionSearchField,
} from "./mission.service";

/** Giá trị hợp lệ cho hai tham số hiển thị; ngoài danh sách thì rơi về mặc định. */
const MISSION_SORTS: MissionListSort[] = ["newest", "oldest", "most-people", "fewest-people"];
const MISSION_FILTERS: MissionListFilter[] = ["all", "needs-action", "published"];
const MISSION_SEARCH_FIELDS: MissionSearchField[] = ["text", "mission-no", "affected-people"];
import { MissionCoordinationService } from "./mission-coordination.service";
import { CoordinationAnalysisService } from "./coordination-analysis.service";
import { WhatIfService } from "./what-if.service";
import { FieldUpdateAssistantService } from "./field-update-assistant.service";
import { MissionWarehouseRequestService } from "./mission-warehouse-request.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("missions")
export class MissionController {
  constructor(
    private missions: MissionService,
    private ai: AiClientService,
    private coordination: MissionCoordinationService,
    private coordinationAnalysis: CoordinationAnalysisService,
    private whatIf: WhatIfService,
    private fieldAssistant: FieldUpdateAssistantService,
    private warehouseRequestService: MissionWarehouseRequestService,
  ) {}

  /** Parse mô tả → tình huống JSON (proxy AI, có cache). */
  @RequirePermission(Permission.INCIDENT_REPORT_SUBMIT)
  @Post("parse")
  parse(@Body() dto: ParseDto) {
    return this.ai.parse(dto.description);
  }

  /**
   * Giọng nói (WAV base64) → text tiếng Việt bằng PhoWhisper local (proxy AI).
   *
   * Bọc trong `{ text }` chứ không trả chuỗi trần: Nest serialize chuỗi trần thành
   * `text/html`, mà cả web lẫn điện thoại đều gọi `res.json()` rồi đọc `.text` —
   * parse hỏng, và chúng bắt lỗi chung nên hiện ra "Nhận dạng giọng nói chưa sẵn
   * sàng". Nhận dạng chạy đúng, chỉ hình dạng phản hồi sai.
   */
  @RequirePermission(Permission.INCIDENT_REPORT_SUBMIT)
  @Post("transcribe")
  async transcribe(@Body() dto: TranscribeDto): Promise<{ text: string }> {
    const text = await this.ai.transcribe(dto.audioBase64, dto.mimeType ?? "audio/wav");
    return { text };
  }

  /**
   * Trưởng thôn (mobile) gửi báo cáo tình huống từ hiện trường → tạo DRAFT "hộp thư"
   * (lưu mô tả thô, CHƯA phân tích) → báo ADMIN. Admin mở tin trên web sẽ tự điền +
   * tự phân tích AI (nhu cầu vật tư, tình huống, địa điểm). Trả { missionId }.
   */
  @RequirePermission(Permission.INCIDENT_REPORT_SUBMIT)
  @Post("report")
  async report(@Request() req: AuthenticatedRequest, @Body() dto: SubmitReportDto) {
    // Chữ HOẶC ghi âm — thiếu cả hai thì không có gì để điều phối đọc.
    if (!dto.description?.trim() && !dto.audioBase64?.trim()) {
      throw new BadRequestException("Cần mô tả tình huống hoặc gửi kèm file ghi âm.");
    }
    const warehouseId = await this.missions.resolveReportWarehouseId(
      req.user.userId,
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
      audio: dto.audioBase64
        ? {
            base64: dto.audioBase64,
            // Lời khai định dạng của máy khách chỉ đi kèm cho đủ; backend vẫn tự
            // nhận diện bằng byte đầu tệp và lấy kết quả của mình.
            mimeType: dto.audioMimeType ?? "audio/wav",
            durationMs: dto.audioDurationMs,
          }
        : undefined,
    });
    return { missionId: mission.id };
  }

  /**
   * Bản ghi âm kèm theo một báo cáo, trả về đúng bytes đã nhận.
   *
   * Đường riêng chứ không nhét vào JSON chi tiết nhiệm vụ, cùng lý do với ảnh
   * bằng chứng: người điều phối chỉ tải file khi thật sự muốn nghe, còn hộp thư
   * thì mở được cả trên sóng yếu.
   */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id/report-audio")
  async reportAudio(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const audio = await this.missions.getReportAudio(id, req.user.userId, req.user.warehouseId);
    res.set({
      "Content-Type": audio.mimeType,
      "Content-Length": String(audio.byteSize),
      // Lời kể đã gửi thì không đổi nữa: cache được, nhưng chỉ trong máy người đã
      // có quyền nghe, không để proxy dùng chung giữ lại.
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="bao-cao-${audio.id}"`,
    });
    return new StreamableFile(audio.data);
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
      // Web gửi kèm cả `incident` đã parse lẫn lời kể gốc: `incident` dùng để tính
      // phương án, còn lời kể được lưu lại làm nguồn cho bản tham mưu.
      dto.description,
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
    return this.missions.planFromReport(
      id,
      incident,
      incidentPoint,
      actor.userId,
      actor.warehouseId,
    );
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

  /**
   * Hộp nhiệm vụ có phân trang, lọc và sắp xếp — tất cả làm ở tầng SQL.
   *
   * Đặt TRƯỚC `@Get(":id")`: Nest so khớp theo thứ tự khai báo, để sau thì "inbox"
   * bị đọc thành một id nhiệm vụ và route này không bao giờ chạy.
   */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get("inbox")
  inbox(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sort") sort?: string,
    @Query("filter") filter?: string,
    @Query("search") search?: string,
    @Query("searchField") searchField?: string,
  ) {
    return this.missions.listMissionsPage({
      // Tham số lạ (người dùng sửa tay URL) rơi về mặc định thay vì ném lỗi: đây
      // là cách hiển thị, không phải dữ liệu — hỏng nó không đáng chặn cả trang.
      page: Number.parseInt(page ?? "", 10) || 1,
      pageSize: Number.parseInt(pageSize ?? "", 10) || 15,
      sort: MISSION_SORTS.includes(sort as MissionListSort) ? (sort as MissionListSort) : "newest",
      filter: MISSION_FILTERS.includes(filter as MissionListFilter)
        ? (filter as MissionListFilter)
        : "all",
      search,
      searchField: MISSION_SEARCH_FIELDS.includes(searchField as MissionSearchField)
        ? (searchField as MissionSearchField)
        : "text",
      actorUserId: req.user.userId,
      role: req.user.role,
      scopeWarehouseId: req.user.warehouseId,
    });
  }

  /**
   * Tra nhiệm vụ theo số hiệu — nguồn cho đường dẫn /missions/nhiem-vu-98.
   *
   * Cũng phải đứng TRƯỚC `@Get(":id")`, cùng lý do với route inbox.
   */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get("by-no/:missionNo")
  byNo(@Request() req: AuthenticatedRequest, @Param("missionNo") missionNo: string) {
    const parsed = Number.parseInt(missionNo, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new NotFoundException("Không tìm thấy nhiệm vụ");
    }
    return this.missions.getMissionByNo(parsed, req.user.userId, req.user.warehouseId);
  }

  /** Lịch sử báo cáo text của chính trưởng thôn (cursor pagination). */
  @RequirePermission(Permission.INCIDENT_REPORT_VIEW_OWN)
  @Get("reports/own")
  ownReports(
    @Request() req: AuthenticatedRequest,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit == null || limit.trim() === "" ? undefined : Number(limit);
    return this.missions.listOwnReports(req.user.userId, req.user.warehouseId, cursor, parsedLimit);
  }

  /** Chi tiết một báo cáo text thuộc đúng reporter đang đăng nhập. */
  @RequirePermission(Permission.INCIDENT_REPORT_VIEW_OWN)
  @Get("reports/own/:id")
  ownReport(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.getOwnReport(id, req.user.userId, req.user.warehouseId);
  }

  /** Công việc chuẩn bị theo từng SKU của đúng kho đang đăng nhập. */
  @RequirePermission(Permission.MISSION_FULFILL)
  @Get("warehouse-requests/own")
  warehouseRequests(@Request() req: AuthenticatedRequest) {
    return this.warehouseRequestService.list(req.user.userId, req.user.warehouseId);
  }

  @RequirePermission(Permission.MISSION_FULFILL)
  @Post("warehouse-requests/:requestId/accept")
  acceptWarehouseRequest(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: WarehouseRequestNoteDto,
  ) {
    return this.warehouseRequestService.accept(
      requestId,
      req.user.userId,
      req.user.warehouseId,
      dto.note,
    );
  }

  @RequirePermission(Permission.MISSION_FULFILL)
  @Post("warehouse-requests/:requestId/discrepancy")
  reportWarehouseDiscrepancy(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: WarehouseRequestDiscrepancyDto,
  ) {
    return this.warehouseRequestService.reportDiscrepancy(
      requestId,
      req.user.userId,
      req.user.warehouseId,
      dto.note,
    );
  }

  @RequirePermission(Permission.MISSION_FULFILL)
  @Post("warehouse-requests/:requestId/prepare")
  prepareWarehouseRequest(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
  ) {
    return this.warehouseRequestService.prepare(requestId, req.user.userId, req.user.warehouseId);
  }

  /**
   * Người đi lấy ký nhận. Quyền MISSION_FULFILL giống bước chuẩn bị: ở xã, người
   * giao và người nhận thường đứng cạnh nhau tại kho, tách thành hai quyền riêng
   * chỉ làm họ phải mượn tài khoản của nhau — mà mượn tài khoản thì chữ ký mất
   * hết ý nghĩa.
   */
  @RequirePermission(Permission.MISSION_FULFILL)
  @Post("warehouse-requests/:requestId/pickup")
  confirmWarehousePickup(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: ConfirmPickupDto,
  ) {
    return this.warehouseRequestService.confirmPickup(
      requestId,
      req.user.userId,
      dto.receivedQuantity,
      dto.note,
      req.user.warehouseId,
    );
  }

  @RequirePermission(Permission.MISSION_APPROVE)
  @Post("warehouse-requests/:requestId/review")
  reviewWarehouseRequest(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() dto: ReviewWarehouseRequestDto,
  ) {
    return this.warehouseRequestService.review(requestId, req.user.userId, dto);
  }

  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id")
  get(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.getMission(id, req.user.userId, req.user.warehouseId);
  }

  /**
   * Vật tư ADMIN có thể thêm vào bản tham mưu — chỉ thứ cụm kho của xã còn hàng.
   *
   * Lọc ở MÁY CHỦ chứ không gửi cả danh mục xuống rồi để màn hình lọc: "còn hàng"
   * là kết quả của bộ lọc lô và phép trừ phần đã hứa cho nhiệm vụ khác, cả hai đều
   * nằm ở đây. Gửi thô xuống là màn hình phải tính lại một phép nó không có dữ liệu.
   */
  @RequirePermission(Permission.MISSION_CREATE)
  @Get(":id/requirement-options")
  requirementOptions(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.listRequirementOptions(id, req.user.userId, req.user.warehouseId);
  }

  /** ADMIN thêm / sửa / xoá một dòng vật tư rồi nhận lại nhiệm vụ đã tính lại. */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/requirements")
  changeRequirement(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: ChangeRequirementDto,
  ) {
    const change =
      dto.op === "remove"
        ? ({ op: "remove", sku: dto.sku } as const)
        : ({ op: dto.op, sku: dto.sku, quantity: dto.quantity as number } as const);
    return this.missions.changeRequirement(id, change, req.user.userId, req.user.warehouseId);
  }

  /**
   * Phân bổ lại theo tồn kho hiện tại, giữ nguyên nhu cầu.
   *
   * Gọi sau khi hàng mượn của xã lân cận đã nhập kho: bản tham mưu chốt phân bổ
   * lúc lập nên nó chưa biết kho vừa có thêm hàng.
   */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/recalculate-supply")
  recalculateSupply(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.recalculateSupply(id, req.user.userId, req.user.warehouseId);
  }

  /** Snapshot phân tích AI để ADMIN đối chiếu nguồn và phiên bản đã dùng. */
  @RequirePermission(Permission.MISSION_ANALYZE)
  @Get(":id/analysis-snapshots")
  analysisSnapshots(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.coordination.listAnalysisSnapshots(id, req.user.userId, req.user.warehouseId);
  }

  /** Run a provenance-aware baseline; only ADMIN may trigger it. */
  @RequirePermission(Permission.MISSION_ANALYZE)
  @Post(":id/analyses")
  analyze(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: AnalyzeMissionDto,
  ) {
    return this.coordinationAnalysis.analyze(id, req.user.userId, req.user.warehouseId, dto);
  }

  /** Latest immutable baseline/What-if snapshot for the ADMIN detail panel. */
  @RequirePermission(Permission.MISSION_ANALYZE)
  @Get(":id/analyses/latest")
  async latestAnalysis(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const snapshots = await this.coordination.listAnalysisSnapshots(
      id,
      req.user.userId,
      req.user.warehouseId,
    );
    // /analyses/latest is deliberately a BASELINE endpoint. A What-if is an
    // isolated comparison and must never silently become the next baseline.
    return snapshots.find((snapshot) => snapshot["kind"] === "BASELINE") ?? null;
  }

  /** ADMIN runs a non-mutating What-if against an immutable baseline. */
  @RequirePermission(Permission.MISSION_SIMULATE)
  @Post(":id/simulations")
  simulate(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: WhatIfDto,
  ) {
    return this.whatIf.simulate(id, req.user.userId, req.user.warehouseId, dto);
  }

  /** Read a persisted simulation only inside its mission scope. */
  @RequirePermission(Permission.MISSION_ANALYZE)
  @Get(":id/simulations/:simulationId")
  simulation(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("simulationId") simulationId: string,
  ) {
    return this.coordination.getAnalysisSnapshot(
      id,
      simulationId,
      req.user.userId,
      req.user.warehouseId,
    );
  }

  /** Các cập nhật hiện trường đã được người dùng tự xác nhận. */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id/field-updates")
  fieldUpdates(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.coordination.listFieldUpdates(id, req.user.userId, req.user.warehouseId);
  }

  /**
   * Lực lượng hiện trường gửi nội dung gõ tay hoặc transcript voice ĐÃ xác
   * nhận. Pipe riêng buộc trả lỗi cho field ngoài whitelist thay vì âm thầm
   * bỏ qua những payload như imageUrl/gpsTrack.
   */
  @RequirePermission(Permission.MISSION_FIELD_UPDATE)
  @Post(":id/field-updates")
  recordFieldUpdate(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: FieldUpdateDto,
  ) {
    return this.fieldAssistant.submit(id, req.user.userId, req.user.warehouseId, dto);
  }

  /** Kho tổng + thôn trong cụm xã (có toạ độ) — cho map ghim điểm nạn trước khi lập phương án. */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":warehouseId/warehouses")
  clusterWarehouses(
    @Request() req: AuthenticatedRequest,
    @Param("warehouseId") warehouseId: string,
  ) {
    return this.missions.listClusterWarehouses(warehouseId, req.user.userId, req.user.warehouseId);
  }

  /**
   * Tuyến kho→điểm nạn của đúng các kho có cấp hàng, để bản đồ vẽ đường ngay sau
   * khi tính nhu cầu — không phải chờ hết bước lập bản tham mưu (có gọi LLM).
   *
   * `MISSION_VIEW` chứ không phải `MISSION_ANALYZE`: đây là route CHỈ ĐỌC, không ghi
   * gì vào nhiệm vụ, khác hẳn `:id/action-plan` bên dưới.
   */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id/warehouse-routes")
  warehouseRoutes(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.warehouseRoutes(id, req.user.userId, req.user.warehouseId);
  }

  /**
   * Sinh Incident Action Plan (8 mục): backend chấm severity/forecasts bằng rule,
   * LLM viết diễn giải, fallback template khi mất mạng. Lưu vào mission.actionPlan.
   * M1: route GHI mission.actionPlan → yêu cầu MISSION_ANALYZE (ADMIN), không phải VIEW.
   */
  @RequirePermission(Permission.MISSION_ANALYZE)
  @Post(":id/action-plan")
  actionPlan(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.generateActionPlan(id, req.user.userId, req.user.warehouseId);
  }

  /** Sinh giải thích tiếng Việt cho phương án (proxy AI). M1: GHI mission.explanation. */
  @RequirePermission(Permission.MISSION_ANALYZE)
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

  /** ADMIN huỷ phương án trước khi bất kỳ kho nào xuất vật tư. */
  @RequirePermission(Permission.MISSION_CREATE)
  @Post(":id/cancel")
  cancel(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: AdminNoteDto) {
    return this.missions.cancelByAdmin(id, dto.note, req.user.warehouseId, req.user.userId);
  }

  /** WAREHOUSE chuẩn bị + xuất kho (PENDING_WAREHOUSE → READY). */
  @RequirePermission(Permission.MISSION_FULFILL)
  @Post(":id/prepare")
  prepare(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.prepareByWarehouse(id, req.user.userId, req.user.warehouseId);
  }

  /**
   * Bước CUỐI: kho xác nhận đã nhận lại vật tư (COMPLETED → RETURNED).
   *
   * Quyền `MISSION_FULFILL` là quyền của KHO — chính vì vậy nó nằm ở đây thay vì
   * `MISSION_CONFIRM` (quyền của hiện trường): người đếm lại hàng khi nó về tới
   * nơi mới là người ký được vào bước này. Service chốt thêm một lần theo vai và
   * theo việc kho đó có tham gia nhiệm vụ hay không.
   */
  @RequirePermission(Permission.MISSION_FULFILL)
  @Post(":id/supplies-returned")
  markSuppliesReturned(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.markReturnedByWarehouse(id, req.user.userId, req.user.warehouseId);
  }

  /**
   * Bước đóng nhiệm vụ: người đi giao báo kết quả thực tế (READY → COMPLETED).
   *
   * Xã phát hành phương án thẳng tới kho, nên hiện trường không tham gia bước
   * phát hành. Nhưng họ phải đóng được nhiệm vụ, nếu không vật tư đã trừ khỏi
   * kho mà không ai biết hàng tới nơi hay chưa. Giao thất bại thì service tự
   * hoàn vật tư về kho trong cùng transaction.
   */
  @RequirePermission(Permission.MISSION_CONFIRM)
  @Post(":id/complete")
  complete(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: CompleteMissionDto,
  ) {
    return this.missions.completeByRescue(
      id,
      dto.outcome,
      req.user.userId,
      dto.note,
      req.user.warehouseId,
      dto.photos,
    );
  }

  /**
   * Một ảnh bằng chứng của nhiệm vụ, trả về đúng bytes đã nhận.
   *
   * Đường riêng chứ không nhét ảnh vào JSON chi tiết nhiệm vụ: người xem chỉ mở
   * ảnh khi thật sự muốn xem, còn trình duyệt thì cache được theo id — ảnh đã
   * gửi rồi thì không bao giờ đổi nội dung nữa.
   */
  @RequirePermission(Permission.MISSION_VIEW)
  @Get(":id/delivery-photos/:photoId")
  async deliveryPhoto(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.missions.getDeliveryPhoto(
      id,
      photoId,
      req.user.userId,
      req.user.warehouseId,
    );
    res.set({
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.byteSize),
      // Ảnh bằng chứng là dữ liệu điều hành: cache được nhưng chỉ trong máy người
      // đã có quyền xem, không để proxy dùng chung giữ lại.
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="bang-chung-${photo.id}"`,
    });
    return new StreamableFile(Buffer.from(photo.data));
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

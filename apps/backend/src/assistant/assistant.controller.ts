import {
  Body,
  Controller,
  HttpException,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import type { Response } from "express";
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

  /**
   * Cùng câu hỏi, nhưng chữ chảy ra dần thay vì đợi trọn câu.
   *
   * Là POST chứ không phải GET nên KHÔNG dùng được `EventSource` của trình duyệt;
   * giao diện đọc bằng `fetch` + reader. Đổi sang GET để xài `EventSource` thì câu
   * hỏi phải nhét vào URL — vào log máy chủ, vào lịch sử trình duyệt, và dính hạn
   * độ dài. Câu hỏi ở đây có thể là mô tả một sự việc cứu hộ, không nên nằm ở đó.
   */
  @Post("warehouses/:id/ask/stream")
  async askStream(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: AskDto,
    @Res() res: Response,
  ) {
    assertWarehouseInScope(req.user.warehouseId, id);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Tắt gom đệm của proxy: có đệm thì chữ ra thành từng cục, mất sạch ý nghĩa
    // của việc chảy dần.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    try {
      for await (const suKien of this.assistant.askStream(id, dto.question)) {
        // Người dùng đóng tab thì dừng gọi mô hình, đừng sinh chữ cho hư không.
        if (res.writableEnded || res.destroyed) return;
        res.write(`data: ${suKien}\n\n`);
      }
    } catch (error) {
      const message =
        error instanceof HttpException ? error.message : "Trợ lý AI tạm thời không phản hồi.";
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      if (!res.writableEnded) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  }
}

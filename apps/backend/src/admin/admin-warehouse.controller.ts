import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { WarehouseKind } from "@prisma/client";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AdminWarehouseService } from "./admin-warehouse.service";

class LocationDto {
  // null = xoá ghim, đưa kho về trạng thái chưa có vị trí. Phải gửi cả hai cùng
  // null; một nửa toạ độ thì không định vị được gì.
  @ValidateIf((dto: LocationDto) => dto.lat !== null)
  @IsNumber()
  lat!: number | null;

  @ValidateIf((dto: LocationDto) => dto.lng !== null)
  @IsNumber()
  lng!: number | null;
}

class CreateWarehouseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsEnum(WarehouseKind)
  kind!: WarehouseKind;

  @IsOptional()
  @ValidateIf((dto: CreateWarehouseDto) => dto.lat !== null)
  @IsNumber()
  lat?: number | null;

  @IsOptional()
  @ValidateIf((dto: CreateWarehouseDto) => dto.lng !== null)
  @IsNumber()
  lng?: number | null;

  // Quãng đường dự phòng khi kho chưa có toạ độ: điều phối vẫn phải xếp được thứ
  // tự gần xa, nếu không thì kho chưa ghim luôn bị coi như ở ngay cạnh.
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;
}

class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsEnum(WarehouseKind)
  kind?: WarehouseKind;

  @IsOptional()
  @ValidateIf((dto: UpdateWarehouseDto) => dto.lat !== null)
  @IsNumber()
  lat?: number | null;

  @IsOptional()
  @ValidateIf((dto: UpdateWarehouseDto) => dto.lng !== null)
  @IsNumber()
  lng?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.ADMIN_USERS)
@Controller("admin/warehouses")
export class AdminWarehouseController {
  constructor(private warehouses: AdminWarehouseService) {}

  /**
   * Toàn bộ kho trong xã, kể cả kho chưa có toạ độ.
   *
   * ĐỌC thì mọi vai xem được kho, SỬA thì vẫn chỉ quản trị. Bản đồ kho là màn
   * hình phụ trách kho dùng để biết kho thôn nằm ở đâu mà chuyển hàng tới — chặn
   * họ ở đây thì bản đồ hiện ra trống trơn, không có điểm nào, mà cũng không báo
   * lỗi gì. Nhìn như bản đồ hỏng chứ không như thiếu quyền.
   *
   * `listAll` đã lọc theo đơn vị của người gọi, nên không ai thấy kho của xã khác.
   */
  @RequirePermission(Permission.WAREHOUSE_MANAGE)
  @Get()
  list(@Request() req: AuthenticatedRequest) {
    return this.warehouses.listAll(req.user.userId);
  }

  /** Thêm kho mới trong xã. */
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(req.user.userId, dto);
  }

  /** Sửa thông tin kho: tên, địa điểm, loại kho, toạ độ. */
  @Patch(":id")
  update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouses.update(req.user.userId, id, dto);
  }

  /** Ghim/sửa toạ độ 1 kho. */
  @Patch(":id/location")
  updateLocation(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: LocationDto,
  ) {
    return this.warehouses.updateLocation(req.user.userId, id, dto.lat, dto.lng);
  }

  /** Xoá kho — chỉ khi kho thật sự rỗng; còn dữ liệu thì trả về lý do cụ thể. */
  @Delete(":id")
  remove(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.warehouses.remove(req.user.userId, id);
  }
}

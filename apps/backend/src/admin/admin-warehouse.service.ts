import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";

/** Quản lý toạ độ kho (ADMIN pin trên map). Cấp xã 1 org — trả toàn bộ kho trong xã. */
@Injectable()
export class AdminWarehouseService {
  constructor(private prisma: PrismaService) {}

  /** Toàn bộ kho trong xã (kể cả kho CHƯA có toạ độ — để pin lần đầu). */
  async listAll(actorUserId: string) {
    const organizationId = await this.requireAdminOrganization(actorUserId);
    return this.prisma.warehouse.findMany({
      where: { organizationId },
      select: warehouseLocationSelect,
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
  }

  /** Cập nhật toạ độ 1 kho (dev mode pin). Validate range hợp lệ. */
  async updateLocation(actorUserId: string, id: string, lat: number, lng: number) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException("Vĩ độ (lat) phải trong khoảng -90..90");
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException("Kinh độ (lng) phải trong khoảng -180..180");
    }
    const organizationId = await this.requireAdminOrganization(actorUserId);
    const wh = await this.prisma.warehouse.findFirst({ where: { id, organizationId } });
    if (!wh) throw new NotFoundException("Không tìm thấy kho");

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        lat,
        lng,
        locationMethod: "MANUAL_ADMIN",
        locationSourceName: null,
        locationSourceUrl: null,
        locationSourceRef: null,
        locationCheckedAt: null,
        locationMethodNote: "Tọa độ do quản trị viên cập nhật trực tiếp trên bản đồ.",
        locationUpdatedAt: new Date(),
      },
      select: warehouseLocationSelect,
    });
  }

  private async requireAdminOrganization(actorUserId: string): Promise<string> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { role: true, organizationId: true },
    });
    if (!actor || actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Không đủ quyền quản lý kho");
    }
    return actor.organizationId;
  }
}

const warehouseLocationSelect = {
  id: true,
  name: true,
  location: true,
  kind: true,
  communeId: true,
  lat: true,
  lng: true,
  locationKey: true,
  locationMethod: true,
  locationSourceName: true,
  locationSourceUrl: true,
  locationSourceRef: true,
  locationCheckedAt: true,
  locationMethodNote: true,
  locationUpdatedAt: true,
} as const;

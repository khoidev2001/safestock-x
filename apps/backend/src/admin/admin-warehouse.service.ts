import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Quản lý toạ độ kho (ADMIN pin trên map). Cấp xã 1 org — trả toàn bộ kho trong xã. */
@Injectable()
export class AdminWarehouseService {
  constructor(private prisma: PrismaService) {}

  /** Toàn bộ kho trong xã (kể cả kho CHƯA có toạ độ — để pin lần đầu). */
  async listAll(actorId: string) {
    const organizationId = await this.actorOrganizationId(actorId);
    const warehouses = await this.prisma.warehouse.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        location: true,
        kind: true,
        communeId: true,
        lat: true,
        lng: true,
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return warehouses;
  }

  /** Cập nhật toạ độ 1 kho (dev mode pin). Validate range hợp lệ. */
  async updateLocation(actorId: string, id: string, lat: number, lng: number) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException("Vĩ độ (lat) phải trong khoảng -90..90");
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException("Kinh độ (lng) phải trong khoảng -180..180");
    }
    const organizationId = await this.actorOrganizationId(actorId);
    const wh = await this.prisma.warehouse.findFirst({
      where: { id, organizationId },
    });
    if (!wh) throw new NotFoundException("Không tìm thấy kho");

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.update({
        where: { id },
        data: { lat, lng },
        select: {
          id: true,
          name: true,
          location: true,
          kind: true,
          communeId: true,
          lat: true,
          lng: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WAREHOUSE_LOCATION_UPDATE",
          entity: "Warehouse",
          entityId: id,
          metadata: {
            reason: "ADMIN cập nhật vị trí kho phục vụ điều phối tuyến",
            verificationSource: "ADMIN_MAP_PIN",
            lat,
            lng,
          },
        },
      });
      return warehouse;
    });
  }

  private async actorOrganizationId(actorId: string): Promise<string> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    return actor.organizationId;
  }
}

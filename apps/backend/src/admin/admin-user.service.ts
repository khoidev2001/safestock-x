import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";

interface CreateUserInput {
  email?: string;
  password: string;
  fullName: string;
  role: UserRole;
  warehouseId?: string | null;
}

/** Role được scope vào 1 kho thôn: phụ trách kho (WAREHOUSE) và trưởng thôn báo cáo (REPORTER). */
function isWarehouseScopedRole(role: UserRole): boolean {
  return role === UserRole.WAREHOUSE || role === UserRole.REPORTER;
}

/**
 * Quản lý user (ADMIN xã): tạo/sửa/xoá tài khoản, gán trưởng thôn vào 1 kho (warehouseId).
 * warehouseId chỉ có nghĩa với role scope kho (WAREHOUSE/REPORTER); role khác → bỏ qua.
 */
@Injectable()
export class AdminUserService {
  constructor(private prisma: PrismaService) {}

  async list(actorUserId: string) {
    const organizationId = await this.requireAdminOrganization(actorUserId);
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        warehouseId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(actorUserId: string, input: CreateUserInput) {
    const organizationId = await this.requireAdminOrganization(actorUserId);
    if (input.email && isSimulationSystemActorEmail(normalizeLogin(input.email))) {
      throw new BadRequestException("Email được dành riêng cho actor hệ thống");
    }
    const warehouse = await this.assertWarehouseValid(
      organizationId,
      input.role,
      input.warehouseId,
    );
    const login = warehouse?.kind === "HAMLET" && warehouse.locationKey
      ? loginForWarehouseRole(input.role, warehouse.locationKey)
      : normalizeLogin(input.email);
    if (isSimulationSystemActorEmail(login)) {
      throw new BadRequestException("Email được dành riêng cho actor hệ thống");
    }
    const exists = await this.prisma.user.findUnique({ where: { email: login } });
    if (exists) throw new BadRequestException("Email đã tồn tại");

    const user = await this.prisma.user.create({
      data: {
        organizationId,
        email: login,
        passwordHash: bcrypt.hashSync(input.password, 10),
        fullName: input.fullName,
        role: input.role,
        warehouseId: isWarehouseScopedRole(input.role) ? (input.warehouseId ?? null) : null,
      },
      select: { id: true, email: true, fullName: true, role: true, warehouseId: true },
    });
    return user;
  }

  async update(actorUserId: string, id: string, patch: Partial<CreateUserInput>) {
    const organizationId = await this.requireAdminOrganization(actorUserId);
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException("Không tìm thấy user");
    if (isSimulationSystemActorEmail(user.email)) {
      throw new ForbiddenException("Không được sửa actor hệ thống");
    }

    const role = (patch.role ?? user.role) as UserRole;
    if (patch.warehouseId !== undefined || patch.role !== undefined) {
      await this.assertWarehouseValid(organizationId, role, patch.warehouseId ?? user.warehouseId);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: patch.fullName,
        role: patch.role,
        warehouseId:
          patch.warehouseId !== undefined
            ? isWarehouseScopedRole(role)
              ? patch.warehouseId
              : null
            : undefined,
        ...(patch.password ? { passwordHash: bcrypt.hashSync(patch.password, 10) } : {}),
      },
      select: { id: true, email: true, fullName: true, role: true, warehouseId: true },
    });
  }

  async remove(actorUserId: string, id: string) {
    const organizationId = await this.requireAdminOrganization(actorUserId);
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException("Không tìm thấy user");
    if (isSimulationSystemActorEmail(user.email)) {
      throw new ForbiddenException("Không được xóa actor hệ thống");
    }
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  /** warehouseId (nếu có) phải trỏ tới kho có thật; chỉ role scope kho (WAREHOUSE/REPORTER) được gán. */
  private async assertWarehouseValid(
    organizationId: string,
    role: UserRole,
    warehouseId?: string | null,
  ): Promise<{ id: string; kind: string; locationKey: string | null } | null> {
    if (isWarehouseScopedRole(role) && !warehouseId) {
      throw new BadRequestException("Tài khoản kho hoặc trưởng thôn phải được gán một kho");
    }
    if (!warehouseId) return null;
    if (!isWarehouseScopedRole(role)) {
      throw new BadRequestException("Chỉ role WAREHOUSE/REPORTER (trưởng thôn) mới gán được kho");
    }
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, organizationId },
      select: { id: true, kind: true, locationKey: true },
    });
    if (!wh) throw new NotFoundException("Kho gán không tồn tại");
    if (role === UserRole.REPORTER && wh.kind !== "HAMLET") {
      throw new BadRequestException("REPORTER chỉ được gán kho thôn");
    }
    if (wh.kind === "HAMLET" && !wh.locationKey) {
      throw new BadRequestException("Kho chưa có locationKey để tạo tên đăng nhập chuẩn");
    }
    return wh;
  }

  private async requireAdminOrganization(actorUserId: string): Promise<string> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { role: true, organizationId: true },
    });
    if (!actor || actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Không đủ quyền quản lý tài khoản");
    }
    return actor.organizationId;
  }
}

function normalizeLogin(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) throw new BadRequestException("Tên đăng nhập không được để trống");
  return normalized;
}

function loginForWarehouseRole(role: UserRole, locationKey: string): string {
  const normalizedKey = locationKey.trim().toLowerCase().replace(/-/g, "");
  if (!/^[a-z0-9]+$/.test(normalizedKey)) {
    throw new BadRequestException("locationKey kho không hợp lệ");
  }
  return role === UserRole.REPORTER ? `${normalizedKey}_baocao` : `kho${normalizedKey}`;
}

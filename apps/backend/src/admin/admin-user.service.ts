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
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  warehouseId?: string | null;
}

/** Role được scope vào 1 kho: phụ trách kho, đồng thời là trưởng thôn của thôn đó. */
function isWarehouseScopedRole(role: UserRole): boolean {
  return role === UserRole.WAREHOUSE;
}

/**
 * Quản lý user (ADMIN xã): tạo/sửa/xoá tài khoản, gán người phụ trách vào 1 kho.
 * warehouseId chỉ có nghĩa với role scope kho (WAREHOUSE); role khác → bỏ qua.
 */
@Injectable()
export class AdminUserService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
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

  async create(input: CreateUserInput) {
    if (isSimulationSystemActorEmail(input.email)) {
      throw new BadRequestException("Email được dành riêng cho actor hệ thống");
    }
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new BadRequestException("Email đã tồn tại");

    await this.assertWarehouseValid(input.role, input.warehouseId);

    // 1 org/xã duy nhất trong MVP — tạo user cùng org hiện có.
    const org = await this.prisma.organization.findFirst();
    if (!org) throw new BadRequestException("Chưa có tổ chức (org) nào");

    const user = await this.prisma.user.create({
      data: {
        organizationId: org.id,
        email: input.email,
        passwordHash: bcrypt.hashSync(input.password, 10),
        fullName: input.fullName,
        role: input.role,
        warehouseId: isWarehouseScopedRole(input.role) ? (input.warehouseId ?? null) : null,
      },
      select: { id: true, email: true, fullName: true, role: true, warehouseId: true },
    });
    return user;
  }

  async update(id: string, patch: Partial<CreateUserInput>) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Không tìm thấy user");
    if (isSimulationSystemActorEmail(user.email)) {
      throw new ForbiddenException("Không được sửa actor hệ thống");
    }

    const role = (patch.role ?? user.role) as UserRole;
    if (patch.warehouseId !== undefined || patch.role !== undefined) {
      await this.assertWarehouseValid(role, patch.warehouseId ?? user.warehouseId);
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

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Không tìm thấy user");
    if (isSimulationSystemActorEmail(user.email)) {
      throw new ForbiddenException("Không được xóa actor hệ thống");
    }
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  /** warehouseId (nếu có) phải trỏ tới kho có thật; chỉ role scope kho được gán. */
  private async assertWarehouseValid(role: UserRole, warehouseId?: string | null): Promise<void> {
    if (!warehouseId) return;
    if (!isWarehouseScopedRole(role)) {
      throw new BadRequestException("Chỉ tài khoản phụ trách kho mới gán được kho");
    }
    const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new NotFoundException("Kho gán không tồn tại");
  }
}

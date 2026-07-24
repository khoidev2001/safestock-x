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

/**
 * Quản lý user (ADMIN xã): tạo/sửa/xoá tài khoản, gán trưởng thôn vào 1 kho (warehouseId).
 * warehouseId chỉ có nghĩa với role WAREHOUSE (trưởng thôn scope kho); role khác → bỏ qua.
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
        warehouseId: input.role === UserRole.WAREHOUSE ? (input.warehouseId ?? null) : null,
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
            ? role === UserRole.WAREHOUSE
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

  /** warehouseId (nếu có) phải trỏ tới kho có thật; chỉ WAREHOUSE mới được gán. */
  private async assertWarehouseValid(role: UserRole, warehouseId?: string | null): Promise<void> {
    if (!warehouseId) return;
    if (role !== UserRole.WAREHOUSE) {
      throw new BadRequestException("Chỉ role WAREHOUSE (trưởng thôn) mới gán được kho");
    }
    const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new NotFoundException("Kho gán không tồn tại");
  }
}

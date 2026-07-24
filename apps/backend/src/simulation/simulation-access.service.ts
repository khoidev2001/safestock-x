import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Permission, roleHasPermission, UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";

export interface SimulationActor {
  userId: string;
  organizationId: string;
  role: UserRole;
  warehouseId: string | null;
}

@Injectable()
export class SimulationAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  isMutationEnabled(): boolean {
    const value = this.config.get<unknown>("SIMULATION_MUTATION_ENABLED");
    if (typeof value === "boolean") return value;
    return typeof value === "string" && value.trim().toLowerCase() === "true";
  }

  async assertPermission(userId: string, permission: Permission): Promise<SimulationActor> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        organizationId: true,
        role: true,
        warehouseId: true,
      },
    });
    if (!user) throw new UnauthorizedException("Tài khoản không còn tồn tại");

    const role = user.role as UserRole;
    if (!roleHasPermission(role, permission)) {
      throw new ForbiddenException("Không đủ quyền truy cập simulator");
    }

    return {
      userId: user.id,
      organizationId: user.organizationId,
      role,
      warehouseId: user.warehouseId,
    };
  }

  async assertWarehouseAccess(
    userId: string,
    warehouseId: string,
    permission: Permission,
  ): Promise<SimulationActor> {
    const actor = await this.assertPermission(userId, permission);
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { organizationId: true },
    });

    const wrongOrganization = warehouse?.organizationId !== actor.organizationId;
    const wrongAssignment = actor.warehouseId != null && actor.warehouseId !== warehouseId;
    if (!warehouse || wrongOrganization || wrongAssignment) {
      throw new ForbiddenException("Kho không thuộc phạm vi được phép");
    }

    return actor;
  }

  async assertMutationAccess(userId: string, warehouseId: string): Promise<SimulationActor> {
    if (!this.isMutationEnabled()) {
      throw new ForbiddenException("Simulator mutation đang bị tắt");
    }
    return this.assertWarehouseAccess(userId, warehouseId, Permission.SIMULATION_MUTATE);
  }
}

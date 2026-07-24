import { randomBytes } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import {
  simulationSystemActorEmail,
  simulationSystemActorName,
} from "./simulation-system-actor-identity";

@Injectable()
export class SimulationSystemActorService {
  private readonly actorPromises = new Map<string, Promise<string>>();

  constructor(private readonly prisma: PrismaService) {}

  async getActorId(warehouseId: string): Promise<string> {
    const cached = this.actorPromises.get(warehouseId);
    if (cached) return cached;

    const provisioning = this.provision(warehouseId);
    this.actorPromises.set(warehouseId, provisioning);
    try {
      return await provisioning;
    } finally {
      if (this.actorPromises.get(warehouseId) === provisioning) {
        this.actorPromises.delete(warehouseId);
      }
    }
  }

  private async provision(warehouseId: string): Promise<string> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, organizationId: true },
    });
    if (!warehouse) throw new NotFoundException("Kho simulator không tồn tại");

    const email = simulationSystemActorEmail(warehouse.id);
    const fullName = simulationSystemActorName(warehouse.id);
    const select = {
      id: true,
      organizationId: true,
      fullName: true,
      role: true,
      warehouseId: true,
    } as const;
    const existing = await this.prisma.user.findUnique({ where: { email }, select });
    if (existing) {
      return this.assertInvariant(existing, warehouse, fullName);
    }

    const passwordHash = await bcrypt.hash(randomBytes(48).toString("base64url"), 10);
    const actor = await this.prisma.user.upsert({
      where: { email },
      create: {
        organizationId: warehouse.organizationId,
        email,
        passwordHash,
        fullName,
        role: UserRole.WAREHOUSE,
        warehouseId: warehouse.id,
      },
      update: {},
      select,
    });

    return this.assertInvariant(actor, warehouse, fullName);
  }

  private assertInvariant(
    actor: {
      id: string;
      organizationId: string;
      fullName: string;
      role: UserRole;
      warehouseId: string | null;
    },
    warehouse: { id: string; organizationId: string },
    fullName: string,
  ): string {
    const invariantMatches =
      actor.organizationId === warehouse.organizationId &&
      actor.warehouseId === warehouse.id &&
      actor.role === UserRole.WAREHOUSE &&
      actor.fullName === fullName;
    if (!invariantMatches) {
      throw new ConflictException("Danh tính hệ thống simulator không hợp lệ");
    }

    return actor.id;
  }
}

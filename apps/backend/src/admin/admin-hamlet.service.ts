import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeHamletName } from "./hamlet-normalization";

export interface SaveHamletInput {
  name: string;
  aliases?: string[];
  communeId?: string;
  lat?: number | null;
  lng?: number | null;
  verified?: boolean;
}

@Injectable()
export class AdminHamletService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, communeId?: string) {
    const organizationId = await this.actorOrganizationId(actorId);
    return (this.prisma as HamletPrisma).hamlet.findMany({
      where: { organizationId, ...(communeId ? { communeId } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async create(actorId: string, input: SaveHamletInput) {
    const organizationId = await this.actorOrganizationId(actorId);
    const data = this.validatedData(input);
    await this.assertAliasesUnique(organizationId, data.communeId, data.aliases);
    return this.prisma.$transaction(async (tx) => {
      const hamlet = await (tx as unknown as HamletPrisma).hamlet.create({
        data: {
          organizationId,
          ...data,
          verifiedAt: data.verified ? new Date() : null,
          verifiedById: data.verified ? actorId : null,
        },
      });
      await tx.auditLog.create({
        data: auditData(actorId, "HAMLET_CREATE", hamlet),
      });
      return hamlet;
    });
  }

  async update(actorId: string, id: string, input: SaveHamletInput) {
    const organizationId = await this.actorOrganizationId(actorId);
    const current = await (this.prisma as HamletPrisma).hamlet.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException("Không tìm thấy thôn");
    const data = this.validatedData({
      name: input.name,
      aliases: input.aliases ?? current.aliases,
      communeId: input.communeId ?? current.communeId,
      lat: input.lat === undefined ? current.lat : input.lat,
      lng: input.lng === undefined ? current.lng : input.lng,
      verified: input.verified ?? current.verified,
    });
    await this.assertAliasesUnique(organizationId, data.communeId, data.aliases, id);
    const verificationChanged = data.verified !== current.verified;
    return this.prisma.$transaction(async (tx) => {
      const hamlet = await (tx as unknown as HamletPrisma).hamlet.update({
        where: { id },
        data: {
          ...data,
          ...(verificationChanged
            ? {
                verifiedAt: data.verified ? new Date() : null,
                verifiedById: data.verified ? actorId : null,
              }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: auditData(actorId, "HAMLET_UPDATE", hamlet),
      });
      return hamlet;
    });
  }

  private validatedData(input: SaveHamletInput) {
    const name = input.name.trim();
    const normalizedName = normalizeHamletName(name);
    if (!normalizedName) throw new BadRequestException("Tên thôn không hợp lệ");
    const communeId = input.communeId?.trim() || "dong-xuan";
    const aliases = [
      ...new Set([normalizedName, ...(input.aliases ?? []).map(normalizeHamletName)]),
    ].filter(Boolean);
    this.assertCoordinatePair(input.lat, input.lng);
    const verified = input.verified ?? false;
    if (verified && (input.lat == null || input.lng == null)) {
      throw new BadRequestException("Phải ghim đủ tọa độ trước khi xác minh thôn");
    }
    return {
      name,
      normalizedName,
      aliases,
      communeId,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      verified,
    };
  }

  private assertCoordinatePair(lat?: number | null, lng?: number | null) {
    if ((lat == null) !== (lng == null)) {
      throw new BadRequestException("Tọa độ thôn phải có đủ vĩ độ và kinh độ");
    }
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      throw new BadRequestException("Vĩ độ (lat) phải trong khoảng -90..90");
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      throw new BadRequestException("Kinh độ (lng) phải trong khoảng -180..180");
    }
  }

  private async assertAliasesUnique(
    organizationId: string,
    communeId: string,
    aliases: string[],
    excludeId?: string,
  ) {
    const others = await (this.prisma as HamletPrisma).hamlet.findMany({
      where: { organizationId, communeId, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { name: true, aliases: true },
    });
    const wanted = new Set(aliases);
    const conflict = others.find((hamlet) => hamlet.aliases.some((alias) => wanted.has(alias)));
    if (conflict) {
      throw new ConflictException(`Tên hoặc alias đã được dùng bởi thôn ${conflict.name}`);
    }
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

function auditData(actorId: string, action: string, hamlet: HamletRow) {
  return {
    actorId,
    action,
    entity: "Hamlet",
    entityId: hamlet.id,
    metadata: {
      reason:
        action === "HAMLET_CREATE"
          ? "ADMIN cấu hình danh mục thôn/điểm ứng phó"
          : "ADMIN cập nhật danh mục thôn/điểm ứng phó",
      name: hamlet.name,
      communeId: hamlet.communeId,
      verified: hamlet.verified,
    },
  };
}

export interface HamletRow {
  id: string;
  organizationId: string;
  communeId: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  lat: number | null;
  lng: number | null;
  verified: boolean;
}

interface HamletPrisma {
  hamlet: {
    findMany(args: unknown): Promise<HamletRow[]>;
    findFirst(args: unknown): Promise<HamletRow | null>;
    create(args: unknown): Promise<HamletRow>;
    update(args: unknown): Promise<HamletRow>;
  };
}

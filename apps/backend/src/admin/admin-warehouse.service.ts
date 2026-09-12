import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WarehouseKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeHamletName } from "./hamlet-normalization";

/** Trường trả về cho mọi thao tác — một hình dạng duy nhất để web không phải đoán. */
const WAREHOUSE_FIELDS = {
  id: true,
  name: true,
  location: true,
  kind: true,
  communeId: true,
  lat: true,
  lng: true,
} as const;

/**
 * Những thứ neo vào một kho, và câu giải thích khi chúng chặn việc xoá.
 *
 * Thứ tự cũng là thứ tự người vận hành phải xử lý: chuyển hàng đi trước, rồi mới
 * gỡ người, còn hồ sơ nhiệm vụ và báo cáo thì không gỡ được — kho đã đi vào lịch
 * sử điều phối thì phải giữ, nếu không mọi bản ghi cũ trỏ vào một cái tên trống.
 */
const DELETE_BLOCKERS = [
  { key: "batches", label: "lô hàng còn trong kho", fix: "chuyển hết hàng sang kho khác" },
  { key: "leaders", label: "tài khoản đang gắn với kho", fix: "đổi kho phụ trách cho họ" },
  { key: "missions", label: "nhiệm vụ đã lấy hàng từ kho", fix: "không gỡ được — hồ sơ phải giữ" },
  { key: "reports", label: "báo cáo kiểm kê tháng", fix: "không gỡ được — hồ sơ phải giữ" },
  { key: "preparations", label: "lượt chuẩn bị hàng", fix: "không gỡ được — hồ sơ phải giữ" },
  { key: "requests", label: "yêu cầu cấp hàng", fix: "không gỡ được — hồ sơ phải giữ" },
  { key: "sensors", label: "số liệu cảm biến đã nhận", fix: "không gỡ được — hồ sơ phải giữ" },
  { key: "devices", label: "khoá thiết bị IoT", fix: "thu hồi khoá thiết bị trước" },
  { key: "alertEmails", label: "thư cảnh báo trong hàng chờ", fix: "chờ hàng chờ gửi xong" },
  { key: "loans", label: "lượt mượn – trả liên xã", fix: "không gỡ được — hồ sơ phải giữ" },
] as const;

/** Quản lý kho: danh sách, thêm, sửa, xoá và ghim toạ độ. Cấp xã 1 org — trả toàn bộ kho trong xã. */
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
  async updateLocation(actorId: string, id: string, lat: number | null, lng: number | null) {
    assertCoordinates(lat, lng);
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

  /**
   * Thêm một kho mới trong xã của người thao tác.
   *
   * `communeId` lấy theo kho sẵn có chứ không cho nhập: cả hệ thống chạy theo mô
   * hình mỗi xã một máy chủ, nhập tay mã xã chỉ mở đường cho một kho lạc sang cụm
   * khác rồi biến mất khỏi mọi bảng tổng hợp.
   */
  async create(
    actorId: string,
    input: {
      name: string;
      location?: string | null;
      kind: WarehouseKind;
      lat?: number | null;
      lng?: number | null;
      distanceKm?: number;
    },
  ) {
    const organizationId = await this.actorOrganizationId(actorId);
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Tên kho không được để trống");

    const lat = input.lat ?? null;
    const lng = input.lng ?? null;
    assertCoordinates(lat, lng);

    const communeId = await this.communeIdOf(organizationId);
    await this.assertNameAvailable(organizationId, name, null);
    if (input.kind === WarehouseKind.CENTRAL) {
      await this.assertNoOtherCentral(organizationId, communeId, null);
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({
        data: {
          organizationId,
          communeId,
          name,
          location: input.location?.trim() || null,
          kind: input.kind,
          lat,
          lng,
          distanceKm: input.distanceKm ?? 0,
        },
        select: WAREHOUSE_FIELDS,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WAREHOUSE_CREATE",
          entity: "Warehouse",
          entityId: warehouse.id,
          metadata: { name, kind: input.kind, location: warehouse.location, lat, lng },
        },
      });
      return warehouse;
    });
  }

  /** Sửa thông tin một kho. Trường nào không gửi thì giữ nguyên. */
  async update(
    actorId: string,
    id: string,
    input: {
      name?: string;
      location?: string | null;
      kind?: WarehouseKind;
      lat?: number | null;
      lng?: number | null;
      distanceKm?: number;
    },
  ) {
    const organizationId = await this.actorOrganizationId(actorId);
    const current = await this.prisma.warehouse.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException("Không tìm thấy kho");

    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException("Tên kho không được để trống");
    }
    if (name && name !== current.name) {
      await this.assertNameAvailable(organizationId, name, id);
    }
    if (input.kind === WarehouseKind.CENTRAL && current.kind !== WarehouseKind.CENTRAL) {
      await this.assertNoOtherCentral(organizationId, current.communeId, id);
    }

    // Toạ độ chỉ kiểm khi người dùng có gửi; gửi một nửa là lỗi, đúng như lúc ghim.
    const lat = input.lat !== undefined ? input.lat : current.lat;
    const lng = input.lng !== undefined ? input.lng : current.lng;
    if (input.lat !== undefined || input.lng !== undefined) assertCoordinates(lat, lng);

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.update({
        where: { id },
        data: {
          name: name ?? current.name,
          location:
            input.location === undefined ? current.location : input.location?.trim() || null,
          kind: input.kind ?? current.kind,
          lat,
          lng,
          distanceKm: input.distanceKm ?? current.distanceKm,
        },
        select: WAREHOUSE_FIELDS,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WAREHOUSE_UPDATE",
          entity: "Warehouse",
          entityId: id,
          metadata: {
            before: {
              name: current.name,
              location: current.location,
              kind: current.kind,
              lat: current.lat,
              lng: current.lng,
            },
            after: {
              name: warehouse.name,
              location: warehouse.location,
              kind: warehouse.kind,
              lat: warehouse.lat,
              lng: warehouse.lng,
            },
          },
        },
      });
      return warehouse;
    });
  }

  /**
   * Xoá một kho — chỉ khi nó thật sự rỗng.
   *
   * Đếm hết mọi thứ đang neo vào kho rồi mới quyết định, và khi từ chối thì nói rõ
   * vướng cái gì cùng cách gỡ. Báo "không xoá được" trống không thì người dùng chỉ
   * còn cách bấm lại vài lần rồi bỏ cuộc.
   *
   * Khu và kệ rỗng bị xoá kèm: chúng là bộ khung của chính kho này, giữ lại thì
   * thành rác không ai với tới được nữa.
   */
  async remove(actorId: string, id: string) {
    const organizationId = await this.actorOrganizationId(actorId);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId },
      select: { id: true, name: true, kind: true },
    });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");

    const counts = {
      batches: await this.prisma.itemBatch.count({
        where: { shelf: { zone: { warehouseId: id } } },
      }),
      leaders: await this.prisma.user.count({ where: { warehouseId: id } }),
      missions: await this.prisma.mission.count({ where: { warehouseId: id } }),
      reports: await this.prisma.monthlyStockReport.count({ where: { warehouseId: id } }),
      preparations: await this.prisma.missionWarehousePreparation.count({
        where: { warehouseId: id },
      }),
      requests: await this.prisma.missionWarehouseRequest.count({ where: { warehouseId: id } }),
      sensors: await this.prisma.sensorSubmission.count({ where: { warehouseId: id } }),
      devices: await this.prisma.deviceCredential.count({ where: { warehouseId: id } }),
      alertEmails: await this.prisma.alertEmailOutbox.count({ where: { warehouseId: id } }),
      loans: await this.prisma.interCommuneLoan.count({ where: { warehouseId: id } }),
    };

    const blockers = DELETE_BLOCKERS.filter((blocker) => counts[blocker.key] > 0).map(
      (blocker) => `${counts[blocker.key]} ${blocker.label} (${blocker.fix})`,
    );
    if (blockers.length > 0) {
      throw new ConflictException(
        `Chưa xoá được kho "${warehouse.name}" vì còn: ${blockers.join("; ")}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shelf.deleteMany({ where: { zone: { warehouseId: id } } });
      await tx.warehouseZone.deleteMany({ where: { warehouseId: id } });
      await tx.warehouse.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WAREHOUSE_DELETE",
          entity: "Warehouse",
          entityId: id,
          metadata: { name: warehouse.name, kind: warehouse.kind },
        },
      });
    });

    return { id, name: warehouse.name };
  }

  /** Mã xã của đơn vị, lấy theo kho đã có; chưa có kho nào thì dùng mã mặc định. */
  private async communeIdOf(organizationId: string): Promise<string> {
    const existing = await this.prisma.warehouse.findFirst({
      where: { organizationId },
      select: { communeId: true },
      orderBy: { createdAt: "asc" },
    });
    return existing?.communeId ?? "default-commune";
  }

  /**
   * Trùng tên là chặn, kể cả khi chỉ khác dấu hoặc khác hoa thường.
   *
   * Tên kho là thứ người trực đọc để chọn nơi lấy hàng; hai dòng "Kho thôn Long
   * Châu" và "kho thon long chau" nằm cạnh nhau thì họ không có cách nào biết
   * mình đang xuất từ kho nào.
   */
  private async assertNameAvailable(organizationId: string, name: string, exceptId: string | null) {
    const normalized = normalizeHamletName(name);
    const siblings = await this.prisma.warehouse.findMany({
      where: { organizationId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { name: true },
    });
    if (siblings.some((sibling) => normalizeHamletName(sibling.name) === normalized)) {
      throw new ConflictException(`Đã có kho tên "${name}" trong xã`);
    }
  }

  /**
   * Mỗi xã chỉ một kho tổng.
   *
   * Không phải quy ước cho đẹp: nghiệp vụ mượn – trả liên xã, lập phương án và
   * cấp khoá thiết bị đều đi tìm kho tổng bằng "lấy cái đầu tiên". Có hai kho
   * tổng thì mỗi luồng vớ một cái, và không ai thấy mình đang nhìn hai bộ số.
   */
  private async assertNoOtherCentral(
    organizationId: string,
    communeId: string,
    exceptId: string | null,
  ) {
    const central = await this.prisma.warehouse.findFirst({
      where: {
        organizationId,
        communeId,
        kind: WarehouseKind.CENTRAL,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
    });
    if (central) {
      throw new ConflictException(
        `Xã đã có kho tổng là "${central.name}". Mỗi xã chỉ một kho tổng — đổi kho đó thành kho thôn trước nếu muốn thay.`,
      );
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

/**
 * Toạ độ hợp lệ hay không — dùng chung cho ghim, thêm và sửa kho.
 *
 * Cả hai cùng null = xoá ghim. Một nửa toạ độ thì không định vị được gì, và để
 * lọt vào cơ sở dữ liệu sẽ thành một điểm nằm trên kinh tuyến gốc giữa Đại Tây
 * Dương — xa hơn mọi kho trong xã, nên mọi phép tính tuyến đường đều hỏng theo.
 */
function assertCoordinates(lat: number | null, lng: number | null): void {
  const clearing = lat == null && lng == null;
  if (clearing) return;
  if (lat == null || lng == null) {
    throw new BadRequestException("Toạ độ kho phải có đủ vĩ độ và kinh độ");
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BadRequestException("Vĩ độ (lat) phải trong khoảng -90..90");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new BadRequestException("Kinh độ (lng) phải trong khoảng -180..180");
  }
}

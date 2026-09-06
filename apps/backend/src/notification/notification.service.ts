import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { NotificationKind, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateNotification {
  /** Explicit for transactional callers; otherwise derived from mission/warehouse. */
  organizationId?: string;
  recipientRole: UserRole;
  kind: NotificationKind;
  title: string;
  body: string;
  missionId?: string;
  warehouseId?: string;
  /** Khoản mượn liên xã mà thông báo nói tới — cho phép dựng nút hành động. */
  loanId?: string;
  fieldUpdateId?: string;
  /**
   * Tình huống của nhiệm vụ. Bỏ trống thì service tự chép từ chính nhiệm vụ đó.
   *
   * Người gửi chỉ nên truyền tay khi bản ghi nhiệm vụ chưa có số đúng ở thời
   * điểm gửi (ví dụ báo cáo thô của trưởng thôn, chưa phân tích).
   */
  incidentType?: string | null;
  affectedPeople?: number | null;
  locationName?: string | null;
}

/** Gateway is injected at runtime; the service does not depend on Socket.IO. */
export type NotificationPusher = (
  organizationId: string,
  role: UserRole,
  notification: unknown,
) => void;

interface PersistedNotification {
  id: string;
  recipientRole: UserRole;
  organizationId: string | null;
}

interface NotificationPersistence {
  notification: {
    create(args: { data: Record<string, unknown> }): Promise<PersistedNotification>;
    findUnique(args: { where: { fieldUpdateId: string } }): Promise<PersistedNotification | null>;
    update(args: {
      where: { id: string };
      data: { title?: string; body?: string };
    }): Promise<PersistedNotification>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  user: {
    findUnique(args: {
      where: { id: string };
      select: { organizationId: true };
    }): Promise<{ organizationId: string } | null>;
  };
  warehouse: {
    findUnique(args: {
      where: { id: string };
      select: { organizationId: true };
    }): Promise<{ organizationId: string } | null>;
  };
  mission: {
    findUnique(args: Record<string, unknown>): Promise<{
      warehouse: { organizationId: string };
      incidentType?: string;
      affectedPeople?: number;
      location?: string | null;
      hamletName?: string | null;
    } | null>;
  };
}

@Injectable()
export class NotificationService {
  private readonly log = new Logger(NotificationService.name);
  private readonly db: NotificationPersistence;

  /** Gateway assigns this for realtime delivery; tests can leave it as a no-op. */
  push: NotificationPusher = () => {};

  constructor(private readonly prisma: PrismaService) {
    // Prisma Client is regenerated with the additive organizationId column at
    // deployment. This explicit boundary avoids silently treating it as safe
    // before that activation step has completed.
    this.db = prisma as unknown as NotificationPersistence;
  }

  /** Persist then publish only to the exact organization + role room. */
  async create(input: CreateNotification) {
    const organizationId = await this.resolveOrganizationId(input);
    const { organizationId: _providedOrganizationId, ...rest } = input;
    const data = { ...rest, ...(await this.resolveIncidentContext(input)) };
    if (input.fieldUpdateId) {
      const existing = await this.db.notification.findUnique({
        where: { fieldUpdateId: input.fieldUpdateId },
      });
      if (existing) return this.reuseFieldUpdateNotification(existing, organizationId, input);
    }
    let notification: PersistedNotification;
    try {
      notification = await this.db.notification.create({ data: { ...data, organizationId } });
    } catch (error) {
      // The unique fieldUpdateId closes the find/create race between a retry
      // and the original request. Read the committed winner instead of
      // creating duplicate ADMIN alerts.
      if (input.fieldUpdateId && isUniqueConflict(error)) {
        const winner = await this.db.notification.findUnique({
          where: { fieldUpdateId: input.fieldUpdateId },
        });
        if (winner) return this.reuseFieldUpdateNotification(winner, organizationId, input);
      }
      throw error;
    }
    this.pushPersisted(notification);
    return notification;
  }

  /** A legacy notification without an organization is deliberately never pushed. */
  pushPersisted(notification: PersistedNotification) {
    if (!notification.organizationId) {
      this.log.warn(
        "Không đẩy notification không có organizationId; record legacy cần backfill nội bộ.",
      );
      return;
    }
    try {
      this.push(notification.organizationId, notification.recipientRole, notification);
    } catch {
      this.log.warn("Không đẩy được thông báo realtime; record đã được lưu để client đọc lại.");
    }
  }

  async updateAndPush(id: string, data: { title?: string; body?: string }) {
    const notification = await this.db.notification.update({ where: { id }, data });
    this.pushPersisted(notification);
    return notification;
  }

  /** Latest notifications of exactly one organization and role. */
  async list(actorId: string, role: UserRole, onlyUnread = false) {
    const organizationId = await this.actorOrganizationId(actorId);
    return this.db.notification.findMany({
      where: { organizationId, recipientRole: role, ...(onlyUnread ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /** Not-found is intentional: it avoids confirming another organization's ID. */
  async markRead(actorId: string, role: UserRole, id: string) {
    const organizationId = await this.actorOrganizationId(actorId);
    const updated = await this.db.notification.updateMany({
      where: { id, organizationId, recipientRole: role },
      data: { read: true },
    });
    if (updated.count !== 1) throw new NotFoundException("Không tìm thấy thông báo");
    return { count: updated.count };
  }

  /**
   * Đánh dấu đã đọc một lô thông báo — không kêu khi có id không khớp.
   *
   * Khác `markRead` một cái có chủ ý: ở đó người dùng chỉ vào ĐÚNG MỘT thông
   * báo, nên không tìm thấy là chuyện đáng báo. Ở đây danh sách id do trình
   * duyệt gom từ bản chụp cách đó vài giây, nên vài id đã được người khác cùng
   * vai đọc mất là chuyện bình thường. Ném lỗi vì chuyện bình thường đó sẽ làm
   * hỏng cả lượt xoá số trên tab — số nằm nguyên tại chỗ dù đã bấm vào.
   *
   * `organizationId` + `recipientRole` vẫn nằm trong điều kiện, nên id của tổ
   * chức khác lọt vào cũng chỉ được đếm là 0, không đọc và không sửa gì.
   */
  async markManyRead(actorId: string, role: UserRole, ids: string[]) {
    const organizationId = await this.actorOrganizationId(actorId);
    return this.db.notification.updateMany({
      where: { id: { in: ids }, organizationId, recipientRole: role, read: false },
      data: { read: true },
    });
  }

  async markAllRead(actorId: string, role: UserRole) {
    const organizationId = await this.actorOrganizationId(actorId);
    return this.db.notification.updateMany({
      where: { organizationId, recipientRole: role, read: false },
      data: { read: true },
    });
  }

  private async actorOrganizationId(actorId: string): Promise<string> {
    const actor = await this.db.user.findUnique({
      where: { id: actorId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    return actor.organizationId;
  }

  /**
   * Chép tình huống của nhiệm vụ vào chính thông báo.
   *
   * Thẻ thông báo cần biểu tượng đúng loại thiên tai và cần in đậm số người,
   * tên thôn — ba thứ đó nằm ở nhiệm vụ. Để màn hình tự đi hỏi thì mỗi thẻ là
   * một lượt gọi mạng lúc đang có việc, mà thẻ hiện trước khi câu trả lời về
   * thì người trực đọc được đúng một dòng chữ chung chung.
   *
   * Chép chứ không tham chiếu: nhiệm vụ sửa số về sau không được phép viết lại
   * nội dung một thông báo đã gửi đi.
   */
  private async resolveIncidentContext(input: CreateNotification) {
    // Xét CÓ NHẮC TỚI hay không, chứ không xét giá trị khác null: người gửi
    // truyền thẳng `incidentType: null` là đang nói "thông báo này không gắn
    // tình huống nào" — như báo cáo thô của trưởng thôn, nơi nhiệm vụ mới chỉ là
    // chỗ trống (OTHER, 0 người). Đọc đè bằng số của nhiệm vụ lúc đó là dựng ra
    // một con số không ai báo.
    const daNoi = "incidentType" in input || "affectedPeople" in input || "locationName" in input;
    if (daNoi || !input.missionId) return {};
    const mission = await this.db.mission.findUnique({
      where: { id: input.missionId },
      select: {
        incidentType: true,
        affectedPeople: true,
        location: true,
        hamletName: true,
        warehouse: { select: { organizationId: true } },
      },
    });
    if (!mission) return {};
    return {
      incidentType: mission.incidentType ?? null,
      affectedPeople: mission.affectedPeople ?? null,
      locationName: mission.hamletName ?? mission.location ?? null,
    };
  }

  private async resolveOrganizationId(input: CreateNotification): Promise<string> {
    if (input.organizationId) return input.organizationId;
    if (input.warehouseId) {
      const warehouse = await this.db.warehouse.findUnique({
        where: { id: input.warehouseId },
        select: { organizationId: true },
      });
      if (warehouse) return warehouse.organizationId;
    }
    if (input.missionId) {
      const mission = await this.db.mission.findUnique({
        where: { id: input.missionId },
        select: { warehouse: { select: { organizationId: true } } },
      });
      if (mission) return mission.warehouse.organizationId;
    }
    throw new NotFoundException("Không xác định được tổ chức nhận thông báo");
  }

  private reuseFieldUpdateNotification(
    notification: PersistedNotification,
    organizationId: string,
    input: CreateNotification,
  ) {
    if (
      notification.organizationId !== organizationId ||
      notification.recipientRole !== input.recipientRole
    ) {
      // Do not disclose whether a colliding ID exists in another scope.
      throw new NotFoundException("Không tìm thấy thông báo");
    }
    this.pushPersisted(notification);
    return notification;
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error != null && typeof error === "object" && "code" in error && String(error.code) === "P2002"
  );
}

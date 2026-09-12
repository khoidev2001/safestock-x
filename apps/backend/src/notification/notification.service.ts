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

/**
 * Trần số dòng một lượt xin — chặn `?limit=100000` biến một cú cuộn thành một
 * lượt quét cả bảng.
 */
const MAX_NOTIFICATION_PAGE_SIZE = 100;

/**
 * Đích của một lượt đẩy realtime.
 *
 * `warehouseId` là ĐỊA CHỈ chứ không phải chú thích: có nó thì chỉ kho đó nhận
 * được, bỏ trống thì cả vai trong xã cùng nhận. Trước đây đích chỉ có tổ chức và
 * vai, nên lệnh "kho thôn Long Châu chuẩn bị vật tư" nổ chuông ở cả kho Đồng Xuân
 * lẫn kho Tân Bình — ba kho cùng tưởng tới lượt mình.
 */
export interface NotificationTarget {
  organizationId: string;
  role: UserRole;
  warehouseId: string | null;
}

/** Gateway is injected at runtime; the service does not depend on Socket.IO. */
export type NotificationPusher = (target: NotificationTarget, notification: unknown) => void;

/**
 * Đẩy xuống điện thoại — gắn lúc chạy giống hệt cách gateway gắn `push`.
 *
 * Tách hẳn khỏi đường socket vì hai kênh trả lời hai câu hỏi khác nhau: socket lo
 * "app đang mở thì thấy ngay", còn kênh này lo "máy đang trong túi thì vẫn reo".
 * Một kênh chết không được kéo kênh kia chết theo.
 */
export type DevicePusher = (
  target: NotificationTarget,
  notification: { title: string; body: string; kind?: string; missionId?: string | null; missionNo?: number | null },
) => void;

interface PersistedNotification {
  id: string;
  recipientRole: UserRole;
  organizationId: string | null;
  warehouseId?: string | null;
  title?: string;
  body?: string;
  kind?: NotificationKind;
  missionId?: string | null;
  missionNo?: number | null;
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
      select: { organizationId: true; warehouseId?: true };
    }): Promise<{ organizationId: string; warehouseId?: string | null } | null>;
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
      missionNo?: number | null;
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
  /** Mặc định không làm gì: máy chủ chưa cấu hình FCM thì hệ thống vẫn chạy trọn vẹn. */
  pushToDevices: DevicePusher = () => {};

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
      this.push(
        {
          organizationId: notification.organizationId,
          role: notification.recipientRole,
          warehouseId: notification.warehouseId ?? null,
        },
        notification,
      );
    } catch {
      this.log.warn("Không đẩy được thông báo realtime; record đã được lưu để client đọc lại.");
    }

    // Kênh thứ hai, chạy độc lập: máy đang đóng app vẫn phải reo. Lỗi ở đây cũng
    // chỉ ghi nhật ký — thông báo đã nằm trong cơ sở dữ liệu rồi.
    try {
      this.pushToDevices(
        {
          organizationId: notification.organizationId,
          role: notification.recipientRole,
          warehouseId: notification.warehouseId ?? null,
        },
        {
          title: notification.title ?? "Ứng phó nhanh",
          body: notification.body ?? "Có thông báo mới",
          kind: notification.kind,
          missionId: notification.missionId ?? null,
          missionNo: notification.missionNo ?? null,
        },
      );
    } catch {
      this.log.warn("Không đẩy được thông báo xuống điện thoại; app vẫn đọc lại được.");
    }
  }

  async updateAndPush(id: string, data: { title?: string; body?: string }) {
    const notification = await this.db.notification.update({ where: { id }, data });
    this.pushPersisted(notification);
    return notification;
  }

  /**
   * Latest notifications of exactly one organization and role.
   *
   * Cuộn vô tận trên điện thoại: `cursor` là id của bản ghi CUỐI trang trước, và
   * `limit` là số dòng xin về cho một lượt. Không truyền gì thì hành xử y như
   * trước (50 dòng mới nhất) — bản web đọc chung đường này và nó không phân trang.
   *
   * Kết quả vẫn là một MẢNG chứ không phải phong bì `{ items, nextCursor }`: nơi
   * gọi biết còn trang sau hay không bằng việc trang vừa nhận có đủ `limit` dòng
   * hay không. Đổi hình dạng trả về thì mọi màn hình đang đọc đường này phải sửa
   * theo cùng lúc, đổi lấy một con số suy ra được.
   *
   * Sắp xếp thêm `id` sau `createdAt`: hai thông báo sinh ra trong cùng một mili
   * giây (một sự kiện gửi cho nhiều vai) thì thứ tự giữa chúng là tuỳ máy chủ, và
   * con trỏ đặt vào giữa cặp đó sẽ nhảy cóc hoặc lặp một dòng ở trang sau.
   */
  async list(
    actorId: string,
    role: UserRole,
    onlyUnread = false,
    page: { limit?: number; cursor?: string } = {},
  ) {
    const { organizationId, warehouseId } = await this.actorScope(actorId);
    const requested = Number.isFinite(page.limit) ? Math.trunc(page.limit as number) : 50;
    const limit = Math.min(Math.max(requested, 1), MAX_NOTIFICATION_PAGE_SIZE);
    const cursor = page.cursor?.trim();
    return this.db.notification.findMany({
      where: {
        organizationId,
        recipientRole: role,
        ...this.warehouseVisibility(warehouseId),
        ...(onlyUnread ? { read: false } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });
  }

  /**
   * Not-found is intentional: it avoids confirming another organization's ID.
   *
   * Cùng lý do với việc lọc theo kho: thông báo của kho khác phải "không tồn tại"
   * với người này, kể cả khi họ đoán đúng id.
   */
  async markRead(actorId: string, role: UserRole, id: string) {
    const { organizationId, warehouseId } = await this.actorScope(actorId);
    const updated = await this.db.notification.updateMany({
      where: {
        id,
        organizationId,
        recipientRole: role,
        ...this.warehouseVisibility(warehouseId),
      },
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
    const { organizationId, warehouseId } = await this.actorScope(actorId);
    return this.db.notification.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        recipientRole: role,
        read: false,
        ...this.warehouseVisibility(warehouseId),
      },
      data: { read: true },
    });
  }

  /**
   * Xoá sạch số chưa đọc — chỉ trong phần người này THẬT SỰ nhìn thấy.
   *
   * Cờ `read` nằm trên chính bản ghi thông báo, dùng chung cho cả vai. Không lọc
   * theo kho ở đây thì kho Đồng Xuân bấm "đọc hết" là xoá luôn dấu chưa đọc trên
   * lệnh gửi riêng cho kho Long Châu — và kho Long Châu mở app lên thấy một hộp
   * thông báo sạch trơn trong khi họ đang nợ một chuyến xuất hàng.
   */
  async markAllRead(actorId: string, role: UserRole) {
    const { organizationId, warehouseId } = await this.actorScope(actorId);
    return this.db.notification.updateMany({
      where: {
        organizationId,
        recipientRole: role,
        read: false,
        ...this.warehouseVisibility(warehouseId),
      },
      data: { read: true },
    });
  }

  /**
   * Phạm vi đọc thông báo của một tài khoản: tổ chức, và kho nếu có.
   *
   * Đọc từ BẢN GHI NGƯỜI DÙNG chứ không nhận từ tầng gọi. Phạm vi là thứ quyết
   * định ai thấy được gì, nên nó không được phép là một tham số mà một chỗ gọi
   * nào đó quên truyền — quên ở đây nghĩa là mở lại đúng lỗ rò vừa vá.
   */
  private async actorScope(
    actorId: string,
  ): Promise<{ organizationId: string; warehouseId: string | null }> {
    const actor = await this.db.user.findUnique({
      where: { id: actorId },
      select: { organizationId: true, warehouseId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    return { organizationId: actor.organizationId, warehouseId: actor.warehouseId ?? null };
  }

  /**
   * Điều kiện lọc theo kho, dùng chung cho mọi lượt đọc và mọi lượt đánh dấu.
   *
   * Tài khoản gắn với MỘT kho (trưởng thôn) chỉ thấy thông báo không ghi kho —
   * tin chung của cả xã — và thông báo ghi đúng kho mình. Tài khoản không gắn kho
   * (điều phối, đội cứu hộ) thấy hết như cũ.
   *
   * Vì sao thông báo không ghi kho vẫn hiện cho tất cả: phần lớn thông báo cũ
   * không có trường này, và chúng là tin chung thật (nhiệm vụ bị huỷ, đội đã rút).
   * Lọc bỏ luôn thì vá một lỗ rò bằng cách bịt mất tai của mọi người.
   */
  private warehouseVisibility(warehouseId: string | null) {
    if (!warehouseId) return {};
    return { OR: [{ warehouseId: null }, { warehouseId }] };
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
    if (!input.missionId) return {};
    const mission = await this.db.mission.findUnique({
      where: { id: input.missionId },
      select: {
        missionNo: true,
        incidentType: true,
        affectedPeople: true,
        location: true,
        hamletName: true,
        warehouse: { select: { organizationId: true } },
      },
    });
    if (!mission) return {};

    // Số hiệu chép LUÔN, không qua cổng `alreadyDescribed` bên dưới.
    //
    // Nó là DANH TÍNH của nhiệm vụ, không phải một con số mô tả tình huống: người
    // trực gọi nhau bằng "nhiệm vụ số 127" ngay cả khi báo cáo còn thô, chưa có
    // loại thiên tai lẫn số người. Chặn nó cùng nhóm kia là những thông báo cần
    // danh tính nhất — báo cáo mới từ hiện trường — lại là những thông báo không
    // có số hiệu.
    const missionNo = { missionNo: mission.missionNo ?? null };

    // Xét CÓ NHẮC TỚI hay không, chứ không xét giá trị khác null: người gửi
    // truyền thẳng `incidentType: null` là đang nói "thông báo này không gắn
    // tình huống nào" — như báo cáo thô của trưởng thôn, nơi nhiệm vụ mới chỉ là
    // chỗ trống (OTHER, 0 người). Đọc đè bằng số của nhiệm vụ lúc đó là dựng ra
    // một con số không ai báo.
    const alreadyDescribed =
      "incidentType" in input || "affectedPeople" in input || "locationName" in input;
    if (alreadyDescribed) return missionNo;

    return {
      ...missionNo,
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

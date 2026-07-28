import { Injectable, Logger } from "@nestjs/common";
import { NotificationKind, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateNotification {
  recipientRole: UserRole;
  kind: NotificationKind;
  title: string;
  body: string;
  missionId?: string;
  warehouseId?: string;
}

/** Hàm đẩy realtime (gateway gán vào) — service không phụ thuộc Socket.IO. */
export type NotificationPusher = (role: UserRole, notification: unknown) => void;

interface PersistedNotification {
  recipientRole: UserRole;
}

@Injectable()
export class NotificationService {
  private readonly log = new Logger(NotificationService.name);

  /** Gateway gán để đẩy WebSocket; mặc định no-op (test không cần socket). */
  push: NotificationPusher = () => {};

  constructor(private prisma: PrismaService) {}

  /** Tạo thông báo + đẩy realtime theo role; DB thành công không phụ thuộc WebSocket. */
  async create(input: CreateNotification) {
    const notification = await this.prisma.notification.create({ data: input });
    this.pushPersisted(notification);
    return notification;
  }

  /** Đẩy một record đã commit; lỗi realtime chỉ được ghi log để client đọc lại qua API. */
  pushPersisted(notification: PersistedNotification) {
    try {
      this.push(notification.recipientRole, notification);
    } catch {
      this.log.warn("Không đẩy được thông báo realtime; record đã được lưu để client đọc lại.");
    }
  }

  /**
   * Cập nhật 1 thông báo đã có + đẩy lại realtime (cùng id → client thay tại chỗ,
   * không nhân đôi). Dùng khi AI enrich xong: đè body của cảnh báo vừa tạo bằng text AI.
   */
  async updateAndPush(id: string, data: { title?: string; body?: string }) {
    const notification = await this.prisma.notification.update({ where: { id }, data });
    this.pushPersisted(notification);
    return notification;
  }

  /** Danh sách thông báo của role (mới nhất trước). */
  list(role: UserRole, onlyUnread = false) {
    return this.prisma.notification.findMany({
      where: { recipientRole: role, ...(onlyUnread ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  markAllRead(role: UserRole) {
    return this.prisma.notification.updateMany({
      where: { recipientRole: role, read: false },
      data: { read: true },
    });
  }
}

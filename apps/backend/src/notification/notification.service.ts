import { Injectable } from "@nestjs/common";
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

@Injectable()
export class NotificationService {
  /** Gateway gán để đẩy WebSocket; mặc định no-op (test không cần socket). */
  push: NotificationPusher = () => {};

  constructor(private prisma: PrismaService) {}

  /** Tạo thông báo + đẩy realtime theo role. */
  async create(input: CreateNotification) {
    const notification = await this.prisma.notification.create({ data: input });
    this.push(input.recipientRole, notification);
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

import { Injectable, Logger } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  isExpired,
  loadServiceAccount,
  requestAccessToken,
  type CachedToken,
  type ServiceAccount,
} from "./fcm-credentials";

/**
 * Thông báo đẩy tới điện thoại — chuông reo cả khi app đã đóng.
 *
 * Vì sao cần: kênh thời gian thực qua socket chỉ sống khi app đang mở. Lệnh điều
 * phối thì gửi bất cứ lúc nào, kể cả hai giờ sáng, tới những người đang để máy
 * trong túi. Không có lớp này thì lệnh vẫn nằm trong hệ thống chờ người ta tự mở
 * app ra xem — đúng thứ mà cả dự án sinh ra để xoá bỏ.
 *
 * NỘI DUNG GỬI ĐI CỐ TÌNH NGHÈO. Thông báo đẩy đi qua máy chủ Google, nên nó chỉ
 * mang tiêu đề, một câu ngắn và số hiệu nhiệm vụ — đủ để người nhận biết phải mở
 * app. Số liệu kho, danh sách vật tư, toạ độ điểm gặp nạn đều ở lại máy chủ xã và
 * chỉ đi ra khi app đã đăng nhập hỏi trực tiếp.
 */

/** Bao nhiêu lần FCM báo token hỏng liên tiếp thì xoá hẳn bản ghi thiết bị. */
const MAX_FAILURES_BEFORE_REMOVAL = 3;

/** Gửi theo lô để một lệnh gửi cho cả vai không thành hàng trăm lượt chờ nối tiếp. */
const SEND_BATCH_SIZE = 20;

export interface PushPayload {
  title: string;
  body: string;
  missionId?: string | null;
  missionNo?: number | null;
  kind?: string;
}

export interface PushAudience {
  organizationId: string;
  role: UserRole;
  /** Có thì chỉ người phụ trách đúng kho đó nhận; null là cả vai trong xã. */
  warehouseId: string | null;
}

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private readonly account: ServiceAccount | null;
  private token: CachedToken | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.account = loadServiceAccount();
    if (!this.account) {
      this.log.warn(
        "Chưa cấu hình FCM (FCM_SERVICE_ACCOUNT_JSON hoặc FCM_SERVICE_ACCOUNT_FILE) — thông báo đẩy tắt, app vẫn nhận realtime khi đang mở.",
      );
    }
  }

  get isConfigured(): boolean {
    return this.account != null;
  }

  /** Ghi nhận một máy nhận thông báo. Token đã có thì gán lại cho người vừa đăng nhập. */
  async registerDevice(input: {
    userId: string;
    organizationId: string;
    token: string;
    platform?: string;
    deviceName?: string | null;
  }) {
    const data = {
      userId: input.userId,
      organizationId: input.organizationId,
      platform: input.platform ?? "android",
      deviceName: input.deviceName ?? null,
      lastSeenAt: new Date(),
      failureCount: 0,
    };
    return this.prisma.pushDevice.upsert({
      where: { token: input.token },
      create: { ...data, token: input.token },
      update: data,
      select: { id: true, token: true, platform: true, lastSeenAt: true },
    });
  }

  /**
   * Gỡ một máy khỏi danh sách nhận.
   *
   * Gọi lúc đăng xuất. Không gỡ thì người tiếp theo mượn máy đó vẫn nghe chuông
   * của những việc không thuộc về họ — mà thông báo cứu hộ có ghi số hiệu nhiệm vụ
   * và tên thôn.
   */
  async removeDevice(token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { token } });
  }

  /**
   * Đẩy tới đúng nhóm người đang nhận thông báo này.
   *
   * Không bao giờ ném lỗi ra ngoài: thông báo đã được lưu trong cơ sở dữ liệu và
   * app đọc lại được, nên một cú gọi Google hỏng không được phép làm hỏng luôn
   * việc giao nhiệm vụ.
   */
  async pushToAudience(audience: PushAudience, payload: PushPayload): Promise<void> {
    if (!this.account) return;
    try {
      const devices = await this.devicesOf(audience);
      if (devices.length === 0) return;
      for (let index = 0; index < devices.length; index += SEND_BATCH_SIZE) {
        const batch = devices.slice(index, index + SEND_BATCH_SIZE);
        await Promise.all(batch.map((device) => this.sendOne(device.token, payload)));
      }
    } catch (error) {
      this.log.warn(
        `Không đẩy được thông báo tới điện thoại: ${error instanceof Error ? error.message : "lỗi không rõ"}`,
      );
    }
  }

  /**
   * Những máy cần nhận.
   *
   * Lấy theo NGƯỜI chứ không theo vai suông: một tài khoản gắn kho thôn chỉ nhận
   * lệnh của kho mình, còn điều phối và đội cứu hộ không gắn kho nào nên nhận mọi
   * lệnh gửi cho vai của họ. Đúng phạm vi mà bản đọc lại bằng HTTP đang áp dụng.
   */
  private async devicesOf(audience: PushAudience) {
    return this.prisma.pushDevice.findMany({
      where: {
        organizationId: audience.organizationId,
        user: {
          role: audience.role,
          organizationId: audience.organizationId,
          ...(audience.warehouseId
            ? { OR: [{ warehouseId: audience.warehouseId }, { warehouseId: null }] }
            : {}),
        },
      },
      select: { id: true, token: true },
    });
  }

  private async accessToken(): Promise<string> {
    if (!this.account) throw new Error("Chưa cấu hình FCM");
    if (isExpired(this.token)) {
      this.token = await requestAccessToken(this.account);
    }
    return this.token!.value;
  }

  private async sendOne(token: string, payload: PushPayload): Promise<void> {
    if (!this.account) return;
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            // Dữ liệu kèm theo chỉ đủ để app mở đúng màn hình. Không nhét số liệu
            // nghiệp vụ vào đây — gói tin này đi qua hạ tầng của Google.
            data: {
              kind: payload.kind ?? "",
              missionId: payload.missionId ?? "",
              missionNo: payload.missionNo != null ? String(payload.missionNo) : "",
            },
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "ung-pho-nhanh-nhiem-vu",
                // Mở thẳng app khi người dùng chạm vào thông báo.
                click_action: "OPEN_MISSION",
              },
            },
          },
        }),
      },
    );

    if (response.ok) {
      await this.prisma.pushDevice.updateMany({
        where: { token },
        data: { failureCount: 0, lastSeenAt: new Date() },
      });
      return;
    }

    // 404/400 từ FCM nghĩa là token đã chết (gỡ app, xoá dữ liệu, cài lại). Đếm
    // đủ số lần rồi mới xoá, vì một lần hỏng cũng có thể do mạng chập chờn.
    const shouldCountFailure = response.status === 404 || response.status === 400;
    if (!shouldCountFailure) {
      this.log.warn(`FCM trả về HTTP ${response.status} khi gửi thông báo`);
      return;
    }
    const device = await this.prisma.pushDevice.findUnique({
      where: { token },
      select: { failureCount: true },
    });
    if (!device) return;
    if (device.failureCount + 1 >= MAX_FAILURES_BEFORE_REMOVAL) {
      await this.prisma.pushDevice.deleteMany({ where: { token } });
      return;
    }
    await this.prisma.pushDevice.updateMany({
      where: { token },
      data: { failureCount: { increment: 1 } },
    });
  }
}

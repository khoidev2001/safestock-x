import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { IncidentService } from "./incident.service";

const DEFAULT_INTERVAL_SECONDS = 60;
const MIN_INTERVAL_SECONDS = 10;

/**
 * Đồng hồ canh im lặng.
 *
 * Mọi quy tắc khác đều chạy khi CÓ số liệu đi vào. Mất tín hiệu thì ngược lại:
 * không có gì đi vào cả, nên phải có người chủ động hỏi "đã bao lâu rồi không
 * nghe thấy gì?". Không có vòng lặp này thì một cảm biến chết sẽ im lặng vĩnh
 * viễn mà không ai biết.
 *
 * Cố tình dùng timer trong tiến trình thay vì hàng đợi Redis: kho mất Internet
 * vẫn phải được canh, và cảnh báo an toàn không nên phụ thuộc thêm một dịch vụ
 * nữa có thể chết. Chạy nhiều bản sao cũng không sinh cảnh báo trùng vì
 * `scanWarehouse` đã chặn sự cố cùng loại đang mở trên cùng thiết bị.
 */
@Injectable()
export class IncidentWatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(IncidentWatchdogService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const intervalSeconds = this.resolveIntervalSeconds();
    if (intervalSeconds === null) {
      this.log.log("Watchdog mất tín hiệu đang tắt theo cấu hình.");
      return;
    }
    this.timer = setInterval(() => void this.sweep(), intervalSeconds * 1000);
    // Không giữ tiến trình sống chỉ vì cái timer này (test, script, shutdown).
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Quét mọi kho đang khai báo thiết bị có chu kỳ báo. Public để test gọi thẳng. */
  async sweep(): Promise<void> {
    if (this.running) return; // Lượt trước còn chạy: bỏ lượt này thay vì chồng tải.
    this.running = true;
    try {
      const monitored = await this.prisma.virtualDevice.findMany({
        where: { expectedIntervalSeconds: { not: null } },
        select: { warehouseId: true },
        distinct: ["warehouseId"],
      });
      for (const { warehouseId } of monitored) {
        try {
          await this.incidents.scanSilentDevices(warehouseId);
        } catch (error) {
          this.log.warn(`Watchdog quét kho ${warehouseId} lỗi: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      this.log.warn(`Watchdog không liệt kê được thiết bị: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * null = tắt có chủ đích (đặt đúng giá trị 0). Giá trị rác KHÔNG được phép biến
   * thành "tắt": env validation đã chặn ở boot, nên ở đây rơi về mặc định và ghi
   * log — im lặng bỏ canh cảm biến là hỏng nguy hiểm hơn nhiều so với quét thừa.
   */
  private resolveIntervalSeconds(): number | null {
    const raw = this.config.get<unknown>("INCIDENT_WATCHDOG_INTERVAL_SECONDS");
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      return DEFAULT_INTERVAL_SECONDS;
    }
    const parsed = Number(String(raw).trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      this.log.warn(
        `INCIDENT_WATCHDOG_INTERVAL_SECONDS không hợp lệ (${String(raw)}); dùng ${DEFAULT_INTERVAL_SECONDS}s.`,
      );
      return DEFAULT_INTERVAL_SECONDS;
    }
    if (parsed === 0) return null;
    return Math.max(MIN_INTERVAL_SECONDS, Math.floor(parsed));
  }
}

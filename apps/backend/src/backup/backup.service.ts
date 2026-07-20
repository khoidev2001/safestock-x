import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";

export const BACKUP_QUEUE = "backup";
export const BACKUP_JOB = "daily-dump";

/**
 * Lịch backup (BE-Bp5): mỗi ngày 17:00 đẩy 1 job repeatable vào BullMQ.
 * Worker (backup.processor) dump DB → Supabase Storage, giữ 3 bản gần nhất.
 * Thiếu cấu hình Supabase → không đăng ký job (skip êm, không chặn app khởi động).
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly log = new Logger(BackupService.name);

  constructor(
    @InjectQueue(BACKUP_QUEUE) private queue: Queue,
    private config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.isConfigured()) {
      this.log.warn("Backup Supabase chưa cấu hình (SUPABASE_URL/SUPABASE_SERVICE_KEY) — bỏ qua lịch backup.");
      return;
    }
    // Repeatable cron 17:00 hằng ngày. BullMQ tự dedupe theo repeat key → không nhân đôi khi restart.
    await this.queue.add(
      BACKUP_JOB,
      {},
      { repeat: { pattern: "0 17 * * *" }, removeOnComplete: 5, removeOnFail: 10 },
    );
    this.log.log("Đã đăng ký lịch backup hằng ngày 17:00 → Supabase.");
  }

  /** Kích hoạt backup thủ công (test/demo) — cùng job worker xử lý. */
  async triggerNow(): Promise<{ enqueued: boolean; reason?: string }> {
    if (!this.isConfigured()) return { enqueued: false, reason: "Supabase chưa cấu hình" };
    await this.queue.add(BACKUP_JOB, { manual: true }, { removeOnComplete: 5, removeOnFail: 10 });
    return { enqueued: true };
  }

  private isConfigured(): boolean {
    return Boolean(this.config.get("SUPABASE_URL") && this.config.get("SUPABASE_SERVICE_KEY"));
  }
}

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { BACKUP_QUEUE } from "./backup.service";

const execAsync = promisify(exec);
const KEEP_BACKUPS = 3;

interface StorageObject {
  name: string;
}

/**
 * Worker backup: dump toàn DB → upload Supabase Storage → giữ KEEP_BACKUPS bản mới nhất.
 * pg_dump chạy trong container Postgres (host không cần cài client). Gọi Storage REST bằng
 * fetch native (KHÔNG dùng supabase-js — SDK đó cần WebSocket cho realtime, thừa cho backup).
 * Lỗi → job fail, BullMQ retry; chạy nền, không chặn luồng chính.
 */
@Processor(BACKUP_QUEUE)
export class BackupProcessor extends WorkerHost {
  private readonly log = new Logger(BackupProcessor.name);
  private readonly url: string;
  private readonly key: string;
  private readonly bucket: string;
  private readonly pgContainer: string;

  constructor(private config: ConfigService) {
    super();
    this.url = (config.get("SUPABASE_URL") as string)?.replace(/\/$/, "");
    this.key = config.get("SUPABASE_SERVICE_KEY") as string;
    this.bucket = config.get("SUPABASE_BACKUP_BUCKET") ?? "db-backups";
    this.pgContainer = config.get("POSTGRES_CONTAINER") ?? "safestock_postgres";
  }

  async process(): Promise<{ file: string; bytes: number }> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `backup-${stamp}.sql`;

    const dump = await this.dumpDatabase();
    await this.upload(fileName, dump);
    await this.pruneOld();

    this.log.log(`Backup xong: ${fileName} (${dump.length} bytes).`);
    return { file: fileName, bytes: dump.length };
  }

  /** pg_dump trong container Postgres, trả nội dung SQL (Buffer). */
  private async dumpDatabase(): Promise<Buffer> {
    const dbUrl = new URL(this.config.get("DATABASE_URL") as string);
    const db = dbUrl.pathname.replace(/^\//, "");
    const user = decodeURIComponent(dbUrl.username);
    // -O -x: bỏ owner/privileges cho portable; chạy trong container nên host khỏi cần pg_dump.
    const cmd = `docker exec ${this.pgContainer} pg_dump -U ${user} -O -x ${db}`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 256 * 1024 * 1024 });
    if (!stdout || stdout.length === 0) throw new Error("pg_dump trả rỗng");
    return Buffer.from(stdout, "utf8");
  }

  private async upload(fileName: string, data: Buffer): Promise<void> {
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${fileName}`, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/sql" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Upload Supabase lỗi (HTTP ${res.status}): ${await res.text()}`);
  }

  /** Giữ KEEP_BACKUPS bản mới nhất, xóa phần cũ hơn. */
  private async pruneOld(): Promise<void> {
    const listRes = await fetch(`${this.url}/storage/v1/object/list/${this.bucket}`, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 100, sortBy: { column: "name", order: "desc" } }),
    });
    if (!listRes.ok) return;

    const objects = (await listRes.json()) as StorageObject[];
    const stale = objects
      .map((o) => o.name)
      .filter((n) => n.startsWith("backup-"))
      .slice(KEEP_BACKUPS);
    if (stale.length === 0) return;

    await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
      method: "DELETE",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: stale }),
    });
    this.log.log(`Đã xóa ${stale.length} bản backup cũ.`);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key };
  }
}

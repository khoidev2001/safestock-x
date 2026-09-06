import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Kho ảnh bằng chứng đặt ngoài cơ sở dữ liệu (Supabase Storage).
 *
 * Ảnh là dữ liệu NẶNG và chỉ đọc theo id — đúng loại việc mà kho vật thể làm
 * tốt còn Postgres làm dở. Để trong bảng thì mỗi bản pg_dump hằng ngày phải cõng
 * lại toàn bộ tập ảnh, và bản sao lưu phình lên là thứ trực tiếp làm chậm việc
 * khôi phục lúc cần khôi phục nhất.
 *
 * Gọi Storage REST bằng `fetch` native, KHÔNG dùng supabase-js — cùng lý do đã
 * ghi ở worker backup: SDK đó kéo theo WebSocket cho realtime, thừa cho việc chỉ
 * tải lên và tải xuống vài tấm ảnh.
 *
 * CHƯA CẤU HÌNH THÌ TẮT, không phải hỏng: máy dev và máy chạy ngoại tuyến không
 * có SUPABASE_URL, và mất tính năng báo cáo kết quả chỉ vì thiếu một biến môi
 * trường là cái giá đắt hơn nhiều so với việc tạm giữ ảnh trong DB.
 */
@Injectable()
export class EvidenceStorageService {
  private readonly log = new Logger(EvidenceStorageService.name);
  private readonly url: string;
  private readonly key: string;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.url = (config.get<string>("SUPABASE_URL") ?? "").replace(/\/$/, "");
    this.key = config.get<string>("SUPABASE_SERVICE_KEY") ?? "";
    this.bucket = config.get<string>("SUPABASE_EVIDENCE_BUCKET") ?? "mission-evidence";
  }

  /** Có đủ cấu hình để dùng kho ngoài hay không; thiếu thì bên gọi giữ ảnh trong DB. */
  get enabled(): boolean {
    return this.url.length > 0 && this.key.length > 0;
  }

  /**
   * Tải một ảnh lên, trả về khoá vật thể để lưu vào DB.
   *
   * Khoá gộp sẵn id nhiệm vụ: lúc phải dọn tay trong bảng điều khiển Supabase thì
   * "ảnh của nhiệm vụ nào" phải nhìn ra được từ chính tên tệp.
   */
  async upload(missionId: string, photoId: string, data: Buffer, mimeType: string) {
    const key = `missions/${missionId}/${photoId}.jpg`;
    const res = await fetch(this.objectUrl(key), {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": mimeType,
        // Ảnh đã gửi thì không bao giờ đổi nội dung, nên cache dài là an toàn.
        "Cache-Control": "max-age=31536000",
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      throw new Error(`Không tải được ảnh lên kho (HTTP ${res.status}): ${await res.text()}`);
    }
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const res = await fetch(this.objectUrl(key), { headers: this.authHeaders() });
    if (!res.ok) {
      throw new Error(`Không tải được ảnh từ kho (HTTP ${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Xoá vật thể, nuốt lỗi.
   *
   * Chỉ dùng để dọn phần vừa tải lên khi bước ghi DB hỏng. Lúc đó lỗi thật sự cần
   * báo cho người dùng là lỗi ghi DB; ném thêm lỗi dọn dẹp chỉ che mất nó. Vật
   * thể mồ côi thì tốn ít dung lượng, không làm sai một con số nào.
   */
  async removeQuietly(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await fetch(this.objectUrl(key), { method: "DELETE", headers: this.authHeaders() });
      } catch (error) {
        this.log.warn(`Không dọn được ảnh mồ côi ${key}: ${String(error)}`);
      }
    }
  }

  private objectUrl(key: string): string {
    return `${this.url}/storage/v1/object/${this.bucket}/${key}`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key };
  }
}

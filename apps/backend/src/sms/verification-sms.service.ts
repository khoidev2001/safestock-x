import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { VN_CARRIER_LABEL, carrierOf, toLocalVnPhone, type VnCarrier } from "./vn-carriers";

/** Mã đi tới máy thật qua nhà mạng, hay chỉ in ra log máy chủ (chế độ dev). */
export type SmsDelivery = "sms" | "dev-log";

/** Một đường gửi đã cấu hình: gửi qua đâu, ký tên gì. */
export interface SmsRoute {
  /** Nhà mạng đường này phục vụ; `null` là đường mặc định dùng cho mọi số. */
  carrier: VnCarrier | null;
  url: string;
  token: string | null;
  /** Tên thương hiệu hiện ở chỗ người gửi trong tin nhắn (brandname). */
  sender: string | null;
}

/**
 * Gửi mã 6 số tới số điện thoại, chọn đường theo NHÀ MẠNG của số đó.
 *
 * Vì sao tách theo nhà mạng: brandname ở Việt Nam ký với từng nhà mạng. Xã có
 * hợp đồng Viettel thì số Viettel đi thẳng đường đó — rẻ hơn và tới nhanh hơn đi
 * vòng qua một cổng chung; số thuộc mạng chưa ký thì rơi về đường mặc định
 * (SMS_PROVIDER_URL, thường là một cổng tổng hợp như eSMS hay Twilio).
 *
 * Cấu hình theo từng nhà mạng, tất cả đều tuỳ chọn:
 *   SMS_PROVIDER_URL / _TOKEN / _SENDER                 → đường mặc định
 *   SMS_PROVIDER_VIETTEL_URL / _TOKEN / _SENDER         → riêng cho Viettel
 *   SMS_PROVIDER_VINAPHONE_… VINAPHONE                  (081 082 083 084 085 088 091 094)
 *   SMS_PROVIDER_MOBIFONE_…                             (070 076 077 078 079 089 090 093)
 *   SMS_PROVIDER_VIETNAMOBILE_…                         (052 056 058 092)
 *   SMS_PROVIDER_GMOBILE_…                              (059 099)
 *   SMS_PROVIDER_ITELECOM_…                             (087)
 *   SMS_PROVIDER_WINTEL_…                               (055)
 *
 * CÒN THIẾU MỘT MẢNH: lệnh gọi HTTP tới nhà cung cấp. Mỗi bên một kiểu ký hoàn
 * toàn khác nhau — eSMS truyền ApiKey/SecretKey trên query, Twilio dùng form
 * encode kèm Basic auth, cổng của nhà mạng lại đòi ký số. Viết sẵn một kiểu là
 * gần như chắc chắn phải bỏ đi viết lại, nên `dispatch` để trống có chủ đích: có
 * hợp đồng với bên nào thì cài đúng bên đó vào một chỗ duy nhất.
 *
 * Chưa cấu hình đường nào mà bật SMS_DEV_LOG_CODES=true thì mã in ra log và trả
 * về cho giao diện — giống hệt luồng email khi chưa có SMTP. Phải BẬT TAY và
 * không bao giờ chạy ở production: một đường vòng đọc log là xác minh hộ được số
 * của người khác.
 */
@Injectable()
export class VerificationSmsService {
  private readonly log = new Logger(VerificationSmsService.name);

  constructor(private readonly config: ConfigService) {}

  /** Đường gửi cho một số cụ thể: ưu tiên đường riêng của nhà mạng, không có thì lấy đường mặc định. */
  routeFor(phone: string): SmsRoute | null {
    const carrier = carrierOf(phone);
    if (carrier) {
      const dedicated = this.readRoute(carrier);
      if (dedicated) return dedicated;
    }
    return this.readRoute(null);
  }

  /** Có ít nhất một đường gửi đã cấu hình (mặc định, hoặc riêng cho một nhà mạng). */
  isConfigured(): boolean {
    if (this.readRoute(null)) return true;
    return (Object.keys(VN_CARRIER_LABEL) as VnCarrier[]).some((carrier) =>
      Boolean(this.readRoute(carrier)),
    );
  }

  /**
   * Chế độ dev: chưa có nhà cung cấp nào thì in mã ra log để còn chạy thử luồng.
   *
   * Không mặc định theo kiểu "thiếu cấu hình thì tự bật": một lần triển khai
   * thiếu biến môi trường sẽ lặng lẽ biến thành lỗ hổng xác minh.
   */
  isDevLogEnabled(): boolean {
    const enabled = String(this.config.get("SMS_DEV_LOG_CODES") ?? "").toLowerCase() === "true";
    const production = String(this.config.get("NODE_ENV") ?? "").toLowerCase() === "production";
    return enabled && !production;
  }

  /** Có đường nào để mã tới được người dùng hay không. */
  canSend(): boolean {
    return this.isConfigured() || this.isDevLogEnabled();
  }

  async sendVerificationCode(input: {
    phone: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<SmsDelivery> {
    const phone = toLocalVnPhone(input.phone);
    const route = this.routeFor(phone);
    const carrier = carrierOf(phone);

    if (!route) {
      if (!this.isDevLogEnabled()) {
        throw new Error("Chưa cấu hình nhà cung cấp SMS và cũng chưa bật chế độ ghi log mã.");
      }
      // Ghi rõ đây là chế độ dev: một dòng log lẫn giữa log vận hành mà không nói
      // rõ thì người đọc tưởng mã đã gửi đi thật.
      this.log.warn(
        `[dev-log] Chưa cấu hình nhà cung cấp SMS. Mã cho ${maskPhone(phone)}` +
          `${carrier ? ` (${VN_CARRIER_LABEL[carrier]})` : ""} là ${input.code}` +
          ` (hết hạn sau ${input.expiresInMinutes} phút).`,
      );
      return "dev-log";
    }

    await this.dispatch(route, {
      phone,
      text: `${input.code} la ma xac minh so dien thoai Ung pho nhanh. Ma het han sau ${input.expiresInMinutes} phut. Khong chia se ma nay cho bat ky ai.`,
    });
    return "sms";
  }

  /**
   * Đẩy tin nhắn qua nhà cung cấp đã cấu hình.
   *
   * Ném lỗi khi gửi hỏng — tầng trên dựa vào đó để xoá mã vừa tạo, không để người
   * dùng ngồi chờ một tin nhắn không bao giờ tới.
   */
  private async dispatch(route: SmsRoute, message: { phone: string; text: string }): Promise<void> {
    void message;
    throw new Error(
      `Đã cấu hình đường gửi ${route.carrier ?? "mặc định"} (${route.url}) nhưng chưa cài phần gọi API của nhà cung cấp.`,
    );
  }

  /** Đọc cấu hình một đường; thiếu URL là chưa cấu hình. */
  private readRoute(carrier: VnCarrier | null): SmsRoute | null {
    const prefix = carrier ? `SMS_PROVIDER_${carrier}` : "SMS_PROVIDER";
    const url = this.readValue(`${prefix}_URL`);
    if (!url) return null;
    return {
      carrier,
      url,
      token: this.readValue(`${prefix}_TOKEN`),
      sender: this.readValue(`${prefix}_SENDER`),
    };
  }

  private readValue(key: string): string | null {
    const value = String(this.config.get<string>(key) ?? "").trim();
    return value === "" ? null : value;
  }
}

/** Che giữa số khi ghi log: log máy chủ không phải chỗ lưu danh bạ của cả xã. */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
}

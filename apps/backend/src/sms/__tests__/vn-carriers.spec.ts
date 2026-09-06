import { VerificationSmsService } from "../verification-sms.service";
import { carrierOf, isVnMobilePhone, toLocalVnPhone } from "../vn-carriers";

describe("nhà mạng theo ba số đầu", () => {
  it("nhận ra cả năm nhà mạng và hai mạng ảo", () => {
    expect(carrierOf("0987654321")).toBe("VIETTEL");
    expect(carrierOf("0387654321")).toBe("VIETTEL");
    expect(carrierOf("0912345678")).toBe("VINAPHONE");
    expect(carrierOf("0812345678")).toBe("VINAPHONE");
    expect(carrierOf("0901234567")).toBe("MOBIFONE");
    expect(carrierOf("0781234567")).toBe("MOBIFONE");
    expect(carrierOf("0921234567")).toBe("VIETNAMOBILE");
    expect(carrierOf("0991234567")).toBe("GMOBILE");
    expect(carrierOf("0871234567")).toBe("ITELECOM");
    expect(carrierOf("0551234567")).toBe("WINTEL");
  });

  it("hiểu số viết kiểu quốc tế — người lưu danh bạ +84 vẫn thêm được số", () => {
    expect(toLocalVnPhone("+84912345678")).toBe("0912345678");
    expect(toLocalVnPhone("84912345678")).toBe("0912345678");
    expect(carrierOf("+84 987 654 321")).toBe("VIETTEL");
  });

  it("từ chối số cố định: gửi mã tới đó là gửi vào hư không", () => {
    // 024 Hà Nội, 028 TP.HCM, 0257 Phú Yên — không mạng nào nhận tin nhắn.
    expect(carrierOf("02412345678")).toBeNull();
    expect(carrierOf("0281234567")).toBeNull();
    expect(isVnMobilePhone("0257123456")).toBe(false);
  });

  it("từ chối đầu số không tồn tại và số cũ 11 chữ số chưa chuyển đổi", () => {
    expect(carrierOf("0111234567")).toBeNull();
    expect(carrierOf("01234567890")).toBeNull();
    expect(carrierOf("091234567")).toBeNull();
  });
});

describe("chọn đường gửi theo nhà mạng", () => {
  const service = (env: Record<string, string>) =>
    new VerificationSmsService({ get: (key: string) => env[key] } as never);

  it("số của nhà mạng đã ký hợp đồng đi đúng đường riêng của nhà mạng đó", () => {
    const sms = service({
      SMS_PROVIDER_URL: "https://cong-tong-hop.example",
      SMS_PROVIDER_VIETTEL_URL: "https://viettel.example",
      SMS_PROVIDER_VIETTEL_SENDER: "UNGPHONHANH",
    });

    expect(sms.routeFor("0987654321")).toEqual(
      expect.objectContaining({ carrier: "VIETTEL", url: "https://viettel.example" }),
    );
    // Mạng chưa ký riêng thì rơi về đường mặc định, không phải rơi vào hư không.
    expect(sms.routeFor("0912345678")).toEqual(
      expect.objectContaining({ carrier: null, url: "https://cong-tong-hop.example" }),
    );
  });

  it("chỉ ký với một nhà mạng thì số mạng khác không có đường nào", () => {
    const sms = service({ SMS_PROVIDER_MOBIFONE_URL: "https://mobifone.example" });

    expect(sms.isConfigured()).toBe(true);
    expect(sms.routeFor("0901234567")?.carrier).toBe("MOBIFONE");
    expect(sms.routeFor("0987654321")).toBeNull();
  });

  it("không cấu hình gì thì không gửi được, trừ khi bật tay chế độ ghi log mã", () => {
    expect(service({}).canSend()).toBe(false);
    expect(service({ SMS_DEV_LOG_CODES: "true" }).canSend()).toBe(true);
    // Production thì cờ dev bị bỏ qua: đọc log là xác minh hộ được số người khác.
    expect(service({ SMS_DEV_LOG_CODES: "true", NODE_ENV: "production" }).canSend()).toBe(false);
  });
});

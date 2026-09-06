/**
 * Nhà mạng Việt Nam, nhận ra từ ba số đầu.
 *
 * Dùng cho ba việc, theo thứ tự quan trọng:
 *
 * 1. CHẶN SỐ KHÔNG NHẬN ĐƯỢC TIN NHẮN. Đầu số cố định (024 Hà Nội, 0257 Phú Yên…)
 *    và đầu số bịa ra đều trông "giống số điện thoại" với một biểu thức chính quy
 *    lỏng, nhưng gửi mã tới đó là gửi vào hư không. Sai lầm này chỉ lộ ra lúc
 *    người dùng ngồi chờ một tin nhắn không bao giờ tới.
 * 2. CHỌN ĐƯỜNG GỬI. Xã ký hợp đồng brandname với nhà mạng nào thì số của nhà
 *    mạng đó đi đường đó — rẻ hơn và tới nhanh hơn đi vòng qua một cổng chung.
 * 3. HIỆN TÊN NHÀ MẠNG cho người dùng soát lại số vừa gõ.
 *
 * Danh sách theo đợt chuyển 11 số → 10 số năm 2018 và các đầu số cấp thêm sau đó.
 * Đầu số là thứ Bộ TT&TT cấp thêm theo thời gian, nên đây là bảng phải cập nhật —
 * không phải hằng số vĩnh viễn.
 */
export type VnCarrier =
  "VIETTEL" | "VINAPHONE" | "MOBIFONE" | "VIETNAMOBILE" | "GMOBILE" | "ITELECOM" | "WINTEL";

export const VN_CARRIER_LABEL: Record<VnCarrier, string> = {
  VIETTEL: "Viettel",
  VINAPHONE: "VinaPhone",
  MOBIFONE: "MobiFone",
  VIETNAMOBILE: "Vietnamobile",
  GMOBILE: "Gmobile",
  ITELECOM: "iTelecom",
  WINTEL: "Wintel",
};

/**
 * Ba số đầu → nhà mạng.
 *
 * iTelecom và Wintel là mạng ảo (MVNO) chạy trên hạ tầng VinaPhone và MobiFone,
 * nhưng vẫn tách riêng: hợp đồng brandname ký với từng bên, và số của họ có thể
 * phải đi một đường gửi khác.
 */
export const VN_CARRIER_BY_PREFIX: Record<string, VnCarrier> = {
  // Viettel
  "032": "VIETTEL",
  "033": "VIETTEL",
  "034": "VIETTEL",
  "035": "VIETTEL",
  "036": "VIETTEL",
  "037": "VIETTEL",
  "038": "VIETTEL",
  "039": "VIETTEL",
  "086": "VIETTEL",
  "096": "VIETTEL",
  "097": "VIETTEL",
  "098": "VIETTEL",
  // VinaPhone
  "081": "VINAPHONE",
  "082": "VINAPHONE",
  "083": "VINAPHONE",
  "084": "VINAPHONE",
  "085": "VINAPHONE",
  "088": "VINAPHONE",
  "091": "VINAPHONE",
  "094": "VINAPHONE",
  // MobiFone
  "070": "MOBIFONE",
  "076": "MOBIFONE",
  "077": "MOBIFONE",
  "078": "MOBIFONE",
  "079": "MOBIFONE",
  "089": "MOBIFONE",
  "090": "MOBIFONE",
  "093": "MOBIFONE",
  // Vietnamobile
  "052": "VIETNAMOBILE",
  "056": "VIETNAMOBILE",
  "058": "VIETNAMOBILE",
  "092": "VIETNAMOBILE",
  // Gmobile
  "059": "GMOBILE",
  "099": "GMOBILE",
  // Mạng ảo
  "087": "ITELECOM",
  "055": "WINTEL",
};

/**
 * Đưa số về dạng nội địa 10 số bắt đầu bằng 0.
 *
 * "+84912345678", "84912345678" và "0912345678" là cùng một máy. Người dùng lưu
 * số theo kiểu nào là tuỳ họ; hệ thống phải hiểu cả ba, nếu không thì một người
 * lưu danh bạ kiểu quốc tế sẽ không bao giờ thêm được số của mình.
 */
export function toLocalVnPhone(phone: string): string {
  const digits = String(phone ?? "").replace(/[^0-9+]/g, "");
  if (digits.startsWith("+84")) return `0${digits.slice(3)}`;
  if (digits.startsWith("84") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

/** Nhà mạng của số, hoặc `null` khi đầu số không thuộc mạng di động nào. */
export function carrierOf(phone: string): VnCarrier | null {
  const local = toLocalVnPhone(phone);
  // Đúng 10 số: mọi thuê bao di động Việt Nam đều 10 số kể từ 2018. Số 11 chữ số
  // là số cũ chưa chuyển đổi, gửi tới đó chắc chắn hỏng.
  if (!/^0\d{9}$/.test(local)) return null;
  return VN_CARRIER_BY_PREFIX[local.slice(0, 3)] ?? null;
}

/** Tên nhà mạng để hiện cho người dùng, `null` khi không nhận ra. */
export function carrierLabelOf(phone: string): string | null {
  const carrier = carrierOf(phone);
  return carrier ? VN_CARRIER_LABEL[carrier] : null;
}

/** Số này có phải thuê bao di động Việt Nam nhận được tin nhắn hay không. */
export function isVnMobilePhone(phone: string): boolean {
  return carrierOf(phone) !== null;
}

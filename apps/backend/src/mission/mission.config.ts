import { IncidentType, LIT_MOI_CHAI_NUOC } from "@safestock/shared-types";

/**
 * Bảng định mức vật tư cứu hộ.
 *
 * ⚠️ ĐỊNH MỨC THAM KHẢO PHỤC VỤ NGHIÊN CỨU, không phải hướng dẫn nghiệp vụ
 * chính thức. Dẫn nguồn:
 *  - Sphere Handbook (chuẩn cứu trợ nhân đạo quốc tế): nước tối thiểu 15
 *    lít/người/ngày; thực phẩm ~2100 kcal/người/ngày.
 *  - Tiêu chuẩn Hội Chữ thập đỏ + quy định phòng chống thiên tai VN.
 *
 * Sẽ đọc từ DB (bảng cấu hình) ở lát tích hợp — giữ hằng số code cho MVP.
 */

/**
 * Thể tích một chai nước cứu trợ, tính bằng lít.
 *
 * Chuẩn Sphere ghi nhu cầu nước theo LÍT, nhưng kho xuất và trưởng thôn đếm theo
 * CHAI — không ai bốc "15 lít" ra khỏi kệ, người ta bốc mười chai. Ghi định mức
 * theo lít rồi để người xuất kho tự chia là đẩy phép tính sang đúng lúc đang vội,
 * và mỗi người chia một kiểu.
 *
 * Giữ hằng số ở đây để đổi cỡ chai chỉ phải sửa một chỗ, và để phép quy đổi luôn
 * nhìn thấy được thay vì nằm ẩn trong một con số đã nhân sẵn.
 */
// Cỡ chai lấy từ gói dùng chung: web hiện lại số lít từ đúng hằng số này, mỗi
// bên giữ một bản là hai màn hình nói hai con số cho cùng một đống hàng.
export { LIT_MOI_CHAI_NUOC };

/**
 * NƯỚC UỐNG đóng chai: lít/người/ngày.
 *
 * Sphere ghi 15 lít/người/ngày, nhưng đó là TỔNG lượng nước cho cả ăn uống lẫn
 * vệ sinh — phần lớn do bồn, giếng và can 20 lít gánh, không phải nước đóng chai.
 * Riêng phần uống và nấu, Sphere đặt mức sinh tồn 2,5–3 lít/người/ngày; kho xã
 * chỉ trữ và phát phần này.
 *
 * Lấy nhầm 15 lít làm định mức nước chai là chỗ sinh ra con số 16 286 chai cho
 * 190 người trong hai ngày: gấp hơn hai lần rưỡi toàn bộ nước cả xã đang trữ, mà
 * cũng chẳng ai chở nổi. Với mức 3 lít và chai 1,5 lít thì thành 2 chai/người/ngày
 * — đúng thứ vác được lên xe và phát tận tay.
 */
export const NUOC_UONG_LIT_MOI_NGUOI_MOI_NGAY = 3;

/** Lít/người/ngày → số chai, giữ nguyên phần lẻ để tổng mới làm tròn. */
function chaiTuLit(litMoiNgay: number): number {
  return litMoiNgay / LIT_MOI_CHAI_NUOC;
}

/** 1 dòng định mức: mỗi SKU cần bao nhiêu, tính theo yếu tố nào. */
export interface NormRule {
  sku: string;
  itemName: string;
  unit: string;
  /** Hệ số nhân với "cơ sở" (người/trẻ em/người già/ngày). */
  perUnit: number;
  basis: NormBasis;
}

export type NormBasis =
  | "PER_PERSON" // mỗi người bị ảnh hưởng
  | "PER_ADULT" // mỗi người lớn = số người ảnh hưởng trừ trẻ em
  | "PER_CHILD" // mỗi trẻ em
  | "PER_PERSON_PER_DAY" // mỗi người mỗi ngày (nhân số ngày)
  | "PER_MEDICAL_CASE"; // mỗi ca cần y tế

/**
 * Định mức nước uống dùng chung cho mọi loại tình huống.
 *
 * Người bị lũ và người bị cháy uống như nhau — nhu cầu uống là nhu cầu sinh tồn,
 * không đổi theo loại thiên tai. Phần khác nhau giữa các tình huống nằm ở SỐ NGÀY
 * (durationHours) chứ không nằm ở lít mỗi ngày.
 */
const NUOC_UONG: NormRule = {
  sku: "WATER-01",
  itemName: "Nước uống đóng chai",
  unit: "chai",
  perUnit: chaiTuLit(NUOC_UONG_LIT_MOI_NGUOI_MOI_NGAY),
  basis: "PER_PERSON_PER_DAY",
};

/** Định mức theo loại tình huống. */
export const MISSION_NORMS: Record<IncidentType, NormRule[]> = {
  [IncidentType.FLOOD]: [
    {
      sku: "LIFE-ADULT",
      itemName: "Áo phao người lớn",
      unit: "chiếc",
      perUnit: 1,
      // PER_ADULT chứ không phải PER_PERSON: ô "Số người" là TỔNG số người ảnh
      // hưởng, đã bao gồm trẻ em. Tính theo tổng thì mỗi trẻ em được phát hai áo
      // phao — một cỡ trẻ em và một cỡ người lớn không ai mặc.
      basis: "PER_ADULT",
    },
    {
      sku: "LIFE-CHILD",
      itemName: "Áo phao trẻ em",
      unit: "chiếc",
      perUnit: 1,
      basis: "PER_CHILD",
    },
    NUOC_UONG,
    {
      sku: "FIRSTAID-01",
      itemName: "Bộ sơ cứu",
      unit: "bộ",
      perUnit: 1,
      basis: "PER_MEDICAL_CASE",
    },
    { sku: "TORCH-01", itemName: "Đèn pin", unit: "chiếc", perUnit: 0.1, basis: "PER_PERSON" },
  ],
  [IncidentType.STORM]: [
    NUOC_UONG,
    {
      sku: "FIRSTAID-01",
      itemName: "Bộ sơ cứu",
      unit: "bộ",
      perUnit: 1,
      basis: "PER_MEDICAL_CASE",
    },
    { sku: "TORCH-01", itemName: "Đèn pin", unit: "chiếc", perUnit: 0.1, basis: "PER_PERSON" },
    { sku: "CANVAS-01", itemName: "Bạt che", unit: "tấm", perUnit: 0.2, basis: "PER_PERSON" },
  ],
  [IncidentType.LANDSLIDE]: [
    {
      sku: "FIRSTAID-01",
      itemName: "Bộ sơ cứu",
      unit: "bộ",
      perUnit: 1,
      basis: "PER_MEDICAL_CASE",
    },
    NUOC_UONG,
    { sku: "TORCH-01", itemName: "Đèn pin", unit: "chiếc", perUnit: 0.2, basis: "PER_PERSON" },
  ],
  [IncidentType.FIRE]: [
    {
      sku: "FIRSTAID-01",
      itemName: "Bộ sơ cứu",
      unit: "bộ",
      perUnit: 1,
      basis: "PER_MEDICAL_CASE",
    },
    NUOC_UONG,
  ],
  [IncidentType.ISOLATION]: [
    NUOC_UONG,
    {
      sku: "FIRSTAID-01",
      itemName: "Bộ sơ cứu",
      unit: "bộ",
      perUnit: 1,
      basis: "PER_MEDICAL_CASE",
    },
  ],
  [IncidentType.OTHER]: [
    NUOC_UONG,
  ],
};

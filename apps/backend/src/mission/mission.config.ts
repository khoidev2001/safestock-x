import { IncidentType } from "@safestock/shared-types";

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
  | "PER_CHILD" // mỗi trẻ em
  | "PER_PERSON_PER_DAY" // mỗi người mỗi ngày (nhân số ngày)
  | "PER_MEDICAL_CASE"; // mỗi ca cần y tế

/** Định mức theo loại tình huống. */
export const MISSION_NORMS: Record<IncidentType, NormRule[]> = {
  [IncidentType.FLOOD]: [
    {
      sku: "LIFE-ADULT",
      itemName: "Áo phao người lớn",
      unit: "chiếc",
      perUnit: 1,
      basis: "PER_PERSON",
    },
    {
      sku: "LIFE-CHILD",
      itemName: "Áo phao trẻ em",
      unit: "chiếc",
      perUnit: 1,
      basis: "PER_CHILD",
    },
    {
      sku: "WATER-01",
      itemName: "Nước uống đóng chai",
      unit: "lít",
      perUnit: 15,
      basis: "PER_PERSON_PER_DAY",
    },
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
    {
      sku: "WATER-01",
      itemName: "Nước uống đóng chai",
      unit: "lít",
      perUnit: 15,
      basis: "PER_PERSON_PER_DAY",
    },
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
    {
      sku: "WATER-01",
      itemName: "Nước uống đóng chai",
      unit: "lít",
      perUnit: 15,
      basis: "PER_PERSON_PER_DAY",
    },
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
    {
      sku: "WATER-01",
      itemName: "Nước uống đóng chai",
      unit: "lít",
      perUnit: 5,
      basis: "PER_PERSON_PER_DAY",
    },
  ],
  [IncidentType.ISOLATION]: [
    {
      sku: "WATER-01",
      itemName: "Nước uống đóng chai",
      unit: "lít",
      perUnit: 15,
      basis: "PER_PERSON_PER_DAY",
    },
    {
      sku: "FIRSTAID-01",
      itemName: "Bộ sơ cứu",
      unit: "bộ",
      perUnit: 1,
      basis: "PER_MEDICAL_CASE",
    },
  ],
  [IncidentType.OTHER]: [
    {
      sku: "WATER-01",
      itemName: "Nước uống đóng chai",
      unit: "lít",
      perUnit: 15,
      basis: "PER_PERSON_PER_DAY",
    },
  ],
};

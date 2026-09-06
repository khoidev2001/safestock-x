import { IncidentType } from "@safestock/shared-types";
import { MISSION_NORMS, NormRule } from "./mission.config";

/** Tình huống đã parse (từ AI hoặc nhập tay). */
export interface IncidentInput {
  incidentType: IncidentType;
  location?: string | null;
  affectedPeople: number;
  durationHours: number;
  children: number;
  elderly: number;
  medicalSupportCases: number;
}

/**
 * Số người thuộc nhóm dễ tổn thương của một tình huống.
 *
 * KHÔNG phải phép cộng ba ô. Trẻ em, người già và ca y tế là ba lát cắt CHỒNG NHAU
 * của cùng một đám người: một đứa trẻ đang cần hỗ trợ y tế được đếm ở cả ô "trẻ em"
 * lẫn ô "ca y tế". Cộng thẳng thì một người bị tính hai ba lần, và con số vọt qua cả
 * tổng số người gặp nạn — báo cáo 200 người mà đánh giá tình huống ghi "có 325 người
 * thuộc nhóm dễ tổn thương" là ca có thật, không ai đọc mà tin được nữa.
 *
 * Không có dữ liệu nào nói ba nhóm chồng nhau bao nhiêu, nên chỉ chốt được hai đầu:
 * - TRẦN là tổng số người gặp nạn — nhóm dễ tổn thương là tập con của đám người đó;
 * - SÀN là nhóm đông nhất — nhóm ấy có thật, dù nó nằm gọn trong nhóm khác đi nữa.
 *
 * Sàn chỉ có tác dụng khi số liệu tự mâu thuẫn (một nhóm khai đông hơn cả tổng số
 * người). Với số liệu nhất quán thì nhóm đông nhất luôn nhỏ hơn trần, nên công thức
 * rút về đúng "cộng ba ô rồi cắt ở tổng số người".
 */
export function countVulnerablePeople(incident: IncidentInput): number {
  const sum = incident.children + incident.elderly + incident.medicalSupportCases;
  const largestGroup = Math.max(
    incident.children,
    incident.elderly,
    incident.medicalSupportCases,
  );
  return Math.max(largestGroup, Math.min(sum, incident.affectedPeople));
}

/** Nhu cầu 1 loại vật tư. */
export interface Requirement {
  sku: string;
  itemName: string;
  unit: string;
  required: number;
}

/** Lô khả dụng để phân bổ (đã lọc IN_STOCK, còn dùng được). */
export interface AvailableBatch {
  batchId: string;
  sku: string;
  quantity: number;
  expiryDate: Date | null;
  // Cụm kho cùng xã (K1): lấy kho gần điểm nạn trước. Optional — tương thích cũ.
  warehouseId?: string;
  warehouseName?: string;
  distanceKm?: number;
}

/** Kết quả phân bổ 1 loại. */
export interface Allocation {
  sku: string;
  itemName: string;
  unit: string;
  required: number;
  allocated: number;
  shortage: number;
  batches: {
    batchId: string;
    qty: number;
    expiryDate: Date | null;
    warehouseId?: string;
    warehouseName?: string;
    distanceKm?: number;
  }[];
}

/**
 * Tính nhu cầu vật tư từ tình huống + định mức — hàm THUẦN.
 * Làm tròn LÊN (ceil) để chuẩn bị dư an toàn, không thiếu.
 *
 * Định mức nào ra 0 thì BỎ HẲN khỏi danh sách, không giữ dòng rỗng. Không có ca
 * cần y tế thì bộ sơ cứu vẫn hiện "đáp ứng 0/0, thiếu 0" ở mọi bảng — một dòng
 * không nói gì nhưng vẫn bắt người trực đọc qua, và giữa lúc gấp thì mỗi dòng
 * thừa là một chỗ để mắt trượt qua dòng thật sự thiếu.
 */
export function computeRequirements(incident: IncidentInput): Requirement[] {
  const norms = MISSION_NORMS[incident.incidentType] ?? MISSION_NORMS[IncidentType.OTHER];
  const days = Math.max(1, Math.ceil(incident.durationHours / 24));

  return norms
    .map((norm) => ({
      sku: norm.sku,
      itemName: norm.itemName,
      unit: norm.unit,
      required: Math.ceil(norm.perUnit * basisValue(norm, incident, days)),
    }))
    .filter((requirement) => requirement.required > 0);
}

/**
 * Phân bổ GREEDY + FEFO (First-Expired-First-Out) — hàm THUẦN.
 * Sort lô theo hạn dùng (gần hết hạn trước, không hạn cuối), lấy dần tới đủ.
 * KHÔNG vượt tồn. Trả về số cấp được + thiếu + chi tiết theo lô.
 */
export function allocateGreedy(requirement: Requirement, batches: AvailableBatch[]): Allocation {
  const pool = batches.filter((b) => b.sku === requirement.sku).sort(byNearestThenFefo);

  let remaining = requirement.required;
  const picked: Allocation["batches"] = [];

  for (const batch of pool) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    if (take <= 0) continue;
    picked.push({
      batchId: batch.batchId,
      qty: take,
      expiryDate: batch.expiryDate,
      warehouseId: batch.warehouseId,
      warehouseName: batch.warehouseName,
      distanceKm: batch.distanceKm,
    });
    remaining -= take;
  }

  const allocated = requirement.required - remaining;
  return {
    sku: requirement.sku,
    itemName: requirement.itemName,
    unit: requirement.unit,
    required: requirement.required,
    allocated,
    shortage: Math.max(0, remaining),
    batches: picked,
  };
}

/**
 * Mức đáp ứng tổng = MIN qua các loại (mắt xích yếu nhất).
 * Thiếu 1 loại thiết yếu = chưa sẵn sàng, không tính trung bình đẹp.
 * Loại required=0 bỏ qua (không kéo xuống).
 */
export function overallFulfillment(allocations: Allocation[]): number {
  const ratios = allocations.filter((a) => a.required > 0).map((a) => a.allocated / a.required);
  if (ratios.length === 0) return 100;
  return Math.round(Math.min(...ratios) * 100);
}

// ---- helpers ----

function basisValue(norm: NormRule, incident: IncidentInput, days: number): number {
  switch (norm.basis) {
    // Đồ dùng chung của cả chuyến: hệ số chính là số lượng, không nhân với ai.
    case "PER_MISSION":
      return 1;
    case "PER_PERSON":
      return incident.affectedPeople;
    case "PER_ADULT":
      // Trẻ em đã được đếm riêng và có định mức riêng. Không kẹp sàn 0 thì một
      // báo cáo ghi nhầm trẻ em nhiều hơn tổng số người sẽ cho ra định mức âm.
      return Math.max(0, incident.affectedPeople - incident.children);
    case "PER_CHILD":
      return incident.children;
    case "PER_PERSON_PER_DAY":
      return incident.affectedPeople * days;
    case "PER_MEDICAL_CASE":
      return incident.medicalSupportCases;
    default:
      return 0;
  }
}

/**
 * Kho GẦN điểm nạn trước (K1 — kho thôn gần lấy trước, tràn sang kho tổng/xa),
 * cùng kho thì FEFO (hạn gần nhất trước; lô không hạn xếp cuối).
 * Không có distanceKm (tương thích cũ) coi như bằng nhau → chỉ FEFO.
 */
function byNearestThenFefo(a: AvailableBatch, b: AvailableBatch): number {
  const distanceA = a.distanceKm ?? Number.POSITIVE_INFINITY;
  const distanceB = b.distanceKm ?? Number.POSITIVE_INFINITY;
  if (distanceA !== distanceB) return distanceA - distanceB;
  const expiry = byExpiryFefo(a, b);
  if (expiry !== 0) return expiry;
  return `${a.warehouseId ?? ""}:${a.batchId}`.localeCompare(`${b.warehouseId ?? ""}:${b.batchId}`);
}

/** FEFO: hạn gần nhất trước; lô không hạn xếp cuối. */
function byExpiryFefo(a: AvailableBatch, b: AvailableBatch): number {
  if (a.expiryDate === null && b.expiryDate === null) return 0;
  if (a.expiryDate === null) return 1;
  if (b.expiryDate === null) return -1;
  return a.expiryDate.getTime() - b.expiryDate.getTime();
}

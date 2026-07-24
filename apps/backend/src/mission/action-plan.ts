/**
 * Incident Action Plan (Kế hoạch hành động cứu hộ) — tầng RULE thuần.
 *
 * Nguyên tắc: severity + forecasts (dự báo %) do BACKEND chấm bằng công thức
 * kiểm chứng được (chống LLM bịa số, chống hỏi vặn khi thi). LLM chỉ viết phần
 * diễn giải định tính (mục tiêu/giai đoạn/cảnh báo/câu hỏi) — ghép ở service.
 */

import { IncidentInput } from "./mission.compute";

export interface Forecast {
  label: string;
  probability: number; // 0-100
}

export interface AllocationSummary {
  sku: string;
  itemName: string;
  unit: string;
  required: number;
  allocated: number;
  shortage: number;
  fromWarehouses: string[]; // tên kho đã lấy
}

export interface WarehouseEta {
  name: string;
  distanceKm: number;
  etaMinutes: number;
  lat: number;
  lng: number;
}

/** Phần LLM viết (khớp ActionPlanNarrative của ai-service). */
export interface ActionPlanNarrative {
  objectives: string[];
  phases: { window: string; actions: string[] }[];
  warnings: string[];
  followUpQuestions: string[];
}

/** Action Plan hoàn chỉnh = số (backend chấm) + văn (LLM viết). */
export interface ActionPlan {
  severityLevel: number; // 1-5
  severityReason: string[];
  confidence: number; // 0-100
  fulfillment: number; // % đáp ứng (min qua loại)
  allocations: AllocationSummary[];
  warehouses: WarehouseEta[];
  forecasts: Forecast[];
  narrative: ActionPlanNarrative;
  generatedBy: "ai" | "template"; // template = fallback khi LLM lỗi
}

/**
 * Chấm mức khẩn cấp 1-5 bằng rule (KHÔNG để LLM chấm — cần nhất quán).
 * Dựa: số người, loại tình huống, nhóm dễ tổn thương, thời gian, mức đáp ứng.
 */
export function scoreSeverity(
  incident: IncidentInput,
  fulfillment: number,
): { level: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 1;

  if (incident.affectedPeople >= 100) {
    score += 2;
    reasons.push(`Số người ảnh hưởng lớn (${incident.affectedPeople}).`);
  } else if (incident.affectedPeople >= 30) {
    score += 1;
    reasons.push(`Số người ảnh hưởng đáng kể (${incident.affectedPeople}).`);
  }

  const highRisk = ["FLOOD", "LANDSLIDE", "STORM"];
  if (highRisk.includes(incident.incidentType)) {
    score += 1;
    reasons.push(`Loại thiên tai nguy hiểm (${incident.incidentType}).`);
  }

  const vulnerable = incident.children + incident.elderly + incident.medicalSupportCases;
  if (vulnerable > 0) {
    score += 1;
    reasons.push(`Có ${vulnerable} người thuộc nhóm dễ tổn thương.`);
  }

  if (incident.durationHours >= 24) {
    reasons.push(`Thời gian cô lập dự kiến kéo dài (${incident.durationHours}h).`);
  }

  if (fulfillment < 70) {
    score += 1;
    reasons.push(`Kho chỉ đáp ứng ${fulfillment}% — thiếu vật tư thiết yếu.`);
  }

  return { level: Math.min(5, Math.max(1, score)), reasons };
}

/**
 * Dự báo % bằng rule (KHÔNG để LLM bịa). Ước lượng định tính có căn cứ:
 * cô lập kéo dài, thiếu vật tư, cần sơ tán.
 */
export function computeForecasts(incident: IncidentInput, fulfillment: number): Forecast[] {
  const forecasts: Forecast[] = [];

  // Cô lập > 24h: tăng theo thời gian + loại lũ/sạt lở.
  const isolationBase =
    incident.incidentType === "FLOOD" || incident.incidentType === "LANDSLIDE" ? 45 : 25;
  const isolationProb = clamp(isolationBase + Math.min(30, incident.durationHours), 0, 95);
  forecasts.push({ label: "Cô lập > 24 giờ", probability: isolationProb });

  // Thiếu vật tư: nghịch với mức đáp ứng.
  forecasts.push({ label: "Thiếu vật tư", probability: clamp(100 - fulfillment, 5, 95) });

  // Cần sơ tán: theo số người + nhóm dễ tổn thương.
  const vulnerable = incident.children + incident.elderly + incident.medicalSupportCases;
  const evacProb = clamp(Math.round(incident.affectedPeople / 5) + vulnerable * 2, 5, 90);
  forecasts.push({ label: "Cần sơ tán", probability: evacProb });

  return forecasts;
}

/**
 * Template fallback: khi LLM lỗi/mất mạng vẫn ra Action Plan từ số backend.
 * Kém mượt hơn LLM nhưng đủ dùng — demo không bao giờ trắng màn hình.
 */
export function buildTemplateNarrative(
  incident: IncidentInput,
  allocations: AllocationSummary[],
): ActionPlanNarrative {
  const shortages = allocations.filter((a) => a.shortage > 0).map((a) => a.itemName);
  const hasVulnerable = incident.children + incident.elderly + incident.medicalSupportCases > 0;

  return {
    objectives: [
      "Không để thiếu nước uống và thuốc sơ cứu trong 6 giờ đầu.",
      "Tiếp cận an toàn khu vực bị nạn, ưu tiên cứu người.",
      hasVulnerable
        ? "Ưu tiên trẻ em, người già, ca cần hỗ trợ y tế."
        : "Bảo đảm an toàn cho toàn bộ người dân.",
    ],
    phases: [
      {
        window: "0-2h",
        actions: [
          "Xác minh chính xác số người và vị trí.",
          "Cấp nước uống và thuốc sơ cứu trước tiên.",
        ],
      },
      {
        window: "2-6h",
        actions: [
          "Chuyển thực phẩm và vật tư thiết yếu còn lại.",
          hasVulnerable
            ? "Lập danh sách người già, trẻ em, phụ nữ mang thai."
            : "Rà soát nhu cầu phát sinh tại hiện trường.",
        ],
      },
      {
        window: "6-24h",
        actions: [
          "Thiết lập điểm tiếp tế tạm thời nếu tình huống kéo dài.",
          "Chuẩn bị đợt tiếp tế thứ hai từ kho tổng.",
        ],
      },
    ],
    warnings: [
      shortages.length > 0
        ? `Thiếu: ${shortages.join(", ")} — cần bổ sung từ kho khác.`
        : "Đủ vật tư thiết yếu ở thời điểm hiện tại.",
      incident.durationHours >= 24
        ? "Nguy cơ cô lập kéo dài trên 24 giờ."
        : "Theo dõi diễn biến sát.",
    ],
    followUpQuestions: [
      "Có trẻ em hoặc người bệnh tại chỗ không?",
      "Hiện còn điện không?",
      "Có phương tiện (xuồng) tại chỗ không?",
    ],
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

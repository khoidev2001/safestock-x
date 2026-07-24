import { ComponentScore, QuantityInput } from "../readiness.types";

/**
 * Điểm khả dụng số lượng (thành phần "quantityAvailability", 28%).
 *
 * So số kiểm kê thực tế với số hệ thống, loại phần đang mượn (ON_LOAN) khỏi
 * "khả dụng ngay". ON_LOAN không tính mất nhưng chưa lấy lại được ngay.
 *
 * - Chưa kiểm kê bao giờ (countedQty null) → điểm giảm mạnh: không có bằng chứng
 *   số hệ thống đúng. Trả về 50 kèm lý do; độ tin cậy dữ liệu (thành phần khác)
 *   sẽ trừ tiếp.
 * - systemQty = 0 → không có gì để đánh giá, coi 0 điểm khả dụng.
 */
export function scoreQuantity(input: QuantityInput): ComponentScore {
  if (input.systemQty <= 0) {
    return {
      key: "quantityAvailability",
      score: 0,
      reasons: ["Không còn tồn trên hệ thống"],
    };
  }

  const availableNow = input.systemQty - input.onLoanQty;
  const reasons: string[] = [];

  if (input.countedQty === null) {
    // Chưa kiểm kê: tin tạm số hệ thống nhưng hạ trần vì thiếu xác nhận.
    const ratio = Math.max(0, availableNow) / input.systemQty;
    if (input.onLoanQty > 0) {
      reasons.push(`${input.onLoanQty} đang được mượn (chưa sẵn sàng ngay)`);
    }
    reasons.push("Chưa kiểm kê thực tế — số liệu chưa được xác nhận");
    return {
      key: "quantityAvailability",
      score: Math.round(ratio * 50), // trần 50 khi chưa kiểm kê
      reasons,
    };
  }

  // Có kiểm kê: điểm theo tỉ lệ thực tế khả dụng ngay / hệ thống.
  const availableCounted = Math.max(0, Math.min(input.countedQty, availableNow));
  const ratio = availableCounted / input.systemQty;

  if (input.onLoanQty > 0) {
    reasons.push(`${input.onLoanQty} đang được mượn (chưa sẵn sàng ngay)`);
  }
  if (input.countedQty < input.systemQty) {
    reasons.push(`Kiểm kê thiếu ${input.systemQty - input.countedQty} so với hệ thống`);
  }

  return {
    key: "quantityAvailability",
    score: Math.round(Math.max(0, Math.min(1, ratio)) * 100),
    reasons,
  };
}

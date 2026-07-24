export interface BatchEligibilityInput {
  condition: "NEW" | "USED" | "NEEDS_CHECK" | "DAMAGED";
  circulation: "IN_STOCK" | "ON_LOAN" | "RETURNED";
  quantity: number;
  onLoanQuantity: number;
  expiryDate: Date | null;
  isLocked: boolean;
}

export interface BatchEligibility {
  eligible: boolean;
  availableQuantity: number;
  reasons: string[];
}

/** Xác định lô có thực sự lấy được ngay cho một nhiệm vụ hay không. */
export function assessBatchEligibility(input: BatchEligibilityInput, now: Date): BatchEligibility {
  const reasons: string[] = [];
  const availableQuantity = Math.max(0, input.quantity - input.onLoanQuantity);

  if (input.circulation !== "IN_STOCK") reasons.push("Lô không ở trạng thái trong kho");
  if (input.condition === "DAMAGED") reasons.push("Lô đã hư hỏng");
  if (input.condition === "NEEDS_CHECK") reasons.push("Lô cần kiểm tra trước khi sử dụng");
  if (input.expiryDate && input.expiryDate.getTime() < now.getTime()) {
    reasons.push("Lô đã hết hạn sử dụng");
  }
  if (input.isLocked) reasons.push("Kệ đang bị khóa");
  if (availableQuantity <= 0) reasons.push("Không còn số lượng khả dụng ngay");

  return {
    eligible: reasons.length === 0,
    availableQuantity,
    reasons,
  };
}

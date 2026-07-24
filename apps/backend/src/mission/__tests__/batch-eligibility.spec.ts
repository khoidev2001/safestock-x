import { assessBatchEligibility } from "../batch-eligibility";

const NOW = new Date("2026-07-21T00:00:00.000Z");

function input(overrides: Record<string, unknown> = {}) {
  return {
    condition: "NEW" as const,
    circulation: "IN_STOCK" as const,
    quantity: 20,
    onLoanQuantity: 0,
    expiryDate: new Date("2027-01-01T00:00:00.000Z"),
    isLocked: false,
    ...overrides,
  };
}

describe("assessBatchEligibility", () => {
  it("rejects an expired batch", () => {
    const result = assessBatchEligibility(
      input({ expiryDate: new Date("2026-07-20T00:00:00.000Z") }),
      NOW,
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Lô đã hết hạn sử dụng");
  });

  it("rejects stock on a locked shelf", () => {
    const result = assessBatchEligibility(input({ isLocked: true }), NOW);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Kệ đang bị khóa");
  });

  it("rejects damaged or needs-check stock", () => {
    expect(assessBatchEligibility(input({ condition: "DAMAGED" }), NOW).eligible).toBe(false);
    expect(assessBatchEligibility(input({ condition: "NEEDS_CHECK" }), NOW).eligible).toBe(false);
  });

  it("subtracts open loans from immediately available quantity", () => {
    const result = assessBatchEligibility(input({ onLoanQuantity: 7 }), NOW);

    expect(result.eligible).toBe(true);
    expect(result.availableQuantity).toBe(13);
  });
});

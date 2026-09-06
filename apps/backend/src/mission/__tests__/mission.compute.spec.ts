import { IncidentType } from "@safestock/shared-types";
import {
  allocateGreedy,
  AvailableBatch,
  computeRequirements,
  IncidentInput,
  overallFulfillment,
  Requirement,
} from "../mission.compute";

const flood = (overrides: Partial<IncidentInput> = {}): IncidentInput => ({
  incidentType: IncidentType.FLOOD,
  affectedPeople: 100,
  durationHours: 48,
  children: 20,
  elderly: 10,
  medicalSupportCases: 4,
  ...overrides,
});

describe("computeRequirements", () => {
  it("áo phao người lớn tính theo NGƯỜI LỚN, đã trừ trẻ em", () => {
    // "Số người" là tổng số người ảnh hưởng, trẻ em nằm trong đó và đã có áo phao
    // cỡ riêng. Tính theo tổng thì mỗi trẻ em lĩnh thêm một áo người lớn thừa.
    const reqs = computeRequirements(flood({ affectedPeople: 100, children: 20 }));
    expect(reqs.find((r) => r.sku === "LIFE-ADULT")?.required).toBe(80);
    expect(reqs.find((r) => r.sku === "LIFE-CHILD")?.required).toBe(20);
  });

  it("trẻ em nhiều hơn tổng số người thì áo người lớn biến mất, không ra số âm", () => {
    // Định mức ra 0 thì bỏ hẳn dòng: bảng nhu cầu không giữ chỗ cho thứ không cần.
    const reqs = computeRequirements(flood({ affectedPeople: 5, children: 8 }));
    expect(reqs.find((r) => r.sku === "LIFE-ADULT")).toBeUndefined();
  });

  it("không có ca cần y tế thì bộ sơ cứu không nằm trong danh sách", () => {
    // Trước đây dòng này vẫn hiện với "đáp ứng 0/0, thiếu 0" ở mọi bảng.
    const reqs = computeRequirements(flood({ medicalSupportCases: 0 }));
    expect(reqs.find((r) => r.sku === "FIRSTAID-01")).toBeUndefined();
    expect(reqs.every((r) => r.required > 0)).toBe(true);
  });

  it("should compute child vest per child", () => {
    const reqs = computeRequirements(flood({ children: 20 }));
    expect(reqs.find((r) => r.sku === "LIFE-CHILD")?.required).toBe(20);
  });

  it("nước đếm theo CHAI 1,5 lít, định mức 1 chai/người/ngày (48h = 2 ngày)", () => {
    // Nước UỐNG đóng chai: 1,5 lít/người/ngày, tức đúng MỘT chai 1,5 lít mỗi
    // người mỗi ngày — phần nước cầm tay phát tận nơi, không phải toàn bộ nước
    // sinh hoạt (phần đó do bồn, giếng và can 20 lít gánh).
    // 1 chai/người/ngày * 100 người * 2 ngày = 200 chai.
    const reqs = computeRequirements(flood({ affectedPeople: 100, durationHours: 48 }));
    expect(reqs.find((r) => r.sku === "WATER-01")?.required).toBe(200);
    expect(reqs.find((r) => r.sku === "WATER-01")?.unit).toBe("chai");
  });

  it("should round duration up to full days", () => {
    const reqs = computeRequirements(flood({ affectedPeople: 10, durationHours: 25 }));
    // 25h → 2 ngày → 1 chai * 10 người * 2 ngày = 20 chai
    expect(reqs.find((r) => r.sku === "WATER-01")?.required).toBe(20);
  });

  it("cháy cũng 1,5 lít/người/ngày → 1 chai 1,5 lít cho một người một ngày", () => {
    // Nhu cầu UỐNG là nhu cầu sinh tồn, không đổi theo loại thiên tai; phần khác
    // nhau giữa các tình huống nằm ở số ngày. Định mức luôn ceil: làm tròn xuống
    // là cấp thiếu nước cho người thật.
    const reqs = computeRequirements({
      incidentType: IncidentType.FIRE,
      affectedPeople: 1,
      durationHours: 24,
      children: 0,
      elderly: 0,
      medicalSupportCases: 0,
    });
    expect(reqs.find((r) => r.sku === "WATER-01")?.required).toBe(1);
  });

  it("should round requirements up (ceil) for safety", () => {
    // torch 0.1/person * 15 người = 1.5 → ceil 2
    const reqs = computeRequirements(flood({ affectedPeople: 15 }));
    expect(reqs.find((r) => r.sku === "TORCH-01")?.required).toBe(2);
  });
});

describe("allocateGreedy (FEFO)", () => {
  const req: Requirement = { sku: "WATER-01", itemName: "Nước", unit: "chai", required: 100 };

  it("should take from earliest-expiry batch first", () => {
    const batches: AvailableBatch[] = [
      { batchId: "b-late", sku: "WATER-01", quantity: 80, expiryDate: new Date("2027-01-01") },
      { batchId: "b-soon", sku: "WATER-01", quantity: 80, expiryDate: new Date("2026-08-01") },
    ];
    const result = allocateGreedy(req, batches);
    expect(result.batches[0].batchId).toBe("b-soon"); // gần hết hạn trước
    expect(result.allocated).toBe(100);
    expect(result.shortage).toBe(0);
  });

  it("should report shortage when not enough stock", () => {
    const batches: AvailableBatch[] = [
      { batchId: "b1", sku: "WATER-01", quantity: 60, expiryDate: null },
    ];
    const result = allocateGreedy(req, batches);
    expect(result.allocated).toBe(60);
    expect(result.shortage).toBe(40);
  });

  it("should not exceed stock (never over-allocate)", () => {
    const batches: AvailableBatch[] = [
      { batchId: "b1", sku: "WATER-01", quantity: 30, expiryDate: null },
      { batchId: "b2", sku: "WATER-01", quantity: 30, expiryDate: null },
    ];
    const result = allocateGreedy(req, batches);
    const totalPicked = result.batches.reduce((s, b) => s + b.qty, 0);
    expect(totalPicked).toBe(60); // chỉ lấy đúng tồn, không quá
    expect(result.allocated).toBe(60);
  });

  it("should ignore batches of other SKU", () => {
    const batches: AvailableBatch[] = [
      { batchId: "other", sku: "TORCH-01", quantity: 100, expiryDate: null },
    ];
    const result = allocateGreedy(req, batches);
    expect(result.allocated).toBe(0);
    expect(result.shortage).toBe(100);
  });

  it("should place no-expiry batches last", () => {
    const batches: AvailableBatch[] = [
      { batchId: "b-noexp", sku: "WATER-01", quantity: 50, expiryDate: null },
      { batchId: "b-exp", sku: "WATER-01", quantity: 50, expiryDate: new Date("2026-08-01") },
    ];
    const result = allocateGreedy({ ...req, required: 60 }, batches);
    expect(result.batches[0].batchId).toBe("b-exp"); // có hạn dùng trước
  });
});

describe("allocateGreedy (K1 — kho gần điểm nạn trước)", () => {
  const req: Requirement = { sku: "WATER-01", itemName: "Nước", unit: "lít", required: 100 };

  it("lấy kho thôn GẦN trước, tràn sang kho tổng xa", () => {
    const batches: AvailableBatch[] = [
      {
        batchId: "central",
        sku: "WATER-01",
        quantity: 500,
        expiryDate: null,
        warehouseName: "Kho tổng",
        distanceKm: 12,
      },
      {
        batchId: "hamlet",
        sku: "WATER-01",
        quantity: 60,
        expiryDate: null,
        warehouseName: "Kho thôn A",
        distanceKm: 2,
      },
    ];
    const result = allocateGreedy(req, batches);
    // Kho thôn gần (2km) lấy trước hết 60, còn 40 lấy kho tổng (12km).
    expect(result.batches[0].warehouseName).toBe("Kho thôn A");
    expect(result.batches[0].qty).toBe(60);
    expect(result.batches[1].warehouseName).toBe("Kho tổng");
    expect(result.batches[1].qty).toBe(40);
    expect(result.shortage).toBe(0);
  });

  it("khoảng cách ưu tiên hơn FEFO giữa các kho", () => {
    const batches: AvailableBatch[] = [
      // Kho xa có hạn gần hơn, nhưng kho gần vẫn được lấy trước.
      {
        batchId: "far-soon",
        sku: "WATER-01",
        quantity: 50,
        expiryDate: new Date("2026-08-01"),
        distanceKm: 10,
      },
      {
        batchId: "near-late",
        sku: "WATER-01",
        quantity: 50,
        expiryDate: new Date("2027-01-01"),
        distanceKm: 1,
      },
    ];
    const result = allocateGreedy({ ...req, required: 50 }, batches);
    expect(result.batches[0].batchId).toBe("near-late"); // gần thắng
  });
});

describe("overallFulfillment (min = weakest link)", () => {
  const alloc = (sku: string, required: number, allocated: number) => ({
    sku,
    itemName: sku,
    unit: "x",
    required,
    allocated,
    shortage: Math.max(0, required - allocated),
    batches: [],
  });

  it("should return the minimum ratio, not average", () => {
    // áo phao 100% nhưng nước 60% → đáp ứng = 60 (mắt xích yếu)
    const result = overallFulfillment([alloc("LIFE-ADULT", 100, 100), alloc("WATER-01", 100, 60)]);
    expect(result).toBe(60);
  });

  it("should return 100 when everything fully allocated", () => {
    expect(overallFulfillment([alloc("A", 50, 50), alloc("B", 20, 20)])).toBe(100);
  });

  it("should ignore zero-requirement items", () => {
    const result = overallFulfillment([alloc("A", 100, 100), alloc("B", 0, 0)]);
    expect(result).toBe(100);
  });
});

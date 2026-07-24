import { computeForecast, ExportTxn, StockLevel } from "../forecast";

const NOW = new Date("2026-07-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("computeForecast (dự báo thống kê: EWMA + độ lệch chuẩn)", () => {
  it("nhu cầu ĐỀU → EWMA = trung bình, không biến động, khoảng tin cậy thu về 1 điểm", () => {
    // Xuất 5 mỗi ngày suốt 10 ngày → chuỗi phẳng: EWMA hội tụ về đúng 5, std = 0.
    const exports: ExportTxn[] = Array.from({ length: 10 }, (_, n) => ({
      sku: "A",
      itemName: "Item A",
      quantity: 5,
      createdAt: daysAgo(n),
    }));
    const stock: StockLevel[] = [{ sku: "A", itemName: "Item A", quantity: 100 }];
    const r = computeForecast(exports, stock, 10, NOW)[0];

    expect(r.avgPerDay).toBe(5); // số tham chiếu giữ nguyên
    expect(r.ewmaPerDay).toBeCloseTo(5, 6);
    expect(r.dailyStdDev).toBeCloseTo(0, 6);
    expect(r.daysLeft).toBeCloseTo(20, 6); // 100/5
    expect(r.daysLeftLow).toBeCloseTo(20, 6);
    expect(r.daysLeftHigh).toBeCloseTo(20, 6);
    expect(r.reorderPoint).toBeCloseTo(15, 6); // 5·3 + 1.28·0·√3
    expect(r.confidence).toBe(1); // 10 ngày có xuất ≥ 8
    expect(r.lowStock).toBe(false); // tồn 100 > 15
  });

  it("EWMA NHẠY xu hướng gần: cùng tổng, xuất gần đây → tốc độ cao hơn, cạn nhanh hơn", () => {
    const recent: ExportTxn[] = [
      { sku: "R", itemName: "Recent", quantity: 20, createdAt: daysAgo(1) },
    ];
    const old: ExportTxn[] = [{ sku: "O", itemName: "Old", quantity: 20, createdAt: daysAgo(8) }];
    const stock: StockLevel[] = [
      { sku: "R", itemName: "Recent", quantity: 60 },
      { sku: "O", itemName: "Old", quantity: 60 },
    ];
    const r = computeForecast([...recent, ...old], stock, 10, NOW);
    const R = r.find((x) => x.sku === "R")!;
    const O = r.find((x) => x.sku === "O")!;

    expect(R.avgPerDay).toBe(2); // trung bình phẳng BẰNG nhau
    expect(O.avgPerDay).toBe(2);
    expect(R.ewmaPerDay).toBeGreaterThan(O.ewmaPerDay); // nhưng EWMA khác hẳn
    expect(R.ewmaPerDay).toBeCloseTo(4.55, 2); // 0.35·20 rồi ·0.65 một bước
    expect(R.daysLeft!).toBeLessThan(O.daysLeft!); // xuất gần → dự báo cạn sớm hơn
  });

  it("SKU biến động → daysLeftLow ≤ daysLeft ≤ daysLeftHigh và reorderPoint có đệm an toàn", () => {
    const exports: ExportTxn[] = [
      { sku: "V", itemName: "Volatile", quantity: 30, createdAt: daysAgo(1) },
      { sku: "V", itemName: "Volatile", quantity: 6, createdAt: daysAgo(4) },
    ];
    const stock: StockLevel[] = [{ sku: "V", itemName: "Volatile", quantity: 50 }];
    const r = computeForecast(exports, stock, 10, NOW)[0];

    expect(r.dailyStdDev).toBeGreaterThan(0);
    expect(r.daysLeftLow!).toBeLessThan(r.daysLeft!);
    expect(r.daysLeft!).toBeLessThan(r.daysLeftHigh!);
    // reorderPoint = ewma·L + z·std·√L: có std nên lớn hơn hẳn nhu cầu lead-time trơn.
    expect(r.reorderPoint).toBeGreaterThan(r.ewmaPerDay * 3);
  });

  it("ít ngày dữ liệu → confidence THẤP (UI nói 'chưa đủ dữ liệu')", () => {
    const exports: ExportTxn[] = [
      { sku: "A", itemName: "Item A", quantity: 12, createdAt: daysAgo(1) },
    ];
    const stock: StockLevel[] = [{ sku: "A", itemName: "Item A", quantity: 40 }];
    const r = computeForecast(exports, stock, 30, NOW)[0];
    expect(r.confidence).toBeCloseTo(1 / 8, 6); // đúng 1 ngày có xuất
    expect(r.confidence).toBeLessThan(0.3);
  });

  it("đánh dấu lowStock khi tồn ≤ điểm đặt hàng lại", () => {
    // Nhu cầu đều 5/ngày → reorderPoint = 15; tồn 10 ≤ 15 → cần bổ sung.
    const exports: ExportTxn[] = Array.from({ length: 10 }, (_, n) => ({
      sku: "A",
      itemName: "Item A",
      quantity: 5,
      createdAt: daysAgo(n),
    }));
    const stock: StockLevel[] = [{ sku: "A", itemName: "Item A", quantity: 10 }];
    const r = computeForecast(exports, stock, 10, NOW)[0];
    expect(r.reorderPoint).toBeCloseTo(15, 6);
    expect(r.lowStock).toBe(true);
    expect(r.daysLeft).toBeCloseTo(2, 6);
  });

  it("bỏ qua export ngoài windowDays", () => {
    const exports: ExportTxn[] = [
      { sku: "A", itemName: "Item A", quantity: 100, createdAt: daysAgo(20) },
    ];
    const stock: StockLevel[] = [{ sku: "A", itemName: "Item A", quantity: 50 }];
    const r = computeForecast(exports, stock, 10, NOW)[0];
    expect(r.ewmaPerDay).toBe(0);
    expect(r.avgPerDay).toBe(0);
    expect(r.daysLeft).toBeNull();
    expect(r.daysLeftLow).toBeNull();
    expect(r.daysLeftHigh).toBeNull();
    expect(r.lowStock).toBe(false);
  });

  it("SKU chưa từng xuất → daysLeft null, không lowStock", () => {
    const stock: StockLevel[] = [{ sku: "B", itemName: "Item B", quantity: 5 }];
    const r = computeForecast([], stock, 7, NOW)[0];
    expect(r.ewmaPerDay).toBe(0);
    expect(r.daysLeft).toBeNull();
    expect(r.daysLeftLow).toBeNull();
    expect(r.daysLeftHigh).toBeNull();
    expect(r.lowStock).toBe(false);
  });

  it("SKU có lịch sử xuất nhưng đã cạn sạch (không còn trong stock) → daysLeft 0, lowStock", () => {
    const exports: ExportTxn[] = [
      { sku: "C", itemName: "Item C", quantity: 20, createdAt: daysAgo(1) },
    ];
    const result = computeForecast(exports, [], 10, NOW); // stock rỗng: SKU C hết batch
    const c = result.find((r) => r.sku === "C")!;
    expect(c.quantity).toBe(0);
    expect(c.daysLeft).toBe(0);
    expect(c.daysLeftLow).toBe(0);
    expect(c.lowStock).toBe(true);
    expect(c.itemName).toBe("Item C"); // tên lấy từ lịch sử xuất
  });
});

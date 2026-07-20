import { computeForecast, ExportTxn, StockLevel } from "../forecast";

const NOW = new Date("2026-07-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("computeForecast", () => {
  it("tính avgPerDay và daysLeft đúng", () => {
    const exports: ExportTxn[] = [
      { sku: "A", itemName: "Item A", quantity: 10, createdAt: daysAgo(1) },
      { sku: "A", itemName: "Item A", quantity: 10, createdAt: daysAgo(5) },
    ];
    const stock: StockLevel[] = [{ sku: "A", itemName: "Item A", quantity: 100 }];
    const result = computeForecast(exports, stock, 10, NOW);
    expect(result[0].avgPerDay).toBe(2); // 20/10
    expect(result[0].daysLeft).toBe(50); // 100/2
    expect(result[0].lowStock).toBe(false);
  });

  it("bỏ qua export ngoài windowDays", () => {
    const exports: ExportTxn[] = [{ sku: "A", itemName: "Item A", quantity: 100, createdAt: daysAgo(20) }];
    const stock: StockLevel[] = [{ sku: "A", itemName: "Item A", quantity: 50 }];
    const result = computeForecast(exports, stock, 10, NOW);
    expect(result[0].avgPerDay).toBe(0);
    expect(result[0].daysLeft).toBeNull();
  });

  it("đánh dấu lowStock khi daysLeft < 7", () => {
    const exports: ExportTxn[] = [{ sku: "A", itemName: "Item A", quantity: 70, createdAt: daysAgo(1) }];
    const stock: StockLevel[] = [{ sku: "A", itemName: "Item A", quantity: 30 }];
    const result = computeForecast(exports, stock, 7, NOW);
    // avgPerDay = 10, daysLeft = 3
    expect(result[0].lowStock).toBe(true);
  });

  it("SKU chưa từng xuất → daysLeft null, không lowStock", () => {
    const stock: StockLevel[] = [{ sku: "B", itemName: "Item B", quantity: 5 }];
    const result = computeForecast([], stock, 7, NOW);
    expect(result[0].daysLeft).toBeNull();
    expect(result[0].lowStock).toBe(false);
  });

  it("SKU có lịch sử xuất nhưng đã cạn sạch (không còn trong stock) → daysLeft 0, lowStock", () => {
    const exports: ExportTxn[] = [{ sku: "C", itemName: "Item C", quantity: 20, createdAt: daysAgo(1) }];
    const result = computeForecast(exports, [], 10, NOW); // stock rỗng: SKU C hết batch
    const c = result.find((r) => r.sku === "C")!;
    expect(c.quantity).toBe(0);
    expect(c.daysLeft).toBe(0);
    expect(c.lowStock).toBe(true);
    expect(c.itemName).toBe("Item C"); // tên lấy từ lịch sử xuất
  });
});

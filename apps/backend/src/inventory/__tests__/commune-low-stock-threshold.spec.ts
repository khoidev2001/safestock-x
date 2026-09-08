import { InventoryService } from "../inventory.service";

/**
 * Ngưỡng "còn ít" chỉ áp cho HÀNG TIÊU HAO.
 *
 * Thiết bị tái sử dụng — xuồng cứu hộ, áo phao, bộ đàm — xuất đi là cho mượn rồi
 * thu về, nên số tồn của chúng vốn nhỏ: sáu chiếc xuồng cho cả xã là đủ dùng chứ
 * không phải sắp hết. Đo chúng bằng cùng con số mười của thùng mì thì bảng lúc
 * nào cũng có mấy dòng thiết bị nằm đó mà đọc mãi không thấy phải làm gì.
 */
describe("InventoryService.communeLowStock", () => {
  function buildPrisma(batches: unknown[]) {
    return {
      user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1", kind: "CENTRAL" }),
      },
      itemBatch: { findMany: jest.fn().mockResolvedValue(batches) },
    };
  }

  it("hỏi hàng tiêu hao theo ngưỡng, thiết bị tái sử dụng chỉ khi đã về 0", async () => {
    const prisma = buildPrisma([]);
    const service = new InventoryService(prisma as never, {} as never);

    await service.communeLowStock("kho-tong", null, "admin-1", 10);

    expect(prisma.itemBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { item: { consumable: true }, quantity: { lte: 10 } },
            { item: { consumable: false }, quantity: { lte: 0 } },
          ],
        }),
      }),
    );
  });

  it("trả kèm `consumable` để màn hình nói đúng 'còn ít' hay 'đã hết sạch'", async () => {
    const prisma = buildPrisma([
      {
        id: "lo-xuong",
        batchCode: "BOAT-2024",
        quantity: 0,
        item: {
          name: "Xuồng cứu hộ",
          sku: "BOAT-01",
          consumable: false,
          category: { unit: "chiếc" },
        },
        shelf: {
          code: "K1",
          zone: { name: "Khu B", warehouse: { id: "kho-tong", name: "Kho xã" } },
        },
      },
    ]);
    const service = new InventoryService(prisma as never, {} as never);

    const result = await service.communeLowStock("kho-tong", null, "admin-1", 10);

    expect(result.items).toEqual([
      {
        batchId: "lo-xuong",
        batchCode: "BOAT-2024",
        sku: "BOAT-01",
        itemName: "Xuồng cứu hộ",
        unit: "chiếc",
        consumable: false,
        quantity: 0,
        warehouseId: "kho-tong",
        warehouseName: "Kho xã",
        zoneName: "Khu B",
        shelfCode: "K1",
      },
    ]);
  });
});

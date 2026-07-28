import { buildCatalogSemanticText, lexicalCatalogScore } from "../inventory-semantic";
import { InventorySemanticService } from "../inventory-semantic.service";

describe("catalog semantic input", () => {
  it("bổ sung công dụng có kiểm soát để embedding hiểu tên vật tư ngắn", () => {
    const text = buildCatalogSemanticText({
      sku: "BLANKET-01",
      name: "Chăn cứu trợ",
      categoryName: "Che chắn khẩn cấp",
      unit: "tấm",
    });
    expect(text).toContain("Chăn cứu trợ");
    expect(text).toContain("giữ ấm");
    expect(text).toContain("trẻ em");
  });

  it("fallback lexical vẫn tìm được công dụng nhưng được gắn mode riêng ở service", () => {
    const candidate = buildCatalogSemanticText({
      sku: "BLANKET-01",
      name: "Chăn cứu trợ",
      categoryName: "Che chắn khẩn cấp",
      unit: "tấm",
    });
    expect(lexicalCatalogScore("đồ giữ ấm cho trẻ", candidate)).toBeGreaterThan(0);
    expect(lexicalCatalogScore("thuốc insulin", candidate)).toBe(0);
  });
  it("scopes normalization candidates to the actor's organization", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      item: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const ai = {
      semanticRank: jest.fn().mockResolvedValue({
        available: false,
        reason: "embedding_unavailable",
        hits: [],
      }),
    };
    const service = new InventorySemanticService(prisma as never, ai as never);

    await service.normalizeInput("user-1", "áo nổi", 5);

    expect(prisma.item.findMany).toHaveBeenCalledWith({
      where: {
        batches: {
          some: {
            shelf: {
              zone: {
                warehouse: { organizationId: "org-1" },
              },
            },
          },
        },
      },
      include: { category: true },
      orderBy: { sku: "asc" },
    });
  });
});

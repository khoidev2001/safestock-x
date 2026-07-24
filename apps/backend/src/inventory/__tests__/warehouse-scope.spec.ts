import { ForbiddenException } from "@nestjs/common";
import { assertBatchInScope } from "../warehouse-scope";

// Prisma giả: chỉ cần itemBatch.findUnique trả warehouseId của batch.
function fakePrisma(batchWarehouseId: string | null) {
  return {
    itemBatch: {
      findUnique: async () =>
        batchWarehouseId ? { shelf: { zone: { warehouseId: batchWarehouseId } } } : null,
    },
  } as never;
}

describe("assertBatchInScope (chống IDOR)", () => {
  it("scope null (quản toàn xã) → cho qua mọi kho", async () => {
    await expect(assertBatchInScope(fakePrisma("kho-B"), null, "b1")).resolves.toBeUndefined();
  });

  it("trưởng thôn thao tác đúng kho mình → cho qua", async () => {
    await expect(assertBatchInScope(fakePrisma("kho-A"), "kho-A", "b1")).resolves.toBeUndefined();
  });

  it("trưởng thôn A gọi batch kho B → 403 Forbidden", async () => {
    await expect(assertBatchInScope(fakePrisma("kho-B"), "kho-A", "b1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("batch không tồn tại + user bị scope → 403 (không rò rỉ)", async () => {
    await expect(assertBatchInScope(fakePrisma(null), "kho-A", "b1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

import { ForbiddenException } from "@nestjs/common";
import {
  assertActorCanAccessBatch,
  assertBatchInScope,
} from "../warehouse-scope";

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

describe("assertActorCanAccessBatch (organization boundary)", () => {
  function scopedPrisma(actorOrganizationId: string, batchOrganizationId: string) {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: actorOrganizationId,
        }),
      },
      itemBatch: {
        findUnique: jest.fn().mockResolvedValue({
          shelf: {
            zone: {
              warehouseId: "warehouse-1",
              warehouse: { organizationId: batchOrganizationId },
            },
          },
        }),
      },
    } as never;
  }

  it("allows a batch in the actor organization", async () => {
    await expect(
      assertActorCanAccessBatch(
        scopedPrisma("org-1", "org-1"),
        "user-1",
        null,
        "batch-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects an admin-style unassigned actor from another organization", async () => {
    await expect(
      assertActorCanAccessBatch(
        scopedPrisma("org-1", "org-2"),
        "user-1",
        null,
        "batch-foreign",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

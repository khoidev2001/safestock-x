import { Injectable, NotFoundException } from "@nestjs/common";
import { LoanStatus } from "@prisma/client";
import { AiClientService } from "../ai/ai-client.service";
import { PrismaService } from "../prisma/prisma.service";
import { buildCatalogSemanticText, lexicalCatalogScore } from "./inventory-semantic";
import { assertActorCanAccessWarehouse, assertWarehouseInScope } from "./warehouse-scope";

interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  unit: string;
  availableQuantity?: number;
}

@Injectable()
export class InventorySemanticService {
  constructor(
    private prisma: PrismaService,
    private ai: AiClientService,
  ) {}

  async searchWarehouse(
    warehouseId: string,
    scopeWarehouseId: string | null | undefined,
    query: string,
    limit: number,
    actorUserId?: string,
  ) {
    if (actorUserId) {
      await assertActorCanAccessWarehouse(this.prisma, actorUserId, scopeWarehouseId, warehouseId);
    } else {
      assertWarehouseInScope(scopeWarehouseId, warehouseId);
    }
    const batches = await this.prisma.itemBatch.findMany({
      where: {
        shelf: { zone: { warehouseId } },
        circulation: "IN_STOCK",
      },
      include: {
        item: { include: { category: true } },
        loans: {
          where: { status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] } },
        },
      },
    });
    const byItem = new Map<string, CatalogItem>();
    for (const batch of batches) {
      const onLoan = batch.loans.reduce(
        (sum, loan) => sum + loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost,
        0,
      );
      const current = byItem.get(batch.itemId) ?? {
        id: batch.item.id,
        sku: batch.item.sku,
        name: batch.item.name,
        categoryName: batch.item.category.name,
        unit: batch.item.category.unit,
        availableQuantity: 0,
      };
      current.availableQuantity =
        (current.availableQuantity ?? 0) + Math.max(0, batch.quantity - onLoan);
      byItem.set(batch.itemId, current);
    }
    return this.rankCatalog(query, [...byItem.values()], limit, 0.32);
  }

  async normalizeInput(actorUserId: string, name: string, limit: number) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người thao tác");
    const items = await this.prisma.item.findMany({
      where: {
        batches: {
          some: {
            shelf: {
              zone: {
                warehouse: { organizationId: actor.organizationId },
              },
            },
          },
        },
      },
      include: { category: true },
      orderBy: { sku: "asc" },
    });
    const catalog: CatalogItem[] = items.map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      categoryName: item.category.name,
      unit: item.category.unit,
    }));
    const ranked = await this.rankCatalog(name, catalog, limit, 0.38);
    return {
      ...ranked,
      input: name,
      reviewRequired: true,
      autoApplied: false,
    };
  }

  private async rankCatalog(
    query: string,
    catalog: CatalogItem[],
    limit: number,
    minScore: number,
  ) {
    const cappedLimit = Math.max(1, Math.min(10, limit));
    const textById = new Map(catalog.map((item) => [item.id, buildCatalogSemanticText(item)]));
    try {
      const ranking = await this.ai.semanticRank(
        query,
        catalog.map((item) => ({ id: item.id, text: textById.get(item.id)! })),
        { topK: cappedLimit, minScore },
      );
      if (ranking.available) {
        const byId = new Map(catalog.map((item) => [item.id, item]));
        return {
          available: true,
          mode: "EMBEDDING" as const,
          reason: null,
          results: ranking.hits.flatMap((hit) => {
            const item = byId.get(hit.id);
            return item ? [{ ...item, score: hit.score }] : [];
          }),
        };
      }
    } catch {
      // AiClient đã log lỗi kết nối. Phần đọc kho vẫn phải degrade an toàn.
    }

    const results = catalog
      .map((item) => ({
        ...item,
        score: lexicalCatalogScore(query, textById.get(item.id)!),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.sku.localeCompare(right.sku))
      .slice(0, cappedLimit);
    return {
      available: false,
      mode: "LEXICAL_FALLBACK" as const,
      reason: "embedding_unavailable",
      results,
    };
  }
}

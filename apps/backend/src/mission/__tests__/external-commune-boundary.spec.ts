import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MissionService } from "../mission.service";

const EXTERNAL_COMMUNES = [
  "Xuân Thọ",
  "Tuy An Bắc",
  "Tuy An Tây",
  "Xuân Lãnh",
  "Phú Mỡ",
  "Xuân Phước",
];

describe("external surrounding-commune boundary", () => {
  it("seeds exactly the verified communes without stock claims or embedded phone numbers", () => {
    const source = readFileSync(join(__dirname, "../../../prisma/seed.ts"), "utf8");
    expect(source).toContain("config({ path: resolveEnvFilePaths() })");
    const block = source.slice(
      source.indexOf("async function seedNeighbors"),
      source.indexOf("function legacyStatus"),
    );

    for (const commune of EXTERNAL_COMMUNES) expect(block).toContain(`"${commune}"`);
    expect(block.match(/\[EXTERNAL\/MANUALLY REPORTED\]/g)).toHaveLength(1);
    expect(block).toContain("contactInfo: getVerifiedNeighborContact(commune)");
    expect(block).toContain("summary: []");
    expect(block).not.toContain("Xuân Sơn");
    expect(block).not.toContain("Sông Cầu");
    expect(block).not.toMatch(/quantity:\s*[1-9]/);
    expect(block).not.toMatch(/0\d{8,}/);
  });

  it("does not read NeighborWarehouse rows into the operational batch pool", async () => {
    const neighborWarehouse = { findMany: jest.fn() };
    const prisma = {
      warehouse: { findMany: jest.fn().mockResolvedValue([]) },
      itemBatch: { findMany: jest.fn().mockResolvedValue([]) },
      neighborWarehouse,
    };
    const service = new MissionService(
      prisma as never,
      { distanceAndEta: jest.fn() } as never,
      {} as never,
      {} as never,
      { getWarehouseScore: jest.fn() } as never,
      {} as never,
    );

    const pool = await (
      service as unknown as {
        loadClusterBatches: (
          organizationId: string,
          communeId: string,
          skus: string[],
        ) => Promise<{ available: unknown[] }>;
      }
    ).loadClusterBatches("org-1", "dong-xuan", ["WATER-01"]);

    expect(pool.available).toEqual([]);
    expect(prisma.warehouse.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", communeId: "dong-xuan" },
    });
    expect(neighborWarehouse.findMany).not.toHaveBeenCalled();
  });

  it("cannot turn empty external summaries into allocation suggestions", () => {
    const service = new MissionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const externalRows = EXTERNAL_COMMUNES.map((commune) => ({
      name: `[EXTERNAL/MANUALLY REPORTED] Xã ${commune}`,
      distanceKm: 0,
      summary: [],
    }));

    const suggestions = (
      service as unknown as {
        suggestNeighbors: (
          sku: string,
          shortage: number,
          neighbors: typeof externalRows,
        ) => unknown[];
      }
    ).suggestNeighbors("WATER-01", 100, externalRows);

    expect(suggestions).toEqual([]);
  });
});

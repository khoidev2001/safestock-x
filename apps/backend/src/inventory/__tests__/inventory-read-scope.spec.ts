import { ForbiddenException } from "@nestjs/common";
import { InventoryController } from "../inventory.controller";
import { ReadinessController } from "../../readiness/readiness.controller";

describe("mobile/web warehouse read scope", () => {
  it("forward scope JWT vào tree, batches và QR scan", async () => {
    const inv = {
      tree: jest.fn().mockResolvedValue({}),
      listBatches: jest.fn().mockResolvedValue([]),
      scanBySku: jest.fn().mockResolvedValue({}),
      listCatalog: jest.fn().mockResolvedValue([]),
      listTransactions: jest.fn().mockResolvedValue([]),
      transferDestinations: jest.fn().mockResolvedValue([]),
    };
    const controller = new InventoryController(inv as never, {} as never, {} as never);
    const request = {
      user: { userId: "user-1", warehouseId: "warehouse-a" },
    } as never;

    await controller.tree(request, "warehouse-a");
    await controller.batches(request, "warehouse-a");
    await controller.scan(request, "LIFE-CHILD");
    await controller.catalog(request);
    await controller.transactions(request, "warehouse-a", { limit: 50 });
    await controller.transferDestinations(request, "warehouse-a");

    expect(inv.tree).toHaveBeenCalledWith("warehouse-a", "warehouse-a", "user-1");
    expect(inv.listBatches).toHaveBeenCalledWith("warehouse-a", "warehouse-a", "user-1");
    expect(inv.scanBySku).toHaveBeenCalledWith("LIFE-CHILD", "warehouse-a", "user-1");
    expect(inv.listCatalog).toHaveBeenCalledWith("user-1");
    expect(inv.listTransactions).toHaveBeenCalledWith("warehouse-a", "warehouse-a", "user-1", 50);
    expect(inv.transferDestinations).toHaveBeenCalledWith("warehouse-a", "warehouse-a", "user-1");
  });

  it("chặn readiness kho khác trước khi query", () => {
    const readiness = { getWarehouseScore: jest.fn() };
    const controller = new ReadinessController(readiness as never, {} as never);

    expect(() =>
      controller.get(
        { user: { userId: "user-1", warehouseId: "warehouse-a" } } as never,
        "warehouse-b",
      ),
    ).toThrow(ForbiddenException);
    expect(readiness.getWarehouseScore).not.toHaveBeenCalled();
  });

  it("chặn readiness zone nếu kết quả thuộc kho khác", async () => {
    const readiness = {
      getScore: jest.fn().mockResolvedValue({ warehouseId: "warehouse-b" }),
    };
    const controller = new ReadinessController(readiness as never, {} as never);

    await expect(
      controller.getZone(
        { user: { userId: "user-1", warehouseId: "warehouse-a" } } as never,
        "zone-b",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("chặn ADMIN đọc readiness kho ngoài organization dù JWT không gắn warehouse", async () => {
    const readiness = {
      getWarehouseScore: jest.fn().mockResolvedValue({ warehouseId: "warehouse-b" }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-a" }),
      },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-b" }),
      },
    };
    const controller = new ReadinessController(readiness as never, prisma as never);

    await expect(
      controller.get({ user: { userId: "admin-a", warehouseId: null } } as never, "warehouse-b"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(readiness.getWarehouseScore).not.toHaveBeenCalled();
  });
});

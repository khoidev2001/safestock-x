import { UserRole } from "@prisma/client";
import { randomBytes } from "crypto";
import {
  applyHamletProvision,
  buildHamletProvisionPlan,
  findProvisionPlan,
  getProvisionSecrets,
  provisionHamletAccounts,
  REPORTER_PASSWORD_ENV,
  WAREHOUSE_PASSWORD_ENV,
} from "../../../prisma/provision-reporter";

const warehouses = [
  { id: "warehouse-a", organizationId: "org-a", name: "Kho Tân Bình", locationKey: "tan-binh" },
  { id: "warehouse-b", organizationId: "org-a", name: "Kho Phước Lộc", locationKey: "phuoc-loc" },
];

describe("per-hamlet account provisioner guards", () => {
  it("builds one REPORTER and one WAREHOUSE target per stable location key", () => {
    expect(buildHamletProvisionPlan(warehouses, [])).toEqual({
      ok: true,
      targets: [
        expect.objectContaining({ login: "tanbinh_baocao", role: UserRole.REPORTER, warehouseId: "warehouse-a" }),
        expect.objectContaining({ login: "khotanbinh", role: UserRole.WAREHOUSE, warehouseId: "warehouse-a" }),
        expect.objectContaining({ login: "phuocloc_baocao", role: UserRole.REPORTER, warehouseId: "warehouse-b" }),
        expect.objectContaining({ login: "khophuocloc", role: UserRole.WAREHOUSE, warehouseId: "warehouse-b" }),
      ],
    });
  });

  it.each([
    ["no hamlets", [], [], "NO_HAMLETS"],
    ["missing key", [{ ...warehouses[0], locationKey: null }], [], "INVALID_LOCATION_KEY"],
    ["duplicate key", [warehouses[0], { ...warehouses[1], locationKey: "tan-binh" }], [], "DUPLICATE_LOCATION_KEY"],
    [
      "login collision",
      [warehouses[0]],
      [{ id: "wrong", email: "tanbinh_baocao", role: UserRole.ADMIN, organizationId: "org-a", warehouseId: null }],
      "LOGIN_COLLISION",
    ],
  ] as const)("fails closed for %s", (_label, warehouseRows, users, reason) => {
    expect(buildHamletProvisionPlan([...warehouseRows], [...users])).toMatchObject({ ok: false, reason });
  });

  it("accepts already provisioned accounts only in their exact scope", () => {
    const users = [
      { id: "reporter-a", email: "tanbinh_baocao", role: UserRole.REPORTER, organizationId: "org-a", warehouseId: "warehouse-a" },
      { id: "warehouse-user-a", email: "khotanbinh", role: UserRole.WAREHOUSE, organizationId: "org-a", warehouseId: "warehouse-a" },
    ];
    expect(buildHamletProvisionPlan([warehouses[0]], users)).toMatchObject({
      ok: true,
      targets: [
        { existingUserId: "reporter-a" },
        { existingUserId: "warehouse-user-a" },
      ],
    });
  });

  it("reads both password inputs only from their configured environment keys", () => {
    const reporterRuntimeInput = randomBytes(18).toString("base64url");
    const warehouseRuntimeInput = randomBytes(18).toString("base64url");
    expect(
      getProvisionSecrets({
        [REPORTER_PASSWORD_ENV]: reporterRuntimeInput,
        [WAREHOUSE_PASSWORD_ENV]: warehouseRuntimeInput,
      }),
    ).toEqual({ reporterPassword: reporterRuntimeInput, warehousePassword: warehouseRuntimeInput });
    expect(getProvisionSecrets({ [REPORTER_PASSWORD_ENV]: reporterRuntimeInput })).toBeUndefined();
  });

  it("queries HAMLET warehouses then only the generated login identities", async () => {
    const prisma = {
      warehouse: { findMany: jest.fn().mockResolvedValue(warehouses) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await expect(findProvisionPlan(prisma as never)).resolves.toMatchObject({ ok: true });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { in: ["tanbinh_baocao", "khotanbinh", "phuocloc_baocao", "khophuocloc"] } },
      }),
    );
  });

  it("creates missing accounts atomically without changing warehouse or organization scope", async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => Promise<void>) => callback(tx)) };
    const plan = buildHamletProvisionPlan([warehouses[0]], []);
    if (!plan.ok) throw new Error("fixture plan invalid");
    await applyHamletProvision(prisma as never, plan, { reporter: "reporter-hash", warehouse: "warehouse-hash" });
    expect(tx.user.create).toHaveBeenCalledTimes(2);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "tanbinh_baocao",
        organizationId: "org-a",
        warehouseId: "warehouse-a",
        role: UserRole.REPORTER,
      }),
    });
  });

  it("hashes both runtime inputs only after the guarded plan succeeds", async () => {
    const reporterRuntimeInput = randomBytes(18).toString("base64url");
    const warehouseRuntimeInput = randomBytes(18).toString("base64url");
    const tx = { user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), updateMany: jest.fn() } };
    const prisma = {
      warehouse: { findMany: jest.fn().mockResolvedValue([warehouses[0]]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    };
    const hashPassword = jest.fn().mockResolvedValueOnce("reporter-hash").mockResolvedValueOnce("warehouse-hash");
    await provisionHamletAccounts(
      prisma as never,
      { reporterPassword: reporterRuntimeInput, warehousePassword: warehouseRuntimeInput },
      hashPassword,
    );
    expect(hashPassword).toHaveBeenCalledTimes(2);
    expect(tx.user.create).toHaveBeenCalledTimes(2);
  });
});

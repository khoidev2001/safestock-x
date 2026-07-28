import { config } from "dotenv";
import * as bcrypt from "bcryptjs";
import { PrismaClient, UserRole, WarehouseKind } from "@prisma/client";

const explicitEnvFile = process.env.SAFESTOCK_ENV_FILE?.trim();
config(explicitEnvFile ? { path: explicitEnvFile } : undefined);

export const REPORTER_PASSWORD_ENV = "SAFESTOCK_REPORTER_PASSWORD";
export const WAREHOUSE_PASSWORD_ENV = "SAFESTOCK_HAMLET_WAREHOUSE_PASSWORD";

export interface HamletProvisionWarehouse {
  id: string;
  organizationId: string;
  name: string;
  locationKey: string | null;
}

export interface HamletProvisionUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  warehouseId: string | null;
}

export interface HamletAccountTarget {
  login: string;
  role: UserRole;
  warehouseId: string;
  organizationId: string;
  fullName: string;
  existingUserId: string | null;
}

export type HamletProvisionPlan =
  | { ok: true; targets: HamletAccountTarget[] }
  | {
      ok: false;
      reason: "NO_HAMLETS" | "INVALID_LOCATION_KEY" | "DUPLICATE_LOCATION_KEY" | "LOGIN_COLLISION";
      detail?: string;
    };

export function reporterLoginForLocationKey(locationKey: string): string {
  return `${normalizeLocationKey(locationKey)}_baocao`;
}

export function warehouseLoginForLocationKey(locationKey: string): string {
  return `kho${normalizeLocationKey(locationKey)}`;
}

export function buildHamletProvisionPlan(
  warehouses: HamletProvisionWarehouse[],
  users: HamletProvisionUser[],
): HamletProvisionPlan {
  if (warehouses.length === 0) return { ok: false, reason: "NO_HAMLETS" };

  const seenKeys = new Set<string>();
  const loginOwner = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const targets: HamletAccountTarget[] = [];

  for (const warehouse of warehouses) {
    let normalizedKey: string;
    try {
      if (!warehouse.locationKey) throw new Error("missing");
      normalizedKey = normalizeLocationKey(warehouse.locationKey);
    } catch {
      return { ok: false, reason: "INVALID_LOCATION_KEY", detail: warehouse.id };
    }
    if (seenKeys.has(normalizedKey)) {
      return { ok: false, reason: "DUPLICATE_LOCATION_KEY", detail: normalizedKey };
    }
    seenKeys.add(normalizedKey);

    for (const role of [UserRole.REPORTER, UserRole.WAREHOUSE] as const) {
      const login =
        role === UserRole.REPORTER
          ? reporterLoginForLocationKey(normalizedKey)
          : warehouseLoginForLocationKey(normalizedKey);
      const existing = loginOwner.get(login);
      if (
        existing &&
        (existing.role !== role ||
          existing.organizationId !== warehouse.organizationId ||
          existing.warehouseId !== warehouse.id)
      ) {
        return { ok: false, reason: "LOGIN_COLLISION", detail: login };
      }
      targets.push({
        login,
        role,
        warehouseId: warehouse.id,
        organizationId: warehouse.organizationId,
        fullName:
          role === UserRole.REPORTER
            ? `Trưởng thôn ${hamletDisplayName(warehouse.name)}`
            : `Phụ trách ${warehouse.name}`,
        existingUserId: existing?.id ?? null,
      });
    }
  }
  return { ok: true, targets };
}

export function getProvisionSecrets(
  environment: NodeJS.ProcessEnv = process.env,
): { reporterPassword: string; warehousePassword: string } | undefined {
  const reporterPassword = environment[REPORTER_PASSWORD_ENV];
  const warehousePassword = environment[WAREHOUSE_PASSWORD_ENV];
  if (!reporterPassword?.trim() || !warehousePassword?.trim()) return undefined;
  return { reporterPassword, warehousePassword };
}

export async function findProvisionPlan(prisma: PrismaClient): Promise<HamletProvisionPlan> {
  const warehouses = await prisma.warehouse.findMany({
    where: { kind: WarehouseKind.HAMLET },
    select: { id: true, organizationId: true, name: true, locationKey: true },
    orderBy: [{ organizationId: "asc" }, { locationKey: "asc" }, { id: "asc" }],
  });
  const candidateLogins = warehouses.flatMap((warehouse) => {
    if (!warehouse.locationKey) return [];
    try {
      return [
        reporterLoginForLocationKey(warehouse.locationKey),
        warehouseLoginForLocationKey(warehouse.locationKey),
      ];
    } catch {
      return [];
    }
  });
  const users = candidateLogins.length
    ? await prisma.user.findMany({
        where: { email: { in: candidateLogins } },
        select: { id: true, email: true, role: true, organizationId: true, warehouseId: true },
      })
    : [];
  return buildHamletProvisionPlan(warehouses, users);
}

export async function applyHamletProvision(
  prisma: PrismaClient,
  plan: Extract<HamletProvisionPlan, { ok: true }>,
  passwordHashes: { reporter: string; warehouse: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const target of plan.targets) {
      const collision = await tx.user.findUnique({ where: { email: target.login } });
      if (
        collision &&
        (collision.id !== target.existingUserId ||
          collision.role !== target.role ||
          collision.organizationId !== target.organizationId ||
          collision.warehouseId !== target.warehouseId)
      ) {
        throw new Error("Không thể provision tài khoản thôn: LOGIN_COLLISION");
      }
      const passwordHash =
        target.role === UserRole.REPORTER ? passwordHashes.reporter : passwordHashes.warehouse;
      if (target.existingUserId) {
        const result = await tx.user.updateMany({
          where: {
            id: target.existingUserId,
            email: target.login,
            role: target.role,
            organizationId: target.organizationId,
            warehouseId: target.warehouseId,
          },
          data: { passwordHash, fullName: target.fullName },
        });
        if (result.count !== 1) {
          throw new Error("Không thể provision tài khoản thôn: dữ liệu đã thay đổi");
        }
      } else {
        await tx.user.create({
          data: {
            email: target.login,
            passwordHash,
            fullName: target.fullName,
            role: target.role,
            organizationId: target.organizationId,
            warehouseId: target.warehouseId,
          },
        });
      }
    }
  });
}

export async function provisionHamletAccounts(
  prisma: PrismaClient,
  secrets: { reporterPassword: string; warehousePassword: string },
  hashPassword: (value: string) => Promise<string> = (value) => bcrypt.hash(value, 12),
): Promise<void> {
  const plan = await findProvisionPlan(prisma);
  if (!plan.ok) throw new Error(`Không thể provision tài khoản thôn: ${plan.reason}`);
  if (!secrets.reporterPassword.trim() || !secrets.warehousePassword.trim()) {
    throw new Error("Mật khẩu runtime cho tài khoản thôn không được để trống");
  }
  const [reporter, warehouse] = await Promise.all([
    hashPassword(secrets.reporterPassword),
    hashPassword(secrets.warehousePassword),
  ]);
  await applyHamletProvision(prisma, plan, { reporter, warehouse });
}

async function run(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    console.log("Usage: ts-node prisma/provision-reporter.ts [--apply]");
    return;
  }
  const unknownArgs = [...args].filter((arg) => arg !== "--apply");
  if (unknownArgs.length > 0) throw new Error(`Tham số không hợp lệ: ${unknownArgs.join(", ")}`);

  const prisma = new PrismaClient();
  try {
    const plan = await findProvisionPlan(prisma);
    if (!plan.ok) throw new Error(`Không thể provision tài khoản thôn: ${plan.reason}`);
    if (!args.has("--apply")) {
      console.log(`DRY RUN — không ghi database; ${plan.targets.length} tài khoản hợp lệ`);
      return;
    }
    const secrets = getProvisionSecrets();
    if (!secrets) {
      throw new Error(
        `${REPORTER_PASSWORD_ENV} và ${WAREHOUSE_PASSWORD_ENV} phải được cung cấp qua môi trường`,
      );
    }
    await provisionHamletAccounts(prisma, secrets);
    console.log(`Đã provision ${plan.targets.length} tài khoản thôn`);
  } finally {
    await prisma.$disconnect();
  }
}

function normalizeLocationKey(locationKey: string): string {
  const normalized = locationKey.trim().toLowerCase().replace(/-/g, "");
  if (!/^[a-z0-9]+$/.test(normalized)) throw new Error("locationKey không hợp lệ");
  return normalized;
}

function hamletDisplayName(warehouseName: string): string {
  return warehouseName.replace(/^Kho\s+/i, "");
}

if (require.main === module) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Provision tài khoản thôn thất bại");
    process.exitCode = 1;
  });
}

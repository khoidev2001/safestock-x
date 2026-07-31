/**
 * Công cụ vận hành cho gateway phần cứng.
 *
 *   pnpm --filter @safestock/backend device:issue   -- --warehouse <id> --code gateway_a --name "Gateway kho"
 *   pnpm --filter @safestock/backend device:revoke  -- --id <credentialId>
 *   pnpm --filter @safestock/backend device:monitor -- --warehouse <id> --device temp_A --interval 300
 *   pnpm --filter @safestock/backend device:monitor -- --warehouse <id> --device temp_A --interval off
 *
 * Token chỉ hiện ĐÚNG MỘT LẦN ở đây. Hệ thống chỉ giữ bản băm, nên mất token là
 * phải cấp lại chứ không đọc lại được.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.get("_command");

  if (command === "issue") return issue(args);
  if (command === "revoke") return revoke(args);
  if (command === "monitor") return monitor(args);

  throw new Error("Lệnh không hợp lệ. Dùng: issue | revoke | monitor");
}

async function issue(args: Map<string, string>): Promise<void> {
  const warehouseId = required(args, "warehouse");
  const code = required(args, "code");
  const name = args.get("name") ?? code;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, name: true, kind: true },
  });
  if (!warehouse) throw new Error(`Không tìm thấy kho ${warehouseId}`);
  if (warehouse.kind !== "CENTRAL") throw new Error("Chỉ kho trung tâm có gateway thiết bị");

  const { randomBytes } = await import("node:crypto");
  const bcrypt = await import("bcryptjs");
  const tokenPrefix = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");

  const credential = await prisma.deviceCredential.create({
    data: {
      warehouseId,
      code,
      name,
      tokenPrefix,
      tokenHash: await bcrypt.hash(secret, 10),
    },
    select: { id: true, code: true, name: true },
  });

  console.log(`Đã cấp khoá cho gateway "${credential.name}" tại kho ${warehouse.name}.`);
  console.log(`  credentialId : ${credential.id}`);
  console.log(`  token        : upn_${tokenPrefix}.${secret}`);
  console.log("");
  console.log("Lưu token ngay — hệ thống không hiển thị lại được lần thứ hai.");
  console.log("Gateway gửi số liệu bằng header: X-Device-Token: <token>");
  console.log("  POST /api/telemetry/snapshots");
}

async function revoke(args: Map<string, string>): Promise<void> {
  const id = required(args, "id");
  const result = await prisma.deviceCredential.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.log(
    result.count === 1
      ? `Đã thu hồi khoá ${id}. Gateway này không gửi được số liệu nữa.`
      : `Không có khoá đang hoạt động nào với id ${id}.`,
  );
}

/**
 * Bật/tắt giám sát im lặng cho một thiết bị.
 *
 * Mặc định thiết bị KHÔNG được giám sát, vì thiết bị mô phỏng do người kéo tay
 * không có nhịp báo cố định — bật sẵn sẽ đẻ ra cảnh báo giả mỗi lúc không ai
 * ngồi trước máy. Chỉ bật cho thiết bị thực sự báo theo chu kỳ.
 */
async function monitor(args: Map<string, string>): Promise<void> {
  const warehouseId = required(args, "warehouse");
  const code = required(args, "device");
  const raw = required(args, "interval");
  const interval = raw.toLowerCase() === "off" ? null : Number(raw);
  if (interval !== null && (!Number.isFinite(interval) || interval <= 0)) {
    throw new Error("--interval phải là số giây dương, hoặc 'off' để tắt giám sát");
  }

  const updated = await prisma.virtualDevice.updateMany({
    where: { warehouseId, code },
    data: { expectedIntervalSeconds: interval },
  });
  if (updated.count === 0)
    throw new Error(`Không tìm thấy thiết bị ${code} trong kho ${warehouseId}`);

  console.log(
    interval === null
      ? `Đã tắt giám sát im lặng cho ${code}.`
      : `Đã bật giám sát im lặng cho ${code}: báo sự cố nếu không có số liệu quá ~${interval * 3}s.`,
  );
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  if (argv[0] && !argv[0].startsWith("--")) args.set("_command", argv[0]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const next = argv[index + 1];
    args.set(token.slice(2), next && !next.startsWith("--") ? next : "true");
  }
  return args;
}

function required(args: Map<string, string>, key: string): string {
  const value = args.get(key);
  if (!value || value === "true") throw new Error(`Thiếu tham số bắt buộc --${key}`);
  return value;
}

main()
  .catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

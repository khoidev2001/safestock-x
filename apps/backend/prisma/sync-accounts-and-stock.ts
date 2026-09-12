/**
 * Đồng bộ RIÊNG tài khoản và số lượng tồn kho giữa hai cơ sở dữ liệu.
 *
 * KHÔNG đụng tới: nhiệm vụ, thông báo, sự cố, cảm biến, nhật ký kiểm toán, phiếu
 * mượn, phiên đăng nhập, mã xác minh, outbox email, giao dịch kho. Những bảng đó
 * là lịch sử vận hành của từng máy chủ, chép đè sang máy khác là làm hỏng lịch sử
 * thật chứ không phải "đồng bộ".
 *
 * Vì sao phải dò theo khoá tự nhiên: khoá chính là cuid, sinh độc lập ở mỗi cơ sở
 * dữ liệu, nên cùng một cái kho ở hai bên có hai id khác nhau. Dò theo id là ghi
 * nhầm hàng loạt.
 *
 *   Tổ chức  → name
 *   Kho      → (tên tổ chức, tên kho)
 *   Người dùng → email
 *   Vật tư   → sku
 *   Lô hàng  → (tên kho, sku, batchCode)
 *
 * Gặp khoá tự nhiên trùng lặp ở bất kỳ đâu thì DỪNG, không đoán.
 *
 * Chạy:
 *   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... \
 *     pnpm --filter @safestock/backend exec ts-node prisma/sync-accounts-and-stock.ts
 *
 * Mặc định là chạy thử: chỉ in ra những gì SẼ đổi. Thêm `--apply` mới thật sự ghi.
 */
import { PrismaClient } from "@prisma/client";

type Flags = {
  apply: boolean;
  overwritePasswords: boolean;
  createMissingBatches: boolean;
  accountsOnly: boolean;
  stockOnly: boolean;
  keepSessions: boolean;
};

function parseFlags(argv: string[]): Flags {
  const known = new Set([
    "--apply",
    "--overwrite-passwords",
    "--create-missing-batches",
    "--accounts-only",
    "--stock-only",
    "--keep-sessions",
  ]);
  for (const arg of argv) {
    if (!known.has(arg)) {
      throw new Error(`Cờ không hiểu: ${arg}. Chỉ nhận: ${[...known].join(", ")}`);
    }
  }
  const flags = {
    apply: argv.includes("--apply"),
    overwritePasswords: argv.includes("--overwrite-passwords"),
    createMissingBatches: argv.includes("--create-missing-batches"),
    accountsOnly: argv.includes("--accounts-only"),
    stockOnly: argv.includes("--stock-only"),
    keepSessions: argv.includes("--keep-sessions"),
  };
  if (flags.accountsOnly && flags.stockOnly) {
    throw new Error("--accounts-only và --stock-only loại trừ nhau.");
  }
  return flags;
}

/** Khoá tự nhiên trùng nghĩa là không xác định được hàng nào ứng với hàng nào. */
function indexUnique<T>(rows: T[], keyOf: (row: T) => string, label: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (index.has(key)) {
      throw new Error(
        `${label} có khoá trùng: "${key}". Khoá tự nhiên phải là duy nhất mới dò được hai bên; ` +
          "hãy đặt lại tên cho hết trùng rồi chạy lại.",
      );
    }
    index.set(key, row);
  }
  return index;
}

type WarehouseRow = { id: string; name: string; organizationId: string };
type BatchRow = {
  id: string;
  batchCode: string;
  quantity: number;
  itemId: string;
  shelfId: string | null;
};

/** Mỗi lô nằm trên kệ → khu → kho; gom lại thành khoá "kho|sku|mã lô". */
async function loadBatchesByNaturalKey(prisma: PrismaClient) {
  const batches = await prisma.itemBatch.findMany({
    select: {
      id: true,
      batchCode: true,
      quantity: true,
      item: { select: { sku: true } },
      shelf: { select: { zone: { select: { warehouse: { select: { name: true } } } } } },
    },
  });
  const byKey = new Map<string, { id: string; quantity: number }>();
  const orphans: string[] = [];
  for (const batch of batches) {
    const warehouseName = batch.shelf?.zone.warehouse.name;
    if (!warehouseName) {
      orphans.push(`${batch.item.sku}/${batch.batchCode}`);
      continue;
    }
    const key = `${warehouseName}|${batch.item.sku}|${batch.batchCode}`;
    if (byKey.has(key)) {
      throw new Error(`Lô trùng khoá tự nhiên: "${key}". Không thể dò an toàn.`);
    }
    byKey.set(key, { id: batch.id, quantity: batch.quantity });
  }
  return { byKey, orphans };
}

async function syncAccounts(
  source: PrismaClient,
  target: PrismaClient,
  flags: Flags,
): Promise<string[]> {
  const notes: string[] = [];

  const targetOrganizations = indexUnique(
    await target.organization.findMany({ select: { id: true, name: true } }),
    (row) => row.name,
    "Tổ chức ở đích",
  );
  const sourceOrganizations = indexUnique(
    await source.organization.findMany({ select: { id: true, name: true } }),
    (row) => row.name,
    "Tổ chức ở nguồn",
  );
  const sourceOrganizationNameById = new Map(
    [...sourceOrganizations.values()].map((row) => [row.id, row.name]),
  );

  const targetWarehouses = indexUnique(
    await target.warehouse.findMany({ select: { id: true, name: true, organizationId: true } }),
    (row: WarehouseRow) => row.name,
    "Kho ở đích",
  );
  const sourceWarehouseNameById = new Map(
    (await source.warehouse.findMany({ select: { id: true, name: true } })).map((row) => [
      row.id,
      row.name,
    ]),
  );

  const sourceUsers = await source.user.findMany({
    select: {
      email: true,
      passwordHash: true,
      fullName: true,
      phone: true,
      notificationEmail: true,
      notificationEmailVerifiedAt: true,
      avatarUrl: true,
      role: true,
      isSuperAdmin: true,
      organizationId: true,
      warehouseId: true,
    },
    orderBy: { email: "asc" },
  });
  const targetUsersByEmail = new Map(
    (
      await target.user.findMany({
        select: { id: true, email: true, passwordHash: true, sessionVersion: true },
      })
    ).map((row) => [row.email, row]),
  );

  let created = 0;
  let updated = 0;
  let sessionsRevoked = 0;

  for (const user of sourceUsers) {
    const organizationName = sourceOrganizationNameById.get(user.organizationId);
    const targetOrganization = organizationName
      ? targetOrganizations.get(organizationName)
      : undefined;
    if (!targetOrganization) {
      notes.push(
        `BỎ QUA tài khoản ${user.email}: đích chưa có tổ chức "${organizationName ?? "?"}". ` +
          "Script này cố tình không tự tạo tổ chức mới.",
      );
      continue;
    }

    // warehouseId = null nghĩa là phụ trách toàn xã, đó là giá trị hợp lệ chứ không phải thiếu.
    let targetWarehouseId: string | null = null;
    if (user.warehouseId) {
      const warehouseName = sourceWarehouseNameById.get(user.warehouseId);
      const targetWarehouse = warehouseName ? targetWarehouses.get(warehouseName) : undefined;
      if (!targetWarehouse) {
        notes.push(
          `BỎ QUA tài khoản ${user.email}: đích chưa có kho "${warehouseName ?? "?"}" để gán scope.`,
        );
        continue;
      }
      targetWarehouseId = targetWarehouse.id;
    }

    const existing = targetUsersByEmail.get(user.email);
    if (!existing) {
      created += 1;
      console.log(`  + tạo   ${user.email} (${user.role}${user.isSuperAdmin ? ", super" : ""})`);
      if (flags.apply) {
        await target.user.create({
          data: {
            email: user.email,
            passwordHash: user.passwordHash,
            fullName: user.fullName,
            phone: user.phone,
            notificationEmail: user.notificationEmail,
            notificationEmailVerifiedAt: user.notificationEmailVerifiedAt,
            avatarUrl: user.avatarUrl,
            role: user.role,
            isSuperAdmin: user.isSuperAdmin,
            organizationId: targetOrganization.id,
            warehouseId: targetWarehouseId,
          },
        });
      }
      continue;
    }

    updated += 1;

    // Chỉ coi là "đổi mật khẩu" khi hash thật sự khác — chạy lại script lần hai
    // không được phép đá người dùng ra lần nữa.
    const passwordChanged =
      flags.overwritePasswords && existing.passwordHash !== user.passwordHash;

    // Mật khẩu đã đổi thì phiên cũ phải chết. Không tăng sessionVersion nghĩa là
    // người cầm phiên mở trước đó vẫn vào được bằng mật khẩu vừa bị thay — đổi
    // mật khẩu như vậy không có tác dụng gì về mặt an toàn.
    const revokeSessions = passwordChanged && !flags.keepSessions;
    if (revokeSessions) sessionsRevoked += 1;

    console.log(
      `  ~ cập nhật ${user.email}` +
        (passwordChanged ? " (đổi mật khẩu" : " (giữ mật khẩu cũ") +
        (revokeSessions ? ", thu hồi phiên cũ)" : ")"),
    );
    if (flags.apply) {
      await target.user.update({
        where: { id: existing.id },
        data: {
          fullName: user.fullName,
          phone: user.phone,
          notificationEmail: user.notificationEmail,
          notificationEmailVerifiedAt: user.notificationEmailVerifiedAt,
          avatarUrl: user.avatarUrl,
          role: user.role,
          isSuperAdmin: user.isSuperAdmin,
          organizationId: targetOrganization.id,
          warehouseId: targetWarehouseId,
          ...(passwordChanged ? { passwordHash: user.passwordHash } : {}),
          ...(revokeSessions ? { sessionVersion: existing.sessionVersion + 1 } : {}),
        },
      });
    }
  }

  console.log(
    `  → ${created} tạo mới, ${updated} cập nhật, ${sessionsRevoked} bị thu hồi phiên, ` +
      `${notes.length} bỏ qua.`,
  );
  return notes;
}

async function syncStockQuantities(
  source: PrismaClient,
  target: PrismaClient,
  flags: Flags,
): Promise<string[]> {
  const notes: string[] = [];

  const sourceBatches = await loadBatchesByNaturalKey(source);
  const targetBatches = await loadBatchesByNaturalKey(target);

  for (const orphan of sourceBatches.orphans) {
    notes.push(`BỎ QUA lô ${orphan} ở nguồn: chưa xếp lên kệ nào nên không biết thuộc kho nào.`);
  }

  const targetItemIdBySku = new Map(
    (await target.item.findMany({ select: { id: true, sku: true } })).map((row) => [
      row.sku,
      row.id,
    ]),
  );

  let changed = 0;
  let identical = 0;
  let missing = 0;

  for (const [key, sourceBatch] of [...sourceBatches.byKey].sort(([a], [b]) => a.localeCompare(b))) {
    const targetBatch = targetBatches.byKey.get(key);
    if (!targetBatch) {
      missing += 1;
      const [warehouseName, sku, batchCode] = key.split("|");
      if (!flags.createMissingBatches) {
        notes.push(
          `THIẾU ở đích: ${warehouseName} / ${sku} / lô ${batchCode} (nguồn có ${sourceBatch.quantity}). ` +
            "Thêm --create-missing-batches nếu muốn tạo lô này.",
        );
        continue;
      }
      if (!targetItemIdBySku.has(sku)) {
        notes.push(`THIẾU ở đích: vật tư sku ${sku} chưa tồn tại — không tạo lô ${batchCode} được.`);
        continue;
      }
      notes.push(
        `KHÔNG TẠO ĐƯỢC ${warehouseName} / ${sku} / lô ${batchCode}: cần biết kệ nào chứa lô này ` +
          "ở đích, mà tạo kệ mới là vượt ra ngoài phạm vi 'chỉ số lượng'.",
      );
      continue;
    }

    if (targetBatch.quantity === sourceBatch.quantity) {
      identical += 1;
      continue;
    }

    changed += 1;
    const [warehouseName, sku, batchCode] = key.split("|");
    console.log(
      `  ~ ${warehouseName} / ${sku} / ${batchCode}: ${targetBatch.quantity} → ${sourceBatch.quantity}`,
    );
    if (flags.apply) {
      // CHỈ quantity. condition/circulation/expiryDate là trạng thái thật của hàng
      // ở máy chủ đích, không phải thứ người dùng yêu cầu đồng bộ.
      await target.itemBatch.update({
        where: { id: targetBatch.id },
        data: { quantity: sourceBatch.quantity },
      });
    }
  }

  const extra = [...targetBatches.byKey.keys()].filter((key) => !sourceBatches.byKey.has(key));
  for (const key of extra) {
    notes.push(`CHỈ CÓ Ở ĐÍCH, để nguyên: ${key.split("|").join(" / ")}`);
  }

  console.log(
    `  → ${changed} lô đổi số lượng, ${identical} lô đã khớp, ${missing} lô thiếu ở đích, ` +
      `${extra.length} lô chỉ có ở đích (không xoá).`,
  );
  return notes;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error(
      "Cần cả SOURCE_DATABASE_URL và TARGET_DATABASE_URL. Nguồn là nơi ĐỌC, đích là nơi GHI.",
    );
  }
  if (sourceUrl === targetUrl) {
    throw new Error("Nguồn và đích trỏ vào cùng một cơ sở dữ liệu.");
  }

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

  console.log(flags.apply ? "CHẾ ĐỘ GHI THẬT (--apply)\n" : "CHẠY THỬ — không ghi gì cả.\n");

  const notes: string[] = [];
  try {
    if (!flags.stockOnly) {
      console.log("Tài khoản:");
      notes.push(...(await syncAccounts(source, target, flags)));
      console.log("");
    }
    if (!flags.accountsOnly) {
      console.log("Số lượng tồn kho:");
      notes.push(...(await syncStockQuantities(source, target, flags)));
      console.log("");
    }
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }

  if (notes.length > 0) {
    console.log(`Cần để ý (${notes.length}):`);
    for (const note of notes) console.log(`  - ${note}`);
    console.log("");
  }
  if (!flags.apply) {
    console.log("Chưa ghi gì. Rà lại danh sách trên, thấy đúng thì chạy lại kèm --apply.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

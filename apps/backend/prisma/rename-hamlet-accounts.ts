/**
 * Đổi tên đăng nhập kho thôn sang dạng {tênthôn} trên database
 * đang chạy, và bỏ tài khoản truongthon@ trỏ trùng kho Long Châu.
 *
 * Seed đã sinh đúng dạng này cho môi trường mới; script chỉ để không phải seed lại
 * (seed sẽ xoá sạch tồn kho và lịch sử). Dùng chung hàm normalizeHamletName với
 * seed nên kết quả khớp tuyệt đối, không lệch dấu.
 *
 * Chạy một lần: pnpm --filter @safestock/backend exec ts-node prisma/rename-hamlet-accounts.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizeHamletName } from "../src/admin/hamlet-normalization";

const prisma = new PrismaClient();

// Tài khoản trùng có thể còn ở dạng cũ kèm tên miền, hoặc đã bị strip-login-domain
// cắt hậu tố. Kiểm cả hai để script vẫn dọn được dù chạy trước hay sau lần cắt đó.
const LEGACY_DUPLICATE_EMAILS = ["truongthon", "truongthon@ungphonhanh.life"];

function hamletAccountEmail(warehouseName: string): string {
  const hamletName = warehouseName.replace(/^Kho thôn\s+/iu, "");
  return normalizeHamletName(hamletName).replace(/\s+/g, "");
}

async function main() {
  for (const email of LEGACY_DUPLICATE_EMAILS) {
    const legacy = await prisma.user.findUnique({ where: { email } });
    if (!legacy) continue;
    await prisma.user.delete({ where: { id: legacy.id } });
    console.log(`Đã xoá tài khoản trùng: ${email}`);
  }

  const users = await prisma.user.findMany({
    where: { warehouse: { kind: "HAMLET" } },
    include: { warehouse: true },
    orderBy: { email: "asc" },
  });

  let changed = 0;
  for (const user of users) {
    if (!user.warehouse) continue;
    const email = hamletAccountEmail(user.warehouse.name);
    if (email === user.email) continue;
    await prisma.user.update({ where: { id: user.id }, data: { email } });
    console.log(`  ${user.email.padEnd(32)} -> ${email.padEnd(30)} (${user.warehouse.name})`);
    changed++;
  }
  console.log(`\nĐổi tên ${changed}/${users.length} tài khoản kho thôn.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

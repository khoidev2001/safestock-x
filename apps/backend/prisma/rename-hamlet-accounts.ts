/**
 * Đổi tên đăng nhập kho thôn sang dạng {tênthôn}@ungphonhanh.life trên database
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

const LEGACY_DUPLICATE_EMAIL = "truongthon@ungphonhanh.life";

function hamletAccountEmail(warehouseName: string): string {
  const hamletName = warehouseName.replace(/^Kho thôn\s+/iu, "");
  return `${normalizeHamletName(hamletName).replace(/\s+/g, "")}@ungphonhanh.life`;
}

async function main() {
  const legacy = await prisma.user.findUnique({ where: { email: LEGACY_DUPLICATE_EMAIL } });
  if (legacy) {
    await prisma.user.delete({ where: { id: legacy.id } });
    console.log(`Đã xoá tài khoản trùng: ${LEGACY_DUPLICATE_EMAIL}`);
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

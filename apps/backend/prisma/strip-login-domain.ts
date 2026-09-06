/**
 * Cắt hậu tố `@ungphonhanh.life` khỏi tên đăng nhập của mọi tài khoản trên database
 * đang chạy: `staff@ungphonhanh.life` → `staff`, `longchau@ungphonhanh.life` → `longchau`.
 *
 * Cột `email` của User thực chất là *định danh đăng nhập* (LoginDto đã ghi rõ: có thể
 * là email hoặc username — tài khoản `admin` không có @ nào từ đầu). Hậu tố tên miền
 * chỉ làm cán bộ xã phải gõ thêm 18 ký tự trên bàn phím điện thoại, và gõ sai một ký
 * tự trong đó thì màn hình chỉ nói "Email hoặc mật khẩu sai".
 *
 * Email nhận cảnh báo nằm ở cột riêng `notificationEmail`, script này không chạm tới —
 * đó mới là địa chỉ thư thật.
 *
 * Seed đã sinh đúng dạng trần cho máy mới; script này để môi trường đang có dữ liệu
 * không phải seed lại (seed xoá sạch tồn kho và lịch sử).
 *
 * Chạy một lần: pnpm --filter @safestock/backend prisma:strip-login-domain
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEGACY_SUFFIX = "@ungphonhanh.life";

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: LEGACY_SUFFIX } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, fullName: true },
  });

  if (users.length === 0) {
    console.log(`Không còn tài khoản nào mang hậu tố ${LEGACY_SUFFIX}.`);
    return;
  }

  // Cắt hậu tố có thể đụng tài khoản đã tồn tại ở dạng trần (vd vừa chạy nửa đường
  // rồi dừng). `email` là unique nên phải kiểm trước, không thì update ném lỗi giữa
  // vòng lặp và bỏ dở phần còn lại.
  const taken = new Set(
    (
      await prisma.user.findMany({
        where: { email: { not: { endsWith: LEGACY_SUFFIX } } },
        select: { email: true },
      })
    ).map((user) => user.email),
  );

  let changed = 0;
  const conflicts: string[] = [];
  for (const user of users) {
    const email = user.email.slice(0, -LEGACY_SUFFIX.length);
    if (taken.has(email)) {
      conflicts.push(`${user.email} -> ${email} (đã có tài khoản khác dùng tên này)`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { email } });
    taken.add(email);
    console.log(`  ${user.email.padEnd(32)} -> ${email.padEnd(20)} (${user.fullName})`);
    changed++;
  }

  console.log(`\nĐã cắt hậu tố cho ${changed}/${users.length} tài khoản.`);
  if (conflicts.length > 0) {
    console.error(`\nBỏ qua ${conflicts.length} tài khoản vì trùng tên đăng nhập:`);
    for (const line of conflicts) console.error(`  ${line}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

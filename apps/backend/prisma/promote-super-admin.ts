/**
 * Cấp bậc super admin cho một tài khoản, kèm tuỳ chọn đổi tên đăng nhập.
 *
 * Toàn hệ thống CHỈ có một super admin, và bậc này không tạo được từ giao diện — một
 * tài khoản không ai xoá được thì không nên đẻ ra bằng vài cú bấm. Đây là đường duy nhất.
 *
 *   pnpm --filter @safestock/backend prisma:promote-super-admin <login> [login-mới] [--chuyen]
 *
 * Ví dụ:
 *   ... prisma:promote-super-admin admindongxuan1 superadmindongxuan
 *   ... prisma:promote-super-admin adminmoi --chuyen   # chuyển bậc từ super admin cũ sang
 */
import { PrismaClient, UserRole } from "@prisma/client";
import { planSuperAdminPromotion } from "../src/admin/super-admin";

const prisma = new PrismaClient();

/** Cùng luật với AdminUserController: username chữ thường, số và . _ - */
const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

async function main() {
  const args = process.argv.slice(2);
  const transfer = args.includes("--chuyen");
  const [currentLogin, nextLoginRaw] = args.filter((arg) => !arg.startsWith("--"));
  if (!currentLogin) {
    throw new Error(
      "Thiếu tên đăng nhập. Cách dùng: promote-super-admin <login> [login-mới] [--chuyen]",
    );
  }
  const nextLogin = nextLoginRaw?.trim().toLowerCase();
  if (nextLogin && !LOGIN_NAME_PATTERN.test(nextLogin)) {
    throw new Error("Tên đăng nhập mới chỉ gồm chữ thường, số và . _ -");
  }

  const user = await prisma.user.findUnique({
    where: { email: currentLogin.trim().toLowerCase() },
    select: { id: true, email: true, fullName: true, role: true, isSuperAdmin: true },
  });
  if (!user) throw new Error(`Không tìm thấy tài khoản "${currentLogin}"`);

  if (nextLogin && nextLogin !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email: nextLogin } });
    if (taken) throw new Error(`Tên đăng nhập "${nextLogin}" đã có người dùng`);
  }

  const holder = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
    select: { id: true, email: true, fullName: true },
  });
  const plan = planSuperAdminPromotion({
    target: { id: user.id, email: nextLogin ?? user.email, fullName: user.fullName },
    currentSuperAdmin: holder,
    transfer,
  });

  const renamed = Boolean(nextLogin && nextLogin !== user.email);
  const updated = await prisma.$transaction(async (tx) => {
    if (plan.demoteId) {
      // Hạ bậc là thu hồi quyền: cắt luôn phiên đang mở của tài khoản cũ, không để
      // một phiên còn sống mang theo quyền vừa bị lấy lại.
      await tx.user.update({
        where: { id: plan.demoteId },
        data: {
          isSuperAdmin: false,
          tokenVersion: { increment: 1 },
          sessionVersion: { increment: 1 },
        },
      });
    }
    return tx.user.update({
      where: { id: plan.promoteId },
      data: {
        email: nextLogin ?? undefined,
        role: UserRole.ADMIN,
        isSuperAdmin: true,
        // Đổi tên đăng nhập thì thu hồi phiên cũ: người dùng đăng nhập lại bằng tên mới,
        // không để một phiên còn sống mang định danh đã không còn tồn tại.
        ...(renamed
          ? { tokenVersion: { increment: 1 }, sessionVersion: { increment: 1 } }
          : {}),
      },
      select: { email: true, fullName: true, role: true, isSuperAdmin: true },
    });
  });

  if (plan.demoteId && holder) {
    console.log(`↓ "${holder.email}" (${holder.fullName}) hạ xuống quản trị xã thường.`);
  }
  console.log(
    `✔ ${updated.fullName}: đăng nhập "${user.email}" → "${updated.email}", role ${updated.role}, super admin = ${updated.isSuperAdmin}`,
  );
}

main()
  .catch((error) => {
    console.error(`✘ ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

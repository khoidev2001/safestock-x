/**
 * Tài khoản riêng cho app IoT (Simulator cảm biến).
 *
 * VÌ SAO PHẢI CÓ: `login()` và `refresh()` đều tăng `user.tokenVersion`, mà đó là
 * MỘT số duy nhất cho mỗi tài khoản chứ không phải cho mỗi thiết bị. Dùng chung
 * `admin` ở cả web lẫn app thì bên nào đăng nhập sau sẽ vô hiệu hoá khoá của bên
 * kia: web đăng nhập → app IoT rớt phiên trong vòng 15 phút (hết hạn access
 * token), số liệu đã chỉnh nằm lại hàng chờ và không bao giờ gửi đi.
 *
 * Đây không phải cách lách. App IoT là một THIẾT BỊ, không phải người vận hành
 * đang ngồi ở web — cho nó danh tính riêng là đúng, và nhật ký cũng phân biệt
 * được số liệu do thiết bị bơm với thao tác do người làm.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/create-iot-account.ts
 */
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "iot";
const PASSWORD = "iot123456";
const NAME = "Thiết bị IoT — Giả lập cảm biến";

async function main() {
  const warehouse = await prisma.warehouse.findFirst({
    where: { kind: "CENTRAL" },
    select: { id: true, name: true, organizationId: true },
  });
  if (!warehouse) throw new Error("Chưa có kho trung tâm; hãy chạy seed trước.");

  const passwordHash = bcrypt.hashSync(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    // Chạy lại thì đặt lại mật khẩu, không đẻ thêm tài khoản trùng vai.
    update: { passwordHash, fullName: NAME, role: UserRole.ADMIN },
    create: {
      email: EMAIL,
      fullName: NAME,
      passwordHash,
      // ADMIN vì chỉ vai này có quyền simulation:mutate — quyền bơm số liệu mô phỏng.
      role: UserRole.ADMIN,
      organizationId: warehouse.organizationId,
    },
    select: { id: true, email: true, role: true },
  });

  console.log("Tai khoan cho app IoT:");
  console.log(`  email    : ${user.email}`);
  console.log(`  mat khau : ${PASSWORD}`);
  console.log(`  vai tro  : ${user.role}`);
  console.log(`  kho      : ${warehouse.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

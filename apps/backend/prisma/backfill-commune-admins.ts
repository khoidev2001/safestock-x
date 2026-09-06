import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { resolveEnvFilePaths } from "../src/config/env-file-path";

config({ path: resolveEnvFilePaths() });

const prisma = new PrismaClient();

/**
 * Một xã có NHIỀU quản trị viên cùng duyệt nhiệm vụ.
 *
 * Trước đây mỗi xã chỉ có một tài khoản `admin` dùng chung, nên không truy được
 * ai đã chốt phương án nào — mà đó là thứ phải trả lời được khi cần hỏi lại.
 * Mỗi người một tài khoản, một tên thật; `Mission.approvedByUserId` từ đó mới có
 * nghĩa.
 *
 * Chạy lại được: khớp theo email, có rồi thì cập nhật, chưa có thì tạo.
 */
const ADMINS = [
  { email: "admindongxuan1", fullName: "Nguyễn Khánh Trình" },
  { email: "admindongxuan2", fullName: "Trần Đình Khôi" },
];

const PASSWORD = "admin123";

/** Email cũ được đổi tên thành tài khoản nào — giữ nguyên id nên dữ liệu cũ vẫn gắn đúng người. */
const EMAIL_RENAMES: Record<string, string> = { admin: "admindongxuan2" };

async function main() {
  const organization = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!organization) throw new Error("Chưa có đơn vị nào trong CSDL — chạy seed trước.");

  const passwordHash = bcrypt.hashSync(PASSWORD, 10);

  // Đổi tên trước khi tạo mới: tạo `admindongxuan2` trước rồi mới đổi `admin`
  // thành cùng email đó sẽ đụng ràng buộc unique.
  for (const [oldEmail, newEmail] of Object.entries(EMAIL_RENAMES)) {
    const existing = await prisma.user.findUnique({ where: { email: oldEmail } });
    if (!existing) continue;
    const alreadyTaken = await prisma.user.findUnique({ where: { email: newEmail } });
    if (alreadyTaken) continue;
    await prisma.user.update({ where: { id: existing.id }, data: { email: newEmail } });
    console.log(
      `Đổi tên đăng nhập: ${oldEmail} → ${newEmail} (giữ nguyên id, dữ liệu cũ không mất)`,
    );
  }

  for (const admin of ADMINS) {
    await prisma.user.upsert({
      where: { email: admin.email },
      // Đặt lại mật khẩu và tên cho khớp yêu cầu, nhưng KHÔNG đụng `warehouseId`:
      // quản trị xã phải có scope null thì mới nhìn được toàn xã.
      update: { passwordHash, fullName: admin.fullName, role: UserRole.ADMIN, warehouseId: null },
      create: {
        organizationId: organization.id,
        email: admin.email,
        passwordHash,
        fullName: admin.fullName,
        role: UserRole.ADMIN,
      },
    });
    console.log(`Quản trị xã sẵn sàng: ${admin.email} — ${admin.fullName}`);
  }

  console.log(`Đơn vị: ${organization.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

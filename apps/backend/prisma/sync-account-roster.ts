/**
 * Đưa danh sách tài khoản của database đang chạy về đúng bảng dưới đây.
 *
 * VÌ SAO KHÔNG SEED LẠI: `seed.ts` xoá sạch tồn kho, nhiệm vụ và lịch sử giao
 * dịch rồi dựng lại từ đầu. Sửa vài cái tên đăng nhập mà mất cả dữ liệu diễn tập
 * là cái giá không đáng.
 *
 * VÌ SAO KHÔNG DÙNG API `admin/users`: `UpdateUserDto` cố tình không cho sửa
 * `email` — tên đăng nhập là định danh, không phải một trường hồ sơ. Còn tạo tài
 * khoản ADMIN qua API thì bắt buộc phải có mã 6 số gửi vào hòm thư thật. Cả hai
 * ràng buộc đều đúng cho người dùng, và cả hai đều chặn đúng việc bảo trì này.
 *
 * CHẠY LẠI NHIỀU LẦN ĐƯỢC: mọi thao tác tra theo tên đăng nhập đích trước, rồi
 * mới tới tên cũ, nên lần chạy thứ hai không tìm thấy gì để đổi và không làm gì.
 *
 * Chạy thử:  pnpm --filter @safestock/backend exec ts-node prisma/sync-account-roster.ts
 * Ghi thật:  ... prisma/sync-account-roster.ts --apply
 */
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

interface RosterEntry {
  /** Tên đăng nhập ĐÍCH. */
  login: string;
  /** Tên đăng nhập cũ, nếu tài khoản này từng mang tên khác. */
  legacyLogin?: string;
  password: string;
  fullName: string;
  role: UserRole;
  isSuperAdmin?: boolean;
  /** Tên kho được gán. `null` = phạm vi toàn xã. */
  warehouseName: string | null;
}

/** Mật khẩu kho thôn là tên đăng nhập cộng 123 — khai một lần, khỏi chép 17 lần. */
function hamlet(login: string, fullName: string, warehouseName: string): RosterEntry {
  return {
    login,
    password: login + "123",
    fullName,
    role: UserRole.WAREHOUSE,
    warehouseName,
  };
}

const ROSTER: RosterEntry[] = [
  {
    login: "superadmindongxuan",
    password: "admin123",
    fullName: "Nguyễn Khánh Trình",
    role: UserRole.ADMIN,
    isSuperAdmin: true,
    warehouseName: null,
  },
  {
    login: "admindongxuan",
    legacyLogin: "admin",
    password: "admin123@",
    fullName: "Khôi",
    role: UserRole.ADMIN,
    warehouseName: null,
  },
  {
    login: "cuuhodongxuan",
    legacyLogin: "rescue",
    password: "cuuho123",
    fullName: "Đội cứu hộ Đồng Xuân",
    role: UserRole.RESCUE,
    warehouseName: null,
  },
  {
    login: "dongxuan",
    legacyLogin: "staff",
    password: "dongxuan123",
    fullName: "Phụ trách kho trung tâm",
    role: UserRole.WAREHOUSE,
    warehouseName: "Kho cứu trợ trung tâm Đồng Xuân",
  },
  hamlet("kydu", "Trưởng thôn Kỳ Đu", "Kho thôn Kỳ Đu"),
  hamlet("longbinh", "Trưởng thôn Long Bình", "Kho thôn Long Bình"),
  hamlet("longchau", "Trưởng thôn Long Châu", "Kho thôn Long Châu"),
  hamlet("longha", "Trưởng thôn Long Hà", "Kho thôn Long Hà"),
  hamlet("longhoa", "Trưởng thôn Long Hòa", "Kho thôn Long Hòa"),
  hamlet("longmy", "Trưởng thôn Long Mỹ", "Kho thôn Long Mỹ"),
  hamlet("longthach", "Trưởng thôn Long Thạch", "Kho thôn Long Thạch"),
  hamlet("longthang", "Trưởng thôn Long Thăng", "Kho thôn Long Thăng"),
  hamlet("phuochue", "Trưởng thôn Phước Huệ", "Kho thôn Phước Huệ"),
  hamlet("phuson", "Trưởng thôn Phú Sơn", "Kho thôn Phú Sơn"),
  hamlet("tanan", "Trưởng thôn Tân An", "Kho thôn Tân An"),
  hamlet("tanbinh", "Trưởng thôn Tân Bình", "Kho thôn Tân Bình"),
  hamlet("tanhoa", "Trưởng thôn Tân Hòa", "Kho thôn Tân Hòa"),
  hamlet("tanphu", "Trưởng thôn Tân Phú", "Kho thôn Tân Phú"),
  hamlet("tanphuoc", "Trưởng thôn Tân Phước", "Kho thôn Tân Phước"),
  hamlet("tanvinh", "Trưởng thôn Tân Vinh", "Kho thôn Tân Vinh"),
  hamlet("triemduc", "Trưởng thôn Triêm Đức", "Kho thôn Triêm Đức"),
];

/**
 * Quản trị các xã lân cận KHÔNG nằm trong bảng trên.
 *
 * `create-communes.ts` dựng chúng cùng với đơn vị, kho và tồn kho của từng xã —
 * khai lại ở đây là hai nơi cùng nói một chuyện, rồi lệch nhau. Script này chỉ
 * cần biết đừng xoá chúng.
 */
const PEER_COMMUNE_LOGIN_PREFIX = "admin.";

/**
 * Tài khoản máy, giữ lại dù không có trong bảng.
 *
 * `iot` là tài khoản app cảm biến đang chạy — xoá nó là luồng telemetry đứt giữa
 * buổi trình diễn, mà không có gì trên màn hình nói vì sao.
 */
const KEEP_LOGINS = new Set(["iot"]);

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "== GHI THẬT ==\n" : "== CHẠY THỬ (thêm --apply để ghi) ==\n");

  const organization = await prisma.organization.findFirst({
    where: { name: "Hội Chữ thập đỏ xã Đồng Xuân" },
  });
  if (!organization) throw new Error("Không tìm thấy đơn vị Hội Chữ thập đỏ xã Đồng Xuân.");

  const warehouses = await prisma.warehouse.findMany({ select: { id: true, name: true } });
  const warehouseIdByName = new Map(warehouses.map((w) => [w.name, w.id]));

  /**
   * Id của những tài khoản bảng trên đã nhận, để pha xoá đừng đụng tới.
   *
   * Bám theo ID chứ không theo tên đăng nhập: lúc CHẠY THỬ không có gì được ghi
   * nên `staff`, `admin`, `rescue` vẫn còn tên cũ, và pha xoá tra theo tên sẽ báo
   * là sắp xoá chúng — đúng bốn dòng đáng sợ nhất trong bản in, mà lại sai.
   */
  const claimedUserIds = new Set<string>();

  for (const entry of ROSTER) {
    const warehouseId = entry.warehouseName ? warehouseIdByName.get(entry.warehouseName) : null;
    if (entry.warehouseName && !warehouseId) {
      throw new Error("Không tìm thấy kho " + entry.warehouseName + " cho " + entry.login + ".");
    }

    // Tra tên ĐÍCH trước: chạy lần hai thì tài khoản đã mang tên mới, mà tên cũ
    // lúc đó có thể đã bị người khác dùng lại.
    const existing =
      (await prisma.user.findUnique({ where: { email: entry.login } })) ??
      (entry.legacyLogin
        ? await prisma.user.findUnique({ where: { email: entry.legacyLogin } })
        : null);

    const data = {
      email: entry.login,
      passwordHash: bcrypt.hashSync(entry.password, 10),
      fullName: entry.fullName,
      role: entry.role,
      isSuperAdmin: entry.isSuperAdmin ?? false,
      warehouseId: warehouseId ?? null,
      organizationId: organization.id,
      // Đổi mật khẩu thì mọi phiên đang mở phải chết theo, kể cả phiên trên điện
      // thoại đang cầm. Không tăng số này là người bị đổi mật khẩu vẫn dùng tiếp
      // được bằng token cũ cho tới khi nó hết hạn.
      sessionVersion: { increment: 1 },
    };

    if (!existing) {
      console.log("TẠO MỚI  " + entry.login.padEnd(20) + entry.role.padEnd(10) + entry.fullName);
      if (apply) {
        const created = await prisma.user.create({ data: { ...data, sessionVersion: 0 } });
        claimedUserIds.add(created.id);
      }
      continue;
    }
    claimedUserIds.add(existing.id);

    const changes: string[] = [];
    if (existing.email !== entry.login) changes.push("tên: " + existing.email + " → " + entry.login);
    if (existing.fullName !== entry.fullName) {
      changes.push("họ tên: " + existing.fullName + " → " + entry.fullName);
    }
    if (existing.role !== entry.role) changes.push("vai: " + existing.role + " → " + entry.role);
    if (existing.isSuperAdmin !== (entry.isSuperAdmin ?? false)) {
      changes.push("super: " + existing.isSuperAdmin + " → " + (entry.isSuperAdmin ?? false));
    }
    if ((existing.warehouseId ?? null) !== (warehouseId ?? null)) changes.push("gán lại kho");
    if (!bcrypt.compareSync(entry.password, existing.passwordHash)) changes.push("đặt lại mật khẩu");

    if (changes.length === 0) {
      console.log("giữ nguyên " + entry.login);
      continue;
    }
    console.log("SỬA      " + entry.login.padEnd(20) + changes.join(" · "));
    if (apply) await prisma.user.update({ where: { id: existing.id }, data });
  }

  // Xoá phần thừa SAU khi đã đổi tên xong: làm trước thì tài khoản đang mang tên
  // cũ (chưa kịp đổi) trông y như một tài khoản lạ và bị xoá oan.
  const survivors = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  for (const user of survivors) {
    if (claimedUserIds.has(user.id)) continue;
    if (KEEP_LOGINS.has(user.email)) continue;
    if (user.email.startsWith(PEER_COMMUNE_LOGIN_PREFIX)) continue;
    console.log("XOÁ      " + user.email.padEnd(20) + user.role);
    if (apply) await prisma.user.delete({ where: { id: user.id } });
  }

  const superAdmins = await prisma.user.findMany({
    where: { isSuperAdmin: true },
    select: { email: true },
  });
  const names = superAdmins.map((u) => u.email).join(", ");
  console.log("\nSuper admin sau khi chạy: " + (names || "(chưa có)"));
  console.log("Tổng tài khoản: " + (await prisma.user.count()));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

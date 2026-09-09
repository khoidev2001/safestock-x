/**
 * Dựng các xã LÂN CẬN của Đồng Xuân để chạy thử luồng mượn — trả liên xã.
 *
 * Mỗi xã là một ĐƠN VỊ riêng: kho trung tâm riêng, tồn kho riêng, tài khoản quản
 * trị riêng. Toạ độ lấy từ danh mục UBND xã đã đối chiếu trên bản đồ
 * (`verified-warehouse-location.ts`) chứ không bịa — bản đồ và phép tính quãng
 * đường đọc thẳng những con số này.
 *
 * CHẠY LẠI NHIỀU LẦN ĐƯỢC. Mọi thứ đi qua `upsert` với id cố định suy từ tên xã,
 * nên lần chạy thứ hai cập nhật chứ không đẻ thêm bản trùng. Riêng số lượng tồn
 * kho thì KHÔNG ghi đè khi lô đã có: chạy lại giữa buổi thử nghiệm mà nó nạp lại
 * kho về mức ban đầu thì mọi khoản mượn vừa thử đều biến mất khỏi con số.
 *
 * Xã Đồng Xuân KHÔNG nằm ở đây — nó do `seed.ts` dựng cùng toàn bộ thôn, kho thôn
 * và dữ liệu diễn tập. Script này chỉ thêm các xã bên kia bàn.
 *
 * Chạy: pnpm --filter @safestock/backend prisma:communes
 */
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { VERIFIED_COMMUNE_REFERENCE_POINTS } from "./verified-warehouse-location";

const prisma = new PrismaClient();

/**
 * Mật khẩu chung cho mọi tài khoản quản trị xã sinh ra ở đây.
 *
 * Đây là dữ liệu THỬ NGHIỆM: các xã này tồn tại để bấm qua lại giữa hai trình
 * duyệt, không phải để chạy thật. Đặt mỗi xã một mật khẩu khác nhau chỉ khiến
 * người thử phải tra bảng giữa chừng.
 */
const PASSWORD = "admin123@";

/**
 * Vật tư nạp sẵn cho mỗi xã lân cận.
 *
 * Cố ý dùng ĐÚNG các mã mà Đồng Xuân có: mượn liên xã chỉ có nghĩa khi hai bên nói
 * về cùng một mã hàng, nếu không thì con số trao đổi cho nhau không so được với
 * nhau. Chọn ba nhóm hay thiếu nhất trong một trận lũ — nước uống, áo phao, sơ cứu
 * — cộng đèn pin và bạt che, đủ để thử cả ca "xã kia cũng không đủ".
 */
const STOCKED_SKUS = ["WATER-01", "LIFE-ADULT", "LIFE-CHILD", "FIRSTAID-01", "TORCH-01", "CANVAS-01"];

/**
 * Số lượng nạp cho mỗi mã, cố tình KHÁC NHAU giữa các xã.
 *
 * Xã nào cũng 500 thì mọi lượt thử đều thành công y hệt nhau, và ca đáng quan tâm
 * nhất — hỏi mượn một xã không đủ hàng — không bao giờ xảy ra. Nhân theo thứ tự xã
 * trong danh sách để có xã dồi dào, xã vừa đủ và xã gần cạn.
 */
const STOCK_TIERS = [600, 420, 260, 180, 120, 60];

interface CommuneSeed {
  /** Tên xã, đúng như trong danh mục UBND đã đối chiếu bản đồ. */
  name: string;
  /** Mã không dấu, dùng cho id đơn vị, id kho và `communeId`. */
  slug: string;
  /** Tên đăng nhập của quản trị viên xã đó. */
  login: string;
  /** Họ tên hiển thị — người thật thì có tên thật, không phải "Admin 2". */
  fullName: string;
}

/**
 * Các xã lân cận, theo đúng thứ tự trong danh mục đã đối chiếu bản đồ.
 *
 * `slug` viết tay chứ không sinh tự động từ tên: id đơn vị đi vào dữ liệu và vào
 * biến môi trường `COMMUNE_PEER_*`, nên nó phải ổn định kể cả khi hàm bỏ dấu đổi
 * cách xử lý một chữ nào đó về sau. `org-xuan-tho` giữ nguyên id mà script
 * `create-second-commune.ts` đời trước đã dùng, để máy nào đã chạy script đó thì
 * lần này là cập nhật chứ không thành xã thứ hai trùng tên.
 */
const COMMUNES: CommuneSeed[] = [
  { name: "Xuân Thọ", slug: "xuan-tho", login: "admin.xuantho", fullName: "Lê Thị Hoài Thu" },
  { name: "Tuy An Bắc", slug: "tuy-an-bac", login: "admin.tuyanbac", fullName: "Phạm Văn Cường" },
  { name: "Tuy An Tây", slug: "tuy-an-tay", login: "admin.tuyantay", fullName: "Ngô Thị Bích Hà" },
  { name: "Xuân Lãnh", slug: "xuan-lanh", login: "admin.xuanlanh", fullName: "Đặng Minh Tuấn" },
  { name: "Phú Mỡ", slug: "phu-mo", login: "admin.phumo", fullName: "So Bếp Mang" },
  { name: "Xuân Phước", slug: "xuan-phuoc", login: "admin.xuanphuoc", fullName: "Huỳnh Quốc Đạt" },
];

async function main() {
  const password = bcrypt.hashSync(PASSWORD, 10);

  // Danh mục vật tư do `seed.ts` dựng và dùng chung cho cả huyện. Chưa seed thì
  // dừng hẳn: tạo xã có kho rỗng trông y như tạo xong rồi, và người thử chỉ phát
  // hiện ra khi mở ô chọn vật tư và thấy nó trống.
  const items = await prisma.item.findMany({
    where: { sku: { in: STOCKED_SKUS } },
    select: { id: true, sku: true, name: true },
  });
  if (items.length === 0) {
    throw new Error(
      "Chưa có danh mục vật tư nào. Chạy `pnpm be:db` để seed xã Đồng Xuân trước, rồi chạy lại script này.",
    );
  }

  const created: { commune: string; login: string; warehouse: string; stock: number }[] = [];

  for (const [index, commune] of COMMUNES.entries()) {
    const point = VERIFIED_COMMUNE_REFERENCE_POINTS[commune.name];
    if (!point) {
      throw new Error(
        `Xã ${commune.name} không có trong danh mục UBND đã đối chiếu bản đồ — không bịa toạ độ.`,
      );
    }
    const organizationId = `org-${commune.slug}`;
    const warehouseId = `kho-trung-tam-${commune.slug}`;
    const quantity = STOCK_TIERS[index % STOCK_TIERS.length];

    const organization = await prisma.organization.upsert({
      where: { id: organizationId },
      update: { name: `Hội Chữ thập đỏ xã ${commune.name}` },
      create: { id: organizationId, name: `Hội Chữ thập đỏ xã ${commune.name}` },
    });

    const warehouse = await prisma.warehouse.upsert({
      where: { id: warehouseId },
      update: {
        name: `Kho xã ${commune.name}`,
        location: point.address,
        lat: point.lat,
        lng: point.lng,
      },
      create: {
        id: warehouseId,
        organizationId: organization.id,
        name: `Kho xã ${commune.name}`,
        location: point.address,
        kind: "CENTRAL",
        communeId: commune.slug,
        lat: point.lat,
        lng: point.lng,
      },
    });

    const zone = await prisma.warehouseZone.upsert({
      where: { id: `khu-a-${commune.slug}` },
      update: {},
      create: {
        id: `khu-a-${commune.slug}`,
        warehouseId: warehouse.id,
        code: "A",
        name: "Khu A — hàng cứu trợ",
      },
    });
    const shelf = await prisma.shelf.upsert({
      where: { id: `ke-a1-${commune.slug}` },
      update: {},
      create: { id: `ke-a1-${commune.slug}`, zoneId: zone.id, code: "A1" },
    });

    for (const item of items) {
      await prisma.itemBatch.upsert({
        where: {
          itemId_batchCode: { itemId: item.id, batchCode: `${item.sku}-${commune.slug}` },
        },
        // KHÔNG nạp lại số lượng. Lô đã có nghĩa là script từng chạy rồi, và số
        // hiện tại là kết quả của những lượt mượn — trả vừa thử. Đặt lại về mức
        // ban đầu là xoá sạch thứ người ta đang kiểm chứng.
        update: {},
        create: {
          itemId: item.id,
          shelfId: shelf.id,
          batchCode: `${item.sku}-${commune.slug}`,
          quantity,
        },
      });
    }

    await prisma.user.upsert({
      where: { email: commune.login },
      update: { passwordHash: password, role: UserRole.ADMIN, organizationId: organization.id },
      create: {
        email: commune.login,
        fullName: commune.fullName,
        passwordHash: password,
        role: UserRole.ADMIN,
        organizationId: organization.id,
      },
    });

    created.push({
      commune: commune.name,
      login: commune.login,
      warehouse: warehouse.name,
      stock: quantity,
    });
  }

  console.log(`Đã dựng ${created.length} xã lân cận (Đồng Xuân do seed.ts dựng riêng).\n`);
  for (const row of created) {
    console.log(
      `  ${row.commune.padEnd(12)}  ${row.login.padEnd(18)} / ${PASSWORD}   ${row.warehouse} — ${items.length} mã × ${row.stock}`,
    );
  }
  console.log(
    "\nMượn liên xã đi qua HTTP giữa hai máy chủ: khai COMMUNE_PEER_* ở cả hai bên (xem .env.example).",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

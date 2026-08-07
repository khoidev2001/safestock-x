import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import {
  InterCommuneLoanDirection,
  InterCommuneLoanStatus,
  NotificationKind,
  Prisma,
  TransactionSource,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { NotificationService } from "../notification/notification.service";
import { findPeer, parseCommunePeers } from "./commune-peer-registry";
import { stockMarksFromLoans } from "./loan-stock-marks";
import { parsePendingStockMove, type PendingStockMove } from "./pending-stock-move";
import {
  actorOf,
  findTransition,
  manualEntryStockEffect,
  MANUAL_INITIAL_STATUS,
  statusAfterReturn,
  manualStockEffect,
  stockEffect,
  type InterCommuneDirection,
  type InterCommuneStatus,
} from "./inter-commune-loan.workflow";

/** Lấy câu lỗi đọc được, kể cả khi thứ ném ra không phải Error. */
function moTaLoi(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface MoveStockInput {
  userId: string;
  batchId: string;
  quantity: number;
  scopeWarehouseId?: string | null;
  note: string;
  /** Khoá chống lặp cho chính thao tác kho, khác với khoá chống nhận trùng tin. */
  requestId: string;
}

/**
 * Mượn — trả vật tư giữa hai xã.
 *
 * Mỗi xã một cơ sở dữ liệu riêng, nên service này chỉ biết BẢN GHI PHÍA MÌNH.
 * Luật chuyển trạng thái và hiệu ứng kho nằm ở `inter-commune-loan.workflow`,
 * đã chốt bằng test riêng — ở đây chỉ áp dụng, không quyết định lại.
 *
 * Mọi thay đổi kho đều đi qua `InventoryService` sẵn có thay vì tự sửa số lượng:
 * đường đó đã có kiểm quyền, ghi giao dịch, và tính lại điểm sẵn sàng. Tự cộng
 * trừ ở đây là mất hết những thứ đó, và mất im lặng.
 */
@Injectable()
export class InterCommuneLoanService implements OnApplicationBootstrap {
  private readonly log = new Logger(InterCommuneLoanService.name);

  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private notifications: NotificationService,
  ) {}

  /**
   * Làm nốt những lần chuyển kho đã hứa mà chưa chắc đã xong.
   *
   * Chạy lúc khởi động vì đó chính là lúc sau một lần sập. An toàn nhờ khoá chống
   * trùng `requestId`: nếu lần trước hàng đã đi thật, lượt này kho nhận ra và
   * không chuyển thêm; nếu chưa đi thì bây giờ đi.
   *
   * KHÔNG chặn máy chủ khởi động. Một khoản mượn hỏng không đáng để cả hệ thống
   * không lên được — lúc bão thì màn hình sống quan trọng hơn một dòng sổ.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.lamNotViecDo().catch((error) =>
      this.log.error(`Không quét được việc chuyển kho còn dở: ${moTaLoi(error)}`),
    );
  }

  private async lamNotViecDo(): Promise<void> {
    const conNo = await this.prisma.interCommuneLoan.findMany({
      // `not: Prisma.DbNull` chứ không phải `NOT: { … : DbNull }`: bộ lọc cột JSON
      // của Prisma phân biệt "ô trống trong bảng" với "giá trị JSON null", và chỉ
      // dạng viết này hỏi đúng câu "ô này có gì không".
      where: { pendingStockMove: { not: Prisma.DbNull } },
      select: { id: true, pendingStockMove: true },
    });
    if (conNo.length === 0) return;

    this.log.warn(`${conNo.length} lần chuyển kho còn dở từ lần chạy trước — đang làm nốt`);
    for (const row of conNo) {
      const viec = parsePendingStockMove(row.pendingStockMove);
      if (!viec) {
        // Dữ liệu méo thì KHÔNG đoán. Xoá cờ để khỏi kêu mãi mỗi lần khởi động,
        // nhưng ghi lại rõ để người trực còn đối chiếu tay được.
        this.log.error(
          `Khoản mượn ${row.id} có việc chuyển kho không đọc được — phải đối chiếu tay: ${JSON.stringify(row.pendingStockMove)}`,
        );
        await this.prisma.interCommuneLoan
          .update({ where: { id: row.id }, data: { pendingStockMove: Prisma.DbNull } })
          .catch(() => undefined);
        continue;
      }
      try {
        await this.moveStock(viec.effect, {
          userId: viec.userId,
          batchId: viec.batchId,
          quantity: viec.quantity,
          scopeWarehouseId: viec.scopeWarehouseId ?? undefined,
          note: viec.note,
          requestId: viec.requestId,
        });
        await this.prisma.interCommuneLoan.update({
          where: { id: row.id },
          data: { pendingStockMove: Prisma.DbNull },
        });
        this.log.log(`Đã làm nốt chuyển kho cho khoản mượn ${row.id}`);
      } catch (error) {
        // Giữ nguyên cờ: lần khởi động sau thử lại. Hết hàng hay sai lô là chuyện
        // người phải xử, xoá cờ ở đây là giấu mất việc còn nợ.
        this.log.error(`Chưa làm nốt được khoản mượn ${row.id}: ${moTaLoi(error)}`);
      }
    }
  }

  /** Danh sách khoản mượn của xã đang đăng nhập, cả hai chiều. */
  async list(userId: string) {
    const organizationId = await this.orgOf(userId);
    const rows = await this.prisma.interCommuneLoan.findMany({
      where: { organizationId },
      orderBy: { requestedAt: "desc" },
    });
    // Sắp bằng tay chứ không `orderBy: status`: Postgres xếp enum theo THỨ TỰ
    // KHAI BÁO, mà trong đó REJECTED đứng ngay sau REQUESTED — tức là các khoản
    // đã đóng nổi lên trên những khoản đang cần làm. Danh sách việc mà xếp kiểu
    // đó thì phải cuộn qua đống đã xong mới thấy việc của mình.
    const uuTien: Record<string, number> = {
      REQUESTED: 0,
      APPROVED: 1,
      ACTIVE: 2,
      PARTIALLY_RETURNED: 3,
      RETURNED: 4,
      REJECTED: 5,
      CANCELLED: 6,
    };
    return rows.sort((a, b) => (uuTien[a.status] ?? 9) - (uuTien[b.status] ?? 9));
  }

  /**
   * Số hàng đang mắc nợ với xã khác, gom theo mã vật tư.
   *
   * Tính từ sổ mượn chứ không thêm cột vào lô: suy từ sổ thì con số không bao giờ
   * lệch với sổ, còn nuôi thêm một cột song song là nuôi thêm một chỗ để sai — mà
   * cái sai đó chỉ lộ ra lúc đối chiếu cuối kỳ.
   */
  async stockMarks(userId: string) {
    const organizationId = await this.orgOf(userId);
    const loans = await this.prisma.interCommuneLoan.findMany({
      where: { organizationId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] } },
    });
    return stockMarksFromLoans(loans as never);
  }

  /**
   * Xã mình gửi yêu cầu mượn sang xã khác.
   *
   * Chưa đụng kho: chưa ai đồng ý, và chưa có hàng nào rời chỗ.
   */
  async requestFromPeer(input: {
    userId: string;
    warehouseId: string | null;
    peerCommuneName: string;
    itemSku: string;
    itemName: string;
    unit: string;
    quantity: number;
    note?: string;
  }) {
    this.assertQuantity(input.quantity);
    const loan = await this.prisma.interCommuneLoan.create({
      data: {
        organizationId: await this.orgOf(input.userId),
        direction: InterCommuneLoanDirection.INCOMING,
        status: InterCommuneLoanStatus.REQUESTED,
        peerCommuneName: input.peerCommuneName.trim(),
        itemSku: input.itemSku.trim(),
        itemName: input.itemName.trim(),
        unit: input.unit.trim(),
        quantity: input.quantity,
        warehouseId: input.warehouseId,
        note: input.note?.trim() || null,
        createdByUserId: input.userId,
      },
    });

    // Gửi sang xã kia SAU KHI đã ghi sổ phía mình, và không để lỗi gửi làm hỏng
    // việc ghi sổ. Mất mạng là chuyện thường lúc thiên tai; yêu cầu vẫn nằm đó,
    // người dùng gọi điện rồi ghi tay như hai xã vẫn làm với nhau từ trước.
    void this.sendToPeer(loan).catch(() => undefined);
    return loan;
  }

  /**
   * Đẩy yêu cầu sang máy chủ xã kia.
   *
   * Ghi lại `peerLoanId` khi gửi được: đó chính là dấu hiệu duy nhất cho người
   * dùng biết bên kia ĐÃ nhận. Không có nó thì màn hình không phân biệt được
   * "đang chờ họ trả lời" với "họ chưa hề biết có yêu cầu này".
   */
  private async sendToPeer(loan: {
    id: string;
    organizationId: string;
    peerCommuneName: string;
    itemSku: string;
    itemName: string;
    unit: string;
    quantity: number;
    note: string | null;
  }): Promise<void> {
    const peer = findPeer(parseCommunePeers(process.env), loan.peerCommuneName);
    if (!peer) return;

    // Hạn chờ ngắn: đây là việc phụ chạy nền, không được giữ tài nguyên khi
    // đường truyền giữa hai xã đang chập chờn.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${peer.baseUrl}/api/loans/inter-commune/inbound`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          // Chỉ gửi khoá. Tên xã đi trong THÂN yêu cầu vì header không mang được
          // chữ có dấu, mà tên xã nào ở đây cũng có dấu.
          "X-Commune-Key": peer.sharedKey,
        },
        body: JSON.stringify({
          peerLoanId: loan.id,
          // Khoá chống nhận trùng lấy theo id bản ghi bên gửi: gửi lại bao nhiêu
          // lần cũng chỉ ra một khoản mượn bên nhận.
          inboundKey: `loan:${loan.id}`,
          // Nói rõ gửi cho xã nào. Thiếu chỗ này thì máy chủ nhận phải đoán, và
          // khi một máy chủ phục vụ nhiều xã thì nó đoán nhầm sang xã khác —
          // yêu cầu mượn hiện lên màn hình của người không liên quan.
          toCommuneName: loan.peerCommuneName,
          // Tự xưng tên thay vì để bên kia suy từ khoá máy. Bên gửi là bên biết
          // rõ tên mình nhất; suy ngược từ khoá chỉ đúng chừng nào mỗi khoá đại
          // diện đúng một xã, mà đó là điều kiện không ai bảo đảm được mãi.
          fromCommuneName: await this.tenXaCuaMinh(loan.organizationId),
          itemSku: loan.itemSku,
          itemName: loan.itemName,
          unit: loan.unit,
          quantity: loan.quantity,
          note: loan.note ?? undefined,
        }),
      });
      if (!response.ok) return;
      const created = (await response.json()) as { id?: string };
      if (!created?.id) return;
      await this.prisma.interCommuneLoan.update({
        where: { id: loan.id },
        data: { peerLoanId: created.id },
      });
    } catch {
      // Không gửi được thì thôi; bản ghi phía mình vẫn còn nguyên.
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Nhận một yêu cầu mượn từ xã khác.
   *
   * `inboundKey` là khoá của xã GỬI. Đường truyền giữa hai xã hay đứt nên xã kia
   * sẽ gửi lại; nhận lại cùng một khoá thì trả về đúng bản ghi cũ, không tạo
   * khoản mượn thứ hai. Không có chốt này thì mỗi lần gửi lại là kho bên cho mượn
   * bị trừ thêm một lần cho cùng một yêu cầu.
   */
  async receiveRequestFromPeer(input: {
    organizationId: string;
    warehouseId: string;
    peerCommuneName: string;
    peerLoanId: string;
    inboundKey: string;
    itemSku: string;
    itemName: string;
    unit: string;
    quantity: number;
    note?: string;
  }) {
    this.assertQuantity(input.quantity);
    const daCo = await this.prisma.interCommuneLoan.findUnique({
      where: { inboundKey: input.inboundKey },
    });
    if (daCo) return daCo;

    // TỰ GỬI CHO CHÍNH MÌNH. Khai địa chỉ xã lân cận trỏ về đúng máy chủ này —
    // rất dễ xảy ra khi cấu hình demo, hoặc khi hai xã cùng dùng một tên miền —
    // thì yêu cầu vừa gửi đi lại quay về, và cơ sở dữ liệu có hai bản ghi cho
    // một khoản: bản đi mượn của mình, cộng thêm một bản "xã kia xin mượn" ma.
    // Duyệt cái ma đó là tự trừ kho của chính mình.
    //
    // Nhận ra bằng chính dữ liệu, không cần khai thêm địa chỉ của mình: id bản
    // ghi bên gửi mà đã có sẵn trong cơ sở dữ liệu này thì người gửi chính là ta.
    const banGhiGoc = await this.prisma.interCommuneLoan.findUnique({
      where: { id: input.peerLoanId },
      select: { organizationId: true },
    });
    // So theo ĐƠN VỊ chứ không chỉ theo sự tồn tại: hai xã hoàn toàn có thể dùng
    // chung một cơ sở dữ liệu (một máy chủ phục vụ cả hai), và khi đó bản ghi bên
    // gửi nằm ngay đây là chuyện bình thường. Chỉ khi nó thuộc CÙNG đơn vị sắp
    // nhận thì mới đúng là tự gửi cho chính mình.
    // Tên xã gửi lấy từ danh bạ của bên nhận, tra theo khoá đã xác thực — KHÔNG
    // tin theo lời khai trong thân yêu cầu. Ai cầm khoá thì danh bạ nói đó là xã
    // nào, chứ không phải người gửi tự xưng.
    //
    // Hệ quả khi hai xã dùng chung MỘT máy chủ (cấu hình để demo bằng hai trình
    // duyệt): danh bạ ấy chỉ có một mục nên bên nhận gọi tên chính mình. Chỉ sai
    // ở NHÃN; số lượng, tồn kho và luồng trạng thái đều đúng. Chạy hai máy chủ
    // thật thì danh bạ mỗi bên có mục của bên kia và tên hiện đúng.
    //
    // Đã thử suy tên từ bản ghi gốc nằm trong cùng cơ sở dữ liệu: điều kiện đúng
    // nhưng nhánh không chạy, chưa cô lập được nguyên nhân. Gỡ đi thay vì để lại
    // mã phức tạp mà vô tác dụng — ghi lại đây để người sau biết hướng đó đã thử.
    const tenXaGui = input.peerCommuneName.trim();

    if (banGhiGoc && banGhiGoc.organizationId === input.organizationId) {
      throw new BadRequestException(
        "Địa chỉ xã lân cận đang trỏ về chính máy chủ này. Sửa lại COMMUNE_PEER_* trong .env.",
      );
    }

    const loan = await this.prisma.interCommuneLoan.create({
      data: {
        organizationId: input.organizationId,
        direction: InterCommuneLoanDirection.OUTGOING,
        status: InterCommuneLoanStatus.REQUESTED,
        peerCommuneName: tenXaGui,
        peerLoanId: input.peerLoanId,
        inboundKey: input.inboundKey,
        itemSku: input.itemSku.trim(),
        itemName: input.itemName.trim(),
        unit: input.unit.trim(),
        quantity: input.quantity,
        warehouseId: input.warehouseId,
        note: input.note?.trim() || null,
      },
    });

    // Thông báo LÀ sợi dây duy nhất giữa hai xã: hai cơ sở dữ liệu tách rời,
    // không ai đọc được của ai. Ghi bản ghi mà không báo thì yêu cầu nằm im
    // trong tab Mượn trả cho tới khi tình cờ có người mở ra xem — mà lúc cần
    // mượn gấp thì không ai đi mở từng tab.
    await this.notifications.create({
      organizationId: input.organizationId,
      recipientRole: UserRole.ADMIN,
      kind: NotificationKind.INTER_WAREHOUSE_REQUEST,
      title: `${tenXaGui} xin mượn ${input.quantity} ${input.unit} ${input.itemName}`,
      body: input.note?.trim() || "Mở tab Mượn trả để đồng ý hoặc từ chối.",
      warehouseId: input.warehouseId,
    });
    return loan;
  }

  /**
   * Nhận yêu cầu do máy chủ xã lân cận đẩy sang.
   *
   * Xã nhận có thể có nhiều đơn vị trong cơ sở dữ liệu; ở đây chọn đơn vị có kho
   * trung tâm, vì mượn liên xã là việc của kho tổng chứ không phải kho thôn.
   */
  async receiveFromPeerServer(
    peerCommuneName: string,
    dto: {
      peerLoanId: string;
      inboundKey: string;
      itemSku: string;
      itemName: string;
      unit: string;
      quantity: number;
      note?: string;
      toCommuneName?: string;
      fromCommuneName?: string;
    },
  ) {
    // Tên xã gửi: ưu tiên tên họ tự khai, lùi về tên suy từ khoá máy khi họ không
    // nói (bản cũ, hoặc máy chủ chưa cập nhật).
    //
    // Đây chỉ là NHÃN, không phải danh tính: quyền gửi đã chốt ở khoá máy trước
    // khi vào tới đây. Ai không có khoá thì không vào được; ai có khoá thì vốn đã
    // gửi được rồi, khai tên gì cũng không mở thêm cửa nào.
    const tenXaGui = dto.fromCommuneName?.trim() || peerCommuneName;
    // Sắp theo ngày tạo để chọn ổn định: `findFirst` không kèm thứ tự thì mỗi
    // lần gọi có thể ra một kho khác khi cơ sở dữ liệu có nhiều đơn vị.
    // Ưu tiên đúng xã mà bên gửi chỉ định. Chỉ khi họ không nói, hoặc nói một tên
    // không có ở đây, mới lùi về kho trung tâm đầu tiên — đúng cho trường hợp
    // thường gặp nhất là một máy chủ phục vụ đúng một xã.
    const theoTen = dto.toCommuneName?.trim()
      ? await this.prisma.warehouse.findFirst({
          where: {
            kind: "CENTRAL",
            organization: { name: { contains: dto.toCommuneName.trim(), mode: "insensitive" } },
          },
          select: { id: true, organizationId: true },
        })
      : null;
    const warehouse =
      theoTen ??
      (await this.prisma.warehouse.findFirst({
        where: { kind: "CENTRAL" },
        orderBy: { createdAt: "asc" },
        select: { id: true, organizationId: true },
      }));
    if (!warehouse) throw new NotFoundException("Xã này chưa cấu hình kho trung tâm");

    // Bóc `fromCommuneName` ra: nó là thông tin đường truyền, không phải cột của
    // bản ghi. Để nó lọt vào là nhét một trường lạ xuống tầng lưu trữ.
    const { fromCommuneName: _boQua, ...duLieu } = dto;
    return this.receiveRequestFromPeer({
      organizationId: warehouse.organizationId,
      warehouseId: warehouse.id,
      ...duLieu,
      peerCommuneName: tenXaGui,
    });
  }

  /**
   * Ghi tay một khoản đã thoả thuận qua điện thoại lúc mất mạng.
   *
   * Bắt đầu thẳng ở ACTIVE vì hàng đã chuyển xong ngoài đời. Chính vì bỏ qua các
   * bước chuyển nên PHẢI tự áp hiệu ứng kho ở đây — thiếu chỗ này thì sổ đứng yên
   * trong khi hàng đã đi.
   */
  /**
   * Tên các xã lân cận, BỎ xã của chính người đang hỏi.
   *
   * Sổ đăng ký có thể chứa cả tên xã mình — chuyện thường khi một cấu hình được
   * chép qua lại giữa các máy chủ trong cùng huyện. Để nguyên thì danh sách chọn
   * có "Đồng Xuân" ngay trên máy của Đồng Xuân, và người dùng có thể tạo một
   * khoản mượn với chính mình: sổ ghi có nợ, kho trừ thật, mà không ai nợ ai cả.
   */
  async peerCommuneNames(userId: string): Promise<string[]> {
    const tenMinh = (await this.tenXaCuaMinh(await this.orgOf(userId)))?.toLowerCase();
    return parseCommunePeers(process.env)
      .map((peer) => peer.communeName)
      .filter((ten) => !tenMinh || ten.trim().toLowerCase() !== tenMinh)
      .sort((a, b) => a.localeCompare(b, "vi"));
  }

  /**
   * Vật tư đang có trong kho, kèm lô sẽ dùng nếu chọn mặt hàng đó.
   *
   * Giao diện cho người dùng chọn TÊN vật tư, không bắt chép mã lô. Mã lô là thứ
   * chỉ máy cần: người trực đang gọi điện thoả thuận với xã bên kia không nói "lô
   * WATER-01-B3", họ nói "nước uống".
   *
   * Lô chọn sẵn là lô có hạn dùng GẦN NHẤT — đúng nguyên tắc hạn gần xuất trước
   * mà kho vẫn theo. Chọn lô mới nhất thì lô cũ nằm lại tới lúc hỏng rồi phải bỏ.
   * Lô không có hạn xếp sau cùng: không có hạn nghĩa là không gấp.
   */
  async availableItemsForManualEntry(userId: string, scopeWarehouseId?: string | null) {
    const organizationId = await this.orgOf(userId);
    const batches = await this.prisma.itemBatch.findMany({
      where: {
        circulation: "IN_STOCK",
        quantity: { gt: 0 },
        shelf: scopeWarehouseId
          ? { zone: { warehouseId: scopeWarehouseId } }
          : { zone: { warehouse: { organizationId } } },
      },
      select: {
        id: true,
        quantity: true,
        expiryDate: true,
        item: { select: { sku: true, name: true, category: { select: { unit: true } } } },
      },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    });

    const theoSku = new Map<
      string,
      { itemSku: string; itemName: string; unit: string; available: number; batchId: string }
    >();
    for (const b of batches) {
      const cu = theoSku.get(b.item.sku);
      if (cu) {
        cu.available += b.quantity;
        continue;
      }
      // Lô đầu tiên gặp là lô hạn gần nhất nhờ thứ tự truy vấn ở trên. Prisma xếp
      // giá trị rỗng sau cùng theo mặc định của Postgres với `asc`, đúng ý muốn.
      theoSku.set(b.item.sku, {
        itemSku: b.item.sku,
        itemName: b.item.name,
        unit: b.item.category.unit,
        available: b.quantity,
        batchId: b.id,
      });
    }

    return [...theoSku.values()].sort((a, b) => a.itemName.localeCompare(b.itemName, "vi"));
  }

  /**
   * Chọn lô cho một mã vật tư: lô có hạn dùng GẦN NHẤT.
   *
   * Đúng nguyên tắc hạn gần xuất trước mà kho vẫn theo. Chọn lô mới nhất thì lô
   * cũ nằm lại tới lúc hỏng rồi phải bỏ — kho cứu trợ mà bỏ hàng vì hết hạn là
   * mất đúng thứ cần dùng lúc bão.
   */
  private async chonLoTheoSku(input: {
    itemSku?: string;
    userId: string;
    scopeWarehouseId?: string | null;
  }): Promise<string> {
    const sku = input.itemSku?.trim();
    if (!sku) throw new BadRequestException("Cần chọn vật tư hoặc nhập mã lô");

    const organizationId = await this.orgOf(input.userId);
    const lo = await this.prisma.itemBatch.findFirst({
      where: {
        item: { sku },
        circulation: "IN_STOCK",
        quantity: { gt: 0 },
        shelf: input.scopeWarehouseId
          ? { zone: { warehouseId: input.scopeWarehouseId } }
          : { zone: { warehouse: { organizationId } } },
      },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!lo) throw new BadRequestException(`Kho không còn lô nào của vật tư ${sku}`);
    return lo.id;
  }

  async recordManually(input: {
    userId: string;
    direction: InterCommuneDirection;
    peerCommuneName: string;
    /** Mã lô cụ thể. Bỏ trống thì phải có `itemSku` để tự chọn lô. */
    batchId?: string;
    /** Mã vật tư — hệ thống tự lấy lô hạn gần nhất. */
    itemSku?: string;
    quantity: number;
    scopeWarehouseId?: string | null;
    note?: string;
  }) {
    this.assertQuantity(input.quantity);

    // Nhận CẢ HAI cách chỉ định hàng.
    //
    // Giao diện gửi mã vật tư vì người trực nói "nước uống", không nói "lô
    // WATER-01-B3". Nhưng đường nhận mã lô vẫn giữ: có lúc người ta cần chỉ đúng
    // một lô cụ thể (lô sắp hỏng, lô vừa nhận về), và bỏ đường đó là lấy mất khả
    // năng ấy chỉ để cho gọn chữ ký hàm.
    const batchId = input.batchId?.trim() || (await this.chonLoTheoSku(input));
    const batch = await this.batchInfo(batchId);

    const effect = manualEntryStockEffect(input.direction);
    const requestId = `loan-manual-${batchId}-${Date.now()}`;
    await this.moveStock(effect, {
      userId: input.userId,
      batchId,
      quantity: input.quantity,
      scopeWarehouseId: input.scopeWarehouseId,
      note: `Mượn liên xã (ghi tay) với ${input.peerCommuneName}`,
      requestId,
    });

    return this.prisma.interCommuneLoan.create({
      data: {
        organizationId: await this.orgOf(input.userId),
        direction: input.direction as InterCommuneLoanDirection,
        status: MANUAL_INITIAL_STATUS as InterCommuneLoanStatus,
        peerCommuneName: input.peerCommuneName.trim(),
        itemSku: batch.sku,
        itemName: batch.name,
        unit: batch.unit,
        quantity: input.quantity,
        warehouseId: batch.warehouseId,
        recordedManually: true,
        note: input.note?.trim() || null,
        createdByUserId: input.userId,
        receivedAt: new Date(),
      },
    });
  }

  /**
   * Chuyển trạng thái một khoản mượn và áp hiệu ứng kho kèm theo.
   *
   * `batchId` bắt buộc khi bước đó có đụng kho: người thủ kho tự chọn lô để đưa
   * hoặc để nhận vào, thay vì hệ thống tự phân bổ. Đúng việc họ vẫn làm, và tránh
   * phải viết một thuật toán chọn lô mới — chỗ đó sai là mất hàng thật trong sổ.
   */
  async advance(input: {
    loanId: string;
    userId: string;
    to: InterCommuneStatus;
    batchId?: string;
    quantity?: number;
    reason?: string;
    scopeWarehouseId?: string | null;
  }) {
    const loan = await this.prisma.interCommuneLoan.findUnique({ where: { id: input.loanId } });
    if (!loan) throw new NotFoundException("Không tìm thấy khoản mượn");
    // Bản ghi của xã khác không được đụng tới, kể cả khi biết id.
    if (loan.organizationId !== (await this.orgOf(input.userId))) {
      throw new ForbiddenException("Khoản mượn này không thuộc đơn vị của bạn");
    }

    const from = loan.status as InterCommuneStatus;
    const transition = findTransition(from, input.to);
    if (!transition) {
      throw new BadRequestException(`Không thể chuyển khoản mượn từ ${from} sang ${input.to}`);
    }
    const direction = loan.direction as InterCommuneDirection;
    // Bản ghi ghi tay KHÔNG kiểm vai: nó không có bản ghi đối ứng ở xã kia, vì
    // xã kia không đăng nhập vào hệ thống này. Người giữ bản ghi làm thay cả hai
    // vai — họ ghi lúc đưa hàng đi và ghi cả lúc nhận hàng về. Kiểm vai ở đây thì
    // khoản mượn ghi tay không bao giờ đóng lại được.
    if (!loan.recordedManually && actorOf(direction) !== transition.by) {
      throw new ForbiddenException(
        transition.by === "LENDER"
          ? "Chỉ bên cho mượn mới làm được bước này"
          : "Chỉ bên đi mượn mới làm được bước này",
      );
    }

    // Trả từng phần: số lượng và trạng thái đích do luật quyết, không do client.
    let returnedQuantity = loan.returnedQuantity;
    let status: InterCommuneStatus = input.to;
    let movingQuantity = loan.quantity;
    if (input.to === "RETURNED" || input.to === "PARTIALLY_RETURNED") {
      movingQuantity = input.quantity ?? loan.quantity - loan.returnedQuantity;
      const ketQua = statusAfterReturn(loan.quantity, loan.returnedQuantity, movingQuantity);
      status = ketQua.status;
      returnedQuantity = ketQua.totalReturned;
    }

    const effect = loan.recordedManually
      ? manualStockEffect(direction, status)
      : stockEffect(direction, transition);
    if (effect !== "NONE" && !input.batchId) {
      throw new BadRequestException("Bước này có thay đổi tồn kho nên phải chọn lô vật tư");
    }

    // GIÀNH quyền chuyển trạng thái trước khi đụng kho.
    //
    // Đọc rồi ghi mà không khoá thì hai lượt trả chạy cùng lúc đều đọc được cùng
    // một `returnedQuantity` cũ: cả hai cùng chuyển kho, nhưng chỉ một lượt ghi
    // được vào sổ. Kho trừ 12 mà sổ ghi 7 — lệch mà không ai thấy ngay.
    //
    // Điều kiện `status` và `returnedQuantity` trong mệnh đề where chính là chốt:
    // lượt thứ hai không khớp trạng thái đã đọc nên `count` bằng 0 và bị từ chối,
    // thay vì lặng lẽ đè lên lượt thứ nhất.
    const now = new Date();
    // Ghi lời hứa chuyển kho vào CÙNG lượt ghi chốt sổ. Đây là chỗ đóng khe hẹp
    // giữa sổ và kho: hai việc nằm ở hai transaction khác nhau, nên sập nguồn
    // giữa chừng thì sổ đã đổi mà hàng còn nguyên. Có lời hứa nằm lại thì lần
    // khởi động sau biết còn nợ việc gì mà làm nốt.
    const loiHua =
      effect === "NONE"
        ? null
        : ({
            effect,
            userId: input.userId,
            batchId: input.batchId as string,
            quantity: movingQuantity,
            scopeWarehouseId: input.scopeWarehouseId ?? null,
            note: `Mượn liên xã với ${loan.peerCommuneName} — ${transition.label}`,
            requestId: `loan-${loan.id}-${input.to}-${returnedQuantity}`,
          } satisfies PendingStockMove);

    const claimed = await this.prisma.interCommuneLoan.updateMany({
      where: {
        id: loan.id,
        status: loan.status,
        returnedQuantity: loan.returnedQuantity,
      },
      data: {
        status: status as InterCommuneLoanStatus,
        returnedQuantity,
        rejectReason: input.to === "REJECTED" ? (input.reason?.trim() ?? null) : loan.rejectReason,
        decidedAt: from === "REQUESTED" ? now : loan.decidedAt,
        receivedAt: input.to === "ACTIVE" ? now : loan.receivedAt,
        returnedAt: status === "RETURNED" ? now : loan.returnedAt,
        pendingStockMove: loiHua ? (loiHua as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        "Khoản mượn vừa được cập nhật ở nơi khác. Tải lại rồi thao tác tiếp.",
      );
    }

    if (loiHua) {
      try {
        await this.moveStock(effect, {
          userId: loiHua.userId,
          batchId: loiHua.batchId,
          quantity: loiHua.quantity,
          scopeWarehouseId: loiHua.scopeWarehouseId ?? undefined,
          note: loiHua.note,
          requestId: loiHua.requestId,
        });
        // Hàng đã đi thật thì xoá lời hứa. Để lại là lần khởi động sau chạy lại
        // một việc đã xong — không sai nhờ khoá chống trùng, nhưng làm người đọc
        // nhật ký tưởng có sự cố.
        await this.prisma.interCommuneLoan.update({
          where: { id: loan.id },
          data: { pendingStockMove: Prisma.DbNull },
        });
      } catch (error) {
        // Kho không chuyển được (hết hàng, sai quyền, sai lô) thì trả sổ về đúng
        // chỗ cũ. Để nguyên là sổ ghi đã trả trong khi hàng chưa hề động đậy.
        await this.prisma.interCommuneLoan.update({
          where: { id: loan.id },
          data: {
            status: loan.status,
            returnedQuantity: loan.returnedQuantity,
            decidedAt: loan.decidedAt,
            receivedAt: loan.receivedAt,
            returnedAt: loan.returnedAt,
            // Lùi sổ về thì lời hứa cũng phải rút: giữ lại là lần khởi động sau
            // chuyển hàng cho một trạng thái đã bị huỷ.
            pendingStockMove: Prisma.DbNull,
          },
        });
        throw error;
      }
    }

    const daCapNhat = await this.prisma.interCommuneLoan.findUnique({ where: { id: loan.id } });
    if (daCapNhat) void this.pushStatusToPeer(daCapNhat).catch(() => undefined);
    return daCapNhat;
  }

  /**
   * Báo trạng thái mới sang xã kia.
   *
   * Thiếu chiều này thì tính năng đứng hình ngay ở bước hai: xã cho mượn bấm
   * "đồng ý", nhưng bản ghi bên xã đi mượn vẫn nằm ở "chờ bên kia quyết" và
   * KHÔNG có nút nào đi tiếp. Mỗi bên tự biết việc mình làm mà bên kia không hay.
   *
   * Bên nhận chỉ chép lại trạng thái, KHÔNG đụng kho: kho của họ chỉ đổi bởi
   * chính thao tác của họ. Đây đúng là điều luật trạng thái đã nói — bên không
   * thực hiện bước thì hiệu ứng kho là NONE.
   */
  private async pushStatusToPeer(loan: {
    peerLoanId: string | null;
    peerCommuneName: string;
    status: string;
    returnedQuantity: number;
  }): Promise<void> {
    if (!loan.peerLoanId) return;
    const peer = findPeer(parseCommunePeers(process.env), loan.peerCommuneName);
    if (!peer) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      await fetch(`${peer.baseUrl}/api/loans/inter-commune/peer-status`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Commune-Key": peer.sharedKey },
        body: JSON.stringify({
          loanId: loan.peerLoanId,
          status: loan.status,
          returnedQuantity: loan.returnedQuantity,
        }),
      });
    } catch {
      // Không báo được thì thôi: sổ phía mình vẫn đúng, hai bên đối chiếu bằng
      // điện thoại như vẫn làm. Không được để lỗi báo tin làm hỏng thao tác kho.
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Nhận thông báo trạng thái từ xã kia.
   *
   * Chỉ chép trạng thái, không chuyển kho, và chỉ chấp nhận bước hợp lệ theo luật
   * — bên kia gửi sai thì bản ghi phía mình vẫn không nhảy lung tung.
   */
  async syncStatusFromPeer(input: {
    loanId: string;
    status: InterCommuneStatus;
    returnedQuantity: number;
  }) {
    const loan = await this.prisma.interCommuneLoan.findUnique({ where: { id: input.loanId } });
    if (!loan) throw new NotFoundException("Không tìm thấy khoản mượn");
    if (loan.status === input.status && loan.returnedQuantity === input.returnedQuantity) {
      return loan; // Báo lại lần nữa thì không đổi gì.
    }
    if (!findTransition(loan.status as InterCommuneStatus, input.status)) {
      throw new BadRequestException(
        `Không thể chuyển khoản mượn từ ${loan.status} sang ${input.status}`,
      );
    }
    await this.notifyPeerDecision(loan, input.status);
    const now = new Date();
    return this.prisma.interCommuneLoan.update({
      where: { id: loan.id },
      data: {
        status: input.status as InterCommuneLoanStatus,
        returnedQuantity: input.returnedQuantity,
        decidedAt: loan.decidedAt ?? now,
        receivedAt: input.status === "ACTIVE" ? now : loan.receivedAt,
        returnedAt: input.status === "RETURNED" ? now : loan.returnedAt,
      },
    });
  }

  /** Báo cho người của xã mình biết bên kia vừa quyết gì. */
  private async notifyPeerDecision(
    loan: {
      organizationId: string;
      warehouseId: string | null;
      peerCommuneName: string;
      itemName: string;
      quantity: number;
      unit: string;
    },
    status: InterCommuneStatus,
  ) {
    const cau: Partial<Record<InterCommuneStatus, string>> = {
      APPROVED: `${loan.peerCommuneName} ĐỒNG Ý cho mượn ${loan.quantity} ${loan.unit} ${loan.itemName}`,
      REJECTED: `${loan.peerCommuneName} từ chối cho mượn ${loan.itemName}`,
      ACTIVE: `${loan.peerCommuneName} đã nhận ${loan.quantity} ${loan.unit} ${loan.itemName}`,
      PARTIALLY_RETURNED: `${loan.peerCommuneName} đã trả một phần ${loan.itemName}`,
      RETURNED: `${loan.peerCommuneName} đã trả xong ${loan.itemName}`,
      CANCELLED: `${loan.peerCommuneName} đã huỷ khoản mượn ${loan.itemName}`,
    };
    const title = cau[status];
    if (!title) return;
    await this.notifications.create({
      organizationId: loan.organizationId,
      recipientRole: UserRole.ADMIN,
      kind: NotificationKind.INTER_WAREHOUSE_REQUEST,
      title,
      body: "Mở tab Mượn trả để xem chi tiết.",
      warehouseId: loan.warehouseId ?? undefined,
    });
  }

  private async moveStock(effect: "DEDUCT" | "ADD" | "NONE", input: MoveStockInput) {
    if (effect === "NONE") return;
    const { userId, batchId, quantity, note, scopeWarehouseId, requestId } = input;
    // TransactionSource.MANUAL: đây là thao tác do người khai, không phải quét mã
    // hay cân tự động. Ghi đúng nguồn để độ tin cậy dữ liệu phản ánh thật.
    if (effect === "DEDUCT") {
      await this.inventory.export(
        userId,
        batchId,
        quantity,
        note,
        TransactionSource.MANUAL,
        scopeWarehouseId,
        requestId,
      );
      return;
    }
    await this.inventory.import(
      userId,
      batchId,
      quantity,
      note,
      TransactionSource.MANUAL,
      scopeWarehouseId,
      requestId,
    );
  }

  private async batchInfo(batchId: string) {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: {
        // Đơn vị nằm ở nhóm vật tư, không nằm ở vật tư — Item không có cột unit.
        item: { select: { sku: true, name: true, category: { select: { unit: true } } } },
        shelf: { select: { zone: { select: { warehouseId: true } } } },
      },
    });
    if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");
    return {
      sku: batch.item.sku,
      name: batch.item.name,
      unit: batch.item.category?.unit ?? "đơn vị",
      warehouseId: batch.shelf?.zone.warehouseId ?? null,
    };
  }

  /**
   * Xã của người đang thao tác.
   *
   * Tra từ người dùng chứ không lấy từ token: token hiện không mang
   * `organizationId`, và thêm trường vào token nghĩa là mọi phiên đang đăng nhập
   * phải đăng nhập lại — cái giá không đáng cho một truy vấn.
   */
  /**
   * Tên xã của chính mình, rút gọn khỏi tên đơn vị đầy đủ.
   *
   * Đơn vị lưu là "Hội Chữ thập đỏ xã Đồng Xuân" nhưng bên kia chỉ cần "Đồng
   * Xuân" — họ đối chiếu tên này với tên xã đã gõ lúc gửi yêu cầu, mà lúc đó
   * người dùng gõ tên xã chứ không gõ tên hội.
   */
  private async tenXaCuaMinh(organizationId: string): Promise<string | undefined> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) return undefined;
    // Cắt tại "xã"/"phường"/"thị trấn" nếu có; không có thì trả nguyên tên thay
    // vì đoán bừa — tên nguyên vẹn vẫn đọc được, tên cắt sai thì không.
    const khop = /(?:^|\s)(?:xã|phường|thị trấn)\s+(.+)$/iu.exec(org.name.trim());
    return (khop?.[1] ?? org.name).trim() || undefined;
  }

  private async orgOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) throw new NotFoundException("Không tìm thấy người dùng");
    return user.organizationId;
  }

  private assertQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException("Số lượng phải là số nguyên dương");
    }
  }
}

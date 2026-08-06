import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InterCommuneLoanDirection,
  InterCommuneLoanStatus,
  TransactionSource,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
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
export class InterCommuneLoanService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  /** Danh sách khoản mượn của xã đang đăng nhập, cả hai chiều. */
  async list(userId: string) {
    const organizationId = await this.orgOf(userId);
    return this.prisma.interCommuneLoan.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    });
  }

  /**
   * Xã mình gửi yêu cầu mượn sang xã khác.
   *
   * Chưa đụng kho: chưa ai đồng ý, và chưa có hàng nào rời chỗ.
   */
  async requestFromPeer(input: {
    userId: string;
    warehouseId: string;
    peerCommuneName: string;
    itemSku: string;
    itemName: string;
    unit: string;
    quantity: number;
    note?: string;
  }) {
    this.assertQuantity(input.quantity);
    return this.prisma.interCommuneLoan.create({
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

    return this.prisma.interCommuneLoan.create({
      data: {
        organizationId: input.organizationId,
        direction: InterCommuneLoanDirection.OUTGOING,
        status: InterCommuneLoanStatus.REQUESTED,
        peerCommuneName: input.peerCommuneName.trim(),
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
  }

  /**
   * Ghi tay một khoản đã thoả thuận qua điện thoại lúc mất mạng.
   *
   * Bắt đầu thẳng ở ACTIVE vì hàng đã chuyển xong ngoài đời. Chính vì bỏ qua các
   * bước chuyển nên PHẢI tự áp hiệu ứng kho ở đây — thiếu chỗ này thì sổ đứng yên
   * trong khi hàng đã đi.
   */
  async recordManually(input: {
    userId: string;
    direction: InterCommuneDirection;
    peerCommuneName: string;
    batchId: string;
    quantity: number;
    scopeWarehouseId?: string | null;
    note?: string;
  }) {
    this.assertQuantity(input.quantity);
    const batch = await this.batchInfo(input.batchId);

    const effect = manualEntryStockEffect(input.direction);
    const requestId = `loan-manual-${input.batchId}-${Date.now()}`;
    await this.moveStock(effect, {
      userId: input.userId,
      batchId: input.batchId,
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
    if (effect !== "NONE") {
      if (!input.batchId) {
        throw new BadRequestException("Bước này có thay đổi tồn kho nên phải chọn lô vật tư");
      }
      await this.moveStock(effect, {
        userId: input.userId,
        batchId: input.batchId,
        quantity: movingQuantity,
        scopeWarehouseId: input.scopeWarehouseId,
        note: `Mượn liên xã với ${loan.peerCommuneName} — ${transition.label}`,
        requestId: `loan-${loan.id}-${input.to}-${returnedQuantity}`,
      });
    }

    const now = new Date();
    return this.prisma.interCommuneLoan.update({
      where: { id: loan.id },
      data: {
        status: status as InterCommuneLoanStatus,
        returnedQuantity,
        rejectReason: input.to === "REJECTED" ? (input.reason?.trim() ?? null) : loan.rejectReason,
        decidedAt: from === "REQUESTED" ? now : loan.decidedAt,
        receivedAt: input.to === "ACTIVE" ? now : loan.receivedAt,
        returnedAt: status === "RETURNED" ? now : loan.returnedAt,
      },
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

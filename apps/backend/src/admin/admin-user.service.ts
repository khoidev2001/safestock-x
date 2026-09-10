import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { EmailVerificationPurpose, Prisma } from "@prisma/client";
import { UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { EmailVerificationService } from "../auth/email-verification.service";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";

interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  warehouseId?: string | null;
  /** Chỉ dùng khi tạo ADMIN: email nhận cảnh báo, phải kèm mã đã gửi tới chính nó. */
  notificationEmail?: string;
  verificationCode?: string;
  /** Xã của tài khoản ADMIN mới. Chỉ super admin chọn được; bỏ trống = xã của người tạo. */
  organizationId?: string;
}

interface Actor {
  id: string;
  role: UserRole;
  isSuperAdmin: boolean;
  organizationId: string;
}

/** Role được scope vào 1 kho: phụ trách kho, đồng thời là trưởng thôn của thôn đó. */
function isWarehouseScopedRole(role: UserRole): boolean {
  return role === UserRole.WAREHOUSE;
}

/**
 * Quản lý user (ADMIN xã): tạo/sửa/xoá tài khoản, gán người phụ trách vào 1 kho.
 * warehouseId chỉ có nghĩa với role scope kho (WAREHOUSE); role khác → bỏ qua.
 *
 * Bậc quản trị:
 * - SUPER ADMIN (ADMIN có isSuperAdmin): tạo được tài khoản ADMIN, xoá được mọi tài
 *   khoản TRỪ super admin. Tạo ADMIN bắt buộc kèm email đã xác minh bằng mã 6 số —
 *   người có quyền cao nhất mà email sai thì lúc có sự cố không ai nhận được cảnh báo.
 * - ADMIN thường: chỉ tạo/xoá được tài khoản bậc dưới (phụ trách kho, hiện trường).
 * Ngoài quản trị tài khoản, hai bậc dùng chung mọi quyền và mọi tính năng khác.
 */
@Injectable()
export class AdminUserService {
  constructor(
    private prisma: PrismaService,
    private verification: EmailVerificationService,
  ) {}

  /**
   * Danh sách tài khoản mà người đang đăng nhập được phép nhìn thấy.
   *
   * TRƯỚC ĐÂY KHÔNG LỌC GÌ CẢ — trả về mọi tài khoản trong cơ sở dữ liệu. Đúng
   * chừng nào hệ thống còn phục vụ một xã duy nhất; từ xã thứ hai trở đi thì
   * quản trị viên xã Xuân Thọ mở màn Tài khoản là thấy trọn danh sách trưởng thôn
   * của Đồng Xuân, kèm số điện thoại và email nhận cảnh báo của họ. Và vì màn đó
   * có sẵn nút Sửa/Xoá, nhìn thấy đồng nghĩa với đụng được.
   *
   * Super admin vẫn nhìn được cả huyện: đó là bậc dựng và thu hồi tài khoản quản
   * trị cho từng xã (xem `resolveOrganization`), không quản được thì việc đó
   * không làm được. Quản trị viên xã thì chỉ thấy người của xã mình.
   */
  async list(actorId: string) {
    const actor = await this.loadActor(actorId);
    return this.prisma.user.findMany({
      where: actor.isSuperAdmin ? {} : { organizationId: actor.organizationId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isSuperAdmin: true,
        warehouseId: true,
        // Số gọi được của người phụ trách kho. Danh sách tài khoản là chỗ duy
        // nhất gom đủ "ai giữ kho nào" — thiếu số thì người trực phải sang màn
        // khác tra, giữa lúc đang cần gọi ngay.
        phone: true,
        notificationEmail: true,
        notificationEmailVerifiedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Bước 1 của việc tạo ADMIN: gửi mã 6 số tới email sẽ gắn cho tài khoản mới. */
  async requestAdminEmailCode(actorId: string, email: string) {
    const actor = await this.loadActor(actorId);
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException("Chỉ super admin mới tạo được tài khoản quản trị");
    }
    const normalized = this.verification.normalizeEmail(email);
    const pending = await this.verification.issue({
      userId: actor.id,
      email: normalized,
      purpose: EmailVerificationPurpose.ADMIN_ACCOUNT,
      recipientName: null,
    });
    return {
      email: pending.email,
      expiresAt: pending.expiresAt,
      delivery: pending.delivery,
      devCode: pending.devCode,
    };
  }

  async create(actorId: string, input: CreateUserInput) {
    const actor = await this.loadActor(actorId);
    this.assertMayManageRole(actor, input.role, "tạo");

    if (isSimulationSystemActorEmail(input.email)) {
      throw new BadRequestException("Email được dành riêng cho actor hệ thống");
    }
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new BadRequestException("Email đã tồn tại");

    // Xã của tài khoản mới phải chốt TRƯỚC khi kiểm kho: kho hợp lệ hay không là
    // câu hỏi "có thuộc xã đó không", nên hỏi ngược lại thì không trả lời được.
    const organizationId = await this.resolveOrganization(actor, input);
    await this.assertWarehouseValid(input.role, input.warehouseId, organizationId);

    // Bước 2 của luồng tạo ADMIN: mã phải đúng VÀ phải là mã của chính địa chỉ
    // đang nhập, nếu không thì đổi email ở phút chót là qua mặt được bước xác minh.
    let verifiedEmail: string | null = null;
    if (input.role === UserRole.ADMIN) {
      const notificationEmail = this.verification.normalizeEmail(input.notificationEmail ?? "");
      this.verification.assertEmailShape(notificationEmail);
      if (!input.verificationCode) {
        throw new BadRequestException("Cần nhập mã xác minh đã gửi tới email của quản trị viên");
      }
      verifiedEmail = await this.verification.consume({
        userId: actor.id,
        code: input.verificationCode,
        purpose: EmailVerificationPurpose.ADMIN_ACCOUNT,
        expectedEmail: notificationEmail,
      });
    }

    const user = await this.prisma.user.create({
      data: {
        organizationId,
        email: input.email,
        passwordHash: bcrypt.hashSync(input.password, 10),
        fullName: input.fullName,
        role: input.role,
        warehouseId: isWarehouseScopedRole(input.role) ? (input.warehouseId ?? null) : null,
        notificationEmail: verifiedEmail,
        notificationEmailVerifiedAt: verifiedEmail ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isSuperAdmin: true,
        warehouseId: true,
        notificationEmail: true,
        notificationEmailVerifiedAt: true,
      },
    });
    return user;
  }

  async update(actorId: string, id: string, patch: Partial<CreateUserInput>) {
    const actor = await this.loadActor(actorId);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Không tìm thấy user");
    this.assertSameCommune(actor, user.organizationId);
    if (isSimulationSystemActorEmail(user.email)) {
      throw new ForbiddenException("Không được sửa actor hệ thống");
    }
    if (user.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException("Không được sửa tài khoản super admin");
    }
    this.assertMayManageRole(actor, user.role as UserRole, "sửa");
    if (patch.role !== undefined) this.assertMayManageRole(actor, patch.role, "gán");

    const role = (patch.role ?? user.role) as UserRole;
    if (patch.warehouseId !== undefined || patch.role !== undefined) {
      await this.assertWarehouseValid(
        role,
        patch.warehouseId ?? user.warehouseId,
        user.organizationId,
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: patch.fullName,
        role: patch.role,
        // `undefined` là không đụng tới, `null` là xoá số — hai ý khác nhau nên
        // không gộp bằng `|| null`.
        phone: patch.phone,
        warehouseId:
          patch.warehouseId !== undefined
            ? isWarehouseScopedRole(role)
              ? patch.warehouseId
              : null
            : undefined,
        ...(patch.password ? { passwordHash: bcrypt.hashSync(patch.password, 10) } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isSuperAdmin: true,
        warehouseId: true,
        phone: true,
      },
    });
  }

  async remove(actorId: string, id: string) {
    const actor = await this.loadActor(actorId);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Không tìm thấy user");
    this.assertSameCommune(actor, user.organizationId);
    if (isSimulationSystemActorEmail(user.email)) {
      throw new ForbiddenException("Không được xóa actor hệ thống");
    }
    // Không ai xoá được super admin, kể cả super admin khác: đây là tài khoản cuối
    // cùng còn quyền dựng lại toàn bộ hệ thống tài khoản khi có sự cố.
    if (user.isSuperAdmin) {
      throw new ForbiddenException("Không được xóa tài khoản super admin");
    }
    if (user.id === actor.id) {
      throw new ForbiddenException("Không được xóa chính tài khoản đang đăng nhập");
    }
    this.assertMayManageRole(actor, user.role as UserRole, "xóa");

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      // Tài khoản đã ký tên vào sổ kho thì xoá đi là mất luôn người thực hiện của
      // những dòng đó — DB chặn, và ở đây nói rõ lý do thay vì trả 500 trống trơn.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new BadRequestException(
          "Tài khoản này đã phát sinh giao dịch kho nên không xóa được. Hãy đổi mật khẩu hoặc hạ vai trò thay vì xóa.",
        );
      }
      throw error;
    }
    return { deleted: true };
  }

  /**
   * Các xã có trong hệ thống, để super admin chọn khi tạo tài khoản quản trị.
   *
   * Kèm SỐ KHO của mỗi xã: tên đơn vị một mình không phân biệt được xã đã dựng
   * xong với xã mới tạo còn trống — mà tạo quản trị viên cho một xã chưa có kho
   * nào là tạo một tài khoản đăng nhập vào màn hình rỗng.
   */
  async listCommunes(actorId: string) {
    // Chỉ super admin. Quản trị viên xã không tạo được tài khoản cho xã khác
    // (`resolveOrganization` chặn), nên với họ danh sách này không mở ra việc gì —
    // nó chỉ kể tên mọi xã trong huyện kèm số kho và số tài khoản của từng xã.
    const actor = await this.loadActor(actorId);
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException("Chỉ super admin mới xem được danh sách xã");
    }
    const organizations = await this.prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { warehouses: true, users: true } },
      },
      orderBy: { name: "asc" },
    });
    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      warehouseCount: organization._count.warehouses,
      userCount: organization._count.users,
    }));
  }

  /**
   * Tài khoản mới thuộc xã nào.
   *
   * Mặc định là xã của NGƯỜI TẠO, không phải "đơn vị đầu tiên trong bảng". Hai
   * cách này trùng nhau chừng nào hệ thống còn đúng một xã; từ xã thứ hai trở đi
   * thì cách cũ ném tài khoản mới sang một xã tuỳ theo thứ tự bảng trả về.
   *
   * Chỉ SUPER ADMIN chỉ định được xã khác, và chỉ cho tài khoản QUẢN TRỊ XÃ: tài
   * khoản kho và hiện trường gắn với kho/địa bàn cụ thể, nên chúng phải ở cùng xã
   * với người quản lý chúng.
   */
  private async resolveOrganization(actor: Actor, input: CreateUserInput): Promise<string> {
    const requested = input.organizationId?.trim();
    if (!requested || requested === actor.organizationId) return actor.organizationId;
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException("Chỉ super admin mới tạo được tài khoản cho xã khác");
    }
    if (input.role !== UserRole.ADMIN) {
      throw new BadRequestException(
        "Chỉ tài khoản quản trị xã mới chọn được xã. Tài khoản kho và hiện trường thuộc cùng xã với người tạo.",
      );
    }
    const organization = await this.prisma.organization.findUnique({ where: { id: requested } });
    if (!organization) throw new NotFoundException("Xã được chọn không tồn tại");
    return organization.id;
  }

  private async loadActor(actorId: string): Promise<Actor> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, role: true, isSuperAdmin: true, organizationId: true },
    });
    if (!actor) throw new ForbiddenException("Tài khoản thực hiện không tồn tại");
    return {
      id: actor.id,
      role: actor.role as UserRole,
      isSuperAdmin: actor.isSuperAdmin,
      organizationId: actor.organizationId,
    };
  }

  /** ADMIN thường chỉ đụng được tới các bậc dưới; ADMIN là bậc chỉ super admin quản. */
  private assertMayManageRole(actor: Actor, role: UserRole, action: string): void {
    if (role === UserRole.ADMIN && !actor.isSuperAdmin) {
      throw new ForbiddenException(`Chỉ super admin mới ${action} được tài khoản quản trị xã`);
    }
  }

  /**
   * warehouseId (nếu có) phải trỏ tới kho CÓ THẬT VÀ THUỘC ĐÚNG XÃ của tài khoản.
   *
   * Thiếu vế thứ hai thì gán được một trưởng thôn của xã này vào kho của xã kia:
   * tài khoản đó đăng nhập vào là thấy tồn kho, phiếu xuất và nhiệm vụ của một xã
   * không phải xã mình — mà mọi lớp kiểm quyền phía sau đều tin vào `warehouseId`
   * nên không lớp nào chặn lại.
   */
  private async assertWarehouseValid(
    role: UserRole,
    warehouseId: string | null | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!warehouseId) return;
    if (!isWarehouseScopedRole(role)) {
      throw new BadRequestException("Chỉ tài khoản phụ trách kho mới gán được kho");
    }
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { organizationId: true },
    });
    // Kho của xã khác trả lời y như kho không tồn tại: người hỏi không có việc gì
    // ở đó, nên câu trả lời cũng không nên xác nhận là nó có.
    if (!wh || wh.organizationId !== organizationId) {
      throw new NotFoundException("Kho gán không tồn tại");
    }
  }

  /**
   * Tài khoản bị tác động phải cùng xã với người thực hiện.
   *
   * Báo KHÔNG TÌM THẤY chứ không phải KHÔNG CÓ QUYỀN: "không có quyền" là một câu
   * xác nhận rằng id đó có tồn tại, và ai cũng dò được id để đếm xem xã bên cạnh
   * có bao nhiêu tài khoản. Cùng lối trả lời với phạm vi nhiệm vụ (`mission.service`).
   */
  private assertSameCommune(actor: Actor, targetOrganizationId: string): void {
    if (actor.isSuperAdmin) return;
    if (targetOrganizationId !== actor.organizationId) {
      throw new NotFoundException("Không tìm thấy user");
    }
  }
}

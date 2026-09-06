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
}

interface Actor {
  id: string;
  role: UserRole;
  isSuperAdmin: boolean;
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

  list() {
    return this.prisma.user.findMany({
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

    await this.assertWarehouseValid(input.role, input.warehouseId);

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

    // 1 org/xã duy nhất trong MVP — tạo user cùng org hiện có.
    const org = await this.prisma.organization.findFirst();
    if (!org) throw new BadRequestException("Chưa có tổ chức (org) nào");

    const user = await this.prisma.user.create({
      data: {
        organizationId: org.id,
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
      await this.assertWarehouseValid(role, patch.warehouseId ?? user.warehouseId);
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

  private async loadActor(actorId: string): Promise<Actor> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, role: true, isSuperAdmin: true },
    });
    if (!actor) throw new ForbiddenException("Tài khoản thực hiện không tồn tại");
    return { id: actor.id, role: actor.role as UserRole, isSuperAdmin: actor.isSuperAdmin };
  }

  /** ADMIN thường chỉ đụng được tới các bậc dưới; ADMIN là bậc chỉ super admin quản. */
  private assertMayManageRole(actor: Actor, role: UserRole, action: string): void {
    if (role === UserRole.ADMIN && !actor.isSuperAdmin) {
      throw new ForbiddenException(`Chỉ super admin mới ${action} được tài khoản quản trị xã`);
    }
  }

  /** warehouseId (nếu có) phải trỏ tới kho có thật; chỉ role scope kho được gán. */
  private async assertWarehouseValid(role: UserRole, warehouseId?: string | null): Promise<void> {
    if (!warehouseId) return;
    if (!isWarehouseScopedRole(role)) {
      throw new BadRequestException("Chỉ tài khoản phụ trách kho mới gán được kho");
    }
    const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new NotFoundException("Kho gán không tồn tại");
  }
}

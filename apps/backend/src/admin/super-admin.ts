/**
 * Bậc quản trị của hệ thống:
 * - SUPER ADMIN: DUY NHẤT một tài khoản trong toàn hệ thống. Là người tạo ra các tài
 *   khoản ADMIN, xoá được mọi tài khoản kể cả ADMIN, và không tài khoản nào xoá được nó.
 * - ADMIN: có thể có nhiều, do super admin tạo. Tạo được tài khoản phụ trách kho và
 *   lực lượng hiện trường, xoá được đúng hai bậc đó.
 * - Ngoài quản trị tài khoản, super admin và admin dùng chung mọi quyền, mọi tính năng.
 *
 * "Duy nhất một" được giữ ở đây thay vì bằng unique index: dự án đồng bộ schema bằng
 * `prisma db push`, một index chỉ tồn tại trong SQL thô sẽ bị lần push sau dọn đi mà
 * không ai hay. Đường duy nhất cấp được super admin là script promote, nên chốt chặn
 * đặt đúng trên đường đó thì không có lối vòng nào khác.
 */

export interface SuperAdminCandidate {
  id: string;
  email: string;
  fullName: string;
}

export interface SuperAdminPlan {
  /** Tài khoản sẽ được nâng lên super admin. */
  promoteId: string;
  /** Super admin cũ bị hạ xuống ADMIN thường, null khi hệ thống chưa có super admin nào. */
  demoteId: string | null;
}

/**
 * Quyết định việc nâng bậc, giữ đúng ràng buộc "chỉ một super admin".
 * Đã có super admin khác mà không nói rõ là chuyển giao → từ chối, vì cấp thêm một
 * tài khoản không ai xoá được thường là gõ nhầm chứ không phải ý định thật.
 */
export function planSuperAdminPromotion(input: {
  target: SuperAdminCandidate;
  currentSuperAdmin: SuperAdminCandidate | null;
  transfer: boolean;
}): SuperAdminPlan {
  const { target, currentSuperAdmin, transfer } = input;
  if (!currentSuperAdmin || currentSuperAdmin.id === target.id) {
    return { promoteId: target.id, demoteId: null };
  }
  if (!transfer) {
    throw new Error(
      `Hệ thống đã có super admin: "${currentSuperAdmin.email}" (${currentSuperAdmin.fullName}). ` +
        `Chỉ được tồn tại một super admin — thêm cờ --chuyen để chuyển bậc này sang "${target.email}", ` +
        `tài khoản cũ sẽ hạ xuống quản trị xã thường.`,
    );
  }
  return { promoteId: target.id, demoteId: currentSuperAdmin.id };
}

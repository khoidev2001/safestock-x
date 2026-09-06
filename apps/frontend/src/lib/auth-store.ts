import { create } from "zustand";
import { UserRole } from "@safestock/shared-types";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  notificationEmail?: string | null;
  /** Có giá trị = email đã xác minh bằng mã 6 số và đủ điều kiện nhận cảnh báo. */
  notificationEmailVerifiedAt?: string | null;
  avatarUrl?: string | null;
  unitName?: string | null;
  /** Tên xã trần ("Đồng Xuân"), backend rút từ tên đơn vị đầy đủ. */
  communeName?: string | null;
  warehouseName?: string | null;
  role: UserRole;
  /** ADMIN cấp cao: thêm quyền tạo/xoá tài khoản quản trị, mọi thứ khác giống ADMIN. */
  isSuperAdmin?: boolean;
  warehouseId?: string | null; // trưởng thôn: scope 1 kho; null = toàn xã
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  hasHydrated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  clear: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuth = create<AuthState>()((set) => ({
  // Access token only exists in memory. The web refresh token is an HttpOnly cookie.
  token: null,
  user: null,
  hasHydrated: false,
  setAuth: (token, user) => set({ token, user }),
  updateUser: (user) => set({ user }),
  clear: () => set({ token: null, user: null }),
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
}));

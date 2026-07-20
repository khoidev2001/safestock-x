import { create } from "zustand";
import { persist } from "zustand/middleware";
import { UserRole } from "@safestock/shared-types";

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  warehouseId?: string | null; // trưởng thôn: scope 1 kho; null = toàn xã
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  hasHydrated: boolean;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => void;
  clear: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      hasHydrated: false,
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "safestock-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);

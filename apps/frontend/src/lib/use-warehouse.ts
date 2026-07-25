"use client";

import { useQuery } from "@tanstack/react-query";
import { getFirstWarehouse } from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-store";

/**
 * Kho đang thao tác của người dùng hiện tại. Trước đây được nạp một lần ở page.tsx
 * rồi truyền xuống; nay mỗi route tự gọi hook này. React Query dedupe theo queryKey
 * nên nhiều trang cùng dùng vẫn chỉ fetch một lần.
 */
export function useWarehouse() {
  const token = useAuth((state) => state.token);
  const userId = useAuth((state) => state.user?.id);
  const hasHydrated = useAuth((state) => state.hasHydrated);

  return useQuery({
    queryKey: ["first-warehouse", userId],
    queryFn: getFirstWarehouse,
    enabled: hasHydrated && Boolean(token && userId),
  });
}

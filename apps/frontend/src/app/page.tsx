"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-store";

/**
 * Trang gốc chỉ điều hướng: đã đăng nhập → tổng quan, chưa thì → đăng nhập.
 * Mọi nội dung dashboard nằm trong nhóm route (dashboard) với path riêng.
 */
export default function RootPage() {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const hasHydrated = useAuth((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    router.replace(token ? "/readiness" : "/login");
  }, [hasHydrated, token, router]);

  return null;
}

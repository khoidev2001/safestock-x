"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { AdminUsersView } from "@/components/dashboard/admin-users-view";
import { useAuth } from "@/lib/auth-store";

export default function UsersPage() {
  const router = useRouter();
  const role = useAuth((state) => state.user?.role);
  const hasHydrated = useAuth((state) => state.hasHydrated);

  // Trang quản trị tài khoản chỉ dành cho ADMIN; vai trò khác bị đưa về tổng quan.
  useEffect(() => {
    if (hasHydrated && role && role !== "ADMIN") router.replace("/overall");
  }, [hasHydrated, role, router]);

  if (role !== "ADMIN") return null;

  return (
    <DashboardPage>{(warehouseId) => <AdminUsersView warehouseId={warehouseId} />}</DashboardPage>
  );
}

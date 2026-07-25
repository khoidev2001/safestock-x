"use client";

import { usePathname } from "next/navigation";
import { ColorIcon } from "@/components/shared/color-icon";
import { getNavItem } from "@/lib/dashboard-nav";
import { useWarehouse } from "@/lib/use-warehouse";

interface DashboardPageProps {
  /**
   * Render nội dung khi đã có warehouseId. Nhiều trang cần id này để gọi API;
   * số ít trang (audit) không cần vẫn nhận được id nhưng có thể bỏ qua.
   */
  children: (warehouseId: string) => React.ReactNode;
  /** true nếu trang không cần chờ warehouseId (ví dụ: nhật ký toàn xã). */
  standalone?: boolean;
}

/**
 * Khung chung cho mọi trang trong dashboard: tiêu đề theo route, chờ nạp kho,
 * và báo lỗi khi không tải được dữ liệu kho. Thay cho PageHeading + điều kiện
 * warehouseId từng nằm rải rác trong page.tsx cũ.
 */
export function DashboardPage({ children, standalone = false }: DashboardPageProps) {
  const pathname = usePathname();
  const nav = getNavItem(pathname);
  const warehouseQuery = useWarehouse();
  const warehouseId = warehouseQuery.data?.id;

  return (
    <div className="space-y-5">
      <PageHeading
        subtitle={nav?.subtitle ?? ""}
        title={nav?.title ?? ""}
        warehouseName={warehouseQuery.data?.name ?? "Đang tải kho"}
      />

      {warehouseQuery.isError ? (
        <WarehouseError />
      ) : standalone ? (
        children("")
      ) : warehouseId ? (
        children(warehouseId)
      ) : (
        <WarehouseLoading />
      )}
    </div>
  );
}

function PageHeading({
  subtitle,
  title,
  warehouseName,
}: {
  subtitle: string;
  title: string;
  warehouseName: string;
}) {
  return (
    <div className="border-b pb-5">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-[var(--color-accent)]">{warehouseName}</p>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

function WarehouseError() {
  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-critical)]">
        <ColorIcon name="warning" size={20} tone="red" />
        Không tải được dữ liệu kho
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Kết nối đến hệ thống dữ liệu đang gián đoạn. Vui lòng thử tải lại sau.
      </p>
    </section>
  );
}

function WarehouseLoading() {
  return (
    <section className="flex items-center gap-2 rounded-md border bg-[var(--surface)] p-5 text-sm text-[var(--text-muted)]">
      <ColorIcon className="animate-spin" name="loading" size={18} tone="blue" />
      Đang tải dữ liệu kho…
    </section>
  );
}

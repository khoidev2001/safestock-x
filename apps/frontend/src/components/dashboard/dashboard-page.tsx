"use client";

import { useEffect } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { useWarehouse } from "@/lib/use-warehouse";
import { usePageHeading } from "@/lib/page-heading-store";

interface DashboardPageProps {
  /**
   * Render nội dung khi đã có warehouseId. Nhiều trang cần id này để gọi API;
   * số ít trang (audit) không cần vẫn nhận được id nhưng có thể bỏ qua.
   */
  children: (warehouseId: string) => React.ReactNode;
  /** true nếu trang không cần chờ warehouseId (ví dụ: nhật ký toàn xã). */
  standalone?: boolean;
  /**
   * Thay tiêu đề lấy từ menu bằng tiêu đề của chính bản ghi đang mở.
   *
   * Trang danh sách thì tên menu là đúng ("Nhiệm vụ"), nhưng trang chi tiết mà
   * vẫn đội cái tên đó thì phần chữ to nhất màn hình không nói được gì — người
   * dùng phải cuộn xuống mới biết mình đang mở bản ghi nào.
   */
  title?: string;
  subtitle?: string;
  /** Chỗ cho lối quay lại, nằm TRÊN tiêu đề — đường thoát phải thấy trước tiên. */
  topSlot?: React.ReactNode;
}

/**
 * Khung chung cho mọi trang trong dashboard: tiêu đề theo route, chờ nạp kho,
 * và báo lỗi khi không tải được dữ liệu kho. Thay cho PageHeading + điều kiện
 * warehouseId từng nằm rải rác trong page.tsx cũ.
 */
export function DashboardPage({
  children,
  standalone = false,
  title,
  subtitle,
  topSlot,
}: DashboardPageProps) {
  const warehouseQuery = useWarehouse();
  const warehouseId = warehouseQuery.data?.id;

  /**
   * Đẩy tiêu đề lên thanh tiêu đề của khung dashboard.
   *
   * Chỉ đẩy phần GHI ĐÈ: trang tĩnh không truyền gì thì thanh tiêu đề tự tra
   * theo path. Dọn lúc rời trang, nếu không tiêu đề "Nhiệm vụ số 103" còn treo
   * lại khi người dùng đã sang tab khác.
   */
  const setHeading = usePageHeading((state) => state.setHeading);
  const clearHeading = usePageHeading((state) => state.clearHeading);
  useEffect(() => {
    if (title === undefined && subtitle === undefined) {
      clearHeading();
      return;
    }
    setHeading({ title, subtitle });
    return () => clearHeading();
  }, [title, subtitle, setHeading, clearHeading]);

  return (
    <div className="space-y-5">
      {topSlot}

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

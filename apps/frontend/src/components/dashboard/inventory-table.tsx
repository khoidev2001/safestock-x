"use client";

import { itemConditionLabel } from "@safestock/shared-types";
import { ColorIcon } from "@/components/shared/color-icon";
import { Pagination, usePagination } from "@/components/shared/pagination";
import type { InventoryBatch } from "@/lib/dashboard-api";

export type InventoryRowAction =
  "IMPORT" | "EXPORT" | "TRANSFER" | "ADJUST" | "RECONCILE" | "CONDITION" | "BORROW";

const actions: { key: InventoryRowAction; label: string }[] = [
  { key: "IMPORT", label: "Nhập thêm" },
  { key: "EXPORT", label: "Xuất" },
  { key: "TRANSFER", label: "Chuyển" },
  { key: "BORROW", label: "Cho mượn" },
  { key: "RECONCILE", label: "Kiểm kê" },
  { key: "ADJUST", label: "Điều chỉnh" },
  { key: "CONDITION", label: "Tình trạng" },
];

type Props = {
  batches: InventoryBatch[] | undefined;
  isLoading: boolean;
  isError: boolean;
  allowedActions: InventoryRowAction[];
  onRetry: () => void;
  onAction: (batch: InventoryBatch, action: InventoryRowAction) => void;
  onPrint: (batch: InventoryBatch) => void;
};

export function InventoryTable({
  batches,
  isLoading,
  isError,
  allowedActions,
  onRetry,
  onAction,
  onPrint,
}: Props) {
  const sorted = [...(batches ?? [])].sort((a, b) => b.quantity - a.quantity);
  const pagination = usePagination(sorted);

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        className="h-[360px] animate-pulse rounded-md border bg-[var(--surface)]"
      />
    );
  }
  if (isError) {
    return (
      <section className="rounded-md border border-red-300 bg-[var(--surface)] p-6">
        <p className="font-semibold text-[var(--color-critical)]">Không tải được tồn kho</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Dữ liệu chưa được thay bằng danh sách rỗng. Hãy kiểm tra kết nối rồi thử lại.
        </p>
        <button
          className="mt-4 rounded-md border px-3 py-2 text-sm font-semibold"
          onClick={onRetry}
        >
          Tải lại
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-4 border-b p-5">
        <div className="flex items-center gap-2">
          <ColorIcon name="inventory" size={20} tone="orange" />
          <div>
            <h2 className="text-sm font-semibold">Tồn kho theo lô</h2>
            <p className="text-xs text-[var(--text-muted)]">Số vật lý, đang mượn và khả dụng</p>
          </div>
        </div>
        <span className="tabular text-xs text-[var(--text-muted)]">{sorted.length} lô</span>
      </header>

      {sorted.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
          <ColorIcon name="packageCheck" size={28} tone="green" />
          <p className="mt-3 text-sm font-medium">Kho chưa có lô vật tư</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Dùng “Tiếp nhận lô mới” để bắt đầu.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Vật tư / lô</th>
                <th className="px-4 py-3 font-medium">Vị trí</th>
                <th className="px-4 py-3 font-medium">Tình trạng</th>
                <th className="px-4 py-3 text-right font-medium">Vật lý</th>
                <th className="px-4 py-3 text-right font-medium">Đang mượn</th>
                <th className="px-4 py-3 text-right font-medium">Khả dụng</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagination.pageItems.map((batch) => {
                const onLoan = (batch.loans ?? []).reduce(
                  (sum, loan) =>
                    sum + loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost,
                  0,
                );
                return (
                  <tr key={batch.id} className="align-top hover:bg-[var(--surface-2)]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{batch.item.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">Lô {batch.batchCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      {batch.shelf
                        ? `${batch.shelf.zone.code} / ${batch.shelf.code}`
                        : "Chưa xếp kệ"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs font-medium">
                        {itemConditionLabel(batch.condition)}
                      </span>
                      {batch.expiryDate ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          HSD {new Date(batch.expiryDate).toLocaleDateString("vi-VN")}
                        </p>
                      ) : null}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">{batch.quantity}</td>
                    <td className="tabular px-4 py-3 text-right">{onLoan}</td>
                    <td className="tabular px-4 py-3 text-right font-semibold">
                      {Math.max(0, batch.quantity - onLoan)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[290px] flex-wrap justify-end gap-1.5">
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => onPrint(batch)}
                        >
                          In QR
                        </button>
                        {actions
                          .filter((action) => allowedActions.includes(action.key))
                          .map((action) => (
                            <button
                              className="rounded border px-2 py-1 text-xs hover:border-[var(--color-accent)]"
                              key={action.key}
                              onClick={() => onAction(batch, action.key)}
                            >
                              {action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={sorted.length}
        totalPages={pagination.totalPages}
      />
    </section>
  );
}

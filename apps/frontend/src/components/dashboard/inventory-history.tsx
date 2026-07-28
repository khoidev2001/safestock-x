"use client";

import { useQuery } from "@tanstack/react-query";
import { getInventoryTransactions } from "@/lib/dashboard-api";

const transactionLabels: Record<string, string> = {
  IMPORT: "Nhập kho",
  EXPORT: "Xuất kho",
  TRANSFER: "Điều chuyển",
  ADJUST: "Điều chỉnh",
  COUNT: "Kiểm kê thực tế",
  CONDITION: "Cập nhật tình trạng",
  RETURN: "Hoàn trả",
};

export function InventoryHistory({ warehouseId }: { warehouseId: string }) {
  const query = useQuery({
    queryKey: ["inventory-transactions", warehouseId],
    queryFn: () => getInventoryTransactions(warehouseId),
  });

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="font-semibold">Nhật ký nghiệp vụ kho</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            100 giao dịch gần nhất của kho, kèm người thao tác và nguồn ghi nhận.
          </p>
        </div>
        <button
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Làm mới
        </button>
      </header>

      {query.isLoading ? (
        <div className="m-5 h-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
      ) : query.isError ? (
        <div className="m-5 rounded-md border border-red-300 p-4" role="alert">
          <p className="text-sm text-[var(--color-critical)]">
            {query.error instanceof Error
              ? query.error.message
              : "Không tải được lịch sử giao dịch."}
          </p>
          <button
            className="mt-3 rounded-md border px-3 py-1.5 text-sm"
            onClick={() => void query.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : query.data?.length ? (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-[var(--surface-2)] text-xs uppercase">
              <tr>
                <th className="px-4 py-2">Thời gian</th>
                <th className="px-4 py-2">Nghiệp vụ</th>
                <th className="px-4 py-2">Vật tư / lô</th>
                <th className="px-4 py-2 text-right">Biến động tồn</th>
                <th className="px-4 py-2">Người thao tác</th>
                <th className="px-4 py-2">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {query.data.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(event.createdAt).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {transactionLabels[event.type] ?? event.type}
                  </td>
                  <td className="px-4 py-3">
                    <b className="block">{event.batch.item.name}</b>
                    <span className="text-xs text-[var(--text-muted)]">
                      {event.batch.item.sku} · {event.batch.batchCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {event.quantityDelta == null
                      ? event.quantity
                      : `${event.quantityDelta > 0 ? "+" : ""}${event.quantityDelta}`}
                    {event.beforeQuantity != null && event.afterQuantity != null ? (
                      <span className="block text-xs font-normal text-[var(--text-muted)]">
                        {event.beforeQuantity} → {event.afterQuantity}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{event.user.fullName}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {event.note || event.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-5 text-sm text-[var(--text-muted)]">
          Chưa có giao dịch nào trong kho này.
        </p>
      )}
    </section>
  );
}

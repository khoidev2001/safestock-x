"use client";

import { Boxes, PackageCheck } from "lucide-react";
import type { InventoryBatch } from "@/lib/dashboard-api";

interface InventoryTableProps {
  batches: InventoryBatch[] | undefined;
  isLoading: boolean;
}

export function InventoryTable({ batches, isLoading }: InventoryTableProps) {
  if (isLoading) {
    return <div className="h-[360px] animate-pulse rounded-md border bg-[var(--surface)]" />;
  }

  const rows = [...(batches ?? [])]
    .sort((first, second) => second.quantity - first.quantity)
    .slice(0, 8);

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-4 border-b p-5">
        <div className="flex items-center gap-2">
          <Boxes aria-hidden="true" size={18} strokeWidth={1.8} />
          <div>
            <h2 className="text-sm font-semibold">Vật tư trọng yếu</h2>
            <p className="text-xs text-[var(--text-muted)]">Top lô theo số lượng hiện có</p>
          </div>
        </div>
        <span className="tabular text-xs text-[var(--text-muted)]">{batches?.length ?? 0} lô</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
          <PackageCheck aria-hidden="true" size={24} strokeWidth={1.8} />
          <p className="mt-3 text-sm font-medium">Chưa có vật tư</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Seed hoặc nhập kho để bắt đầu.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Vật tư</th>
                <th className="px-4 py-3 font-medium">Vị trí</th>
                <th className="px-4 py-3 font-medium">Tình trạng</th>
                <th className="px-4 py-3 text-right font-medium">Số lượng</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((batch) => (
                <tr key={batch.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3">
                    <p className="font-medium">{batch.item.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {batch.item.sku} · {batch.item.category.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{batch.shelf.zone.code}</p>
                    <p className="text-xs text-[var(--text-muted)]">{batch.shelf.code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs font-medium">
                      {batch.condition}
                    </span>
                  </td>
                  <td className="tabular px-4 py-3 text-right font-semibold">
                    {batch.quantity} {batch.item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { getInventoryBatches, reconcileBatch, type InventoryBatch } from "@/lib/dashboard-api";

export function StocktakeView({ warehouseId }: { warehouseId: string }) {
  const query = useQuery({
    queryKey: ["inventory-batches", warehouseId],
    queryFn: () => getInventoryBatches(warehouseId),
    enabled: Boolean(warehouseId),
  });

  if (query.isLoading) return <Skeleton />;
  const batches = query.data ?? [];

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <ClipboardCheck size={18} /> Kiểm kê thực tế
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Nhập số đếm thực tế từng lô. Lệch so hệ thống sẽ hiện để bạn xác nhận ghi đè (có ghi audit).
        </p>
      </div>
      <div className="divide-y">
        {batches.map((b) => (
          <StocktakeRow key={b.id} batch={b} warehouseId={warehouseId} />
        ))}
      </div>
    </section>
  );
}

function StocktakeRow({ batch, warehouseId }: { batch: InventoryBatch; warehouseId: string }) {
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState<string>("");
  const countedNum = counted === "" ? null : Number(counted);
  const diff = countedNum === null ? null : countedNum - batch.quantity;

  const mutate = useMutation({
    mutationFn: () =>
      reconcileBatch({
        batchId: batch.id,
        countedQty: countedNum as number,
        applyOverride: true,
        note: "Kiểm kê tay",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", warehouseId] });
      setCounted("");
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{batch.item.name}</p>
        <p className="text-xs text-[var(--text-muted)]">
          Lô {batch.code} · kệ {batch.shelf.zone.code}-{batch.shelf.code}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-[var(--text-muted)]">Hệ thống</p>
        <p className="tabular text-sm font-semibold">{batch.quantity}</p>
      </div>
      <input
        type="number"
        min={0}
        placeholder="Đếm thực"
        value={counted}
        onChange={(e) => setCounted(e.target.value)}
        className="tabular w-24 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
      <div className="w-20 text-right">
        {diff !== null && diff !== 0 && (
          <span
            className="tabular text-sm font-semibold"
            style={{ color: "var(--color-critical)" }}
          >
            {diff > 0 ? "+" : ""}
            {diff}
          </span>
        )}
      </div>
      <button
        onClick={() => mutate.mutate()}
        disabled={countedNum === null || diff === 0 || mutate.isPending}
        className="rounded-md px-3 py-2 text-xs font-semibold text-[var(--color-accent-fg)] transition active:translate-y-px disabled:opacity-40"
        style={{ background: "var(--color-accent)" }}
      >
        Ghi đè
      </button>
    </div>
  );
}

function Skeleton() {
  return <div className="h-72 animate-pulse rounded-md border bg-[var(--surface)]" aria-busy="true" />;
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useState } from "react";
import {
  createMutationRequestId,
  getInventoryBatches,
  reconcileBatch,
  type InventoryBatch,
} from "@/lib/dashboard-api";
import { Pagination, usePagination } from "@/components/shared/pagination";

export function StocktakeView({ warehouseId }: { warehouseId: string }) {
  const query = useQuery({
    queryKey: ["inventory-batches", warehouseId],
    queryFn: () => getInventoryBatches(warehouseId),
    enabled: Boolean(warehouseId),
  });

  const batches = query.data ?? [];
  const pagination = usePagination(batches);

  if (query.isLoading) return <Skeleton />;
  if (query.isError) {
    return (
      <section className="rounded-md border border-red-300 bg-[var(--surface)] p-5" role="alert">
        <p className="font-semibold text-[var(--color-critical)]">
          Không tải được danh sách kiểm kê
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {query.error instanceof Error ? query.error.message : "Vui lòng thử lại."}
        </p>
        <button
          className="mt-3 rounded-md border px-3 py-1.5 text-sm"
          onClick={() => void query.refetch()}
        >
          Tải lại
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <ColorIcon name="stocktake" size={20} tone="green" /> Kiểm kê thực tế
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Nhập số đếm thực tế của từng lô. Mọi thay đổi số lượng đều được lưu trong nhật ký.
        </p>
      </div>
      <div className="divide-y">
        {batches.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-muted)]">Kho chưa có lô vật tư để kiểm kê.</p>
        ) : (
          pagination.pageItems.map((b) => (
            <StocktakeRow key={b.id} batch={b} warehouseId={warehouseId} />
          ))
        )}
      </div>
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={batches.length}
        totalPages={pagination.totalPages}
      />
    </section>
  );
}

function StocktakeRow({ batch, warehouseId }: { batch: InventoryBatch; warehouseId: string }) {
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState<string>("");
  const [requestId, setRequestId] = useState(createMutationRequestId);
  const countedNum = counted === "" ? null : Number(counted);
  const diff = countedNum === null ? null : countedNum - batch.quantity;
  const isValid = countedNum !== null && Number.isInteger(countedNum) && countedNum >= 0;

  const mutate = useMutation({
    mutationFn: () =>
      reconcileBatch({
        batchId: batch.id,
        countedQty: countedNum as number,
        applyOverride: true,
        note: "Kiểm kê tay",
        requestId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", warehouseId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-transactions", warehouseId] });
      setCounted("");
      setRequestId(createMutationRequestId());
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{batch.item.name}</p>
        <p className="text-xs text-[var(--text-muted)]">
          Lô {batch.batchCode} · kệ{" "}
          {batch.shelf ? `${batch.shelf.zone.code}-${batch.shelf.code}` : "chưa xếp"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-[var(--text-muted)]">Hệ thống</p>
        <p className="tabular text-sm font-semibold">{batch.quantity}</p>
      </div>
      <input
        type="number"
        min={0}
        placeholder="Thực tế"
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
        disabled={!isValid || diff === 0 || mutate.isPending}
        className="rounded-md px-3 py-2 text-xs font-semibold text-[var(--color-accent-fg)] transition active:translate-y-px disabled:opacity-40"
        style={{ background: "var(--color-accent)" }}
      >
        Cập nhật
      </button>
      {mutate.isError ? (
        <p className="basis-full text-right text-xs text-[var(--color-critical)]" role="alert">
          {mutate.error instanceof Error
            ? mutate.error.message
            : "Không cập nhật được kết quả kiểm kê."}
        </p>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="h-72 animate-pulse rounded-md border bg-[var(--surface)]" aria-busy="true" />
  );
}

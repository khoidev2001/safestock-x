"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useState } from "react";
import { getOpenLoans, returnLoan, type LoanRecord } from "@/lib/dashboard-api";
import { Pagination, usePagination } from "@/components/shared/pagination";

export function LoanView({ warehouseId }: { warehouseId: string }) {
  const query = useQuery({
    queryKey: ["open-loans", warehouseId],
    queryFn: () => getOpenLoans(warehouseId),
    enabled: Boolean(warehouseId),
  });

  const loans = query.data ?? [];
  const pagination = usePagination(loans);

  if (query.isLoading) return <Skeleton />;

  if (loans.length === 0) {
    return (
      <section className="rounded-md border bg-[var(--surface)] p-10 text-center">
        <ColorIcon className="mx-auto" name="success" size={30} tone="green" />
        <p className="mt-3 font-medium">Không có phiếu mượn đang mở</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Vật tư tái sử dụng khi xuất sẽ tạo phiếu mượn tại đây.
        </p>
      </section>
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {pagination.pageItems.map((loan) => (
          <LoanCard key={loan.id} loan={loan} warehouseId={warehouseId} />
        ))}
      </div>
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={loans.length}
        totalPages={pagination.totalPages}
      />
    </div>
  );
}

function LoanCard({ loan, warehouseId }: { loan: LoanRecord; warehouseId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const outstanding = loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost;
  const [form, setForm] = useState({ returnedOk: outstanding, returnedDamaged: 0, lost: 0 });

  const mutate = useMutation({
    mutationFn: () => returnLoan(loan.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["open-loans", warehouseId] });
      setOpen(false);
    },
  });

  const total = form.returnedOk + form.returnedDamaged + form.lost;
  const valid = total > 0 && total <= outstanding;

  return (
    <section className="rounded-md border bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <ColorIcon className="mt-0.5" name="loan" size={21} tone="amber" />
          <div>
            <p className="font-semibold">{loan.batch.item.name}</p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Lô {loan.batch.batchCode} · đã mượn {loan.quantity} · chưa hoàn{" "}
              <b className="text-[var(--text)]">{outstanding}</b>
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition active:translate-y-px"
          style={{ background: "var(--color-accent)" }}
        >
          {open ? "Đóng" : "Ghi nhận trả"}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t pt-4">
          <div className="grid grid-cols-3 gap-3">
            <ReturnField
              label="Còn sử dụng tốt"
              value={form.returnedOk}
              onChange={(v) => setForm({ ...form, returnedOk: v })}
            />
            <ReturnField
              label="Bị hư hỏng"
              value={form.returnedDamaged}
              onChange={(v) => setForm({ ...form, returnedDamaged: v })}
            />
            <ReturnField
              label="Thất lạc"
              value={form.lost}
              onChange={(v) => setForm({ ...form, lost: v })}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              Tổng {total}/{outstanding}
              {!valid && total > outstanding && (
                <b className="text-[var(--color-critical)]"> · vượt số lượng chưa hoàn</b>
              )}
            </span>
            <button
              onClick={() => mutate.mutate()}
              disabled={!valid || mutate.isPending}
              className="rounded-md px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] transition active:translate-y-px disabled:opacity-50"
              style={{ background: "var(--color-accent)" }}
            >
              {mutate.isPending ? "Đang lưu…" : "Xác nhận trả"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReturnField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="tabular w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
    </label>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-md border bg-[var(--surface)]" />
      ))}
    </div>
  );
}

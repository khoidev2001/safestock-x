"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { getClusterWarehouses } from "@/lib/mission-api";
import { createUser, deleteUser, listUsers, type AdminUser } from "@/lib/admin-api";

const ROLES = [
  { value: "WAREHOUSE", label: "Phụ trách kho / Trưởng thôn" },
  { value: "RESCUE", label: "Đội cứu hộ" },
  { value: "ADMIN", label: "Quản trị xã" },
] as const;

/** ADMIN xã quản lý tài khoản: tạo trưởng thôn gán kho, cứu hộ, quản trị. */
export function AdminUsersView({ warehouseId }: { warehouseId: string }) {
  const qc = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: listUsers });
  const whQuery = useQuery({
    queryKey: ["cluster-warehouses", warehouseId],
    queryFn: () => getClusterWarehouses(warehouseId),
  });

  const [form, setForm] = useState({ email: "", password: "", fullName: "", role: "WAREHOUSE", warehouseId: "" });
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createUser({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role as AdminUser["role"],
        warehouseId: form.role === "WAREHOUSE" && form.warehouseId ? form.warehouseId : undefined,
      }),
    onSuccess: () => {
      setForm({ email: "", password: "", fullName: "", role: "WAREHOUSE", warehouseId: "" });
      setErr(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Lỗi tạo user"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const warehouses = whQuery.data ?? [];
  const nameById = new Map(warehouses.map((w) => [w.id, w.name]));
  const users = usersQuery.data ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <section className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
          <UserPlus size={18} strokeWidth={1.8} />
          <span>Tạo tài khoản</span>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Họ tên">
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm" />
          </Field>
          <Field label="Email / tên đăng nhập">
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm" />
          </Field>
          <Field label="Mật khẩu">
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm" />
          </Field>
          <Field label="Vai trò">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm">
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
          {form.role === "WAREHOUSE" && (
            <Field label="Kho phụ trách (để trống = toàn xã)">
              <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm">
                <option value="">— Toàn xã (kho tổng) —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.kind === "HAMLET" ? "(thôn)" : "(tổng)"}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.email || !form.password || !form.fullName}
            className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
          >
            {create.isPending ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
          {err && <p className="text-xs text-[var(--color-critical)]">{err}</p>}
        </div>
      </section>

      <section className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users size={18} strokeWidth={1.8} />
          <span>Danh sách người dùng ({users.length})</span>
        </div>
        <ul className="mt-4 divide-y">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{u.fullName} <span className="text-xs text-[var(--text-muted)]">· {u.email}</span></p>
                <p className="text-xs text-[var(--text-muted)]">
                  {u.role}
                  {u.warehouseId ? ` · ${nameById.get(u.warehouseId) ?? "kho thôn"}` : u.role === "WAREHOUSE" ? " · toàn xã" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(u.id)}
                disabled={remove.isPending}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                title="Xoá"
              >
                <Trash2 size={15} className="text-[var(--color-critical)]" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

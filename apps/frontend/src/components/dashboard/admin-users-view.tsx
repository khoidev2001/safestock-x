"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useState } from "react";
import { getClusterWarehouses } from "@/lib/mission-api";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUserPassword,
  type AdminUser,
} from "@/lib/admin-api";
import { Pagination, usePagination } from "@/components/shared/pagination";
import {
  FIELD_FORCE_ROLE_LABEL,
  userRoleLabel,
} from "@safestock/shared-types";

const ROLES = [
  { value: "WAREHOUSE", label: "Phụ trách kho / Trưởng thôn" },
  { value: "RESCUE", label: FIELD_FORCE_ROLE_LABEL },
  { value: "ADMIN", label: "Quản trị xã" },
] as const;

// Nhãn HIỂN THỊ cho mọi role (gồm REPORTER — trưởng thôn báo cáo từ mobile, tạo qua seed/di động,
// không nằm trong dropdown tạo tài khoản ở trên). Dùng string key để nhận mọi UserRole.
/** ADMIN xã quản lý tài khoản: tạo người phụ trách kho, hiện trường và quản trị. */
export function AdminUsersView({ warehouseId }: { warehouseId: string }) {
  const qc = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: listUsers });
  const whQuery = useQuery({
    queryKey: ["cluster-warehouses", warehouseId],
    queryFn: () => getClusterWarehouses(warehouseId),
  });

  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "WAREHOUSE",
    warehouseId: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [passwordEdit, setPasswordEdit] = useState({ userId: "", password: "" });

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
    onError: (e) =>
      setErr(e instanceof Error ? e.message : "Chưa thể tạo tài khoản. Vui lòng thử lại."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const changePassword = useMutation({
    mutationFn: () => updateUserPassword(passwordEdit.userId, passwordEdit.password),
    onSuccess: () => setPasswordEdit({ userId: "", password: "" }),
  });

  const warehouses = whQuery.data ?? [];
  const nameById = new Map(warehouses.map((w) => [w.id, w.name]));
  const users = usersQuery.data ?? [];
  const pagination = usePagination(users);

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <section className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
          <ColorIcon name="addUser" size={20} tone="blue" />
          <span>Tạo tài khoản</span>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Họ tên">
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Email / tên đăng nhập">
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Mật khẩu">
            <input
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Vai trò">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          {form.role === "WAREHOUSE" && (
            <Field label="Kho phụ trách (để trống = toàn xã)">
              <select
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
              >
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
            disabled={create.isPending || !form.email || form.password.length < 8 || !form.fullName}
            className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
          >
            {create.isPending ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
          {err && <p className="text-xs text-[var(--color-critical)]">{err}</p>}
        </div>
      </section>

      <section className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ColorIcon name="users" size={20} tone="blue" />
          <span>Danh sách tài khoản ({users.length})</span>
        </div>
        <ul className="mt-4 divide-y">
          {pagination.pageItems.map((u) => (
            <li key={u.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {u.fullName}{" "}
                    <span className="text-xs text-[var(--text-muted)]">· {u.email}</span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {userRoleLabel(u.role)}
                    {u.warehouseId
                      ? ` · ${nameById.get(u.warehouseId) ?? "kho thôn"}`
                      : u.role === "WAREHOUSE"
                        ? " · toàn xã"
                        : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    aria-label={`Đổi mật khẩu cho ${u.fullName}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)]"
                    onClick={() => setPasswordEdit({ userId: u.id, password: "" })}
                    title="Đổi mật khẩu"
                    type="button"
                  >
                    <ColorIcon name="key" size={18} tone="amber" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(u.id)}
                    disabled={remove.isPending}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                    title="Xóa tài khoản"
                  >
                    <ColorIcon name="delete" size={18} tone="red" />
                  </button>
                </div>
              </div>
              {passwordEdit.userId === u.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 bg-[var(--surface-2)] p-3">
                  <input
                    aria-label={`Mật khẩu mới cho ${u.fullName}`}
                    autoComplete="new-password"
                    className="min-w-56 flex-1 rounded-md border bg-[var(--surface)] px-3 text-sm"
                    minLength={8}
                    onChange={(event) =>
                      setPasswordEdit({ ...passwordEdit, password: event.target.value })
                    }
                    placeholder="Mật khẩu mới, ít nhất 8 ký tự"
                    type="password"
                    value={passwordEdit.password}
                  />
                  <button
                    aria-label="Lưu mật khẩu mới"
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
                    disabled={passwordEdit.password.length < 8 || changePassword.isPending}
                    onClick={() => changePassword.mutate()}
                    type="button"
                  >
                    <ColorIcon name="save" size={18} tone="green" /> Lưu
                  </button>
                  <button
                    aria-label="Hủy đổi mật khẩu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-[var(--surface)]"
                    onClick={() => setPasswordEdit({ userId: "", password: "" })}
                    type="button"
                  >
                    <ColorIcon name="close" size={18} tone="red" />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <Pagination
          onPageChange={pagination.setPage}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={users.length}
          totalPages={pagination.totalPages}
        />
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

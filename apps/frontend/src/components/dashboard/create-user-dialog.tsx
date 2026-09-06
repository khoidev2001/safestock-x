"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { createUser, requestAdminEmailCode, type AdminUser } from "@/lib/admin-api";
import { getClusterWarehouses } from "@/lib/mission-api";
import { useQuery } from "@tanstack/react-query";
import { FIELD_FORCE_ROLE_LABEL } from "@safestock/shared-types";

const BASE_ROLES = [
  { value: "WAREHOUSE", label: "Phụ trách kho / Trưởng thôn" },
  { value: "RESCUE", label: FIELD_FORCE_ROLE_LABEL },
] as const;
/** Tài khoản quản trị xã chỉ super admin mới tạo được, và phải kèm email đã xác minh. */
const ADMIN_ROLE = { value: "ADMIN", label: "Quản trị xã" } as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const EMPTY_FORM = {
  email: "",
  password: "",
  fullName: "",
  role: "WAREHOUSE",
  warehouseId: "",
  notificationEmail: "",
  verificationCode: "",
};

/**
 * Tạo tài khoản — form nằm trong hộp thoại chứ không chiếm sẵn một cột: phần lớn thời
 * gian người dùng vào đây để xem và sửa danh sách, tạo tài khoản là việc thỉnh thoảng.
 */
export function CreateUserDialog({
  isOpen,
  isSuperAdmin,
  warehouseId,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  isSuperAdmin: boolean;
  warehouseId: string;
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const whQuery = useQuery({
    queryKey: ["cluster-warehouses", warehouseId],
    queryFn: () => getClusterWarehouses(warehouseId),
    enabled: isOpen,
  });
  const warehouses = whQuery.data ?? [];
  const roles = isSuperAdmin ? [...BASE_ROLES, ADMIN_ROLE] : BASE_ROLES;

  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Địa chỉ đã được gửi mã. Giữ riêng với ô nhập để nếu super admin sửa email sau khi
  // gửi mã thì nút "Tạo tài khoản" khoá lại, không tạo nhầm bằng mã của địa chỉ cũ.
  const [codeSentTo, setCodeSentTo] = useState("");

  const needsEmailVerification = form.role === "ADMIN";
  const emailInput = form.notificationEmail.trim().toLowerCase();
  const codeMatchesEmail = Boolean(codeSentTo) && codeSentTo === emailInput;

  const sendCode = useMutation({
    mutationFn: () => requestAdminEmailCode(emailInput),
    onSuccess: (result) => {
      setCodeSentTo(result.email);
      setErr(null);
      setNotice(
        result.delivery === "dev-log"
          ? `CHẾ ĐỘ DEV — chưa cấu hình SMTP nên KHÔNG có mail nào được gửi. Mã để nhập là ${result.devCode}.`
          : `Đã gửi mã 6 số tới ${result.email}. Kiểm tra cả mục Spam. Mã sống 10 phút.`,
      );
    },
    onError: (e) => {
      setNotice(null);
      setErr(e instanceof Error ? e.message : "Chưa gửi được mã xác minh.");
    },
  });

  const create = useMutation({
    mutationFn: () =>
      createUser({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role as AdminUser["role"],
        warehouseId: form.role === "WAREHOUSE" && form.warehouseId ? form.warehouseId : undefined,
        notificationEmail: needsEmailVerification ? emailInput : undefined,
        verificationCode: needsEmailVerification ? form.verificationCode.trim() : undefined,
      }),
    onSuccess: (user) => {
      reset();
      onCreated(user);
    },
    onError: (e) => {
      setNotice(null);
      setErr(e instanceof Error ? e.message : "Chưa thể tạo tài khoản. Vui lòng thử lại.");
    },
  });

  function reset() {
    setForm(EMPTY_FORM);
    setCodeSentTo("");
    setErr(null);
    setNotice(null);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      reset();
      dialog.showModal();
      requestAnimationFrame(() => firstFieldRef.current?.focus());
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const canSubmit =
    !create.isPending &&
    Boolean(form.email) &&
    form.password.length >= 8 &&
    Boolean(form.fullName) &&
    (!needsEmailVerification || (codeMatchesEmail && form.verificationCode.length === 6));

  return (
    <dialog
      aria-labelledby="create-user-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,34rem)] overflow-y-auto rounded-lg border bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-slate-950/45"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <ColorIcon name="addUser" size={20} tone="blue" />
            <h2 className="text-lg font-semibold" id="create-user-title">
              Tạo tài khoản
            </h2>
          </div>
          <button
            aria-label="Đóng"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition hover:bg-[var(--surface-2)]"
            onClick={onClose}
            type="button"
          >
            <ColorIcon name="close" size={18} tone="blue" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <Field label="Họ tên">
            <input
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              ref={firstFieldRef}
              value={form.fullName}
            />
          </Field>
          <Field label="Tên đăng nhập">
            <input
              autoComplete="off"
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="chữ thường, số và . _ -"
              value={form.email}
            />
          </Field>
          <Field label="Mật khẩu">
            <input
              autoComplete="new-password"
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
              minLength={8}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="ít nhất 8 ký tự"
              type="password"
              value={form.password}
            />
          </Field>
          <Field label="Vai trò">
            <select
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
              onChange={(e) => {
                setCodeSentTo("");
                setForm({ ...form, role: e.target.value, verificationCode: "" });
              }}
              value={form.role}
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {needsEmailVerification && (
            <div className="space-y-3 rounded-md border border-dashed bg-[var(--surface-2)] p-3">
              <p className="text-xs text-[var(--text-muted)]">
                Tài khoản quản trị nhận email cảnh báo sự cố, nên địa chỉ phải xác minh được: gửi
                mã 6 số tới email rồi nhập lại mã thì tài khoản mới được tạo.
              </p>
              <Field label="Email của quản trị viên">
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                    onChange={(e) => setForm({ ...form, notificationEmail: e.target.value })}
                    placeholder="ten@gmail.com"
                    type="email"
                    value={form.notificationEmail}
                  />
                  <button
                    className="shrink-0 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-3)] disabled:opacity-60"
                    disabled={sendCode.isPending || !EMAIL_PATTERN.test(emailInput)}
                    onClick={() => sendCode.mutate()}
                    type="button"
                  >
                    {sendCode.isPending ? "Đang gửi…" : codeMatchesEmail ? "Gửi lại mã" : "Gửi mã"}
                  </button>
                </div>
              </Field>
              <Field label="Mã xác minh 6 số">
                <input
                  className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-center text-base font-semibold tracking-[0.3em] disabled:opacity-60"
                  disabled={!codeMatchesEmail}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      verificationCode: e.target.value.replace(/\D/g, "").slice(0, 6),
                    })
                  }
                  placeholder="000000"
                  value={form.verificationCode}
                />
              </Field>
            </div>
          )}

          {form.role === "WAREHOUSE" && (
            <Field label="Kho phụ trách (để trống = toàn xã)">
              <select
                className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                value={form.warehouseId}
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

          <div aria-live="polite" className="min-h-4">
            {err ? <p className="text-xs text-[var(--color-critical)]">{err}</p> : null}
            {notice ? <p className="text-xs text-[var(--color-accent)]">{notice}</p> : null}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t bg-[var(--surface-2)] px-5 py-4">
          <button
            className="min-h-10 rounded-md border bg-[var(--surface)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-3)]"
            onClick={onClose}
            type="button"
          >
            Hủy
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
            disabled={!canSubmit}
            type="submit"
          >
            {create.isPending ? (
              <ColorIcon className="animate-spin" name="loading" size={17} tone="green" />
            ) : (
              <ColorIcon name="addUser" size={17} tone="green" />
            )}
            {create.isPending ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </footer>
      </form>
    </dialog>
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

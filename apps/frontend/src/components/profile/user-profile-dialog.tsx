"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { useAuth } from "@/lib/auth-store";
import { getProfile, updateProfile, type UpdateProfileInput } from "@/lib/profile-api";
import { ProfileAvatarEditor } from "./profile-avatar-editor";
import { userRoleLabel } from "@safestock/shared-types";

export function UserProfileDialog({
  isOpen,
  onClose,
  onLogout,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const cachedUser = useAuth((state) => state.user);
  const updateCachedUser = useAuth((state) => state.updateUser);
  const queryClient = useQueryClient();
  const profileKey = ["user-profile", cachedUser?.id] as const;
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: getProfile,
    enabled: Boolean(cachedUser?.id),
  });
  const queriedProfile = profileQuery.data?.id === cachedUser?.id ? profileQuery.data : null;
  const profile = queriedProfile ?? cachedUser;
  const [form, setForm] = useState<UpdateProfileInput>({
    fullName: "",
    phone: null,
    notificationEmail: null,
    avatarUrl: null,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [invalidField, setInvalidField] = useState<
    "fullName" | "phone" | "notificationEmail" | null
  >(null);

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      updateCachedUser(updated);
      queryClient.setQueryData(profileKey, updated);
      setMessage("Đã lưu hồ sơ.");
      setError("");
      setInvalidField(null);
    },
    onError: (reason: Error) => {
      setError(reason.message || "Chưa thể lưu hồ sơ.");
      setMessage("");
      setInvalidField(null);
    },
  });

  useEffect(() => {
    if (queriedProfile) updateCachedUser(queriedProfile);
  }, [queriedProfile, updateCachedUser]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current || !profile) return;
    wasOpenRef.current = true;
    setForm({
      fullName: profile.fullName || "",
      phone: profile.phone ?? null,
      notificationEmail: profile.notificationEmail ?? null,
      avatarUrl: profile.avatarUrl ?? null,
    });
    setError("");
    setMessage("");
    setInvalidField(null);
  }, [isOpen, profile]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => nameRef.current?.focus());
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const phone = form.phone?.trim() || null;
    const notificationEmail = form.notificationEmail?.trim().toLowerCase() || null;
    if (fullName.length < 2) {
      setInvalidField("fullName");
      return setError("Họ và tên phải có ít nhất 2 ký tự.");
    }
    if (phone && !/^[+0-9][0-9 .()-]{7,19}$/.test(phone)) {
      setInvalidField("phone");
      return setError("Số điện thoại chưa đúng định dạng.");
    }
    if (notificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) {
      setInvalidField("notificationEmail");
      return setError("Email cá nhân chưa đúng định dạng.");
    }
    setError("");
    setMessage("");
    setInvalidField(null);
    mutation.mutate({ ...form, fullName, phone, notificationEmail });
  }

  function logout() {
    queryClient.removeQueries({ queryKey: ["user-profile"] });
    onLogout();
  }

  return (
    <dialog
      aria-labelledby="profile-dialog-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,46rem)] overflow-y-auto rounded-lg border bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-slate-950/45"
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
      <form onSubmit={submit}>
        <header className="flex items-start justify-between border-b px-5 py-4 md:px-6">
          <div>
            <h2 className="text-xl font-semibold" id="profile-dialog-title">
              Hồ sơ cá nhân
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {profile?.role ? userRoleLabel(profile.role) : "Người dùng hệ thống"}
            </p>
          </div>
          <button
            aria-label="Đóng hồ sơ"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md transition hover:bg-[var(--surface-2)] active:translate-y-px"
            onClick={onClose}
            type="button"
          >
            <ColorIcon name="close" size={19} tone="blue" />
          </button>
        </header>

        <div className="space-y-6 px-5 py-5 md:px-6">
          <ProfileAvatarEditor
            disabled={mutation.isPending}
            fullName={form.fullName}
            onChange={(avatarUrl) => setForm((current) => ({ ...current, avatarUrl }))}
            onError={setError}
            value={form.avatarUrl}
          />

          <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
            <ProfileField label="Họ và tên" required>
              <input
                aria-describedby={invalidField === "fullName" ? "profile-form-status" : undefined}
                aria-invalid={invalidField === "fullName"}
                autoComplete="name"
                className="w-full rounded-md border bg-[var(--surface)] px-3"
                disabled={mutation.isPending}
                maxLength={100}
                minLength={2}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fullName: event.target.value }))
                }
                ref={nameRef}
                required
                value={form.fullName}
              />
            </ProfileField>
            <ProfileField label="Số điện thoại">
              <input
                aria-describedby={invalidField === "phone" ? "profile-form-status" : undefined}
                aria-invalid={invalidField === "phone"}
                autoComplete="tel"
                className="w-full rounded-md border bg-[var(--surface)] px-3"
                disabled={mutation.isPending}
                inputMode="tel"
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="Ví dụ: 0912 345 678"
                value={form.phone ?? ""}
              />
            </ProfileField>
            <ProfileField hint="Dùng để nhận email cảnh báo sự cố." label="Email cá nhân">
              <input
                aria-describedby={
                  invalidField === "notificationEmail" ? "profile-form-status" : undefined
                }
                aria-invalid={invalidField === "notificationEmail"}
                autoComplete="email"
                className="w-full rounded-md border bg-[var(--surface)] px-3"
                disabled={mutation.isPending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notificationEmail: event.target.value }))
                }
                placeholder="ten@donvi.vn"
                type="email"
                value={form.notificationEmail ?? ""}
              />
            </ProfileField>
            <ProfileField
              hint={profile?.warehouseName ? `Kho phụ trách: ${profile.warehouseName}` : undefined}
              label="Đơn vị"
            >
              <input
                className="w-full rounded-md border bg-[var(--surface-2)] px-3 text-[var(--text-muted)]"
                readOnly
                value={formatCommuneUnit(profile?.unitName)}
              />
            </ProfileField>
          </div>

          <div aria-live="polite" className="min-h-6 text-sm" id="profile-form-status">
            {error || profileQuery.error ? (
              <p className="text-[var(--color-critical)]">
                {error || (profileQuery.error as Error).message}
              </p>
            ) : null}
            {message ? <p className="font-medium text-[var(--color-accent)]">{message}</p> : null}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-[var(--surface-2)] px-5 py-4 md:px-6">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 font-semibold text-[var(--color-critical)] transition hover:bg-red-50 active:translate-y-px"
            onClick={logout}
            type="button"
          >
            <ColorIcon name="logout" size={18} tone="red" /> Đăng xuất
          </button>
          <div className="flex gap-2">
            <button
              className="min-h-10 rounded-md border bg-[var(--surface)] px-4 font-semibold transition hover:bg-[var(--surface-3)] active:translate-y-px"
              onClick={onClose}
              type="button"
            >
              Hủy
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
              disabled={mutation.isPending || profileQuery.isLoading}
              type="submit"
            >
              {mutation.isPending ? (
                <ColorIcon className="animate-spin" name="loading" size={17} tone="green" />
              ) : (
                <ColorIcon name="save" size={17} tone="green" />
              )}
              {mutation.isPending ? "Đang lưu" : "Lưu hồ sơ"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

function ProfileField({
  children,
  hint,
  label,
  required = false,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
      {hint ? <span className="text-xs font-normal text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

function formatCommuneUnit(unitName?: string | null): string {
  if (!unitName) return "Chưa xác định";
  const commune = unitName.match(/(?:^|\s)xã\s+(.+)$/iu)?.[1]?.trim();
  return commune ? `Xã ${commune}` : unitName;
}

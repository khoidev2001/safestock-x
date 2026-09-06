"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import {
  cancelNotificationEmailCode,
  confirmNotificationEmailCode,
  getNotificationEmailState,
  removeNotificationEmail,
  requestNotificationEmailCode,
  type NotificationEmailState,
} from "@/lib/profile-api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Khớp RESEND_COOLDOWN_MS ở backend — nút "Gửi lại" mở khoá đúng lúc server chịu nhận. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Email nhận cảnh báo sự cố: thêm là phải xác minh bằng mã 6 số gửi tới chính hộp thư đó.
 * Ba trạng thái nối tiếp nhau — chưa có email → đang chờ nhập mã → đã xác minh — nên
 * ô này tự quản trạng thái riêng thay vì nằm chung form hồ sơ (form đó lưu bằng một nút).
 */
export function NotificationEmailField({
  isOpen,
  canRemove,
  onVerifiedChange,
}: {
  /** Hộp thoại hồ sơ luôn nằm trong cây React, nên chỉ hỏi trạng thái khi nó thực sự mở. */
  isOpen: boolean;
  /** false với quản trị viên: họ chỉ đổi được sang email khác, không bỏ trống được. */
  canRemove: boolean;
  onVerifiedChange?: (state: NotificationEmailState) => void;
}) {
  const queryClient = useQueryClient();
  const stateKey = ["notification-email-state"] as const;
  const stateQuery = useQuery({
    queryKey: stateKey,
    queryFn: getNotificationEmailState,
    enabled: isOpen,
  });
  const state = stateQuery.data ?? null;

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  function applyState(next: NotificationEmailState) {
    queryClient.setQueryData(stateKey, next);
    onVerifiedChange?.(next);
  }

  // Người dùng bấm "Đổi email" khi đang có email đã xác minh: mở lại ô nhập mà chưa
  // đụng gì tới hồ sơ — email cũ vẫn nhận cảnh báo cho tới khi email mới xác minh xong.
  const [isEditing, setIsEditing] = useState(false);

  const requestMutation = useMutation({
    mutationFn: requestNotificationEmailCode,
    onSuccess: (next) => {
      applyState(next);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setError("");
      setMessage(
        next.delivery === "dev-log"
          ? `CHẾ ĐỘ DEV — chưa cấu hình SMTP nên không có mail nào được gửi. Mã để nhập là ${next.devCode}.`
          : `Đã gửi mã 6 số tới ${next.pendingEmail ?? "email của bạn"}.`,
      );
    },
    onError: (reason: Error) => {
      setError(reason.message || "Chưa gửi được mã xác minh.");
      setMessage("");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmNotificationEmailCode,
    onSuccess: (next) => {
      applyState(next);
      setCode("");
      setCooldown(0);
      setError("");
      setIsEditing(false);
      setMessage("Đã xác minh email. Cảnh báo sự cố sẽ được gửi tới địa chỉ này.");
    },
    onError: (reason: Error) => {
      setError(reason.message || "Mã xác minh không đúng.");
      setMessage("");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelNotificationEmailCode,
    onSuccess: (next) => {
      applyState(next);
      setCode("");
      setCooldown(0);
      setError("");
      setMessage("");
      setEmail("");
      setIsEditing(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeNotificationEmail,
    onSuccess: (next) => {
      applyState(next);
      setEmail("");
      setCode("");
      setError("");
      setIsEditing(false);
      setMessage("Đã gỡ email nhận cảnh báo.");
    },
    onError: (reason: Error) => setError(reason.message || "Chưa gỡ được email."),
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const busy =
    requestMutation.isPending ||
    confirmMutation.isPending ||
    cancelMutation.isPending ||
    removeMutation.isPending;

  function submitEmail() {
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setMessage("");
      return setError("Email chưa đúng định dạng.");
    }
    setError("");
    requestMutation.mutate(value);
  }

  function submitCode() {
    const value = code.trim();
    if (!/^\d{6}$/.test(value)) {
      setMessage("");
      return setError("Mã xác minh gồm 6 chữ số.");
    }
    setError("");
    confirmMutation.mutate(value);
  }

  const verifiedEmail =
    state?.notificationEmail && state.notificationEmailVerifiedAt ? state.notificationEmail : null;
  const pendingEmail = state?.pendingEmail ?? null;

  return (
    <section
      aria-labelledby="notification-email-heading"
      className="rounded-md border bg-[var(--surface-2)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" id="notification-email-heading">
            Email cá nhân nhận cảnh báo
          </h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Khi kho có sự cố, hệ thống gửi cảnh báo tới đây. Email phải được xác minh bằng mã 6 số
            nên chỉ địa chỉ có thật mới được lưu.
            {canRemove ? "" : " Tài khoản quản trị bắt buộc có email nên chỉ đổi được, không gỡ được."}
          </p>
        </div>
        {verifiedEmail ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            <ColorIcon name="success" size={14} tone="green" /> Đã xác minh
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {stateQuery.isPending ? (
          <p className="text-sm text-[var(--text-muted)]">Đang tải trạng thái email…</p>
        ) : pendingEmail ? (
          <div className="space-y-3">
            <p className="text-sm">
              Mã 6 số đã gửi tới <strong className="break-all">{pendingEmail}</strong>. Kiểm tra cả
              mục Spam nếu chưa thấy.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="notification-email-code">
                Mã xác minh 6 số
              </label>
              <input
                autoComplete="one-time-code"
                className="h-10 w-40 rounded-md border bg-[var(--surface)] px-3 text-center text-lg font-semibold tracking-[0.4em]"
                disabled={busy}
                id="notification-email-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitCode();
                  }
                }}
                placeholder="000000"
                value={code}
              />
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
                disabled={busy || code.length !== 6}
                onClick={submitCode}
                type="button"
              >
                {confirmMutation.isPending ? (
                  <ColorIcon className="animate-spin" name="loading" size={16} tone="green" />
                ) : (
                  <ColorIcon name="success" size={16} tone="green" />
                )}
                Xác nhận
              </button>
              <button
                className="min-h-10 rounded-md border bg-[var(--surface)] px-3 text-sm font-semibold transition hover:bg-[var(--surface-3)] active:translate-y-px disabled:opacity-60"
                disabled={busy || cooldown > 0}
                onClick={() => requestMutation.mutate(pendingEmail)}
                type="button"
              >
                {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
              </button>
              <button
                className="min-h-10 rounded-md px-2 text-sm font-semibold text-[var(--text-muted)] underline-offset-2 transition hover:underline disabled:opacity-60"
                disabled={busy}
                onClick={() => cancelMutation.mutate()}
                type="button"
              >
                Nhập email khác
              </button>
            </div>
          </div>
        ) : verifiedEmail && !isEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 break-all rounded-md border bg-[var(--surface)] px-3 py-2 text-sm">
              {verifiedEmail}
            </span>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-[var(--surface)] px-3 text-sm font-semibold transition hover:bg-[var(--surface-3)] active:translate-y-px disabled:opacity-60"
              disabled={busy}
              onClick={() => {
                setEmail("");
                setMessage("");
                setError("");
                setIsEditing(true);
              }}
              type="button"
            >
              <ColorIcon name="edit" size={16} tone="blue" /> Đổi email
            </button>
            {canRemove ? (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--color-critical)] transition hover:bg-red-50 active:translate-y-px disabled:opacity-60"
                disabled={busy}
                onClick={() => removeMutation.mutate()}
                type="button"
              >
                <ColorIcon name="delete" size={16} tone="red" /> Gỡ
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="notification-email-input">
              Email cá nhân
            </label>
            <input
              autoComplete="email"
              className="h-10 min-w-0 flex-1 rounded-md border bg-[var(--surface)] px-3"
              disabled={busy}
              id="notification-email-input"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitEmail();
                }
              }}
              placeholder="ten@gmail.com"
              type="email"
              value={email}
            />
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
              disabled={busy || !email.trim()}
              onClick={submitEmail}
              type="button"
            >
              {requestMutation.isPending ? (
                <ColorIcon className="animate-spin" name="loading" size={16} tone="green" />
              ) : (
                <ColorIcon name="send" size={16} tone="green" />
              )}
              Gửi mã xác minh
            </button>
            {verifiedEmail ? (
              <button
                className="min-h-10 rounded-md px-2 text-sm font-semibold text-[var(--text-muted)] underline-offset-2 transition hover:underline"
                disabled={busy}
                onClick={() => setIsEditing(false)}
                type="button"
              >
                Hủy
              </button>
            ) : null}
          </div>
        )}

        <div aria-live="polite" className="min-h-5 text-sm">
          {error || stateQuery.error ? (
            <p className="text-[var(--color-critical)]">
              {error || (stateQuery.error as Error).message}
            </p>
          ) : message ? (
            <p className="font-medium text-[var(--color-accent)]">{message}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

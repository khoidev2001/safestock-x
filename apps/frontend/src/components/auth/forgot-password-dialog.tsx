"use client";

import { useEffect, useRef, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { BASE } from "@/lib/api";

type Step = "request" | "reset" | "done";

const MIN_PASSWORD_LENGTH = 8;

async function post(path: string, body: unknown): Promise<{ message?: string }> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(", ")
          : "Không thực hiện được. Vui lòng thử lại.",
    );
  }
  return data;
}

/**
 * Quên mật khẩu: xin mã → nhập mã kèm mật khẩu mới.
 *
 * Mã luôn đi tới email ĐÃ XÁC MINH của tài khoản, người dùng không khai địa chỉ nhận —
 * nên hộp thoại này chỉ hỏi tên đăng nhập. Cũng vì thế tài khoản chưa xác minh email
 * thì không đặt lại được, và màn hình nói thẳng điều đó thay vì để họ chờ mã mãi.
 */
export function ForgotPasswordDialog({
  isOpen,
  defaultLogin,
  onClose,
}: {
  isOpen: boolean;
  defaultLogin: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("request");
  const [login, setLogin] = useState(defaultLogin);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      setStep("request");
      setLogin(defaultLogin);
      setCode("");
      setPassword("");
      setConfirm("");
      setError("");
      setNotice("");
      dialog.showModal();
      requestAnimationFrame(() => firstFieldRef.current?.focus());
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, defaultLogin]);

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const data = await post("/api/auth/password-reset/request", { login: login.trim() });
      setNotice(data.message ?? "Đã gửi mã nếu tài khoản hợp lệ.");
      setStep("reset");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
    }
    if (password !== confirm) return setError("Hai lần nhập mật khẩu chưa khớp nhau.");
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/password-reset/confirm", { login: login.trim(), code, password });
      setNotice("");
      setStep("done");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      aria-labelledby="forgot-password-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,30rem)] overflow-y-auto rounded-lg border bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-slate-950/50"
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
          if (busy) return;
          if (step === "request") void requestCode();
          else if (step === "reset") void submitReset();
          else onClose();
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <ColorIcon name="key" size={20} tone="amber" />
            <h2 className="text-lg font-semibold" id="forgot-password-title">
              Quên mật khẩu
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

        <div className="space-y-4 px-5 py-4">
          {step === "done" ? (
            <div className="text-center">
              {/* Icon của thư viện render ra khối riêng nên `text-center` không kéo nó
                  vào giữa được — phải có một hộp flex bọc ngoài. */}
              <div className="flex justify-center">
                <ColorIcon name="success" size={34} tone="green" />
              </div>
              <p className="mt-3 font-semibold">Đã đổi mật khẩu</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Mọi phiên đăng nhập cũ của tài khoản này đã bị thu hồi. Hãy đăng nhập lại bằng mật
                khẩu mới.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                Mã 6 số được gửi tới email cá nhân đã xác minh của tài khoản. Tài khoản chưa xác
                minh email thì phải nhờ quản trị viên đặt lại mật khẩu giúp.
              </p>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Tên đăng nhập</span>
                <input
                  autoComplete="username"
                  className="login-field h-11 w-full rounded-md border px-3 outline-none transition focus:border-[var(--color-accent)] disabled:opacity-70"
                  disabled={busy || step === "reset"}
                  onChange={(event) => setLogin(event.target.value)}
                  ref={firstFieldRef}
                  value={login}
                />
              </label>

              {step === "reset" ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Mã xác minh 6 số</span>
                    <input
                      autoComplete="one-time-code"
                      className="login-field h-11 w-full rounded-md border px-3 text-center text-lg font-semibold tracking-[0.4em] outline-none transition focus:border-[var(--color-accent)]"
                      disabled={busy}
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="000000"
                      value={code}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Mật khẩu mới</span>
                    <div className="relative">
                      <input
                        autoComplete="new-password"
                        className="login-field h-11 w-full rounded-md border px-3 pr-11 outline-none transition focus:border-[var(--color-accent)]"
                        disabled={busy}
                        minLength={MIN_PASSWORD_LENGTH}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="ít nhất 8 ký tự"
                        type={showPassword ? "text" : "password"}
                        value={password}
                      />
                      <button
                        aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        aria-pressed={showPassword}
                        className="login-password-toggle absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center transition"
                        onClick={() => setShowPassword((current) => !current)}
                        type="button"
                      >
                        <ColorIcon
                          name={showPassword ? "passwordHide" : "passwordShow"}
                          size={20}
                          tone="blue"
                        />
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Nhập lại mật khẩu mới</span>
                    <input
                      autoComplete="new-password"
                      className="login-field h-11 w-full rounded-md border px-3 outline-none transition focus:border-[var(--color-accent)]"
                      disabled={busy}
                      onChange={(event) => setConfirm(event.target.value)}
                      type={showPassword ? "text" : "password"}
                      value={confirm}
                    />
                  </label>

                  <button
                    className="text-sm font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void requestCode()}
                    type="button"
                  >
                    Gửi lại mã
                  </button>
                </>
              ) : null}
            </>
          )}

          <div aria-live="polite" className="min-h-5 text-sm">
            {error ? <p className="text-[var(--color-critical)]">{error}</p> : null}
            {!error && notice ? <p className="text-[var(--color-accent)]">{notice}</p> : null}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t bg-[var(--surface-2)] px-5 py-4">
          {step === "done" ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95"
              onClick={onClose}
              type="button"
            >
              Về màn hình đăng nhập
            </button>
          ) : (
            <>
              <button
                className="min-h-10 rounded-md border bg-[var(--surface)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-3)]"
                onClick={onClose}
                type="button"
              >
                Hủy
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
                disabled={
                  busy ||
                  !login.trim() ||
                  (step === "reset" && (code.length !== 6 || !password || !confirm))
                }
                type="submit"
              >
                {busy ? (
                  <ColorIcon className="animate-spin" name="loading" size={17} tone="green" />
                ) : null}
                {step === "request" ? "Gửi mã" : "Đặt mật khẩu mới"}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof TypeError) {
    return "Không thể kết nối đến hệ thống. Vui lòng kiểm tra máy chủ và thử lại.";
  }
  return error instanceof Error ? error.message : "Không thực hiện được. Vui lòng thử lại.";
}

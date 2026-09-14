"use client";

import { useEffect, useRef, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { loginOtpInputError, loginOtpView, type LoginOtpChallenge } from "@/lib/login-otp-state";

/**
 * Bước hai khi tài khoản quản trị đăng nhập: nhập mã 6 số gửi tới email.
 *
 * Nút "Gửi lại mã" KHÔNG hiện trong 60 giây đầu, chỉ hiện dòng đếm ngược. Hiện nút
 * mà vô hiệu hoá thì người dùng vẫn bấm thử, và cảm giác "nút hỏng" còn tệ hơn là
 * biết rõ phải chờ bao lâu.
 */
export function LoginOtpStep({
  challenge,
  busy,
  error,
  notice,
  onVerify,
  onResend,
  onBack,
}: {
  challenge: LoginOtpChallenge;
  busy: boolean;
  error: string;
  notice: string;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Đếm theo đồng hồ thật mỗi giây; mốc lấy từ máy chủ nên tab ngủ dậy vẫn đúng.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Mã mới tới thì xoá mã cũ đang gõ và đưa con trỏ về ô nhập.
  useEffect(() => {
    setCode("");
    setLocalError("");
    setNow(Date.now());
    inputRef.current?.focus();
  }, [challenge.challengeToken, challenge.expiresAt]);

  const view = loginOtpView(challenge, now);
  const shownError = localError || error;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = loginOtpInputError(code, challenge, Date.now());
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError("");
    onVerify(code.trim());
  }

  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
      <div className="rounded-md bg-[var(--accent-soft)] px-3 py-3 text-sm leading-6">
        Tài khoản quản trị cần thêm một bước. Mã 6 số vừa được gửi tới{" "}
        <span className="font-semibold">{challenge.email}</span>.
        {challenge.devCode ? (
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            Máy chủ chưa cấu hình email — mã thử:{" "}
            <span className="font-mono">{challenge.devCode}</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="login-otp" className="text-sm font-medium">
          Mã đăng nhập
        </label>
        <input
          ref={inputRef}
          autoComplete="one-time-code"
          className="login-field h-12 rounded-md border px-3 text-center font-mono text-2xl tracking-[0.5em] outline-none transition focus:border-[var(--color-accent)] disabled:opacity-70"
          disabled={busy}
          id="login-otp"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          value={code}
        />
        <p
          aria-live="polite"
          className={`text-sm ${view.expired ? "font-semibold text-[var(--color-critical)]" : "text-[var(--text-muted)]"}`}
        >
          {view.expired
            ? "Mã đã hết hạn. Hãy gửi lại mã mới."
            : `Mã còn hiệu lực ${view.secondsLeft} giây.`}
        </p>
      </div>

      {shownError ? (
        <p className="rounded-md px-3 py-2 text-sm text-[var(--color-critical)] ring-1 ring-[color-mix(in_oklch,var(--color-critical)_24%,transparent)]">
          {shownError}
        </p>
      ) : notice ? (
        <p className="rounded-md px-3 py-2 text-sm text-[var(--color-ready)] ring-1 ring-[color-mix(in_oklch,var(--color-ready)_24%,transparent)]">
          {notice}
        </p>
      ) : null}

      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        disabled={busy || code.length !== 6}
        type="submit"
      >
        {busy ? <ColorIcon className="animate-spin" name="loading" size={18} tone="green" /> : null}
        Xác nhận
      </button>

      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          className="min-h-9 rounded-md px-2 font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-60"
          disabled={busy}
          onClick={onBack}
          type="button"
        >
          ← Đổi tài khoản
        </button>
        {view.canResend ? (
          <button
            className="min-h-9 rounded-md px-2 font-semibold text-[var(--color-accent)] underline-offset-2 transition hover:underline disabled:opacity-60"
            disabled={busy}
            onClick={onResend}
            type="button"
          >
            Gửi lại mã
          </button>
        ) : (
          <span className="text-[var(--text-muted)]">Gửi lại mã sau {view.resendIn} giây</span>
        )}
      </div>
    </form>
  );
}

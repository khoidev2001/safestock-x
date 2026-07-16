"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((state) => state.setAuth);
  const [email, setEmail] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "Đăng nhập thất bại");
      }
      const data = await response.json();
      setAuth(data.accessToken, data.refreshToken, data.user);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] bg-[var(--bg)] lg:grid-cols-[minmax(420px,0.9fr)_1fr]">
      <section className="hidden border-r bg-[var(--surface-2)] p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-accent)] text-sm font-bold text-[var(--color-accent-fg)]">
            UP
          </span>
          <div>
            <p className="font-semibold">Ứng phó nhanh</p>
            <p className="text-xs text-[var(--text-muted)]">Điều phối cứu hộ & hậu cần thông minh</p>
          </div>
        </div>

        <div className="max-w-md">
          <p className="text-sm font-medium text-[var(--text-muted)]">Kho cứu hộ cấp xã</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
            Biết vật tư nào thực sự sẵn sàng trước khi tình huống xảy ra.
          </h1>
          <p className="mt-5 text-sm leading-6 text-[var(--text-muted)]">
            Dashboard dành cho WAREHOUSE và ADMIN: readiness, tồn kho, mô phỏng cảm biến
            và hậu kiểm thao tác nhạy cảm.
          </p>
        </div>

        <div className="rounded-md border bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
            Demo account
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            admin / admin123@ · staff@safestock.vn / staff123
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-5">
        <form className="w-full max-w-sm rounded-md border bg-[var(--surface)] p-6" onSubmit={submit}>
          <h2 className="text-xl font-semibold">Đăng nhập</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Dùng tài khoản được cấp bởi quản trị viên.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              Tên đăng nhập
            </label>
            <input
              autoComplete="username"
              className="rounded-md border bg-[var(--surface)] px-3 py-2 outline-none transition focus:ring-2 focus:ring-[var(--color-accent)]"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              value={email}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Mật khẩu
            </label>
            <input
              autoComplete="current-password"
              className="rounded-md border bg-[var(--surface)] px-3 py-2 outline-none transition focus:ring-2 focus:ring-[var(--color-accent)]"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>

          {error ? (
            <p className="mt-4 rounded-md px-3 py-2 text-sm text-[var(--color-critical)] ring-1 ring-[color-mix(in_oklch,var(--color-critical)_24%,transparent)]">
              {error}
            </p>
          ) : null}

          <button
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-accent-fg)] transition active:translate-y-px disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
            {isLoading ? "Đang đăng nhập" : "Đăng nhập"}
          </button>
        </form>
      </section>
    </main>
  );
}

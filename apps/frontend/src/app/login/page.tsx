"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((state) => state.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        if (response.status === 401) {
          throw new Error("Tên đăng nhập hoặc mật khẩu không đúng.");
        }
        if (response.status >= 500) {
          throw new Error("Hệ thống đang tạm gián đoạn. Vui lòng thử lại sau.");
        }
        throw new Error("Chưa thể đăng nhập bằng tài khoản này.");
      }
      const data = await response.json();
      setAuth(data.accessToken, data.refreshToken, data.user);
      router.push("/readiness");
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Không thể kết nối đến hệ thống. Vui lòng kiểm tra máy chủ và thử lại."
          : (err as Error).message,
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="login-page-background min-h-[100dvh] p-5 md:p-8 lg:p-12">
      <div className="mx-auto grid min-h-[calc(100dvh-2.5rem)] w-full max-w-7xl items-center gap-10 md:min-h-[calc(100dvh-4rem)] lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:gap-16">
        <section className="max-w-2xl justify-self-center text-center text-white">
          <h1 className="text-5xl font-semibold leading-none tracking-[-0.04em] md:text-6xl lg:text-7xl">
            Ứng phó nhanh
          </h1>
          <p className="mt-5 text-base font-medium leading-7 text-white md:text-lg lg:whitespace-nowrap lg:text-xl">
            Giải pháp cứu hộ cứu nạn và hậu cần thông minh
          </p>
        </section>

        <section className="w-full max-w-lg lg:justify-self-end">
          <form className="app-panel login-panel w-full max-w-lg p-7 md:p-9" onSubmit={submit}>
            <div className="mb-7 flex justify-center">
              <Image
                alt="Ứng phó nhanh"
                className="h-auto w-full max-w-[280px]"
                height={1080}
                priority
                sizes="280px"
                src="/brand/ung-pho-nhanh-logo.png"
                width={1920}
              />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-semibold">Đăng nhập hệ thống</h2>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Tên đăng nhập
              </label>
              <input
                autoComplete="username"
                className="login-field h-11 rounded-md border px-3 outline-none transition focus:border-[var(--color-accent)]"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                value={email}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  autoComplete="current-password"
                  className="login-field h-11 w-full rounded-md border px-3 pr-11 outline-none transition focus:border-[var(--color-accent)]"
                  id="password"
                  onChange={(event) => setPassword(event.target.value)}
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
            </div>

            {error ? (
              <p className="mt-4 rounded-md px-3 py-2 text-sm text-[var(--color-critical)] ring-1 ring-[color-mix(in_oklch,var(--color-critical)_24%,transparent)]">
                {error}
              </p>
            ) : null}

            <button
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? (
                <ColorIcon className="animate-spin" name="loading" size={18} tone="green" />
              ) : null}
              {isLoading ? "Đang đăng nhập" : "Đăng nhập"}
            </button>

            <div className="mt-6 border-t pt-5 text-center">
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[var(--accent-soft)]"
                href="/contacts"
              >
                <ColorIcon name="phone" size={19} tone="green" />
                Xem số liên hệ UBND các xã
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

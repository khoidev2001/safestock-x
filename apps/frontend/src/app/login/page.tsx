"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLoader } from "@/components/shared/brand-loader";
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog";
import { ColorIcon } from "@/components/shared/color-icon";
import { BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { markSessionPresent } from "@/lib/session-marker";
import { publishSession } from "@/lib/session-channel";

/**
 * Đăng nhập xong thì dừng lại chừng này ở màn hình "đã vào được" trước khi
 * chuyển sang bảng điều khiển.
 *
 * Không phải để làm cảnh: bảng điều khiển còn phải hỏi kho, hỏi thông báo, mở
 * socket — trong khoảng đó màn hình gần như trống. Chuyển thẳng sang một trang
 * trống làm người dùng tưởng đăng nhập hỏng và bấm quay lại. Một dấu tích rõ
 * ràng cắt hẳn cái ngờ đó, và phần lớn thời gian chờ này trùng luôn với thời
 * gian trang kia đang dựng.
 */
const SUCCESS_PAUSE_MS = 700;

type FormState = "idle" | "sending" | "success";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((state) => state.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const isBusy = formState !== "idle";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setFormState("sending");
    try {
      const response = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Transport": "web",
        },
        // Cắt khoảng trắng ngay tại đây, đừng để nó đi tới máy chủ rồi mới hỏng:
        // mỗi lần hỏng là một lần bị bộ chống dò đếm, sai năm lần là khoá 15 phút.
        // Mật khẩu KHÔNG cắt — khoảng trắng có thể là một phần thật của mật khẩu.
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Tên đăng nhập hoặc mật khẩu không đúng.");
        }
        // Sai 5 lần là khoá 15 phút — và trong 15 phút đó MẬT KHẨU ĐÚNG CŨNG BỊ
        // TỪ CHỐI. Không nói ra thì người dùng gõ lại đúng mật khẩu, vẫn hỏng,
        // rồi đi nghi ngờ tài khoản hoặc máy chủ. Đây là chỗ duy nhất trong app
        // mà "thử lại ngay" là việc chắc chắn vô ích.
        if (response.status === 429) {
          throw new Error(
            "Đã sai quá 5 lần nên tài khoản bị khoá tạm 15 phút. " +
              "Trong lúc này gõ đúng mật khẩu cũng không vào được — hãy chờ rồi thử lại.",
          );
        }
        if (response.status >= 500) {
          throw new Error("Hệ thống đang tạm gián đoạn. Vui lòng thử lại sau.");
        }
        throw new Error("Chưa thể đăng nhập bằng tài khoản này.");
      }
      const data = await response.json();
      setAuth(data.accessToken, data.user);
      // Từ giờ máy này mới có cái để khôi phục ở những lần mở trang sau.
      markSessionPresent();
      // Đăng nhập thu hồi phiên cũ của tài khoản: tab nào đang mở phải nhận token
      // mới ngay, không thì nó chạy tiếp với token vừa chết và bị đá ra ngoài.
      publishSession(data.accessToken, data.user);
      // KHÔNG trả về trạng thái "idle" ở đây: từ lúc này tấm thẻ chỉ còn việc
      // báo đã vào được rồi nhường chỗ cho bảng điều khiển. Mở khoá lại các ô
      // nhập giữa chừng chỉ mời người dùng bấm Đăng nhập lần thứ hai.
      setFormState("success");
      setTimeout(() => router.push("/overall"), SUCCESS_PAUSE_MS);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Không thể kết nối đến hệ thống. Vui lòng kiểm tra máy chủ và thử lại."
          : (err as Error).message,
      );
      setFormState("idle");
    }
  }

  return (
    <main className="login-page-background min-h-[100dvh] px-4 py-8 md:p-8 lg:p-12">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-7xl items-center gap-10 md:min-h-[calc(100dvh-4rem)] lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)] lg:gap-16">
        <section className="login-hero-enter max-w-2xl justify-self-center text-center text-white">
          {/* `leading-none` cắt cụt dấu của chữ Việt: "Ứ" chồng hai dấu lên đầu
              chữ hoa, mà hộp dòng cao đúng bằng cỡ chữ thì phần chồng đó bị xén.
              Cỡ chữ cũng phải bắt đầu nhỏ hơn — ở 3rem thì "Ứng phó nhanh" rộng
              hơn màn hình 320px và tràn ra ngoài. */}
          <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-[-0.03em] [text-wrap:balance] sm:text-5xl md:text-6xl lg:text-7xl">
            Ứng phó nhanh
          </h1>
          {/* Bỏ `lg:whitespace-nowrap`: đúng ở mốc 1024px, cột này chỉ còn hơn
              440px trong khi dòng chữ cần khoảng 570px — cấm xuống dòng ở đó
              nghĩa là cắt mất đuôi câu. */}
          <p className="mx-auto mt-5 max-w-xl text-base font-medium leading-7 text-white [text-wrap:pretty] md:text-lg lg:text-xl">
            Giải pháp cứu hộ cứu nạn và hậu cần thông minh
          </p>
        </section>

        <section className="w-full max-w-lg justify-self-center lg:justify-self-end">
          <form
            className="app-panel login-panel login-panel-enter w-full max-w-lg p-6 sm:p-7 md:p-9"
            onSubmit={submit}
          >
            {formState === "sending" ? <span aria-hidden className="login-progress" /> : null}

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
                className="login-field h-11 rounded-md border px-3 outline-none transition focus:border-[var(--color-accent)] disabled:opacity-70"
                disabled={isBusy}
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
                  className="login-field h-11 w-full rounded-md border px-3 pr-11 outline-none transition focus:border-[var(--color-accent)] disabled:opacity-70"
                  disabled={isBusy}
                  id="password"
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-pressed={showPassword}
                  className="login-password-toggle absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center transition"
                  disabled={isBusy}
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
              disabled={isBusy}
              type="submit"
            >
              {isBusy ? (
                <ColorIcon className="animate-spin" name="loading" size={18} tone="green" />
              ) : null}
              {formState === "success"
                ? "Đã đăng nhập"
                : formState === "sending"
                  ? "Đang đăng nhập"
                  : "Đăng nhập"}
            </button>

            <div className="mt-4 text-right">
              <button
                className="min-h-9 rounded-md px-2 text-sm font-semibold text-[var(--color-accent)] underline-offset-2 transition hover:underline disabled:opacity-60"
                disabled={isBusy}
                onClick={() => setIsForgotOpen(true)}
                type="button"
              >
                Quên mật khẩu?
              </button>
            </div>

            <div className="mt-6 border-t pt-5 text-center">
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[var(--accent-soft)]"
                href="/contacts"
              >
                <ColorIcon name="phone" size={19} tone="green" />
                Xem số liên hệ UBND các xã
              </Link>
            </div>

            {/* Lớp phủ nằm TRONG tấm thẻ chứ không phủ cả trang: nó che đúng phần
                đang bị khoá và để nguyên phần còn lại của màn hình, nên người
                dùng vẫn thấy mình đang ở đâu. */}
            {isBusy ? (
              <div className="login-busy-veil">
                {formState === "success" ? (
                  <>
                    <span className="login-success-mark">
                      <ColorIcon name="success" size={34} tone="green" />
                    </span>
                    <p className="mt-4 text-base font-semibold">Đăng nhập thành công</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Đang mở bảng điều khiển…
                    </p>
                  </>
                ) : (
                  <BrandLoader label="Đang đăng nhập…" size={72} />
                )}
              </div>
            ) : null}
          </form>
        </section>
      </div>

      <ForgotPasswordDialog
        defaultLogin={email.trim()}
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
      />
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ColorIcon, type ColorIconName, type ColorIconTone } from "@/components/shared/color-icon";
import { useAuth } from "@/lib/auth-store";
import { closeWebSession } from "@/lib/api";
import { navGroups, navItems, type NavItem } from "@/lib/dashboard-nav";
import { missionDeepLink } from "@/lib/mission-inbox-state";
import { NotificationBell } from "@/components/mission/notification-bell";
import { UserProfileButton } from "@/components/profile/user-profile-button";
import { roleHasPermission, userRoleLabel } from "@safestock/shared-types";

interface DashboardShellProps {
  children: React.ReactNode;
  warehouseName?: string;
}

const NAV_COLLAPSED_KEY = "ung-pho-nhanh:nav-collapsed";

export function DashboardShell({ children, warehouseName }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((state) => state.user);
  const visibleNav = navItems.filter(
    (item) => user?.role && roleHasPermission(user.role, item.requiredPermission),
  );

  // Bắt đầu ở trạng thái mở để HTML server và client khớp nhau, rồi mới đọc lựa chọn
  // đã lưu. Nhớ qua các lần tải lại: người đang ghim toạ độ hàng loạt không phải thu
  // lại menu sau mỗi lần chuyển trang.
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    setNavCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === "true");
  }, []);

  function toggleNav() {
    setNavCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem(NAV_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  async function logout() {
    await closeWebSession();
    router.replace("/login");
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]">
      <a className="skip-link" href="#noi-dung-chinh">
        Chuyển đến nội dung chính
      </a>
      <div
        className={`grid min-h-[100dvh] ${navCollapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[272px_1fr]"}`}
      >
        <aside
          className={`hidden border-r bg-[var(--surface)] py-6 lg:sticky lg:top-0 lg:block lg:h-[100dvh] lg:overflow-y-auto ${
            navCollapsed ? "px-2" : "px-5"
          }`}
        >
          <div className={navCollapsed ? "pb-3" : "px-2 pb-5"}>
            <Image
              alt="Ứng phó nhanh"
              className={navCollapsed ? "mx-auto h-auto w-10" : "h-auto w-full max-w-[232px]"}
              height={1080}
              priority
              sizes={navCollapsed ? "40px" : "232px"}
              src={navCollapsed ? "/brand/ung-pho-nhanh-mark.png" : "/brand/ung-pho-nhanh-logo.png"}
              width={1920}
            />
          </div>

          <button
            type="button"
            onClick={toggleNav}
            aria-expanded={!navCollapsed}
            title={navCollapsed ? "Mở rộng thanh chức năng" : "Thu gọn thanh chức năng"}
            className={`mb-3 flex items-center rounded-md border text-xs font-medium text-[var(--text-muted)] transition active:translate-y-px ${
              navCollapsed ? "w-full justify-center px-0 py-2" : "w-full gap-2 px-3 py-2"
            }`}
          >
            <ColorIcon name={navCollapsed ? "expand" : "shrink"} size={16} tone="blue" />
            {navCollapsed ? null : <span>Thu gọn</span>}
          </button>

          <nav className="border-t pt-4" aria-label="Điều hướng chính">
            {navGroups.map((group) => {
              const items = visibleNav.filter((item) => item.group === group);
              if (items.length === 0) return null;
              return (
                <div className="mb-5" key={group}>
                  {/* Rail hẹp không đủ chỗ cho tiêu đề nhóm; đường kẻ thay nó ngăn cách. */}
                  {navCollapsed ? (
                    <div className="mx-2 mb-1.5 border-t" />
                  ) : (
                    <p className="mb-1.5 px-3 text-xs font-semibold text-[var(--text-muted)]">
                      {group}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink
                        key={item.path}
                        isActive={isActive(item.path)}
                        item={item}
                        rail={navCollapsed}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b bg-[var(--surface)] px-4 py-4 md:px-7">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <ColorIcon name="warehouse" size={21} tone="blue" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {warehouseName || user?.warehouseName || user?.unitName || "Đang tải đơn vị"}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {user?.fullName || user?.email || "Chưa xác định"} ·{" "}
                    {user?.role ? userRoleLabel(user.role) : "Chưa xác định vai trò"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell
                  onOpenMission={(missionId, fieldUpdateId) =>
                    router.push(missionDeepLink(missionId, fieldUpdateId))
                  }
                />
                <UserProfileButton onLogout={logout} />
              </div>
            </div>

            <nav
              aria-label="Điều hướng chính trên di động"
              className="mx-auto mt-3 flex max-w-[1440px] gap-1 overflow-x-auto pb-1 lg:hidden"
            >
              {visibleNav.map((item) => (
                <NavLink key={item.path} compact isActive={isActive(item.path)} item={item} />
              ))}
            </nav>
          </header>

          <main className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-8" id="noi-dung-chinh">
            {children}
          </main>
        </section>
      </div>
    </div>
  );
}

function NavLink({
  compact = false,
  rail = false,
  isActive,
  item,
}: {
  compact?: boolean;
  /** Rail: menu đã thu, chỉ còn icon — nhãn giữ cho trình đọc màn hình và tooltip. */
  rail?: boolean;
  isActive: boolean;
  item: { path: string; label: string; icon: ColorIconName; tone: ColorIconTone };
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center rounded-md text-sm transition active:translate-y-px ${
        rail
          ? "w-full justify-center px-0 py-2.5"
          : compact
            ? "w-auto shrink-0 justify-center gap-2 px-3 py-2.5 text-xs"
            : "w-full gap-3 px-3 py-2.5 text-left"
      }`}
      href={item.path}
      title={rail ? item.label : undefined}
      style={{
        background: isActive ? "var(--accent-soft)" : "transparent",
        color: isActive ? "var(--color-accent)" : "var(--text-muted)",
      }}
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center ${compact ? "h-7 w-7" : "h-8 w-8"}`}
      >
        <ColorIcon name={item.icon} size={compact ? 17 : 20} tone={item.tone} />
      </span>
      <span className={rail ? "sr-only" : `truncate ${isActive ? "font-semibold" : "font-medium"}`}>
        {item.label}
      </span>
    </Link>
  );
}

export type { NavItem };

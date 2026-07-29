"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

export function DashboardShell({ children, warehouseName }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((state) => state.user);
  const visibleNav = navItems.filter(
    (item) => user?.role && roleHasPermission(user.role, item.requiredPermission),
  );

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
      <div className="grid min-h-[100dvh] lg:grid-cols-[272px_1fr]">
        <aside className="hidden border-r bg-[var(--surface)] px-5 py-6 lg:sticky lg:top-0 lg:block lg:h-[100dvh] lg:overflow-y-auto">
          <div className="px-2 pb-5">
            <Image
              alt="Ứng phó nhanh"
              className="h-auto w-full max-w-[232px]"
              height={1080}
              priority
              sizes="232px"
              src="/brand/ung-pho-nhanh-logo.png"
              width={1920}
            />
          </div>

          <nav className="border-t pt-4" aria-label="Điều hướng chính">
            {navGroups.map((group) => {
              const items = visibleNav.filter((item) => item.group === group);
              if (items.length === 0) return null;
              return (
                <div className="mb-5" key={group}>
                  <p className="mb-1.5 px-3 text-xs font-semibold text-[var(--text-muted)]">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink key={item.path} isActive={isActive(item.path)} item={item} />
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
  isActive,
  item,
}: {
  compact?: boolean;
  isActive: boolean;
  item: { path: string; label: string; icon: ColorIconName; tone: ColorIconTone };
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center rounded-md text-sm transition active:translate-y-px ${
        compact
          ? "w-auto shrink-0 justify-center gap-2 px-3 py-2.5 text-xs"
          : "w-full gap-3 px-3 py-2.5 text-left"
      }`}
      href={item.path}
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
      <span className={`truncate ${isActive ? "font-semibold" : "font-medium"}`}>{item.label}</span>
    </Link>
  );
}

export type { NavItem };

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ColorIcon, type ColorIconName, type ColorIconTone } from "@/components/shared/color-icon";
import { useAuth } from "@/lib/auth-store";
import { NotificationBell } from "@/components/mission/notification-bell";
import { UserProfileButton } from "@/components/profile/user-profile-button";

export type DashboardView =
  | "readiness"
  | "insights"
  | "assistant"
  | "inventory"
  | "simulator"
  | "mission"
  | "incident"
  | "stocktake"
  | "loan"
  | "map"
  | "report"
  | "users"
  | "audit";

interface DashboardShellProps {
  activeView: DashboardView;
  children: React.ReactNode;
  onViewChange: (view: DashboardView) => void;
  warehouseName?: string;
}

const navItems: {
  id: DashboardView;
  label: string;
  icon: ColorIconName;
  tone: ColorIconTone;
  group: "Điều hành" | "Nghiệp vụ kho" | "Quản trị";
  adminOnly?: boolean;
}[] = [
  { id: "readiness", label: "Tổng quan", icon: "dashboard", tone: "green", group: "Điều hành" },
  { id: "mission", label: "Điều phối cứu hộ", icon: "mission", tone: "orange", group: "Điều hành" },
  { id: "insights", label: "Theo dõi, dự báo", icon: "insights", tone: "blue", group: "Điều hành" },
  { id: "assistant", label: "Tra cứu kho", icon: "assistant", tone: "blue", group: "Điều hành" },
  { id: "inventory", label: "Vật tư", icon: "inventory", tone: "orange", group: "Nghiệp vụ kho" },
  { id: "stocktake", label: "Kiểm kê", icon: "stocktake", tone: "green", group: "Nghiệp vụ kho" },
  { id: "loan", label: "Mượn, trả", icon: "loan", tone: "amber", group: "Nghiệp vụ kho" },
  { id: "incident", label: "Sự cố", icon: "incident", tone: "red", group: "Nghiệp vụ kho" },
  { id: "report", label: "Báo cáo tháng", icon: "report", tone: "green", group: "Nghiệp vụ kho" },
  { id: "map", label: "Bản đồ kho", icon: "map", tone: "blue", group: "Nghiệp vụ kho" },
  { id: "simulator", label: "Cảm biến thử nghiệm", icon: "simulator", tone: "amber", group: "Quản trị" },
  { id: "users", label: "Tài khoản", icon: "users", tone: "blue", group: "Quản trị", adminOnly: true },
  { id: "audit", label: "Nhật ký", icon: "audit", tone: "amber", group: "Quản trị" },
];

const navGroups = ["Điều hành", "Nghiệp vụ kho", "Quản trị"] as const;

const roleLabels: Record<string, string> = {
  ADMIN: "Quản trị xã",
  WAREHOUSE: "Phụ trách kho",
  RESCUE: "Đội cứu hộ",
};

export function DashboardShell({ activeView, children, onViewChange, warehouseName }: DashboardShellProps) {
  const router = useRouter();
  const { user, clear } = useAuth();
  const visibleNav = navItems.filter((item) => !item.adminOnly || user?.role === "ADMIN");

  function logout() {
    clear();
    router.replace("/login");
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]">
      <a className="skip-link" href="#noi-dung-chinh">Chuyển đến nội dung chính</a>
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
                  <p className="mb-1.5 px-3 text-xs font-semibold text-[var(--text-muted)]">{group}</p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavButton
                        key={item.id}
                        isActive={activeView === item.id}
                        item={item}
                        onClick={() => onViewChange(item.id)}
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
                    {user?.fullName || user?.email || "Chưa xác định"} · {roleLabels[user?.role ?? ""] ?? "Chưa xác định vai trò"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell onOpenMission={() => onViewChange("mission")} />
                <UserProfileButton onLogout={logout} />
              </div>
            </div>

            <nav
              aria-label="Điều hướng chính trên di động"
              className="mx-auto mt-3 flex max-w-[1440px] gap-1 overflow-x-auto pb-1 lg:hidden"
            >
              {visibleNav.map((item) => (
                <NavButton
                  key={item.id}
                  compact
                  isActive={activeView === item.id}
                  item={item}
                  onClick={() => onViewChange(item.id)}
                />
              ))}
            </nav>
          </header>

          <main className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-8" id="noi-dung-chinh">{children}</main>
        </section>
      </div>
    </div>
  );
}

function NavButton({
  compact = false,
  isActive,
  item,
  onClick,
}: {
  compact?: boolean;
  isActive: boolean;
  item: { id: DashboardView; label: string; icon: ColorIconName; tone: ColorIconTone };
  onClick: () => void;
}) {
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center rounded-md text-sm transition active:translate-y-px ${
        compact ? "w-auto shrink-0 justify-center gap-2 px-3 py-2.5 text-xs" : "w-full gap-3 px-3 py-2.5 text-left"
      }`}
      onClick={onClick}
      style={{
        background: isActive ? "var(--accent-soft)" : "transparent",
        color: isActive ? "var(--color-accent)" : "var(--text-muted)",
      }}
      type="button"
    >
      <span className={`inline-flex shrink-0 items-center justify-center ${compact ? "h-7 w-7" : "h-8 w-8"}`}>
        <ColorIcon name={item.icon} size={compact ? 17 : 20} tone={item.tone} />
      </span>
      <span className={`truncate ${isActive ? "font-semibold" : "font-medium"}`}>{item.label}</span>
    </button>
  );
}

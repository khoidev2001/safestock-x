"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardCheck,
  ClipboardList,
  LayoutGrid,
  ListChecks,
  LogOut,
  Package,
  RadioTower,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { NotificationBell } from "@/components/mission/notification-bell";

export type DashboardView =
  | "readiness"
  | "inventory"
  | "simulator"
  | "mission"
  | "incident"
  | "stocktake"
  | "loan"
  | "audit";

interface DashboardShellProps {
  activeView: DashboardView;
  children: React.ReactNode;
  onViewChange: (view: DashboardView) => void;
}

const navItems: {
  id: DashboardView;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: "readiness", label: "Tổng quan", icon: LayoutGrid },
  { id: "inventory", label: "Kho vật tư", icon: Package },
  { id: "simulator", label: "Mô phỏng", icon: RadioTower },
  { id: "mission", label: "Nhiệm vụ", icon: ClipboardList },
  { id: "incident", label: "Sự cố", icon: AlertTriangle },
  { id: "stocktake", label: "Kiểm kê", icon: ClipboardCheck },
  { id: "loan", label: "Mượn-trả", icon: ArrowLeftRight },
  { id: "audit", label: "Hậu kiểm", icon: ListChecks },
];

export function DashboardShell({ activeView, children, onViewChange }: DashboardShellProps) {
  const router = useRouter();
  const { user, clear } = useAuth();

  function logout() {
    clear();
    router.replace("/login");
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]">
      <div className="grid min-h-[100dvh] lg:grid-cols-[248px_1fr]">
        <aside className="hidden border-r bg-[var(--surface)] px-4 py-5 lg:block">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-accent)] text-sm font-bold text-[var(--color-accent-fg)]">
              UP
            </span>
            <div>
              <p className="font-semibold">Ứng phó nhanh</p>
              <p className="text-xs text-[var(--text-muted)]">Điều phối cứu hộ & hậu cần</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1" aria-label="Điều hướng chính">
            {navItems.map((item) => (
              <NavButton
                key={item.id}
                isActive={activeView === item.id}
                item={item}
                onClick={() => onViewChange(item.id)}
              />
            ))}
          </nav>

          <div className="mt-8 rounded-md border bg-[var(--surface-2)] p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.8} />
              Hậu kiểm bật
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Sửa tay, reconcile và xuất lô đều cần lý do, ghi audit 5W.
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b bg-[color-mix(in_oklch,var(--surface)_92%,transparent)] px-4 py-3 backdrop-blur md:px-6">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Warehouse aria-hidden="true" size={19} strokeWidth={1.8} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Bảng điều hành kho cứu hộ</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {user?.email ?? "Chưa xác định"} · {user?.role ?? "NO_ROLE"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <button
                  aria-label="Đăng xuất"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-[var(--surface)] transition hover:bg-[var(--surface-2)] active:translate-y-px"
                  onClick={logout}
                  title="Đăng xuất"
                  type="button"
                >
                  <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <nav
              aria-label="Điều hướng chính trên di động"
              className="mx-auto mt-3 grid max-w-[1440px] grid-cols-4 gap-2 lg:hidden"
            >
              {navItems.map((item) => (
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

          <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-6">{children}</div>
        </section>
      </div>
    </main>
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
  item: { id: DashboardView; label: string; icon: typeof LayoutGrid };
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      className={`flex w-full items-center rounded-md text-sm transition active:translate-y-px ${
        compact ? "justify-center gap-1.5 px-2 py-2 text-xs" : "gap-3 px-3 py-2 text-left"
      }`}
      onClick={onClick}
      style={{
        background: isActive ? "var(--surface-2)" : "transparent",
        color: isActive ? "var(--text)" : "var(--text-muted)",
      }}
      type="button"
    >
      <Icon aria-hidden="true" size={compact ? 15 : 17} strokeWidth={1.8} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

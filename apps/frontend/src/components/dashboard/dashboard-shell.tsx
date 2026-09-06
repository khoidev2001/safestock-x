"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ColorIcon, type ColorIconName, type ColorIconTone } from "@/components/shared/color-icon";
import { BrandLoader } from "@/components/shared/brand-loader";
import { useAuth } from "@/lib/auth-store";
import { closeWebSession } from "@/lib/api";
import { getNavItem, navGroups, navItems, type NavItem } from "@/lib/dashboard-nav";
import { unreadByNavPath, unreadIdsForNavPath } from "@/lib/notification-routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotifications, markNotificationsRead, type AppNotification } from "@/lib/mission-api";
import { missionDeepLink } from "@/lib/mission-inbox-state";
import { useTabTransition } from "@/lib/use-tab-transition";
import { NotificationBell } from "@/components/mission/notification-bell";
import { UserProfileButton } from "@/components/profile/user-profile-button";
import { roleHasPermission, userRoleLabel } from "@safestock/shared-types";

interface DashboardShellProps {
  children: React.ReactNode;
  warehouseName?: string;
  /**
   * Những lớp nổi (trợ lý, thẻ thông báo) phải sống NGOÀI vùng nội dung.
   *
   * Lúc chuyển tab, khối chờ phủ kín vùng nội dung. Thẻ cảnh báo sự cố mà nằm
   * chung trong đó thì bị phủ mất theo — đúng loại thông báo không được phép
   * chớp tắt chỉ vì một lượt bấm tab.
   */
  overlays?: React.ReactNode;
}

const NAV_COLLAPSED_KEY = "ung-pho-nhanh:nav-collapsed";

export function DashboardShell({ children, warehouseName, overlays }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const { dangChuyen, dichDen, chuyenTab } = useTabTransition();
  const visibleNav = navItems.filter(
    (item) => user?.role && roleHasPermission(user.role, item.requiredPermission),
  );

  // Số việc chưa đọc gắn thẳng lên tab. Chuông ở góc chỉ cho biết "có gì đó";
  // con số trên tab cho biết Ở ĐÂU, tức là bấm vào đâu thì thấy.
  const notifQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    enabled: Boolean(user?.role),
    refetchInterval: 15_000,
  });
  const soChuaDoc = unreadByNavPath(notifQuery.data ?? []);

  /**
   * Xem việc của một tab rồi thì con số của tab đó phải mất.
   *
   * Trước đây chỉ mở chuông mới xoá được số, nên người trực bấm vào tab Nhiệm
   * vụ, đọc hết việc, quay ra vẫn thấy số đỏ y nguyên. Vài lần như vậy là họ
   * thôi không tin con số nữa, đúng lúc nó đang báo một việc thật.
   *
   * Xoá trong bộ nhớ đệm TRƯỚC khi máy chủ trả lời: con số phải mất cùng lúc
   * với cú bấm, không phải sau một vòng mạng. Nếu lượt ghi hỏng thì lượt hỏi lại
   * ở `finally` sẽ trả con số về đúng như máy chủ đang giữ — thà số quay lại còn
   * hơn giấu mất một việc chưa ai xử lý.
   */
  const danhDauTabDaXem = useCallback(
    (navPath: string) => {
      const ids = unreadIdsForNavPath(notifQuery.data ?? [], navPath);
      if (ids.length === 0) return;
      queryClient.setQueryData<AppNotification[]>(["notifications"], (hienCo) =>
        hienCo?.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)),
      );
      void markNotificationsRead(ids)
        .catch(() => undefined)
        .finally(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
    },
    [notifQuery.data, queryClient],
  );

  /**
   * Chiều cao thật của thanh tiêu đề, để khối chờ biết "ô nội dung" bắt đầu từ đâu.
   *
   * Không đặt hằng số: thanh này cao khác nhau theo bề ngang màn hình (dưới mốc
   * lg còn cõng thêm một hàng tab ngang), và cao thêm nữa khi tên kho dài phải
   * xuống dòng. Đoán một con số thì khối chờ lệch tâm đúng ở những màn hình
   * không ai kiểm.
   *
   * Khởi tạo 0 để HTML dựng ở máy chủ và ở trình duyệt khớp nhau; đo xong ở lượt
   * vẽ đầu tiên, trước khi có bất kỳ lượt chuyển tab nào.
   */
  const headerRef = useRef<HTMLElement>(null);
  const [chieuCaoHeader, setChieuCaoHeader] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const theoDoi = new ResizeObserver(() => {
      setChieuCaoHeader(el.getBoundingClientRect().height);
    });
    theoDoi.observe(el);
    return () => theoDoi.disconnect();
  }, []);

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

  // Trong lúc chờ, tab được tô sáng là tab NGƯỜI DÙNG VỪA BẤM chứ không phải tab
  // cũ. Bấm mà thanh bên không nhúc nhích thì phản xạ đầu tiên là bấm lại.
  const duongDanHienHanh = dichDen ?? pathname;
  // Hỏi đúng cái hàm mà tiêu đề trang và bộ kiểm quyền đang hỏi, thay vì tự so
  // tiền tố ở đây. Tự so là cách cũ, và nó trao `/mission/<id>` cho tab Điều
  // phối cứu hộ — mở một nhiệm vụ ra thì sáng nhầm tab, còn tiêu đề lại ghi việc
  // của tab khác.
  const tabHienTai = getNavItem(duongDanHienHanh)?.path ?? null;
  function isActive(path: string) {
    return tabHienTai === path;
  }

  /**
   * VÀO một tab cũng là đã xem việc của tab đó, không riêng gì bấm lên nó.
   *
   * Bấm một thông báo nhiệm vụ sẽ mở thẳng `/mission/<id>` chứ không đi qua tab
   * Nhiệm vụ, nên nếu chỉ xoá số lúc bấm tab thì con số ở đó nằm lì trong khi
   * người dùng đang đọc đúng cái việc mà nó đếm.
   *
   * `daXoaCho` khoá lại theo từng lượt vào: thông báo MỚI tới trong lúc đang
   * ngồi ở tab đó vẫn hiện số bình thường, chỉ lượt vào mới xoá tiếp. Thiếu khoá
   * này thì số không bao giờ kịp hiện và người trực không biết vừa có việc.
   */
  const daXoaCho = useRef<string | null>(null);
  useEffect(() => {
    // Chờ có dữ liệu thật rồi mới đánh dấu đã xử lý lượt vào này: chốt sổ lúc
    // danh sách còn rỗng thì lượt vào đó coi như bị bỏ qua vĩnh viễn.
    if (!tabHienTai || !notifQuery.data) return;
    if (daXoaCho.current === tabHienTai) return;
    daXoaCho.current = tabHienTai;
    danhDauTabDaXem(tabHienTai);
  }, [tabHienTai, notifQuery.data, danhDauTabDaXem]);

  async function logout() {
    await closeWebSession();
    router.replace("/login");
  }

  return (
    <div
      className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]"
      // Hai số đo này định nghĩa "ô nội dung": phần màn hình bên phải cột chức
      // năng và bên dưới thanh tiêu đề. Khối chờ neo theo đây chứ không theo
      // chiều cao trang.
      style={
        {
          "--header-h": `${chieuCaoHeader}px`,
          "--nav-w": navCollapsed ? "72px" : "272px",
        } as React.CSSProperties
      }
    >
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
                        badge={soChuaDoc[item.path] ?? 0}
                        onSelect={danhDauTabDaXem}
                        onNavigate={chuyenTab}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <header
            className="sticky top-0 z-10 border-b bg-[var(--surface)] px-4 py-4 md:px-7"
            ref={headerRef}
          >
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
                <NavLink
                  key={item.path}
                  compact
                  isActive={isActive(item.path)}
                  item={item}
                  badge={soChuaDoc[item.path] ?? 0}
                  onSelect={danhDauTabDaXem}
                  onNavigate={chuyenTab}
                />
              ))}
            </nav>
          </header>

          <main
            aria-busy={dangChuyen}
            className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-8"
            id="noi-dung-chinh"
          >
            {/* Nội dung ở NGUYÊN trong dòng chảy bố cục, kể cả lúc đang chờ.
                Bản trước ẩn nó bằng `hidden`, và trang mới dựng bên trong một
                nhánh `display:none` khi route đã có sẵn trong bộ nhớ đệm.
                Leaflet đo khung lúc đó ra 0×0, tải đúng một ô bản đồ, rồi giữ
                nguyên con số đó khi khung hiện lại — bản đồ ở tab Điều phối cứu
                hộ chỉ còn một ô vuông ở góc. Mọi thứ tự đo kích thước (bản đồ,
                biểu đồ, bảng cuộn ngang) đều cần điều này. Khối chờ nằm ở cuối
                hàm, phủ lên trên. */}
            {children}
          </main>
        </section>
      </div>

      {overlays}

      {dangChuyen ? (
        <>
          {/* Khối chờ neo vào Ô NỘI DUNG chứ không vào nội dung.
              Bản trước đặt nó trong `<main>` nên chiều cao lớp phủ bằng chiều
              cao trang: trang ngắn thì dấu hiệu nằm sát trên, trang dài mấy màn
              hình thì nó trôi xuống dưới tầm nhìn. Neo cố định vào khung màn
              hình bên phải cột chức năng và dưới thanh tiêu đề thì nó nằm đúng
              một chỗ, mọi trang như nhau. */}
          <div className="tab-transition-veil">
            <BrandLoader />
          </div>
          {/* Chặn mọi cú bấm trong lúc trang đích còn đang dựng. Bấm tiếp lúc này
              chỉ xếp thêm một lượt chuyển vào hàng đợi, và cái hiện ra cuối cùng
              không phải tab bấm sau cùng. Nằm TRÊN khối chờ để con trỏ "cấm" phủ
              khắp màn hình, kể cả trên vùng nội dung. */}
          <div aria-hidden className="tab-transition-block" />
        </>
      ) : null}
    </div>
  );
}

function NavLink({
  compact = false,
  rail = false,
  isActive,
  item,
  badge = 0,
  onSelect,
  onNavigate,
}: {
  compact?: boolean;
  /** Rail: menu đã thu, chỉ còn icon — nhãn giữ cho trình đọc màn hình và tooltip. */
  rail?: boolean;
  isActive: boolean;
  item: { path: string; label: string; icon: ColorIconName; tone: ColorIconTone };
  badge?: number;
  /** Đánh dấu đã xem việc của tab này. Chạy cả khi đang đứng sẵn ở tab đó. */
  onSelect: (path: string) => void;
  onNavigate: (path: string) => void;
}) {
  function bam(event: React.MouseEvent<HTMLAnchorElement>) {
    // Xoá số trước và không kèm điều kiện gì: kể cả khi đang đứng sẵn ở tab này
    // (không có gì để chuyển) thì cú bấm vẫn có nghĩa "tôi đã xem chỗ này".
    onSelect(item.path);

    // Giữ nguyên `href` để còn mở tab mới, sao chép đường dẫn, và để trình đọc
    // màn hình đọc ra là một liên kết. Chỉ giành lấy cú bấm trái không kèm phím
    // bổ trợ — đúng cú bấm cần hiện khối chờ.
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onNavigate(item.path);
  }

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center rounded-md text-sm transition active:translate-y-px ${
        rail
          ? "relative w-full justify-center px-0 py-2.5"
          : compact
            ? "w-auto shrink-0 justify-center gap-2 px-3 py-2.5 text-xs"
            : "w-full gap-3 px-3 py-2.5 text-left"
      }`}
      href={item.path}
      onClick={bam}
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
      {badge > 0 ? (
        <span
          // Đọc thành lời cho trình đọc màn hình: một con số trần cạnh nhãn tab
          // không nói được nó đếm cái gì.
          aria-label={`${badge} việc chưa xem`}
          // `h-5` cùng `min-w-5` cho số một chữ số thành HÌNH TRÒN thật. Thiếu
          // chiều cao cố định thì ô co theo dòng chữ, và `rounded-full` chỉ bo
          // được thành hình thuốc con nhộng dẹt — nhìn ra ngay là lệch.
          //
          // Số từ hai chữ số trở lên vẫn giãn ngang thành viên nang; đó là đánh
          // đổi đúng, vì bóp chữ vào một ô tròn cố định thì số 99+ đọc không ra.
          className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-white ${
            rail ? "absolute right-1 top-1" : ""
          }`}
          style={{ background: "var(--color-critical)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export type { NavItem };

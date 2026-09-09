"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ColorIcon, type ColorIconName, type ColorIconTone } from "@/components/shared/color-icon";
import { BrandLoader } from "@/components/shared/brand-loader";
import { TabTransitionProvider } from "@/lib/tab-transition-context";
import { useAuth } from "@/lib/auth-store";
import { closeWebSession } from "@/lib/api";
import { getNavItem, navGroups, navItems, type NavItem } from "@/lib/dashboard-nav";
import { usePageHeading } from "@/lib/page-heading-store";
import { unreadByNavPath, unreadIdsForNavPath } from "@/lib/notification-routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotifications, markNotificationsRead, type AppNotification } from "@/lib/mission-api";
import { missionDeepLink } from "@/lib/mission-inbox-state";
import type { TabTransition } from "@/lib/use-tab-transition";
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
  /**
   * Trạng thái chuyển tab, do LAYOUT giữ chứ không phải shell.
   *
   * Thẻ thông báo nổi cũng mở nhiệm vụ, mà nó do layout dựng — nằm ngoài shell
   * nên không với tới được context shell phát ra. Đưa hook lên layout thì cả hai
   * đường chuyển trang dùng chung đúng một khối chờ, thay vì nuôi hai cái rồi
   * chúng lệch nhau.
   */
  transition: TabTransition;
}

const NAV_COLLAPSED_KEY = "ung-pho-nhanh:nav-collapsed";

export function DashboardShell({
  children,
  warehouseName,
  overlays,
  transition,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const { isNavigating, destination, goToTab } = transition;
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
  const unreadCounts = unreadByNavPath(notifQuery.data ?? []);

  /**
   * Tab ĐANG MỞ không bao giờ đeo số.
   *
   * Người dùng đang nhìn thẳng vào nội dung của tab đó; một con số đỏ ngay trên
   * cái tab họ đang đứng không nói được điều gì họ chưa thấy, nó chỉ nói "có gì
   * đó ở đây" — mà "ở đây" là chỗ họ đang ở. Tệ hơn: nó không tắt được bằng thao
   * tác nào cả, nên nó dạy người dùng rằng số đỏ là thứ để bỏ qua.
   *
   * Số vẫn chạy bình thường cho các tab KHÁC, và hiện lại ngay khi rời tab này.
   */
  const badgeFor = (path: string): number => (isActive(path) ? 0 : (unreadCounts[path] ?? 0));

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
  const markTabRead = useCallback(
    (navPath: string) => {
      const ids = unreadIdsForNavPath(notifQuery.data ?? [], navPath);
      if (ids.length === 0) return;
      queryClient.setQueryData<AppNotification[]>(["notifications"], (current) =>
        current?.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)),
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
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setHeaderHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
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
  const activePath = destination ?? pathname;
  // Hỏi đúng cái hàm mà tiêu đề trang và bộ kiểm quyền đang hỏi, thay vì tự so
  // tiền tố ở đây. Tự so là cách cũ, và nó trao `/mission/<id>` cho tab Điều
  // phối cứu hộ — mở một nhiệm vụ ra thì sáng nhầm tab, còn tiêu đề lại ghi việc
  // của tab khác.
  const nav = getNavItem(activePath);
  const activeTab = nav?.path ?? null;
  function isActive(path: string) {
    return activeTab === path;
  }

  // Ghi đè tiêu đề do chính trang đặt (trang chi tiết nhiệm vụ). Không có thì
  // rơi về tiêu đề của tab, nên trang tĩnh không phải khai báo gì.
  const headingTitle = usePageHeading((state) => state.title);
  const headingSubtitle = usePageHeading((state) => state.subtitle);
  // Trang đã tự đặt tiêu đề thì phụ đề cũng là của nó, kể cả khi còn trống (đang
  // chờ dữ liệu). Rơi về phụ đề của tab lúc đó sẽ ghép "Nhiệm vụ số 103" với câu
  // mô tả của danh sách — hai dòng nói về hai thứ khác nhau.
  const subtitle = headingTitle ? headingSubtitle : (headingSubtitle ?? nav?.subtitle);

  /**
   * VÀO một tab cũng là đã xem việc của tab đó, không riêng gì bấm lên nó.
   *
   * Bấm một thông báo nhiệm vụ sẽ mở thẳng `/mission/<id>` chứ không đi qua tab
   * Nhiệm vụ, nên nếu chỉ xoá số lúc bấm tab thì con số ở đó nằm lì trong khi
   * người dùng đang đọc đúng cái việc mà nó đếm.
   *
   * Đánh dấu LIÊN TỤC chừng nào còn đứng ở tab đó, kể cả với thông báo vừa mới
   * tới. Bản trước khoá lại theo từng lượt vào, để tin mới vẫn kịp hiện số — nhưng
   * con số ấy nằm trên chính cái tab người dùng đang mở, nên nó không nói thêm
   * được gì và cũng không có cách nào tắt đi ngoài việc rời tab rồi quay lại.
   *
   * Vẫn giữ đúng ý định cũ ở chỗ nó có tác dụng: tin về trong lúc người dùng đứng
   * ở tab KHÁC vẫn hiện số bình thường trên tab của nó.
   */
  useEffect(() => {
    if (!activeTab || !notifQuery.data) return;
    markTabRead(activeTab);
  }, [activeTab, notifQuery.data, markTabRead]);

  async function logout() {
    await closeWebSession();
    router.replace("/login");
  }

  return (
    /* Phát trạng thái chuyển tab xuống cả vùng nội dung: liên kết trong trang
       dùng chung đúng khối chờ này thay vì tự dựng cái thứ hai. */
    <TabTransitionProvider value={transition}>
      <div
        className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]"
        // Hai số đo này định nghĩa "ô nội dung": phần màn hình bên phải cột chức
        // năng và bên dưới thanh tiêu đề. Khối chờ neo theo đây chứ không theo
        // chiều cao trang.
        style={
          {
            "--header-h": `${headerHeight}px`,
            "--nav-w": navCollapsed ? "72px" : "272px",
          } as React.CSSProperties
        }
      >
        <a className="skip-link" href="#noi-dung-chinh">
          Chuyển đến nội dung chính
        </a>
        <div
          /* Chuyển động cột: rail hẹp lại thì cả vùng nội dung nới ra theo. Nhảy
           một phát 200px là mắt mất dấu chỗ mình đang đọc — trượt 260ms thì mắt
           bám theo được. Chỉ chạy `grid-template-columns`; các thuộc tính khác
           đổi tức thì nên không có gì phải chờ nhau. */
          className={`grid min-h-[100dvh] transition-[grid-template-columns] duration-[260ms] ease-out motion-reduce:transition-none ${navCollapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[272px_1fr]"}`}
        >
          {/* Cột dọc: logo và menu ở trên, khối đơn vị ghim đáy bằng `mt-auto`.
            Cuộn chuyển vào riêng phần menu để khối đáy không bị đẩy khỏi tầm
            nhìn khi danh sách chức năng dài hơn màn hình. */}
          <aside
            className={`hidden border-r bg-[var(--surface)] py-6 transition-[padding] duration-[260ms] ease-out motion-reduce:transition-none lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col ${
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
                src={
                  navCollapsed ? "/brand/ung-pho-nhanh-mark.png" : "/brand/ung-pho-nhanh-logo.png"
                }
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

            <nav
              className="min-h-0 flex-1 overflow-y-auto border-t pt-4"
              aria-label="Điều hướng chính"
            >
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
                          badge={badgeFor(item.path)}
                          onSelect={markTabRead}
                          onNavigate={goToTab}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* Đơn vị và vai trò của người đang đăng nhập — thông tin nền, không
              phải thứ phải đọc mỗi lượt chuyển tab. Ở rail thu gọn chỉ còn biểu
              tượng: nhét chữ vào 72px thì cắt cụt cả tên lẫn vai trò, thà để
              tooltip nói đủ. */}
            <div
              className={`mt-auto shrink-0 border-t pt-4 ${navCollapsed ? "" : "px-1"}`}
              title={`${warehouseName || user?.warehouseName || user?.unitName || "Đang tải đơn vị"} · ${
                user?.fullName || user?.email || "Chưa xác định"
              }`}
            >
              <div className={`flex items-center gap-3 ${navCollapsed ? "justify-center" : ""}`}>
                <ColorIcon name="warehouse" size={21} tone="blue" />
                {navCollapsed ? null : (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {warehouseName || user?.warehouseName || user?.unitName || "Đang tải đơn vị"}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {user?.fullName || user?.email || "Chưa xác định"} ·{" "}
                      {user?.role
                        ? userRoleLabel(user.role, { isSuperAdmin: user.isSuperAdmin })
                        : "Chưa xác định vai trò"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <header
              className="sticky top-0 z-10 border-b bg-[var(--surface)] px-4 py-4 md:px-7"
              ref={headerRef}
            >
              <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
                {/* Chỗ dễ thấy nhất màn hình nay dành cho "đang ở đâu", không phải
                  "mình là ai". Tên đơn vị và vai trò không đổi suốt phiên nên đọc
                  một lần là đủ — chúng chuyển xuống đáy cột chức năng. Tiêu đề
                  trang thì đổi mỗi lượt chuyển tab, và là thứ người dùng cần đối
                  chiếu liên tục.

                  Tiêu đề lấy theo path; riêng trang chi tiết nhiệm vụ ghi đè qua
                  `page-heading-store` để hiện đúng "Nhiệm vụ số 103". */}
                <div className="flex min-w-0 items-center gap-3">
                  <ColorIcon name={nav?.icon ?? "dashboard"} size={22} tone={nav?.tone ?? "blue"} />
                  <div className="min-w-0">
                    <h1 className="truncate text-base font-semibold md:text-lg">
                      {headingTitle || nav?.title || "Ứng phó nhanh"}
                    </h1>
                    {subtitle ? (
                      <p className="truncate text-xs text-[var(--text-muted)] md:text-sm">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <NotificationBell
                    // Đi qua `goToTab` chứ không đẩy thẳng bằng router: mở một
                    // nhiệm vụ từ chuông cũng là một lượt chuyển trang mất vài giây
                    // (tải nhiệm vụ, tải kho, dựng bản đồ), mà trước đây nó là lượt
                    // DUY NHẤT không có khối chờ — bấm xong màn hình đứng im như
                    // chưa nhận cú bấm, nên người dùng bấm tiếp thông báo khác.
                    //
                    // Cùng đường với bấm tab thì cũng dùng chung khối chờ có dấu
                    // hiệu phóng to thu nhỏ, và cũng được chặn bấm chồng lượt.
                    onOpenMission={(missionId, fieldUpdateId) => {
                      const href = missionDeepLink(missionId, fieldUpdateId);
                      // Đang đứng sẵn ở đúng nhiệm vụ đó: `pathname` sẽ không đổi
                      // nên khối chờ không có mốc nào để tắt, phải đợi hết chốt
                      // chặn 8 giây. Lượt này chỉ đổi tham số trên URL, đẩy thẳng.
                      if (href.split("?")[0] === pathname) {
                        router.push(href);
                        return;
                      }
                      goToTab(href);
                    }}
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
                    badge={badgeFor(item.path)}
                    onSelect={markTabRead}
                    onNavigate={goToTab}
                  />
                ))}
              </nav>
            </header>

            <main
              aria-busy={isNavigating}
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

        {isNavigating ? (
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
    </TabTransitionProvider>
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
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
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
      onClick={handleClick}
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

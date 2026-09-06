"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BASE } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FloatingAssistant } from "@/components/assistant/floating-assistant";
import { useIncidentAlertsBridge } from "@/components/assistant/use-incident-alerts";
import { advanceInterCommuneLoan, getOpenIncidents } from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-store";
import { useWarehouse } from "@/lib/use-warehouse";
import { NotificationToasts, type ToastItem } from "@/components/shared/notification-toasts";
import { phatTiengThongBao } from "@/lib/notification-sound";
import { BrandLoader } from "@/components/shared/brand-loader";
import { useMissionFocus } from "@/lib/mission-focus-store";
import { missionDeepLink } from "@/lib/mission-inbox-state";
import { getNavItem, navItems } from "@/lib/dashboard-nav";
import { roleHasPermission } from "@safestock/shared-types";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const hasHydrated = useAuth((state) => state.hasHydrated);
  const warehouseQuery = useWarehouse();
  const warehouseId = warehouseQuery.data?.id;

  useEffect(() => {
    if (hasHydrated && !token) router.replace("/login");
  }, [hasHydrated, token, router]);

  useEffect(() => {
    if (!hasHydrated || !token || !user) return;
    const route = getNavItem(pathname);
    if (!route || roleHasPermission(user.role, route.requiredPermission)) return;
    const fallback = navItems.find((item) => roleHasPermission(user.role, item.requiredPermission));
    router.replace(fallback?.path ?? "/login");
  }, [hasHydrated, pathname, router, token, user]);

  const incidentsQuery = useQuery({
    queryKey: ["open-incidents", warehouseId],
    queryFn: () => getOpenIncidents(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
    refetchInterval: 12_000,
  });

  // Kho đang xem chỉ dùng lúc có thông báo tới, không dùng để mở kết nối. Giữ nó
  // trong ref thay vì trong danh sách phụ thuộc, vì lý do ở khối dưới.
  const warehouseIdRef = useRef(warehouseId);
  useEffect(() => {
    warehouseIdRef.current = warehouseId;
  }, [warehouseId]);

  // Sensor snapshots are read by REST polling in their own pages. Socket.IO
  // remains only for lightweight user notifications.
  //
  // CHỈ phụ thuộc vào token. Trước đây có cả `warehouseId`, mà giá trị đó lúc
  // dựng trang đầu tiên là `undefined` rồi vài trăm mili giây sau mới có — nên
  // effect chạy lại và ngắt kết nối vừa mở, đúng lúc nó còn đang bắt tay. Console
  // in ra "WebSocket is closed before the connection is established", và mỗi lần
  // vào trang lại tốn một kết nối chết yểu. Thông báo vẫn tới nhờ socket mở lại
  // và nhờ lượt hỏi định kỳ, nên không ai để ý là có gì đó sai.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /** Id các thông báo đã kêu chuông trong phiên này — không kêu lại lần hai. */
  const daKeuRef = useRef<Set<string>>(new Set());

  /**
   * Trả lời yêu cầu mượn NGAY TRÊN THẺ thông báo.
   *
   * Trước đây thẻ chỉ báo "có xã xin mượn", người trực phải tự nhớ sang tab Mượn
   * trả rồi tìm lại đúng dòng. Lúc đang bão, mỗi bước phải đi tìm là một bước bị
   * bỏ — và bên xin mượn ngồi chờ mà không biết chờ ai.
   *
   * Chỉ ĐỒNG Ý mới cần chọn lô, nên nút Đồng ý ở đây đưa khoản mượn sang trạng
   * thái đã duyệt và để người dùng chọn lô ở tab Mượn trả. Cho chọn lô ngay trên
   * một thẻ thông báo nhỏ xíu là ép quyết định về lô trong ba giây, mà chọn nhầm
   * lô thì trừ nhầm hàng thật.
   */
  const traLoiYeuCauMuon = useCallback(
    async (loanId: string, dongY: boolean) => {
      await advanceInterCommuneLoan(loanId, {
        to: dongY ? "APPROVED" : "REJECTED",
        reason: dongY ? undefined : "Từ chối từ thông báo",
      });
      queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (dongY) router.push("/loan");
    },
    [queryClient, router],
  );
  const boToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);
  const focusMission = useMissionFocus((s) => s.focusMission);
  const moNhiemVu = useCallback(
    (item: ToastItem) => {
      boToast(item.id);
      if (!item.missionId) return;
      focusMission(item.missionId);
      router.push(missionDeepLink(item.missionId));
    },
    [boToast, focusMission, router],
  );

  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(BASE, { transports: ["websocket"], auth: { token } });
    socket.on("notification", (payload?: Partial<ToastItem>) => {
      queryClient.invalidateQueries({ queryKey: ["open-incidents", warehouseIdRef.current] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // Máy chủ có thể phát sự kiện rỗng (chỉ để báo "có gì đó mới"). Không có
      // tiêu đề thì không dựng thẻ: một thẻ trống còn khó hiểu hơn là không có.
      if (!payload?.id || !payload.title) return;
      // Tiếng báo chỉ kêu cho thông báo CHƯA TỪNG hiện trong phiên này. Máy chủ
      // gửi lại một thông báo cũ (mở lại socket, thử lại) thì im.
      //
      // Đặt ngoài hàm cập nhật state chứ không đặt trong: React gọi hàm cập nhật
      // hai lần ở chế độ dev để bắt hàm không thuần, nên phát tiếng trong đó là
      // chuông kêu đôi — nghe như có hai việc trong khi chỉ có một.
      if (daKeuRef.current.has(payload.id)) return;
      daKeuRef.current.add(payload.id);
      phatTiengThongBao();
      setToasts((current) => {
        if (current.some((item) => item.id === payload.id)) return current;
        // Giữ tối đa bốn thẻ. Nhiều hơn thì chồng kín màn hình và che mất đúng
        // phần giao diện người dùng đang cần bấm.
        return [
          ...current.slice(-3),
          {
            id: payload.id as string,
            kind: payload.kind ?? "",
            title: payload.title as string,
            body: payload.body ?? "",
            missionId: payload.missionId ?? null,
            loanId: payload.loanId ?? null,
            incidentType: payload.incidentType ?? null,
            affectedPeople: payload.affectedPeople ?? null,
            locationName: payload.locationName ?? null,
          },
        ];
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  useIncidentAlertsBridge(incidentsQuery.data);

  // Đang khôi phục phiên: PHẢI hiện gì đó. Trước đây trả `null`, tức là màn hình
  // trắng trơn suốt lượt gọi khôi phục — người dùng không biết app đang chạy hay
  // đã hỏng, và phản xạ đầu tiên là tải lại trang, làm mọi thứ bắt đầu lại.
  if (!hasHydrated) return <DangKhoiPhucPhien />;
  // Không có phiên thì đang bị đẩy sang trang đăng nhập; đừng loé lên khung
  // dashboard rỗng trong lúc chuyển.
  if (!token) return null;
  return (
    // Trợ lý và thẻ thông báo đi qua `overlays` chứ không nằm trong `children`:
    // vùng nội dung bị ẩn trong lúc chuyển tab, mà cảnh báo sự cố thì không được
    // phép chớp tắt chỉ vì người dùng vừa bấm sang tab khác.
    <DashboardShell
      overlays={
        <>
          {warehouseId ? <FloatingAssistant warehouseId={warehouseId} /> : null}
          <NotificationToasts
            items={toasts}
            onDecideLoan={traLoiYeuCauMuon}
            onDismiss={boToast}
            onOpen={moNhiemVu}
          />
        </>
      }
      warehouseName={warehouseQuery.data?.name}
    >
      {children}
    </DashboardShell>
  );
}

function DangKhoiPhucPhien() {
  // Cùng một khối chờ với lúc chuyển tab: người dùng học nhịp thở của dấu hiệu
  // một lần rồi nhận ra nó ở mọi chỗ phải chờ, thay vì mỗi chỗ một kiểu quay.
  return <BrandLoader className="min-h-[100dvh]" label="Đang mở phiên làm việc…" />;
}

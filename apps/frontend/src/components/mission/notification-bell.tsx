"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { incidentTypeLabel, Permission, roleHasPermission } from "@safestock/shared-types";
import { ColorIcon } from "@/components/shared/color-icon";
import { incidentIconName } from "@/lib/incident-visuals";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ApiError, BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { getNotifications, markAllRead } from "@/lib/mission-api";
import {
  advanceInterCommuneLoan,
  getInterCommuneLoans,
  type InterCommuneLoan,
} from "@/lib/dashboard-api";
import { loanActions, statusLabel } from "@/components/dashboard/inter-commune-loan-actions";
import { useMissionFocus } from "@/lib/mission-focus-store";

export function NotificationBell({
  onOpenMission,
}: {
  onOpenMission?: (missionId: string, fieldUpdateId?: string | null) => void;
}) {
  const role = useAuth((s) => s.user?.role);
  const token = useAuth((s) => s.token);
  const focusMission = useMissionFocus((s) => s.focusMission);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  function openMission(missionId: string, fieldUpdateId?: string | null) {
    focusMission(missionId);
    onOpenMission?.(missionId, fieldUpdateId);
    setOpen(false);
  }

  const notifQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    enabled: Boolean(role),
    refetchInterval: 15000, // fallback nếu WebSocket rớt
  });

  // Realtime: backend derives the role room from the authenticated user.
  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(BASE, {
      transports: ["websocket"],
      auth: { token },
    });
    socket.on("notification", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  const items = notifQuery.data ?? [];
  const unread = items.filter((n) => !n.read).length;
  const canManageLoans = Boolean(role && roleHasPermission(role, Permission.LOAN_MANAGE));
  const hasLoanNotification = items.some((n) => n.loanId);

  /**
   * Sổ mượn liên xã, để thẻ thông báo dựng được phần chi tiết và hai nút.
   *
   * Thông báo chỉ mang `loanId`; mọi thứ người duyệt cần biết trước khi bấm —
   * xin bao nhiêu, món gì, hiện đang ở bước nào — nằm trong sổ. Chỉ tải khi
   * chuông ĐANG MỞ và thật sự có thông báo mượn: phần lớn lượt mở chuông là để
   * đọc tin nhiệm vụ, không việc gì phải quét sổ mượn cho những lượt đó.
   */
  const loanQuery = useQuery({
    queryKey: ["inter-commune-loans"],
    queryFn: getInterCommuneLoans,
    enabled: open && canManageLoans && hasLoanNotification,
  });
  const loanById = new Map((loanQuery.data ?? []).map((loan) => [loan.id, loan]));

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markAllRead();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  return (
    <div className="relative">
      <button
        aria-label={`Thông báo${unread > 0 ? `, ${unread} chưa đọc` : ""}`}
        onClick={toggle}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-[var(--surface)] transition hover:bg-[var(--surface-2)] active:translate-y-px"
        type="button"
      >
        {/* Còn việc chưa đọc thì chuông đỏ, không chỉ mỗi con số nhỏ ở góc:
            màu đọc được từ xa hơn một chữ số cỡ 10px. */}
        <ColorIcon name="notification" size={19} tone={unread > 0 ? "red" : "amber"} />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--color-critical)" }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* z nhỏ là đủ: hộp này nằm trong header `sticky z-10` nên dù đặt bao
              nhiêu cũng chỉ được vẽ ở tầng 10 của trang. Thứ từng đè lên nó là
              lớp control của Leaflet, và chỗ sửa đúng nằm ở khung bản đồ
              (`isolate` trong incident-map), không phải ở đây. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-md border bg-[var(--surface)] shadow-2xl">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">Thông báo</div>
            {/* Cao tới 800px để đọc được nhiều thông báo trong một lượt mở, nhưng
                không vượt quá màn hình: hộp thả xuống từ chuông sát mép trên, nên
                trên laptop cao 768px thì 800px cứng làm phần cuối danh sách rơi ra
                ngoài màn hình mà không cuộn tới được. */}
            <div className="max-h-[min(800px,75vh)] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                  Chưa có thông báo.
                </p>
              ) : (
                items.map((n) =>
                  n.loanId && canManageLoans ? (
                    <LoanNotificationCard
                      key={n.id}
                      notification={n}
                      loan={loanById.get(n.loanId)}
                      loading={loanQuery.isPending}
                    />
                  ) : n.missionId ? (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openMission(n.missionId as string, n.fieldUpdateId)}
                      className="block w-full border-b px-4 py-3 text-left transition last:border-0 hover:bg-[var(--surface-2)]"
                    >
                      {/* Số hiệu trước tiêu đề: trong chuông có cả chục dòng của
                          nhiều nhiệm vụ khác nhau, không có số thì phải mở từng
                          dòng ra mới biết dòng nào thuộc việc mình đang theo. */}
                      {n.missionNo != null ? (
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Nhiệm vụ số {n.missionNo}
                        </p>
                      ) : null}
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {n.incidentType ? (
                          <ColorIcon name={incidentIconName(n.incidentType)} size={16} tone="red" />
                        ) : null}
                        {n.title}
                      </p>
                      <NotificationFacts notification={n} />
                      <p className="mt-0.5 line-clamp-3 text-xs text-[var(--text-muted)]">
                        {n.body}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--color-accent)]">
                        Xem nhiệm vụ →
                      </p>
                    </button>
                  ) : (
                    <div key={n.id} className="border-b px-4 py-3 last:border-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      {/* body có thể dài khi kèm giải thích AI → gói 3 dòng, tránh tràn dropdown. */}
                      <p className="mt-0.5 line-clamp-3 text-xs text-[var(--text-muted)]">
                        {n.body}
                      </p>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Thẻ thông báo mượn liên xã: bấm ra chi tiết, duyệt ngay tại chỗ.
 *
 * Trước đây thẻ này là một `<div>` chết, kết bằng câu "Mở tab Mượn trả để xem chi
 * tiết". Người bên xã cho mượn đọc xong phải nhớ tên xã và số lượng, rời chuông,
 * đi tìm đúng dòng đó giữa danh sách — trong lúc xã bên kia đang đợi để biết có
 * hàng hay không. Việc phải làm ở ngay đây, nên nút cũng phải ở ngay đây.
 *
 * Vẫn giữ đường sang tab Mượn, trả: phần trả hàng và trả từng phần nằm bên đó, và
 * thẻ này cố ý không gánh cả vòng đời khoản mượn.
 */
function LoanNotificationCard({
  notification,
  loan,
  loading,
}: {
  notification: { title: string; body: string };
  /** `undefined` khi sổ chưa tải xong, hoặc khoản mượn đã bị xoá khỏi sổ. */
  loan?: InterCommuneLoan;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const advance = useMutation({
    mutationFn: (input: { to: string; reason?: string }) =>
      advanceInterCommuneLoan(loan!.id, input),
    onMutate: () => setError(null),
    onSuccess: () => {
      setRejecting(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-stock-marks"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) =>
      setError(
        e instanceof ApiError || e instanceof Error ? e.message : "Không cập nhật được khoản mượn.",
      ),
  });

  // Đúng những bước máy chủ sẽ chấp nhận, không hơn: bày một nút rồi để máy chủ
  // từ chối là dạy người dùng rằng nút trên màn hình không đáng tin.
  const actions = loan ? loanActions(loan.direction, loan.status, loan.recordedManually) : [];

  return (
    <div className="border-b px-4 py-3 last:border-0">
      <button
        aria-expanded={expanded}
        className="block w-full text-left"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <ColorIcon name="loan" size={16} tone="amber" />
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-3 text-xs text-[var(--text-muted)]">{notification.body}</p>
        <p className="mt-1 text-[11px] font-semibold text-[var(--color-accent)]">
          {expanded ? "Thu gọn" : "Xem chi tiết và duyệt →"}
        </p>
      </button>

      {expanded ? (
        <div className="mt-2 space-y-2 rounded-md border bg-[var(--surface-2)] p-2.5">
          {loading ? (
            <p className="text-xs text-[var(--text-muted)]">Đang tra sổ mượn…</p>
          ) : !loan ? (
            /* Khoản mượn không còn trong sổ: thông báo cũ hơn dữ liệu. Nói thẳng
               thay vì hiện một thẻ trống, và vẫn chỉ đường sang tab để tra lại. */
            <p className="text-xs text-[var(--text-muted)]">
              Không còn thấy khoản mượn này trong sổ. Mở tab Mượn, trả để tra lại.
            </p>
          ) : (
            <>
              <dl className="space-y-1 text-xs">
                <DetailRow
                  label={loan.direction === "OUTGOING" ? "Xã xin mượn" : "Hỏi mượn xã"}
                  value={loan.peerCommuneName}
                />
                <DetailRow label="Vật tư" value={loan.itemName} />
                <DetailRow
                  label="Số lượng"
                  value={`${loan.quantity.toLocaleString("vi")} ${loan.unit}`}
                />
                <DetailRow label="Trạng thái" value={statusLabel(loan.status)} />
                {loan.note ? <DetailRow label="Ghi chú" value={loan.note} /> : null}
              </dl>

              {rejecting ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--text-muted)]">
                    Lý do từ chối (xã kia đọc được)
                    <input
                      autoFocus
                      className="mt-1 w-full rounded-md border bg-[var(--surface)] px-2 py-1.5 text-xs"
                      onChange={(event) => setReason(event.target.value.slice(0, 300))}
                      placeholder="Ví dụ: kho bên mình cũng đang thiếu"
                      value={reason}
                    />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <CardButton
                      disabled={advance.isPending}
                      onClick={() =>
                        advance.mutate({ to: "REJECTED", reason: reason.trim() || undefined })
                      }
                      tone="critical"
                    >
                      {advance.isPending ? "Đang gửi…" : "Xác nhận từ chối"}
                    </CardButton>
                    <CardButton disabled={advance.isPending} onClick={() => setRejecting(false)}>
                      Quay lại
                    </CardButton>
                  </div>
                </div>
              ) : actions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Không còn bước nào phải làm ở đây. Phần trả hàng nằm trong tab Mượn, trả.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {actions
                    // Trả từng phần cần ô nhập số lượng — việc đó thuộc tab Mượn,
                    // trả. Chuông chỉ lo bước quyết định: đồng ý hay không.
                    .filter((action) => !action.needsQuantity)
                    .map((action) => (
                      <CardButton
                        disabled={advance.isPending}
                        key={action.to}
                        onClick={() => {
                          if (action.to === "REJECTED") {
                            setRejecting(true);
                            return;
                          }
                          advance.mutate({ to: action.to });
                        }}
                        tone={
                          action.tone === "danger"
                            ? "critical"
                            : action.tone === "primary"
                              ? "accent"
                              : undefined
                        }
                      >
                        {advance.isPending ? "Đang xử lý…" : action.label}
                      </CardButton>
                    ))}
                </div>
              )}
            </>
          )}
          <div aria-live="polite">
            {error ? <p className="text-xs text-[var(--color-critical)]">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium">{value}</dd>
    </div>
  );
}

function CardButton({
  children,
  disabled,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "accent" | "critical";
}) {
  return (
    <button
      className="rounded-md border bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold transition hover:bg-[var(--surface-3)] active:translate-y-px disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      style={
        tone === "critical"
          ? { borderColor: "var(--color-critical)", color: "var(--color-critical)" }
          : tone === "accent"
            ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" }
            : undefined
      }
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * Dòng dữ kiện gọn của một thông báo: thiên tai gì, bao nhiêu người, ở đâu.
 *
 * Cùng ba thứ với thẻ thông báo nổi, để người đọc lại trong chuông không phải
 * dịch nghĩa lần nữa từ một cách trình bày khác.
 */
function NotificationFacts({
  notification,
}: {
  notification: {
    incidentType?: string | null;
    affectedPeople?: number | null;
    locationName?: string | null;
  };
}) {
  const { incidentType, affectedPeople, locationName } = notification;
  if (!incidentType && !affectedPeople && !locationName) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
      {incidentType ? (
        <span className="font-semibold" style={{ color: "var(--color-critical)" }}>
          {incidentTypeLabel(incidentType)}
        </span>
      ) : null}
      {affectedPeople ? (
        <span>
          <b>{affectedPeople.toLocaleString("vi")}</b> người
        </span>
      ) : null}
      {locationName ? <b>{locationName}</b> : null}
    </p>
  );
}

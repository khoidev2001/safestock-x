"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Permission, roleHasPermission } from "@safestock/shared-types";
import { ColorIcon } from "@/components/shared/color-icon";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import {
  advanceInterCommuneLoan,
  getInterCommuneLoans,
  getPeerCommunes,
  requestInterCommuneLoan,
  resendInterCommuneLoan,
  type InterCommuneLoan,
} from "@/lib/dashboard-api";
import { recalculateMissionSupply, type MissionRequirement } from "@/lib/mission-api";
import {
  attemptsSummary,
  isLoanInFlight,
  loanLine,
  sortByStage,
  type LoanTone,
} from "./loan-progress";

/**
 * Mượn phần còn thiếu của xã lân cận, ngay dưới bảng điều phối nội xã.
 *
 * Đứng ở ĐÂY chứ không ở khối "Khả năng đáp ứng": hai khối trả lời hai câu khác
 * nhau. Khối điều phối nói LẤY HÀNG Ở ĐÂU — kho nào trong xã cấp gì, và phần nào
 * trong xã không còn thì hỏi ai bên ngoài; đó là một mạch việc liền nhau, cắt đôi
 * ra hai chỗ là bắt người trực nhớ danh sách thiếu rồi cuộn đi tìm nút. Khối khả
 * năng đáp ứng chỉ còn việc soi lại kết quả: đủ hay chưa.
 *
 * Thay cho khối "Liên xã khi thiếu nội xã" cũ. Khối đó liệt kê số điện thoại UBND
 * các xã kèm dòng "đề xuất liên hệ, chưa xác nhận có hàng" — tức là giao lại toàn
 * bộ việc cho người dùng đúng lúc họ cần hệ thống làm hộ nhất, trong khi đường
 * mượn máy-với-máy đã chạy được.
 */
export function InterCommuneBorrowSection({
  missionId,
  missionNo,
  requirements,
  canRecalculate,
}: {
  missionId: string;
  /** Ghi vào lời nhắn gửi sang xã cho mượn, để họ biết hàng đi đâu. */
  missionNo?: number;
  /** Vật tư đang dùng của nhiệm vụ, đọc thẳng từ bản ghi (không phải ảnh chụp). */
  requirements: MissionRequirement[];
  /**
   * Nhiệm vụ còn nháp nên phân bổ lại được.
   *
   * Đã phát hành thì các kho đang cầm phiếu theo con số cũ; tính lại lúc đó là
   * đổi lệnh dưới tay người đang bốc hàng. Máy chủ chặn lần nữa.
   */
  canRecalculate: boolean;
}) {
  const queryClient = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const canBorrow = Boolean(role && roleHasPermission(role, Permission.LOAN_MANAGE));
  const shortItems = requirements.filter((requirement) => requirement.shortage > 0);

  const loans = useQuery({
    queryKey: ["inter-commune-loans"],
    queryFn: getInterCommuneLoans,
    enabled: canBorrow,
    // Câu trả lời của xã kia tới qua máy chủ của họ, không qua thao tác nào trên
    // màn hình này. Hỏi lại trong lúc còn khoản chưa ngã ngũ — hết việc thì thôi,
    // không nuôi một vòng lặp chạy suốt ca trực.
    // Còn bước đang chạy thì hỏi lại: câu trả lời của xã kia tới qua máy chủ của
    // họ, và bước ĐANG GỬI cũng kết thúc ở nền chứ không do thao tác nào ở đây.
    // Nhịp ngắn hơn trước vì bước đang gửi chỉ kéo dài vài giây — chờ 15 giây mới
    // biết đã gửi xong thì người dùng đã kịp bấm gửi lại một lần vô ích.
    refetchInterval: (query) =>
      query.state.data?.some((loan) => loan.direction === "INCOMING" && isLoanInFlight(loan))
        ? 5_000
        : false,
  });

  /**
   * Chỉ những khoản MÌNH đi mượn CHO NHIỆM VỤ NÀY.
   *
   * Lọc theo `missionId`, không theo mã vật tư. Lỗi đã xảy ra thật: một nhiệm vụ
   * vừa lập xong, chưa ai bấm gì, đã hiện sẵn "Đã gửi sang xã Xuân Thọ 4 chiếc" —
   * đó là khoản mượn của một nhiệm vụ khác cũng thiếu xuồng. Người trực đọc câu
   * đó rồi ngồi đợi một câu trả lời không dành cho mình.
   *
   * Khoản cũ tạo trước khi có trường này mang `missionId` rỗng nên không hiện ở
   * nhiệm vụ nào — đúng ý: không biết nó thuộc về đâu thì đừng gán bừa.
   */
  const missionLoans = (loans.data ?? []).filter(
    (loan) =>
      loan.direction === "INCOMING" && loan.missionId === missionId && loan.status !== "CANCELLED",
  );

  /**
   * Phân bổ lại khi hàng mượn đã thật sự về kho.
   *
   * Bản tham mưu chốt phân bổ lúc lập, nên xã kia đồng ý và hàng đã nhập kho rồi
   * mà màn hình vẫn ghi "đáp ứng 0/150". Người trực làm đủ mọi việc được yêu cầu
   * và hệ thống vẫn báo thiếu — không có cách nào tệ hơn để kết thúc một luồng.
   *
   * Mốc là ACTIVE chứ không phải APPROVED: đồng ý mới là lời hứa, ACTIVE mới là
   * lúc kho bên mình cộng thêm hàng thật.
   */
  const recalculate = useMutation({
    mutationFn: () => recalculateMissionSupply(missionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
  });
  /**
   * Những khoản đã tính rồi, để không gọi lại vòng vo.
   *
   * `useEffect` chạy lại sau mỗi lần lượt truy vấn nhiệm vụ được làm mới, mà
   * chính lần tính lại vừa rồi làm nó mới. Không nhớ đã xử lý khoản nào thì đó là
   * một vòng lặp gọi máy chủ không có điểm dừng.
   */
  const settledLoanIds = useRef<Set<string>>(new Set());
  /**
   * Khoản đã về kho MÀ chỗ thiếu của nó vẫn chưa được bù.
   *
   * Hai điều kiện, cố ý:
   *
   * - `settledLoanIds` chặn gọi lặp trong một lần mở màn hình: chính lần tính lại
   *   vừa rồi làm lượt truy vấn nhiệm vụ mới lại, `useEffect` chạy lại, và không
   *   nhớ đã xử lý khoản nào thì đó là vòng lặp gọi máy chủ không có điểm dừng.
   * - Còn thiếu hay không thì chặn gọi thừa GIỮA các lần mở màn hình: ref rỗng lại
   *   sau mỗi lần tải trang, nên nếu chỉ dựa vào nó thì mọi lượt mở nhiệm vụ có
   *   khoản mượn cũ đều tốn một lượt phân bổ lại vô ích, mãi mãi.
   *
   * Còn thiếu mà hàng đã về thì đúng là lúc con số đang cũ — gọi lại là việc cần.
   */
  const shortSkus = new Set(shortItems.map((item) => item.sku));
  const arrivedLoanIds = missionLoans
    .filter(
      (loan) =>
        shortSkus.has(loan.itemSku) &&
        (loan.status === "ACTIVE" ||
          loan.status === "PARTIALLY_RETURNED" ||
          loan.status === "RETURNED"),
    )
    .map((loan) => loan.id);
  const arrivedKey = arrivedLoanIds.join(",");

  useEffect(() => {
    if (!canRecalculate || recalculate.isPending) return;
    const fresh = arrivedLoanIds.filter((id) => !settledLoanIds.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) settledLoanIds.current.add(id);
    recalculate.mutate();
    // `arrivedKey` là dạng chuỗi của danh sách id: mảng mới mỗi lần dựng lại nên
    // so sánh tham chiếu luôn khác, còn chuỗi thì chỉ đổi khi danh sách thật sự đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivedKey, canRecalculate]);

  /**
   * Loại hiện trong khối này: còn thiếu, HOẶC đã từng hỏi mượn cho nhiệm vụ này.
   *
   * Vế sau là chỗ báo kết quả. Chỉ lọc theo "còn thiếu" thì ngay khi hàng mượn về
   * kho, dòng đó biến mất khỏi màn hình — người điều phối vừa làm xong cả một
   * vòng mượn liên xã và không thấy đâu nói là nó đã xong.
   */
  const rows = requirements.filter(
    (requirement) =>
      requirement.shortage > 0 || missionLoans.some((loan) => loan.itemSku === requirement.sku),
  );

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-[var(--text-muted)]">
        Kho trong xã lo đủ cả {requirements.length} loại vật tư — chưa phải hỏi mượn xã nào.
      </p>
    );
  }

  if (!canBorrow) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-[var(--text-muted)]">
        Còn thiếu {shortItems.length} loại phải hỏi mượn xã lân cận. Việc này cần tài khoản có quyền
        quản lý mượn, trả.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {shortItems.length > 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Kho trong xã không đủ {shortItems.length} loại. Bấm{" "}
          <span className="font-semibold text-[var(--text)]">Mượn xã khác</span> ở dòng tương ứng —
          xã kia nhận được yêu cầu, bấm đồng ý là hàng trừ bên họ và cộng vào kho mình.
        </p>
      ) : (
        /* Không còn thiếu gì mà khối vẫn hiện, nghĩa là chỗ thiếu đã được bù bằng
           hàng mượn. Nói thẳng ra: đó là kết quả của cả một vòng việc người điều
           phối vừa làm, không thể để họ tự suy ra từ việc chữ đỏ biến mất. */
        <p className="text-sm font-semibold" style={{ color: "var(--color-ready)" }}>
          Đã mượn đủ phần thiếu — kho trong xã nay lo được cả {requirements.length} loại.
        </p>
      )}

      <div className="divide-y rounded-md border">
        {rows.map((item) => (
          <div className="px-4 py-3" key={item.sku}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">{item.itemName}</p>
              {item.shortage > 0 ? (
                <p className="text-xs font-semibold text-[var(--color-critical)]">
                  thiếu {item.shortage.toLocaleString("vi")} {item.unit}
                </p>
              ) : (
                <p className="text-xs font-semibold" style={{ color: "var(--color-ready)" }}>
                  đã đủ
                </p>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Kho trong xã đáp ứng {item.allocated.toLocaleString("vi")}/
              {item.required.toLocaleString("vi")} {item.unit}
            </p>
            <BorrowFromPeer
              item={item}
              loans={missionLoans}
              missionId={missionId}
              missionNo={missionNo}
            />
          </div>
        ))}
      </div>

      {recalculate.isPending ? (
        <p className="text-xs text-[var(--text-muted)]">
          Hàng mượn đã về kho — đang phân bổ lại theo tồn kho mới…
        </p>
      ) : null}
    </div>
  );
}

/**
 * Hỏi mượn phần còn thiếu của MỘT loại vật tư.
 *
 * Số lượng thiếu thì hệ thống đã biết sẵn nên nó là số điền sẵn, không phải câu
 * hỏi. Chỉ hỏi đúng hai điều máy không biết: mượn xã nào, và có sửa số lượng không.
 */
function BorrowFromPeer({
  item,
  loans,
  missionId,
  missionNo,
}: {
  item: MissionRequirement;
  /** ĐÃ lọc sẵn theo nhiệm vụ ở khối cha — xem `missionLoans`. */
  loans: InterCommuneLoan[];
  missionId: string;
  missionNo?: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [peerCommuneName, setPeerCommuneName] = useState("");
  const [quantity, setQuantity] = useState(String(item.shortage));
  const [error, setError] = useState<string | null>(null);
  const unit = item.unit || "đơn vị";

  const peers = useQuery({
    queryKey: ["peer-communes"],
    queryFn: getPeerCommunes,
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const request = useMutation({
    mutationFn: () =>
      requestInterCommuneLoan({
        peerCommuneName,
        itemSku: item.sku,
        itemName: item.itemName,
        unit,
        quantity: Number(quantity),
        missionId,
        note: missionNo
          ? `Nhiệm vụ số ${missionNo}: còn thiếu ${item.shortage.toLocaleString("vi")} ${unit}.`
          : undefined,
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-stock-marks"] });
    },
    onError: (e) =>
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Không gửi được yêu cầu mượn sang xã kia.",
      ),
  });

  // `loans` đã lọc theo nhiệm vụ và theo chiều đi mượn; ở đây chỉ chọn đúng món.
  // Sắp theo BƯỚC, không theo thứ tự cơ sở dữ liệu trả về: hỏi ba xã thì dòng
  // cần bấm ngay phải nằm trên, không nằm dưới một dòng đã bị từ chối.
  const related = sortByStage(loans.filter((loan) => loan.itemSku === item.sku));
  const summary = attemptsSummary(related);
  const waiting = related.some((loan) => isLoanInFlight(loan));
  const requestedQuantity = Number(quantity);

  return (
    <div className="mt-2 space-y-1.5">
      {summary ? <p className="text-xs font-semibold text-[var(--text-muted)]">{summary}</p> : null}
      {related.map((loan) => (
        <LoanProgressLine key={loan.id} loan={loan} />
      ))}

      {open ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-[var(--surface-2)] px-3 py-2.5">
          <label className="min-w-40 flex-1">
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Hỏi mượn xã
            </span>
            <select
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
              disabled={peers.isPending || request.isPending}
              onChange={(event) => setPeerCommuneName(event.target.value)}
              value={peerCommuneName}
            >
              <option value="">
                {peers.isPending
                  ? "Đang tra sổ xã lân cận…"
                  : (peers.data?.length ?? 0) === 0
                    ? "— Chưa khai xã lân cận nào —"
                    : "— Chọn xã —"}
              </option>
              {(peers.data ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Số lượng ({unit})
            </span>
            <input
              aria-label={`Số lượng mượn ${item.itemName}`}
              className="tabular w-28 rounded-md border bg-[var(--surface)] px-3 py-2 text-right text-sm"
              inputMode="numeric"
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, "").slice(0, 7))}
              value={quantity}
            />
          </label>
          <button
            className="min-h-10 rounded-md bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
            disabled={request.isPending || !peerCommuneName || requestedQuantity < 1}
            onClick={() => {
              if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
                setError("Số lượng phải là số nguyên dương.");
                return;
              }
              request.mutate();
            }}
            type="button"
          >
            {request.isPending ? "Đang gửi…" : "Gửi yêu cầu mượn"}
          </button>
          <button
            className="min-h-10 rounded-md border bg-[var(--surface)] px-3 text-sm font-semibold transition hover:bg-[var(--surface-3)] disabled:opacity-60"
            disabled={request.isPending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            type="button"
          >
            Đóng
          </button>
          {peers.isError ? (
            <p className="w-full text-xs text-[var(--color-critical)]">
              Không tra được danh sách xã lân cận. Thử lại sau ít phút.
            </p>
          ) : null}
        </div>
      ) : (
        <button
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
          onClick={() => {
            setError(null);
            setQuantity(String(item.shortage));
            setOpen(true);
          }}
          style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
          type="button"
        >
          <ColorIcon name="loan" size={14} tone="amber" />
          {/* Đã có một yêu cầu đang treo thì KHÔNG mời "Mượn xã khác" lần nữa như
              chưa có gì xảy ra — hỏi thêm một xã nữa là việc có thật (xã đầu có thể
              từ chối), nhưng nó phải hiện ra đúng là việc hỏi thêm, nếu không người
              trực bấm hai lần rồi ôm hai lô hàng cho một chỗ thiếu. */}
          {waiting ? "Hỏi thêm xã khác" : related.length > 0 ? "Hỏi xã khác nữa" : "Mượn xã khác"}
        </button>
      )}

      <div aria-live="polite">
        {error ? <p className="text-xs text-[var(--color-critical)]">{error}</p> : null}
      </div>
    </div>
  );
}

/**
 * Một dòng cho một lần hỏi mượn MỘT xã.
 *
 * Toàn bộ phần quyết định "đang ở bước nào, nói câu gì, có nút gì" nằm ở
 * `loan-progress.ts` và có bài kiểm riêng. Ở đây chỉ còn việc vẽ và gọi máy chủ —
 * ba lỗi trạng thái trước đây đều sinh ra từ chỗ hai việc đó trộn vào nhau.
 */
function LoanProgressLine({ loan }: { loan: InterCommuneLoan }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const line = loanLine(loan);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] });
    queryClient.invalidateQueries({ queryKey: ["loan-stock-marks"] });
  };

  const resend = useMutation({
    mutationFn: () => resendInterCommuneLoan(loan.id),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) =>
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Vẫn chưa gửi được."),
  });

  /**
   * Xác nhận hàng đã về kho, ngay tại dòng.
   *
   * Đây là mắt xích từng làm cả luồng đứng lại: xã kia đồng ý rồi, nhưng bước
   * nhận hàng nằm ở tab Mượn, trả nên không ai bấm, và bảng vật tư vẫn ghi thiếu
   * 5 chiếc bên cạnh dòng chữ "mượn thành công". Bấm xong thì kho cộng thêm hàng
   * và khối cha tự phân bổ lại — xem `useEffect` ở `InterCommuneBorrowSection`.
   */
  const confirmReceived = useMutation({
    mutationFn: () => advanceInterCommuneLoan(loan.id, { to: "ACTIVE" }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) =>
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Không ghi nhận được là đã nhận hàng.",
      ),
  });

  const busy = resend.isPending || confirmReceived.isPending;

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold" style={{ color: TONE_COLOR[line.tone] }}>
        {line.text}
      </p>
      {line.action === "RESEND" ? (
        <LineButton disabled={busy} onClick={() => resend.mutate()} tone="critical">
          {resend.isPending ? "Đang gửi lại…" : "Gửi lại"}
        </LineButton>
      ) : null}
      {line.action === "CONFIRM_RECEIVED" ? (
        <LineButton disabled={busy} onClick={() => confirmReceived.mutate()} tone="accent">
          {confirmReceived.isPending ? "Đang ghi nhận…" : "Xác nhận đã nhận hàng"}
        </LineButton>
      ) : null}
      <div aria-live="polite">
        {error ? <p className="text-xs text-[var(--color-critical)]">{error}</p> : null}
      </div>
    </div>
  );
}

/**
 * Màu theo SẮC THÁI, không theo trạng thái.
 *
 * `muted` là chỗ quan trọng nhất: bước "đang gửi" và bước "đã bị từ chối" đều
 * không phải lỗi và đều không đòi ai làm gì ngay, nên chúng không được tô đỏ.
 * Tô đỏ mọi thứ thì màu đỏ thôi mang nghĩa "cần xử lý".
 */
const TONE_COLOR: Record<LoanTone, string> = {
  ready: "var(--color-ready)",
  attention: "var(--color-attention)",
  critical: "var(--color-critical)",
  muted: "var(--text-muted)",
};

function LineButton({
  children,
  disabled,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone: "accent" | "critical";
}) {
  return (
    <button
      className="rounded-md border px-2.5 py-1 text-xs font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      style={
        tone === "critical"
          ? { borderColor: "var(--color-critical)", color: "var(--color-critical)" }
          : { borderColor: "var(--color-accent)", color: "var(--color-accent)" }
      }
      type="button"
    >
      {children}
    </button>
  );
}

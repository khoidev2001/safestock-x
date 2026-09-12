"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { formatTimeAndDate } from "@/lib/date-format";
import {
  advanceInterCommuneLoan,
  acceptInterCommuneReturn,
  getAvailableItemsForLoan,
  getBorrowableItems,
  getInterCommuneLoans,
  getPeerCommunes,
  recordManualInterCommuneLoan,
  requestInterCommuneLoan,
  type InterCommuneLoan,
} from "@/lib/dashboard-api";
import {
  isLoanOpen,
  loanActions,
  outstanding,
  statusLabel,
  type LoanAction,
} from "./inter-commune-loan-actions";

/**
 * Sổ mượn — trả giữa hai xã.
 *
 * Hai chiều nằm chung một danh sách nhưng tách nhãn rõ ràng: xã mình ĐANG NỢ ai,
 * và ai đang nợ xã mình. Gộp lại mà không phân biệt thì nhìn vào chỉ thấy một
 * đống con số, không biết bên nào phải chủ động.
 *
 * Khoản đã đóng gập lại sẵn: chúng chỉ dùng để đối chiếu, không phải việc phải
 * làm. Để lẫn với khoản đang mở thì việc cần làm bị trôi xuống dưới.
 */
export function InterCommuneLoanPanel({ warehouseId }: { warehouseId: string }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["inter-commune-loans", warehouseId],
    queryFn: getInterCommuneLoans,
    refetchInterval: 20_000,
  });

  const [borrowFormOpen, setBorrowFormOpen] = useState(false);
  const [borrowForm, setBorrowForm] = useState({
    peerCommuneName: "",
    itemName: "",
    quantity: "",
    note: "",
  });
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    direction: "OUTGOING" as "OUTGOING" | "INCOMING",
    peerCommuneName: "",
    itemSku: "",
    quantity: "",
    note: "",
  });

  // Chỉ tải danh sách khi form MỞ RA. Người dùng vào tab Mượn trả thường chỉ để
  // xem sổ; tải sẵn hai danh sách cho một form chưa chắc ai mở là tốn hai lượt
  // gọi mỗi lần vào tab.
  const peerCommunes = useQuery({
    queryKey: ["peer-communes"],
    queryFn: getPeerCommunes,
    enabled: manualFormOpen || borrowFormOpen,
    staleTime: 5 * 60_000,
  });
  // Vật tư ĐANG CÓ trong kho mình — chỉ dùng cho form ghi tay, nơi mình là bên cho
  // mượn nên phải chọn được lô của mình.
  const availableItems = useQuery({
    queryKey: ["available-items-for-loan"],
    queryFn: getAvailableItemsForLoan,
    enabled: manualFormOpen,
    staleTime: 60_000,
  });

  // Danh mục ĐẦY ĐỦ — dùng cho form đi mượn. Thứ cần mượn chính là thứ mình không
  // có, nên lọc theo tồn kho của mình là giấu mất đúng những mặt hàng cần nhất.
  const borrowableItems = useQuery({
    queryKey: ["borrowable-items"],
    queryFn: getBorrowableItems,
    enabled: borrowFormOpen,
    staleTime: 60_000,
  });

  /**
   * Ghi tay một khoản đã thoả thuận qua điện thoại.
   *
   * Đây là ĐƯỜNG LUI khi mất mạng — tình huống thường gặp nhất lúc thiên tai, và
   * cũng là lúc hai xã cần nhau nhất. Không có đường này thì đúng lúc quan trọng
   * nhất người trực không ghi được gì, rồi hôm sau không ai nhớ đã cho ai mượn
   * bao nhiêu.
   *
   * Vẫn cộng trừ kho thật như luồng tự động: hàng đã đi thì kho phải phản ánh
   * đúng, dù thoả thuận diễn ra qua điện thoại chứ không qua mạng.
   */
  const manualMutation = useMutation({
    mutationFn: () => {
      const quantity = Number(manualForm.quantity);
      if (!manualForm.peerCommuneName.trim()) throw new Error("Cần chọn xã bên kia.");
      if (!manualForm.itemSku.trim()) throw new Error("Cần chọn vật tư.");
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Số lượng phải là số nguyên dương.");
      }
      return recordManualInterCommuneLoan({
        direction: manualForm.direction,
        peerCommuneName: manualForm.peerCommuneName.trim(),
        itemSku: manualForm.itemSku.trim(),
        quantity: quantity,
        note: manualForm.note.trim() || undefined,
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setManualForm({
        direction: "OUTGOING",
        peerCommuneName: "",
        itemSku: "",
        quantity: "",
        note: "",
      });
      setManualFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-stock-marks"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", warehouseId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Không ghi được khoản mượn"),
  });

  /**
   * Gửi yêu cầu mượn sang xã lân cận.
   *
   * KHÔNG đụng kho: chưa ai đồng ý, chưa có hàng nào rời chỗ. Trừ kho ngay lúc
   * gửi là trừ cho một thứ có thể bị từ chối năm phút sau.
   *
   * Chọn vật tư từ danh sách của CHÍNH KHO MÌNH — nghe ngược nhưng đúng: hai xã
   * dùng chung danh mục vật tư, và mã phải khớp thì bên kia mới đối chiếu được
   * với kho họ. Gõ tay tên vật tư là hai bên nói về hai thứ khác nhau.
   */
  const borrowMutation = useMutation({
    mutationFn: () => {
      const quantity = Number(borrowForm.quantity);
      if (!borrowForm.peerCommuneName.trim()) throw new Error("Cần chọn xã để hỏi mượn.");
      if (!borrowForm.itemName.trim()) throw new Error("Cần chọn vật tư cần mượn.");
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Số lượng phải là số nguyên dương.");
      }
      const item = (borrowableItems.data ?? []).find((m) => m.itemSku === borrowForm.itemName);
      if (!item) throw new Error("Không nhận ra vật tư đã chọn.");
      return requestInterCommuneLoan({
        peerCommuneName: borrowForm.peerCommuneName.trim(),
        itemSku: item.itemSku,
        itemName: item.itemName,
        unit: item.unit,
        quantity: quantity,
        note: borrowForm.note.trim() || undefined,
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setBorrowForm({ peerCommuneName: "", itemName: "", quantity: "", note: "" });
      setBorrowFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Không gửi được yêu cầu"),
  });

  /**
   * Đi tiếp một bước của khoản mượn.
   *
   * KHÔNG gửi mã lô. Trước đây mỗi bước có đụng kho đều bắt người trực dán một
   * mã lô chép từ tab Vật tư sang — mà người đang nghe điện thoại thoả thuận với
   * xã bên kia nói "nước uống", không nói "lô WATER-01-B3". Máy chủ tự chọn lô
   * theo đúng nguyên tắc kho vẫn theo (hạn gần xuất trước), giống hệt đường ghi
   * tay đã làm từ đầu.
   */
  const advance = useMutation({
    mutationFn: (input: { loan: InterCommuneLoan; action: LoanAction }) =>
      advanceInterCommuneLoan(input.loan.id, {
        to: input.action.to,
        quantity: input.action.needsQuantity
          ? Number(quantity[input.loan.id]) || undefined
          : undefined,
      }),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Không cập nhật được khoản mượn"),
  });

  /**
   * Bên cho mượn xác nhận đã nhận lại hàng.
   *
   * Tách khỏi `advance` vì bước này KHÔNG đổi trạng thái khoản mượn — trạng thái
   * nói bên mượn đã trả tới đâu, còn đây nói hàng đã về tới kho tới đâu.
   */
  const acceptReturn = useMutation({
    mutationFn: (loan: InterCommuneLoan) =>
      acceptInterCommuneReturn(loan.id, Number(quantity[loan.id]) || undefined),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Không ghi nhận được hàng nhận lại"),
  });

  const loans = query.data ?? [];
  const openLoans = loans.filter((l) => isLoanOpen(l));
  const closedLoans = loans.filter((l) => !isLoanOpen(l));

  return (
    <section className="app-panel p-5">
      <div className="flex items-center gap-2">
        <ColorIcon name="loan" size={20} tone="blue" />
        <h2 className="font-semibold">Mượn — trả với xã khác</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Mỗi xã giữ sổ riêng. Khoản ghi tay là khoản đã thoả thuận qua điện thoại lúc mất mạng.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-md px-3 py-2 text-xs font-semibold text-white"
          onClick={() => {
            setError(null);
            setBorrowFormOpen(true);
          }}
          style={{ background: "var(--color-accent)" }}
          type="button"
        >
          Gửi yêu cầu mượn xã khác
        </button>
        <button
          className="rounded-md border px-3 py-2 text-xs font-semibold"
          onClick={() => {
            setError(null);
            setManualFormOpen(true);
          }}
          type="button"
        >
          Ghi tay khoản đã thoả thuận qua điện thoại
        </button>
      </div>

      <FormDialog
        isOpen={borrowFormOpen}
        onClose={() => setBorrowFormOpen(false)}
        title="Gửi yêu cầu mượn xã khác"
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            borrowMutation.mutate();
          }}
        >
          <p className="text-xs text-[var(--text-muted)]">
            Yêu cầu bay sang xã được chọn dưới dạng thông báo, kèm sẵn hai nút Đồng ý và Từ chối.
            Kho mình CHƯA đổi gì — chưa ai đồng ý thì chưa có hàng nào rời chỗ.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium" htmlFor="xin-muon-xa">
                Hỏi mượn xã
              </label>
              <select
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="xin-muon-xa"
                onChange={(event) =>
                  setBorrowForm((previous) => ({
                    ...previous,
                    peerCommuneName: event.target.value,
                  }))
                }
                value={borrowForm.peerCommuneName}
              >
                <option value="">— chọn xã —</option>
                {(peerCommunes.data ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor="xin-muon-vattu">
                Vật tư cần mượn
              </label>
              <select
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="xin-muon-vattu"
                onChange={(event) =>
                  setBorrowForm((previous) => ({ ...previous, itemName: event.target.value }))
                }
                value={borrowForm.itemName}
              >
                <option value="">— chọn vật tư —</option>
                {(borrowableItems.data ?? []).map((item) => (
                  <option key={item.itemSku} value={item.itemSku}>
                    {item.itemName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor="xin-muon-so">
                Số lượng
              </label>
              <input
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="xin-muon-so"
                min={1}
                onChange={(event) =>
                  setBorrowForm((previous) => ({ ...previous, quantity: event.target.value }))
                }
                type="number"
                value={borrowForm.quantity}
              />
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor="xin-muon-ghichu">
                Ghi chú
              </label>
              <input
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="xin-muon-ghichu"
                maxLength={500}
                onChange={(event) =>
                  setBorrowForm((previous) => ({ ...previous, note: event.target.value }))
                }
                placeholder="Ngập thôn Tân Bình, cần gấp trong hôm nay"
                value={borrowForm.note}
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-[var(--color-critical)] p-3 text-sm text-[var(--color-critical)]">
              {error}
            </p>
          ) : null}

          <button
            className="rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            disabled={borrowMutation.isPending}
            style={{ background: "var(--color-accent)" }}
            type="submit"
          >
            {borrowMutation.isPending ? "Đang gửi…" : "Gửi yêu cầu"}
          </button>
        </form>
      </FormDialog>

      <FormDialog
        isOpen={manualFormOpen}
        onClose={() => setManualFormOpen(false)}
        title="Ghi tay khoản đã thoả thuận qua điện thoại"
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            manualMutation.mutate();
          }}
        >
          <p className="text-xs text-[var(--text-muted)]">
            Dùng khi mất mạng: hai xã gọi điện thoả thuận xong, mỗi bên tự ghi vào sổ của mình. Kho
            vẫn cộng trừ thật, nên phải ghi đúng lô và đúng số.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium" htmlFor="ghi-tay-chieu">
                Chiều
              </label>
              <select
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="ghi-tay-chieu"
                onChange={(event) =>
                  setManualForm((previous) => ({
                    ...previous,
                    direction: event.target.value as "OUTGOING" | "INCOMING",
                  }))
                }
                value={manualForm.direction}
              >
                <option value="OUTGOING">Mình cho xã khác mượn (kho mình GIẢM)</option>
                <option value="INCOMING">Mình mượn của xã khác (kho mình TĂNG)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor="ghi-tay-xa">
                Xã bên kia
              </label>
              {/* Chọn từ danh sách chứ không gõ tay: tên xã phải khớp CHÍNH XÁC
                  với sổ đăng ký thì hệ thống mới gửi thông báo sang đúng nơi.
                  Gõ tay lệch một dấu là khoản mượn nằm im mà không ai biết vì sao. */}
              <select
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="ghi-tay-xa"
                onChange={(event) =>
                  setManualForm((previous) => ({
                    ...previous,
                    peerCommuneName: event.target.value,
                  }))
                }
                value={manualForm.peerCommuneName}
              >
                <option value="">— chọn xã —</option>
                {(peerCommunes.data ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {peerCommunes.data?.length === 0 ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Chưa khai xã lân cận nào trong cấu hình máy chủ.
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor="ghi-tay-vattu">
                Vật tư
              </label>
              {/* Chọn theo TÊN, không bắt chép mã lô. Mã lô là thứ chỉ máy cần;
                  người trực đang gọi điện thoả thuận nói "nước uống", không nói
                  "lô WATER-01-B3". Hệ thống tự lấy lô có hạn dùng GẦN NHẤT, đúng
                  nguyên tắc hạn gần xuất trước mà kho vẫn theo. */}
              <select
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="ghi-tay-vattu"
                onChange={(event) =>
                  setManualForm((previous) => ({ ...previous, itemSku: event.target.value }))
                }
                value={manualForm.itemSku}
              >
                <option value="">— chọn vật tư —</option>
                {(availableItems.data ?? []).map((item) => (
                  <option key={item.itemSku} value={item.itemSku}>
                    {item.itemName} (còn {item.available} {item.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor="ghi-tay-so">
                Số lượng
              </label>
              <input
                className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                id="ghi-tay-so"
                min={1}
                onChange={(event) =>
                  setManualForm((previous) => ({ ...previous, quantity: event.target.value }))
                }
                type="number"
                value={manualForm.quantity}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium" htmlFor="ghi-tay-ghichu">
              Ghi chú (ai gọi, lúc mấy giờ)
            </label>
            <input
              className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
              id="ghi-tay-ghichu"
              maxLength={500}
              onChange={(event) =>
                setManualForm((previous) => ({ ...previous, note: event.target.value }))
              }
              placeholder="Anh Tuấn xã Xuân Thọ gọi lúc 14h, mất mạng"
              value={manualForm.note}
            />
          </div>

          {error ? (
            <p className="rounded-md border border-[var(--color-critical)] p-3 text-sm text-[var(--color-critical)]">
              {error}
            </p>
          ) : null}

          <button
            className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-60"
            disabled={manualMutation.isPending}
            type="submit"
          >
            {manualMutation.isPending ? "Đang ghi…" : "Ghi vào sổ"}
          </button>
        </form>
      </FormDialog>

      {error ? (
        <p className="mt-3 rounded-md border border-[var(--color-critical)] p-3 text-sm text-[var(--color-critical)]">
          {error}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">Đang tải sổ mượn…</p>
      ) : openLoans.length === 0 && closedLoans.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed p-4 text-sm text-[var(--text-muted)]">
          Chưa có khoản mượn nào với xã khác.
        </p>
      ) : (
        <>
          {openLoans.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {openLoans.map((loan) => (
                <LoanRow
                  key={loan.id}
                  loan={loan}
                  quantity={quantity[loan.id] ?? ""}
                  busy={
                    (advance.isPending && advance.variables?.loan.id === loan.id) ||
                    (acceptReturn.isPending && acceptReturn.variables?.id === loan.id)
                  }
                  onQuantity={(v) => setQuantity((c) => ({ ...c, [loan.id]: v }))}
                  onAction={(action) => advance.mutate({ loan, action })}
                  onAcceptReturn={() => acceptReturn.mutate(loan)}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-md border border-dashed p-4 text-sm text-[var(--text-muted)]">
              Không còn khoản nào đang mở.
            </p>
          )}

          {closedLoans.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--text-muted)]">
                {closedLoans.length} khoản đã đóng sổ
              </summary>
              <ul className="mt-3 space-y-2">
                {closedLoans.map((loan) => (
                  <li className="rounded-md border p-3 text-sm" key={loan.id}>
                    <span className="font-medium">{loan.itemName}</span>{" "}
                    <span className="text-[var(--text-muted)]">
                      · {loan.quantity} {loan.unit} · {loan.peerCommuneName} ·{" "}
                      {statusLabel(loan.status)}
                      {loan.rejectReason ? ` — ${loan.rejectReason}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function LoanRow({
  loan,
  quantity,
  busy,
  onQuantity,
  onAction,
  onAcceptReturn,
}: {
  loan: InterCommuneLoan;
  quantity: string;
  busy: boolean;
  onQuantity: (value: string) => void;
  onAction: (action: LoanAction) => void;
  onAcceptReturn: () => void;
}) {
  const actions = loanActions(loan.direction, loan.status, loan.recordedManually);
  const outstandingQuantity = outstanding(loan.quantity, loan.returnedQuantity);
  const isLender = loan.direction === "OUTGOING";
  // Hàng bên kia đã báo trả mà mình chưa xác nhận cầm được. Chỉ bên CHO MƯỢN mới
  // có việc này, và bản ghi ghi tay thì không: người giữ nó làm thay cả hai vai
  // nên đã cộng kho ngay ở bước ghi nhận.
  const dangTrenDuongVe = isLender && !loan.recordedManually
    ? loan.returnedQuantity - loan.returnAcceptedQuantity
    : 0;

  // Mốc thời gian ghi thẳng ngày giờ, KHÔNG viết "2 ngày trước": đây là con số cán
  // bộ xã đọc cho nhau qua điện thoại và chép vào biên bản giấy. "2 ngày trước"
  // chép vào biên bản thì tuần sau không ai tra ngược ra được mốc nào.
  const milestones: { label: string; value: string }[] = [
    {
      // Bản ghi tay không "gửi" đi đâu cả — người trực chép lại một thoả thuận đã
      // xong qua điện thoại. Gọi nó là "gửi yêu cầu" là mô tả sai việc đã xảy ra.
      label: loan.recordedManually ? "Ghi vào sổ" : "Gửi yêu cầu",
      value: formatTimeAndDate(loan.requestedAt),
    },
  ];

  // Khoản ghi tay không đi qua bước duyệt nào, nên không dựng dòng duyệt rỗng.
  if (!loan.recordedManually) {
    milestones.push({
      label:
        loan.status === "REJECTED"
          ? "Từ chối yêu cầu"
          : loan.status === "CANCELLED"
            ? "Huỷ yêu cầu"
            : "Duyệt yêu cầu",
      // Nói thẳng là chưa có, không bỏ trống: dòng trống đọc ra thành "mất dữ liệu".
      value: loan.decidedAt ? formatTimeAndDate(loan.decidedAt) : "Chưa duyệt",
    });
  }

  if (loan.receivedAt) {
    milestones.push({ label: "Giao nhận hàng", value: formatTimeAndDate(loan.receivedAt) });
  }
  if (loan.returnedAt) {
    milestones.push({ label: "Trả xong", value: formatTimeAndDate(loan.returnedAt) });
  }

  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{loan.itemName}</p>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {/* Nói rõ chiều bằng lời, không bằng mũi tên: mũi tên đọc được hai
                nghĩa, mà nhầm chiều ở đây là đòi nợ nhầm người. */}
            {isLender ? "Cho " : "Mượn của "}
            <span className="font-medium text-[var(--text)]">{loan.peerCommuneName}</span>
            {isLender ? " mượn" : ""} · {statusLabel(loan.status)}
            {loan.recordedManually ? " · ghi tay" : ""}
          </p>
          {/* "Chờ bên kia quyết" chỉ đúng khi bên kia ĐÃ nhận được yêu cầu.
              `peerLoanId` rỗng nghĩa là tin chưa rời khỏi máy chủ mình — không
              nói ra thì người trực ngồi đợi một câu trả lời không ai sẽ gửi. */}
          {loan.direction === "INCOMING" && loan.status === "REQUESTED" && !loan.peerLoanId ? (
            <p className="mt-1 text-xs font-semibold text-[var(--color-critical)]">
              Chưa gửi được sang xã {loan.peerCommuneName} — họ chưa nhận được yêu cầu này.
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold">
            {outstandingQuantity} {loan.unit}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            còn nợ / {loan.quantity} {loan.unit}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 border-t pt-3 text-xs sm:grid-cols-2">
        {milestones.map((milestone) => (
          <div className="flex flex-wrap items-baseline gap-x-2" key={milestone.label}>
            <dt className="text-[var(--text-muted)]">{milestone.label}:</dt>
            <dd className="font-mono font-medium">{milestone.value}</dd>
          </div>
        ))}
      </dl>

      {dangTrenDuongVe > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          <label className="text-xs">
            <span className="block text-[var(--text-muted)]">Số nhận lại lần này</span>
            <input
              className="mt-1 w-32 rounded-md border px-2 py-1.5 text-sm"
              inputMode="numeric"
              onChange={(e) => onQuantity(e.target.value)}
              placeholder={String(dangTrenDuongVe)}
              value={quantity}
            />
          </label>
          <button
            className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={onAcceptReturn}
            style={{ background: "var(--color-accent)", color: "#fff", borderColor: "transparent" }}
            type="button"
          >
            {busy ? "Đang xử lý…" : "Xác nhận đã nhận lại"}
          </button>
          <p className="w-full text-xs text-[var(--text-muted)]">
            {loan.peerCommuneName} báo đã trả {dangTrenDuongVe} {loan.unit} nhưng chưa ai bên mình
            xác nhận cầm được. Bấm khi hàng đã về tới kho — bước này mới cộng kho thật.
          </p>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          {actions.some((a) => a.needsQuantity) ? (
            <label className="text-xs">
              <span className="block text-[var(--text-muted)]">Số lượng lần này</span>
              <input
                className="mt-1 w-32 rounded-md border px-2 py-1.5 text-sm"
                inputMode="numeric"
                onChange={(e) => onQuantity(e.target.value)}
                placeholder={String(outstandingQuantity)}
                value={quantity}
              />
            </label>
          ) : null}
          {actions.map((action) => (
            <button
              className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy}
              key={action.to}
              onClick={() => onAction(action)}
              style={
                action.tone === "primary"
                  ? { background: "var(--color-accent)", color: "#fff", borderColor: "transparent" }
                  : action.tone === "danger"
                    ? { color: "var(--color-critical)" }
                    : undefined
              }
              type="button"
            >
              {busy ? "Đang xử lý…" : action.label}
            </button>
          ))}
          {/* Bỏ ô mã lô rồi thì phải nói bằng lời rằng bấm nút này là hàng rời
              kho thật — mất ô nhập mà không nói gì thì nút trông như chỉ đổi
              một dòng chữ trên sổ. Kho tự chọn lô hạn gần nhất, đúng nguyên tắc
              hạn gần xuất trước mà thủ kho vẫn theo. */}
          {actions.some((a) => a.movesStock) ? (
            <p className="w-full text-xs text-[var(--text-muted)]">
              Bước này cộng trừ kho thật. Hệ thống tự lấy lô {loan.itemName} có hạn dùng gần nhất,
              không cần nhập mã lô.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Vỏ hộp thoại cho hai biểu mẫu mượn — trả liên xã.
 *
 * Dùng <dialog> gốc như các hộp thoại khác trong dự án: trình duyệt tự lo lớp
 * phủ, bẫy tiêu điểm và phím Esc, không phải dựng lại bằng tay.
 *
 * Chỉ dựng nội dung khi đang mở — giữ nguyên nếp cũ là biểu mẫu chỉ tồn tại lúc
 * người dùng thật sự cần, không nằm sẵn trong cây DOM.
 */
function FormDialog({
  children,
  isOpen,
  onClose,
  title,
}: {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,40rem)] overflow-y-auto rounded-lg border bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-slate-950/45"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <h2 className="text-lg font-semibold" id={titleId}>
          {title}
        </h2>
        <button
          aria-label="Đóng"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md transition hover:bg-[var(--surface-2)]"
          onClick={onClose}
          type="button"
        >
          <ColorIcon name="close" size={18} tone="blue" />
        </button>
      </header>
      {isOpen ? children : null}
    </dialog>
  );
}

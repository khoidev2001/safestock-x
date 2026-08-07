"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import {
  advanceInterCommuneLoan,
  getAvailableItemsForLoan,
  getInterCommuneLoans,
  getPeerCommunes,
  recordManualInterCommuneLoan,
  type InterCommuneLoan,
} from "@/lib/dashboard-api";
import {
  isOpen,
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
  const [batchId, setBatchId] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["inter-commune-loans", warehouseId],
    queryFn: getInterCommuneLoans,
    refetchInterval: 20_000,
  });

  const [moGhiTay, setMoGhiTay] = useState(false);
  const [ghiTay, setGhiTay] = useState({
    direction: "OUTGOING" as "OUTGOING" | "INCOMING",
    peerCommuneName: "",
    itemSku: "",
    quantity: "",
    note: "",
  });

  // Chỉ tải danh sách khi form MỞ RA. Người dùng vào tab Mượn trả thường chỉ để
  // xem sổ; tải sẵn hai danh sách cho một form chưa chắc ai mở là tốn hai lượt
  // gọi mỗi lần vào tab.
  const xaLanCan = useQuery({
    queryKey: ["peer-communes"],
    queryFn: getPeerCommunes,
    enabled: moGhiTay,
    staleTime: 5 * 60_000,
  });
  const vatTuCoSan = useQuery({
    queryKey: ["available-items-for-loan"],
    queryFn: getAvailableItemsForLoan,
    enabled: moGhiTay,
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
  const ghiTayMutation = useMutation({
    mutationFn: () => {
      const soLuong = Number(ghiTay.quantity);
      if (!ghiTay.peerCommuneName.trim()) throw new Error("Cần chọn xã bên kia.");
      if (!ghiTay.itemSku.trim()) throw new Error("Cần chọn vật tư.");
      if (!Number.isInteger(soLuong) || soLuong < 1) {
        throw new Error("Số lượng phải là số nguyên dương.");
      }
      return recordManualInterCommuneLoan({
        direction: ghiTay.direction,
        peerCommuneName: ghiTay.peerCommuneName.trim(),
        itemSku: ghiTay.itemSku.trim(),
        quantity: soLuong,
        note: ghiTay.note.trim() || undefined,
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setGhiTay({
        direction: "OUTGOING",
        peerCommuneName: "",
        itemSku: "",
        quantity: "",
        note: "",
      });
      setMoGhiTay(false);
      queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-stock-marks"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", warehouseId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Không ghi được khoản mượn"),
  });

  const advance = useMutation({
    mutationFn: (input: { loan: InterCommuneLoan; action: LoanAction }) =>
      advanceInterCommuneLoan(input.loan.id, {
        to: input.action.to,
        batchId: input.action.needsBatch ? batchId[input.loan.id]?.trim() : undefined,
        quantity: input.action.needsQuantity
          ? Number(quantity[input.loan.id]) || undefined
          : undefined,
      }),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inter-commune-loans"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Không cập nhật được khoản mượn"),
  });

  const loans = query.data ?? [];
  const dangMo = loans.filter((l) => isOpen(l.status));
  const daDong = loans.filter((l) => !isOpen(l.status));

  return (
    <section className="app-panel p-5">
      <div className="flex items-center gap-2">
        <ColorIcon name="loan" size={20} tone="blue" />
        <h2 className="font-semibold">Mượn — trả với xã khác</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Mỗi xã giữ sổ riêng. Khoản ghi tay là khoản đã thoả thuận qua điện thoại lúc mất mạng.
      </p>

      <div className="mt-3">
        <button
          className="rounded-md border px-3 py-2 text-xs font-semibold"
          onClick={() => setMoGhiTay((truoc) => !truoc)}
          type="button"
        >
          {moGhiTay ? "Đóng" : "Ghi tay khoản đã thoả thuận qua điện thoại"}
        </button>
      </div>

      {moGhiTay ? (
        <form
          className="mt-3 space-y-3 rounded-md border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            ghiTayMutation.mutate();
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
                  setGhiTay((truoc) => ({
                    ...truoc,
                    direction: event.target.value as "OUTGOING" | "INCOMING",
                  }))
                }
                value={ghiTay.direction}
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
                  setGhiTay((truoc) => ({ ...truoc, peerCommuneName: event.target.value }))
                }
                value={ghiTay.peerCommuneName}
              >
                <option value="">— chọn xã —</option>
                {(xaLanCan.data ?? []).map((ten) => (
                  <option key={ten} value={ten}>
                    {ten}
                  </option>
                ))}
              </select>
              {xaLanCan.data?.length === 0 ? (
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
                  setGhiTay((truoc) => ({ ...truoc, itemSku: event.target.value }))
                }
                value={ghiTay.itemSku}
              >
                <option value="">— chọn vật tư —</option>
                {(vatTuCoSan.data ?? []).map((mon) => (
                  <option key={mon.itemSku} value={mon.itemSku}>
                    {mon.itemName} (còn {mon.available} {mon.unit})
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
                  setGhiTay((truoc) => ({ ...truoc, quantity: event.target.value }))
                }
                type="number"
                value={ghiTay.quantity}
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
              onChange={(event) => setGhiTay((truoc) => ({ ...truoc, note: event.target.value }))}
              placeholder="Anh Tuấn xã Xuân Thọ gọi lúc 14h, mất mạng"
              value={ghiTay.note}
            />
          </div>

          <button
            className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-60"
            disabled={ghiTayMutation.isPending}
            type="submit"
          >
            {ghiTayMutation.isPending ? "Đang ghi…" : "Ghi vào sổ"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-[var(--color-critical)] p-3 text-sm text-[var(--color-critical)]">
          {error}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">Đang tải sổ mượn…</p>
      ) : dangMo.length === 0 && daDong.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed p-4 text-sm text-[var(--text-muted)]">
          Chưa có khoản mượn nào với xã khác.
        </p>
      ) : (
        <>
          {dangMo.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {dangMo.map((loan) => (
                <LoanRow
                  key={loan.id}
                  loan={loan}
                  batchId={batchId[loan.id] ?? ""}
                  quantity={quantity[loan.id] ?? ""}
                  busy={advance.isPending && advance.variables?.loan.id === loan.id}
                  onBatchId={(v) => setBatchId((c) => ({ ...c, [loan.id]: v }))}
                  onQuantity={(v) => setQuantity((c) => ({ ...c, [loan.id]: v }))}
                  onAction={(action) => advance.mutate({ loan, action })}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-md border border-dashed p-4 text-sm text-[var(--text-muted)]">
              Không còn khoản nào đang mở.
            </p>
          )}

          {daDong.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--text-muted)]">
                {daDong.length} khoản đã đóng sổ
              </summary>
              <ul className="mt-3 space-y-2">
                {daDong.map((loan) => (
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
  batchId,
  quantity,
  busy,
  onBatchId,
  onQuantity,
  onAction,
}: {
  loan: InterCommuneLoan;
  batchId: string;
  quantity: string;
  busy: boolean;
  onBatchId: (value: string) => void;
  onQuantity: (value: string) => void;
  onAction: (action: LoanAction) => void;
}) {
  const actions = loanActions(loan.direction, loan.status, loan.recordedManually);
  const conNo = outstanding(loan.quantity, loan.returnedQuantity);
  const laChoMuon = loan.direction === "OUTGOING";

  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{loan.itemName}</p>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {/* Nói rõ chiều bằng lời, không bằng mũi tên: mũi tên đọc được hai
                nghĩa, mà nhầm chiều ở đây là đòi nợ nhầm người. */}
            {laChoMuon ? "Cho " : "Mượn của "}
            <span className="font-medium text-[var(--text)]">{loan.peerCommuneName}</span>
            {laChoMuon ? " mượn" : ""} · {statusLabel(loan.status)}
            {loan.recordedManually ? " · ghi tay" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold">
            {conNo} {loan.unit}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            còn nợ / {loan.quantity} {loan.unit}
          </p>
        </div>
      </div>

      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          {actions.some((a) => a.needsBatch) ? (
            <label className="text-xs">
              <span className="block text-[var(--text-muted)]">Mã lô vật tư</span>
              <input
                className="mt-1 w-56 rounded-md border px-2 py-1.5 text-sm"
                onChange={(e) => onBatchId(e.target.value)}
                placeholder="Dán mã lô từ tab Vật tư"
                value={batchId}
              />
            </label>
          ) : null}
          {actions.some((a) => a.needsQuantity) ? (
            <label className="text-xs">
              <span className="block text-[var(--text-muted)]">Số lượng lần này</span>
              <input
                className="mt-1 w-32 rounded-md border px-2 py-1.5 text-sm"
                inputMode="numeric"
                onChange={(e) => onQuantity(e.target.value)}
                placeholder={String(conNo)}
                value={quantity}
              />
            </label>
          ) : null}
          {actions.map((action) => (
            <button
              className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy || (action.needsBatch && !batchId.trim())}
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
        </div>
      ) : null}
    </li>
  );
}

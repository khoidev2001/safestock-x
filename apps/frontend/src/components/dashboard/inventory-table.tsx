"use client";

import { itemConditionLabel } from "@safestock/shared-types";
import { ColorIcon } from "@/components/shared/color-icon";
import { Pagination, usePagination } from "@/components/shared/pagination";
import type { InventoryBatch } from "@/lib/dashboard-api";

export type InventoryRowAction =
  "IMPORT" | "EXPORT" | "TRANSFER" | "ADJUST" | "RECONCILE" | "CONDITION" | "BORROW";

/**
 * Nút thao tác trên từng dòng lô hàng.
 *
 * Viền sáng lên khi rê chuột là điều kiện để người dùng biết mình đang nhắm vào
 * nút nào: tám nút nhỏ xếp sát nhau, không có phản hồi thì bấm nhầm sang "Điều
 * chỉnh" trong khi định bấm "Kiểm kê" — hai thao tác ghi vào sổ kho khác nhau.
 */
const ACTION_BUTTON_CLASS =
  "w-full rounded border px-2 py-2 text-center text-xs transition-colors @4xl:py-1 " +
  "hover:border-[var(--color-accent)] hover:bg-[color-mix(in_oklch,var(--color-accent)_10%,transparent)] " +
  "hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[var(--color-accent)] active:translate-y-px";

const actions: { key: InventoryRowAction; label: string }[] = [
  { key: "IMPORT", label: "Nhập thêm" },
  { key: "EXPORT", label: "Xuất" },
  { key: "TRANSFER", label: "Chuyển" },
  { key: "BORROW", label: "Cho mượn" },
  { key: "RECONCILE", label: "Kiểm kê" },
  { key: "ADJUST", label: "Điều chỉnh" },
  { key: "CONDITION", label: "Tình trạng" },
];

type Props = {
  batches: InventoryBatch[] | undefined;
  isLoading: boolean;
  isError: boolean;
  allowedActions: InventoryRowAction[];
  onRetry: () => void;
  onAction: (batch: InventoryBatch, action: InventoryRowAction) => void;
  onPrint: (batch: InventoryBatch) => void;
};

export function InventoryTable({
  batches,
  isLoading,
  isError,
  allowedActions,
  onRetry,
  onAction,
  onPrint,
}: Props) {
  const sorted = [...(batches ?? [])].sort((a, b) => b.quantity - a.quantity);
  const pagination = usePagination(sorted);

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        className="h-[360px] animate-pulse rounded-md border bg-[var(--surface)]"
      />
    );
  }
  if (isError) {
    return (
      <section className="rounded-md border border-red-300 bg-[var(--surface)] p-6">
        <p className="font-semibold text-[var(--color-critical)]">Không tải được tồn kho</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Dữ liệu chưa được thay bằng danh sách rỗng. Hãy kiểm tra kết nối rồi thử lại.
        </p>
        <button
          className="mt-4 rounded-md border px-3 py-2 text-sm font-semibold"
          onClick={onRetry}
        >
          Tải lại
        </button>
      </section>
    );
  }

  const onLoanOf = (batch: InventoryBatch) =>
    (batch.loans ?? []).reduce(
      (sum, loan) => sum + loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost,
      0,
    );

  const renderActions = (batch: InventoryBatch) => (
    <>
      <button className={ACTION_BUTTON_CLASS} onClick={() => onPrint(batch)} type="button">
        In QR
      </button>
      {actions
        .filter((action) => allowedActions.includes(action.key))
        .map((action) => (
          <button
            className={ACTION_BUTTON_CLASS}
            key={action.key}
            onClick={() => onAction(batch, action.key)}
            type="button"
          >
            {action.label}
          </button>
        ))}
    </>
  );

  return (
    // Khung đo bề ngang của CHÍNH nó (container query), không đo màn hình: cột
    // chức năng bên trái mở hay thu làm khung này chênh nhau 200px ở cùng một
    // màn hình, mà bảng bảy cột chỉ đọc được khi khung đủ rộng thật.
    <section className="@container rounded-md border bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-4 border-b p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-2">
          <ColorIcon name="inventory" size={20} tone="orange" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Tồn kho theo lô</h2>
            <p className="text-xs text-[var(--text-muted)]">Số vật lý, đang mượn và khả dụng</p>
          </div>
        </div>
        <span className="tabular shrink-0 text-xs text-[var(--text-muted)]">
          {sorted.length} lô
        </span>
      </header>

      {sorted.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
          <ColorIcon name="packageCheck" size={28} tone="green" />
          <p className="mt-3 text-sm font-medium">Kho chưa có lô vật tư</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Dùng “Tiếp nhận lô mới” để bắt đầu.
          </p>
        </div>
      ) : (
        <>
          {/* Khung hẹp (điện thoại, máy tính bảng): mỗi lô một thẻ. Bảng bảy cột
              ép vào 375px thì chỉ thấy ba cột đầu, chữ bẻ từng tiếng và mỗi dòng
              cao gần hai trăm pixel vì cột nút thao tác — ba con số quan trọng
              nhất (vật lý, đang mượn, khả dụng) lại nằm ngoài màn hình. */}
          <ul className="divide-y @4xl:hidden">
            {pagination.pageItems.map((batch) => {
              const onLoan = onLoanOf(batch);
              return (
                <li className="p-4" key={batch.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{batch.item.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Lô {batch.batchCode} ·{" "}
                        {batch.shelf
                          ? `${batch.shelf.zone.code} / ${batch.shelf.code}`
                          : "Chưa xếp kệ"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs font-medium">
                        {itemConditionLabel(batch.condition)}
                      </span>
                      {batch.expiryDate ? (
                        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                          HSD {new Date(batch.expiryDate).toLocaleDateString("vi-VN")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-[var(--surface-2)] px-2 py-2 text-center">
                    <div>
                      <dt className="text-[11px] text-[var(--text-muted)]">Vật lý</dt>
                      <dd className="tabular text-sm font-semibold">{batch.quantity}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-muted)]">Đang mượn</dt>
                      <dd className="tabular text-sm">{onLoan}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-muted)]">Khả dụng</dt>
                      <dd className="tabular text-sm font-semibold">
                        {Math.max(0, batch.quantity - onLoan)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 @xs:grid-cols-3 @md:grid-cols-4">
                    {renderActions(batch)}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto @4xl:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Vật tư / lô</th>
                  <th className="px-4 py-3 font-medium">Vị trí</th>
                  <th className="px-4 py-3 font-medium">Tình trạng</th>
                  <th className="px-4 py-3 text-right font-medium">Vật lý</th>
                  <th className="px-4 py-3 text-right font-medium">Đang mượn</th>
                  <th className="px-4 py-3 text-right font-medium">Khả dụng</th>
                  <th className="px-4 py-3 text-right font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagination.pageItems.map((batch) => {
                  const onLoan = onLoanOf(batch);
                  return (
                    <tr key={batch.id} className="align-top hover:bg-[var(--surface-2)]">
                      <td className="px-4 py-3">
                        <p className="font-medium">{batch.item.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">Lô {batch.batchCode}</p>
                      </td>
                      <td className="px-4 py-3">
                        {batch.shelf
                          ? `${batch.shelf.zone.code} / ${batch.shelf.code}`
                          : "Chưa xếp kệ"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs font-medium">
                          {itemConditionLabel(batch.condition)}
                        </span>
                        {batch.expiryDate ? (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            HSD {new Date(batch.expiryDate).toLocaleDateString("vi-VN")}
                          </p>
                        ) : null}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-semibold">
                        {batch.quantity}
                      </td>
                      <td className="tabular px-4 py-3 text-right">{onLoan}</td>
                      <td className="tabular px-4 py-3 text-right font-semibold">
                        {Math.max(0, batch.quantity - onLoan)}
                      </td>
                      <td className="px-4 py-3">
                        {/* Lưới cố định 4 cột thay cho flex-wrap: wrap xếp nút theo
                            bề ngang chữ nên mỗi hàng một số nút khác nhau, lệch
                            phải, nhìn như rơi vãi. Lưới cho mọi nút cùng bề rộng và
                            thẳng cột giữa các dòng của bảng. */}
                        <div className="ml-auto grid w-[304px] max-w-full grid-cols-4 gap-1.5">
                          {renderActions(batch)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={sorted.length}
        totalPages={pagination.totalPages}
      />
    </section>
  );
}

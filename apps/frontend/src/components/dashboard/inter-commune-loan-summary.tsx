"use client";

import { useQuery } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { TabLink } from "@/components/shared/tab-link";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { getInterCommuneLoans, type InterCommuneLoan } from "@/lib/dashboard-api";
import { isLoanOpen, outstanding, statusLabel } from "./inter-commune-loan-actions";

/**
 * Số khoản mỗi trang của một cột.
 *
 * Đây là khối tóm tắt trên trang Tổng quan, không phải sổ đầy đủ: một xã mượn
 * hàng chục khoản thì danh sách dài hơn cả phần tồn kho phía trên, và mọi khối
 * sau nó bị đẩy xuống khỏi màn hình. Năm dòng đủ thấy việc đang gấp, ai cần đọc
 * hết thì có đường dẫn sang sổ Mượn — trả.
 */
const LOANS_PER_PAGE = 5;

/**
 * Xã mình đang nợ ai, và ai đang nợ xã mình — hiện ngay trên trang Tổng quan.
 *
 * Vì sao đứng ở đây: tồn kho ngay phía trên là MỘT con số, không nói được bao
 * nhiêu trong đó là hàng đi mượn phải trả lại, và bao nhiêu đã đưa đi chưa lấy
 * về. Người nhìn con số ấy để quyết định điều phối sẽ tưởng mình có nhiều hơn —
 * hoặc ít hơn — thực tế mình sở hữu.
 *
 * HAI CHIỀU TÁCH HẲN thành hai cột, không gộp một danh sách. Gộp lại thì phải
 * đọc từng dòng mới biết bên nào phải chủ động, mà nhầm chiều ở đây là đòi nợ
 * nhầm người.
 *
 * KHÔNG tự ẩn khi trống, khác `LoanStockMarksPanel` cũ. Câu hỏi ở đây là câu hỏi
 * có/không ("có đang cho ai mượn không"), nên "không nợ ai" cũng là một câu trả
 * lời — khối biến mất thì người đọc không biết là không có, hay là chưa tải xong.
 *
 * CHỈ ĐỌC. Mọi nút đồng ý, từ chối, ghi nhận trả đều nằm ở tab Mượn — trả; hai
 * chỗ cùng đổi được trạng thái một khoản là hai chỗ phải nhớ đồng bộ.
 */
export function InterCommuneLoanSummary() {
  const query = useQuery({
    queryKey: ["inter-commune-loans", "summary"],
    queryFn: getInterCommuneLoans,
    refetchInterval: 30_000,
  });

  const loans = query.data ?? [];
  const openLoans = loans.filter((loan) => isLoanOpen(loan));
  const lending = openLoans.filter((loan) => loan.direction === "OUTGOING");
  const borrowing = openLoans.filter((loan) => loan.direction === "INCOMING");
  const closedCount = loans.length - openLoans.length;

  return (
    <section aria-labelledby="muon-tra-lien-xa" className="app-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b p-4">
        <div className="flex items-center gap-2">
          <ColorIcon name="loan" size={18} tone="amber" />
          <h2 className="font-semibold" id="muon-tra-lien-xa">
            Mượn — trả với xã khác
          </h2>
        </div>
        <TabLink className="text-sm font-medium text-[var(--color-accent)] hover:underline" href="/loan">
          Mở sổ mượn — trả →
        </TabLink>
        <p className="w-full text-xs text-[var(--text-muted)]">
          Hàng đã đưa đi hoặc đang giữ hộ không nằm gọn trong con số tồn kho.
        </p>
      </div>

      {query.isLoading ? (
        <div className="p-4" aria-busy="true">
          <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </div>
      ) : query.isError ? (
        <p className="p-4 text-sm text-[var(--text-muted)]">
          Chưa tải được sổ mượn — trả. Kết nối có thể đang gián đoạn.
        </p>
      ) : (
        <>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <LoanColumn
              // "Đang cho mượn" — hàng của mình đang nằm ở xã khác, mình là bên chờ nhận lại.
              emptyText="Không cho xã nào mượn."
              loans={lending}
              peerPrefix="Cho"
              peerSuffix="mượn"
              title="Đang cho xã khác mượn"
              tone="var(--color-attention)"
            />
            <LoanColumn
              // "Đang mượn" — hàng đang ở trong kho mình nhưng phải trả lại.
              emptyText="Không mượn của xã nào."
              loans={borrowing}
              peerPrefix="Mượn của"
              peerSuffix=""
              title="Đang mượn của xã khác"
              tone="var(--color-accent)"
            />
          </div>

          {closedCount > 0 ? (
            /* Chỉ ĐẾM khoản đã đóng sổ, không liệt kê: chúng dùng để đối chiếu
               cuối kỳ, không phải việc phải làm hôm nay. Ai cần đọc thì có đường
               dẫn sang sổ đầy đủ ở trên. */
            <p className="border-t px-4 py-3 text-xs text-[var(--text-muted)]">
              {closedCount} khoản đã đóng sổ (đã trả xong, bị từ chối hoặc đã huỷ).
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function LoanColumn({
  emptyText,
  loans,
  peerPrefix,
  peerSuffix,
  title,
  tone,
}: {
  emptyText: string;
  loans: InterCommuneLoan[];
  peerPrefix: string;
  peerSuffix: string;
  title: string;
  tone: string;
}) {
  /* Mỗi cột đếm trang riêng: hai chiều dài ngắn khác nhau, dùng chung một số
     trang thì cột ngắn hết dòng trong khi cột dài vẫn còn, mà người đọc lại
     tưởng mình đã xem hết cả hai bên. */
  const { page, pageItems, pageSize, setPage, totalPages } = usePagination(loans, LOANS_PER_PAGE);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {loans.length > 0 ? (
          <span className="tabular text-xs text-[var(--text-muted)]">{loans.length} khoản</span>
        ) : null}
      </div>

      {loans.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">{emptyText}</p>
      ) : (
        <ul className="mt-2 divide-y">
          {pageItems.map((loan) => {
            const remaining = outstanding(loan.quantity, loan.returnedQuantity);
            return (
              <li className="py-2.5" key={loan.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{loan.itemName}</p>
                    {/* Nói rõ chiều bằng LỜI, không bằng mũi tên: mũi tên đọc được
                        hai nghĩa, mà nhầm chiều ở đây là đòi nợ nhầm người. */}
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {peerPrefix}{" "}
                      <span className="font-medium text-[var(--text)]">
                        {loan.peerCommuneName}
                      </span>
                      {peerSuffix ? ` ${peerSuffix}` : ""}
                      {loan.recordedManually ? " · ghi tay" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold">
                      {remaining.toLocaleString("vi")} {loan.unit}
                    </p>
                    {/* Kèm tổng đã mượn: "còn 8 chiếc" một mình không phân biệt
                        được khoản mượn 8 chưa trả gì với khoản mượn 30 đã trả 22. */}
                    <p className="tabular text-xs text-[var(--text-muted)]">
                      còn nợ / {loan.quantity.toLocaleString("vi")} {loan.unit}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-xs font-medium" style={{ color: tone }}>
                  {statusLabel(loan.status)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* Tổng số khoản đã nằm cạnh tiêu đề cột, nên bỏ dòng "Hiển thị 1-5 trên
          16" — nó chỉ lặp lại con số ấy trong một cột vốn đã hẹp. `Pagination`
          tự ẩn khi chỉ có một trang. */}
      <Pagination
        label="khoản"
        onPageChange={setPage}
        padding="pt-3"
        page={page}
        pageSize={pageSize}
        showSummary={false}
        totalItems={loans.length}
        totalPages={totalPages}
      />
    </div>
  );
}

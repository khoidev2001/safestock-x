"use client";

import { ColorIcon } from "@/components/shared/color-icon";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 8;

export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, pageItems, pageSize, setPage, totalPages };
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  /**
   * Thêm nút về trang đầu / tới trang cuối, và ô nhập số trang để nhảy thẳng.
   *
   * Tuỳ chọn chứ không bật sẵn: danh sách vài trang thì dãy số đã bấm tới mọi nơi,
   * thêm nút chỉ làm rối. Chỉ danh sách dài hàng chục trang mới cần.
   */
  showJump = false,
  label = "bản ghi",
  /**
   * Dòng "Hiển thị 1-15 trên 100 …" ở mép trái.
   *
   * Tắt được vì nó chỉ hữu ích khi con số tổng chưa nói ở đâu khác. Ở hộp nhiệm
   * vụ, tổng đã nằm ngay cạnh tiêu đề nên dòng này chỉ lặp lại, mà lại đẩy dãy
   * số trang lệch hẳn sang phải.
   */
  showSummary = true,
  /**
   * Lớp đệm của chân trang, ghi đè được vì nó phụ thuộc khung chứa.
   *
   * Mặc định `px-5` là gutter cho khung KHÔNG có đệm riêng (thẻ bảng). Đặt trong
   * một panel vốn đã `p-4` thì phần đệm cộng dồn, chân trang thụt vào sâu hơn nội
   * dung và đường kẻ trên không còn thẳng hàng với thứ nó đang chia tách.
   */
  padding = "px-5 py-4",
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showJump?: boolean;
  label?: string;
  showSummary?: boolean;
  padding?: string;
}) {
  if (totalItems <= pageSize) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <footer
      // Không hardcode `pl-0 pr-0` ở đây: Tailwind sinh `pl`/`pr` sau `px` nên
      // chúng đè luôn lớp đệm truyền qua `padding`, và chân trang dính sát hai
      // mép bảng trong khi mọi hàng bên trên đều thụt vào.
      className={`flex flex-col gap-3 lg:flex-row lg:items-center ${
        // Không có dòng tóm tắt thì chẳng còn gì để dạt về hai mép — dồn vào giữa
        // thay vì để dãy số trang treo lơ lửng một bên.
        showSummary ? "lg:justify-between" : "justify-center"
      } ${padding}`}
    >
      {showSummary && (
        <p className="text-sm text-[var(--text-muted)]">
          Hiển thị{" "}
          <span className="tabular font-medium text-[var(--text)]">
            {firstItem}-{lastItem}
          </span>{" "}
          trên <span className="tabular font-medium text-[var(--text)]">{totalItems}</span> {label}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <nav aria-label="Phân trang" className="flex items-center gap-1">
          {showJump && (
            <PageButton ariaLabel="Trang đầu" disabled={page === 1} onClick={() => onPageChange(1)}>
              <span aria-hidden className="tabular px-0.5 text-xs font-bold">
                ‹‹
              </span>
            </PageButton>
          )}
          <PageButton
            ariaLabel="Trang trước"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ColorIcon name="left" size={18} tone="blue" />
          </PageButton>
          {visiblePages.map((pageNumber) => (
            <PageButton
              ariaLabel={`Trang ${pageNumber}`}
              isActive={pageNumber === page}
              key={pageNumber}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </PageButton>
          ))}
          <PageButton
            ariaLabel="Trang sau"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ColorIcon name="right" size={18} tone="blue" />
          </PageButton>
          {showJump && (
            <PageButton
              ariaLabel="Trang cuối"
              disabled={page === totalPages}
              onClick={() => onPageChange(totalPages)}
            >
              <span aria-hidden className="tabular px-0.5 text-xs font-bold">
                ››
              </span>
            </PageButton>
          )}
        </nav>
        {/* {showJump && <PageJump page={page} totalPages={totalPages} onPageChange={onPageChange} />} */}
      </div>
    </footer>
  );
}

/**
 * Nhảy thẳng tới một trang bằng cách gõ số.
 *
 * Giữ giá trị đang gõ trong state riêng thay vì đẩy thẳng ra ngoài: gõ "12" thì
 * ký tự đầu là "1", nhảy ngay sang trang 1 rồi mới tới 12 — mỗi phím một lượt
 * dựng lại cả danh sách. Chỉ nhảy khi bấm Enter hoặc rời ô.
 */
function PageJump({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    setDraft("");
    if (!Number.isFinite(parsed)) return;
    // Kẹp vào khoảng hợp lệ thay vì báo lỗi: gõ 999 ở danh sách 7 trang thì ý
    // người dùng rõ ràng là "về cuối", chứ không phải là gõ sai cần mắng.
    const target = Math.min(Math.max(parsed, 1), totalPages);
    if (target !== page) onPageChange(target);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-[var(--text-muted)]" htmlFor="pagination-jump">
        Đến trang
      </label>
      <input
        id="pagination-jump"
        type="number"
        min={1}
        max={totalPages}
        inputMode="numeric"
        value={draft}
        placeholder={String(page)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        className="tabular h-9 w-16 rounded-md border bg-[var(--surface)] px-2 text-center text-sm"
      />
      <span className="text-sm text-[var(--text-muted)]">/ {totalPages}</span>
    </div>
  );
}

function PageButton({
  ariaLabel,
  children,
  disabled = false,
  isActive = false,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      aria-label={ariaLabel}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      style={
        isActive
          ? {
              background: "var(--color-accent)",
              color: "var(--color-accent-fg)",
              borderColor: "var(--color-accent)",
            }
          : undefined
      }
      type="button"
    >
      {children}
    </button>
  );
}

function getVisiblePages(page: number, totalPages: number): number[] {
  const windowSize = Math.min(5, totalPages);
  const start = Math.min(Math.max(1, page - 2), totalPages - windowSize + 1);
  return Array.from({ length: windowSize }, (_, index) => start + index);
}

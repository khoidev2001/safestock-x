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
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= pageSize) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <footer className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[var(--text-muted)]">
        Hiển thị{" "}
        <span className="tabular font-medium text-[var(--text)]">
          {firstItem}-{lastItem}
        </span>{" "}
        trên <span className="tabular font-medium text-[var(--text)]">{totalItems}</span> bản ghi
      </p>
      <nav aria-label="Phân trang" className="flex items-center gap-1">
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
      </nav>
    </footer>
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

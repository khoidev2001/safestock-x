"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { TabLink } from "@/components/shared/tab-link";
import { communeStockTotals } from "@/lib/commune-stock-totals";
import {
  getCommuneExpiry,
  getCommuneStock,
  type CommuneExpiryItem,
} from "@/lib/dashboard-api";

/**
 * Số ở thẻ tổng: viết liền, không phần lẻ.
 *
 * Kiểu Việt Nam chấm ngăn nghìn và phẩy ngăn thập phân cho ra "9.127,5 lít" — ba
 * con số đứng cạnh nhau, mỗi con số hai loại dấu, đọc lướt rất dễ hiểu sai độ lớn.
 *
 * CẮT phần lẻ chứ không làm tròn: nửa lít lẻ sinh ra từ phép nhân chai × 1,5,
 * không ai đong được, và làm tròn lên là hứa nhiều nước hơn số thực có trong kho.
 */
const soNguyen = (value: number) => Math.floor(value).toLocaleString("vi");

/** Bao nhiêu dòng hết hạn hiện sẵn trước khi phải bấm "xem thêm". */
const EXPIRY_PREVIEW_ROWS = 6;

/**
 * Vật tư toàn xã đang có bao nhiêu, và thứ nào sắp hỏng — đặt NGAY DƯỚI hộp nhiệm vụ.
 *
 * Vì sao ở đây: hai câu hỏi đầu tiên sau khi người trực đọc xong danh sách nhiệm
 * vụ là "xã còn đủ hàng để đi không" và "có gì sắp hỏng mà phải đẩy đi trước
 * không". Trước đây câu thứ nhất nằm ở tab Vật tư, câu thứ hai nằm ở tab Theo dõi
 * — và câu thứ hai còn chỉ đọc đúng kho tổng, nên thùng lương khô sắp hỏng dưới
 * thôn không ai nhìn thấy cho tới lúc nó hỏng thật.
 *
 * BA CON SỐ, KHÔNG PHẢI MỘT. Đồ dùng đếm bằng chiếc, lương thực bằng kg, nước
 * bằng lít; gộp lại thành một con số "tổng vật tư" thì nghe to nhưng không trả
 * lời được câu nào. Cách chia rổ dùng chung với khối tồn kho ở tab Vật tư.
 *
 * Kho thôn gọi vào hai đường này sẽ bị máy chủ từ chối (403) — khối lặng lẽ biến
 * mất thay vì hiện một câu lỗi mà trưởng thôn không làm gì được.
 */
export function CommuneSupplySummary({ warehouseId }: { warehouseId: string }) {
  const [showAllExpiry, setShowAllExpiry] = useState(false);

  const stockQuery = useQuery({
    queryKey: ["commune-stock", warehouseId],
    queryFn: () => getCommuneStock(warehouseId),
    enabled: Boolean(warehouseId),
    // Không thử lại: 403 là câu trả lời dứt khoát cho kho thôn, thử lại chỉ tốn
    // lượt gọi và làm chậm màn hình.
    retry: false,
    staleTime: 60_000,
  });

  const expiryQuery = useQuery({
    queryKey: ["commune-expiry", warehouseId],
    queryFn: () => getCommuneExpiry(warehouseId),
    enabled: Boolean(warehouseId),
    retry: false,
    staleTime: 60_000,
  });

  // Cả hai đường cùng phạm vi quyền, nên hỏng cả hai nghĩa là người này không
  // được xem toàn xã. Hỏng một đường thì phần còn lại vẫn đáng hiện.
  if (stockQuery.isError && expiryQuery.isError) return null;

  const totals = communeStockTotals(stockQuery.data?.byWarehouse ?? []);
  const expiryItems = expiryQuery.data?.items ?? [];
  const visibleExpiry = showAllExpiry ? expiryItems : expiryItems.slice(0, EXPIRY_PREVIEW_ROWS);
  const hiddenExpiryCount = expiryItems.length - visibleExpiry.length;
  const expiredCount = expiryItems.filter((item) => item.daysUntilExpiry < 0).length;

  return (
    <section aria-labelledby="vat-tu-toan-xa" className="app-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b p-4">
        <div className="flex items-center gap-2">
          <ColorIcon name="warehouse" size={18} tone="blue" />
          <h2 className="font-semibold" id="vat-tu-toan-xa">
            Vật tư toàn xã
          </h2>
          {totals.warehouseCount > 0 ? (
            <span className="text-sm text-[var(--text-muted)]">{totals.warehouseCount} kho</span>
          ) : null}
        </div>
        <TabLink
          className="text-sm font-medium text-[var(--color-accent)] hover:underline"
          href="/inventory"
        >
          Mở kho vật tư →
        </TabLink>
      </div>

      {stockQuery.isError ? null : (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <TotalCard
            hint={
              totals.supplySkuCount > 0
                ? `${totals.supplySkuCount} mã, không tính lương thực và nước`
                : "Không tính lương thực và nước"
            }
            icon={<ColorIcon name="inventory" size={19} tone="orange" />}
            isLoading={stockQuery.isLoading}
            label="Vật tư"
            unit="món"
            value={soNguyen(totals.supplyUnits)}
          />
          <TotalCard
            hint="Gạo, lương khô và hàng đếm theo cân"
            icon={<ColorIcon name="packageSearch" size={19} tone="green" />}
            isLoading={stockQuery.isLoading}
            label="Lương thực"
            unit="kg"
            value={soNguyen(totals.foodKg)}
          />
          <TotalCard
            hint="Quy từ số chai đang có trong các kho"
            icon={<ColorIcon name="flood" size={19} tone="blue" />}
            isLoading={stockQuery.isLoading}
            label="Nước uống"
            unit="lít"
            value={soNguyen(totals.waterLiters)}
          />
        </div>
      )}

      {expiryQuery.isError ? null : (
        <div className="border-t p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold">
              Sắp hết hạn trong {expiryQuery.data?.windowDays ?? 30} ngày tới
            </h3>
            {/* Số lô ĐÃ quá hạn tách riêng khỏi tổng: "12 lô sắp hết hạn" nghe
                như còn thời gian, trong khi 3 trong số đó đã hỏng từ tuần trước
                và phải đưa ra khỏi kệ chứ không phải đẩy đi phát. */}
            {expiryItems.length > 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                {expiryItems.length} lô
                {expiredCount > 0 ? (
                  <span style={{ color: "var(--color-critical)" }}>
                    {" · "}
                    {expiredCount} lô đã quá hạn
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          {expiryQuery.isLoading ? (
            <div className="mt-3 h-24 animate-pulse rounded-md bg-[var(--surface-2)]" aria-busy="true" />
          ) : expiryItems.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Không có lô nào sắp hết hạn. Không cần đẩy hàng đi gấp.
            </p>
          ) : (
            <>
              <ul className="mt-3 divide-y">
                {visibleExpiry.map((item) => (
                  <ExpiryRow item={item} key={item.batchId} />
                ))}
              </ul>
              {hiddenExpiryCount > 0 ? (
                <button
                  className="mt-3 text-sm font-medium text-[var(--color-accent)] hover:underline"
                  onClick={() => setShowAllExpiry(true)}
                  type="button"
                >
                  Xem thêm {hiddenExpiryCount} lô nữa
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TotalCard({
  hint,
  icon,
  isLoading,
  label,
  unit,
  value,
}: {
  hint: string;
  icon: React.ReactNode;
  isLoading: boolean;
  label: string;
  unit: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-[var(--surface-2)] p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
        {icon}
        {label}
      </div>
      {isLoading ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-[var(--surface)]" aria-busy="true" />
      ) : (
        <p className="tabular mt-2 text-lg font-semibold">
          {value}
          <span className="ml-1.5 text-sm font-normal text-[var(--text-muted)]">{unit}</span>
        </p>
      )}
      <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

/**
 * Một lô sắp hết hạn: hàng gì, ở kho nào, còn bao nhiêu, hạn tới khi nào.
 *
 * Tên kho đứng CÙNG hàng với tên hàng chứ không nằm dưới dạng chú thích nhỏ: câu
 * hỏi ngay sau "cái gì sắp hỏng" luôn là "nó nằm ở đâu để tôi cho người tới lấy".
 */
function ExpiryRow({ item }: { item: CommuneExpiryItem }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.itemName}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">
          {item.warehouseName} · {item.quantity.toLocaleString("vi")} {item.unit}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <ExpiryBadge days={item.daysUntilExpiry} />
        <p className="tabular mt-0.5 text-xs text-[var(--text-muted)]">
          {formatExpiryDate(item.expiryDate)}
        </p>
      </div>
    </li>
  );
}

/**
 * Còn bao nhiêu ngày, tô theo mức gấp.
 *
 * Ba mức chứ không phải một dải màu liên tục: người trực chỉ cần phân biệt "bỏ
 * ra khỏi kệ", "đẩy đi trong tuần này" và "để mắt tới". Chia mịn hơn thì màu
 * thành trang trí, không còn nói được phải làm gì.
 */
function ExpiryBadge({ days }: { days: number }) {
  const { label, tone } =
    days < 0
      ? { label: `Quá hạn ${Math.abs(days)} ngày`, tone: "var(--color-critical)" }
      : days === 0
        ? { label: "Hết hạn hôm nay", tone: "var(--color-critical)" }
        : days <= 7
          ? { label: `Còn ${days} ngày`, tone: "var(--color-critical)" }
          : { label: `Còn ${days} ngày`, tone: "var(--color-attention)" };

  return (
    <span
      className="tabular inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{ color: tone, background: `color-mix(in oklch, ${tone} 12%, transparent)` }}
    >
      {label}
    </span>
  );
}

function formatExpiryDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { getCommuneStock, type WarehouseStock } from "@/lib/dashboard-api";

/**
 * Tồn kho TOÀN XÃ, hiện ngay trong tab Vật tư của kho tổng.
 *
 * Bảng tồn bên dưới chỉ đếm hàng nằm trong chính kho tổng. Hàng đã đẩy xuống các
 * thôn thì biến mất khỏi màn hình, nên lúc cần điều phối người trực tưởng xã hết
 * hàng trong khi ba thôn vẫn còn — rồi đi xin chi viện một thứ mình đang có.
 *
 * XẾP THEO KHO, không phải theo vật tư. Người trực hỏi "thôn Long Châu đang có
 * gì" nhiều hơn hỏi "áo phao cả xã còn bao nhiêu" — vì câu hỏi thứ nhất dẫn tới
 * một hành động cụ thể (điều xe tới đâu), còn câu thứ hai chỉ là một con số.
 *
 * Mặc định GẤP LẠI. Đây là số để tra lúc cần, không phải số phải nhìn mỗi ngày;
 * bung sẵn thì nó đẩy bảng tồn thật xuống dưới màn hình.
 *
 * Kho thôn gọi vào đây sẽ bị máy chủ từ chối (403) — khối này lặng lẽ biến mất
 * thay vì hiện một câu lỗi mà trưởng thôn không làm gì được.
 */
export function CommuneStockPanel({ warehouseId }: { warehouseId: string }) {
  const [moRong, setMoRong] = useState(false);

  const query = useQuery({
    queryKey: ["commune-stock", warehouseId],
    queryFn: () => getCommuneStock(warehouseId),
    enabled: Boolean(warehouseId),
    // Không thử lại: 403 là câu trả lời dứt khoát cho kho thôn, thử lại chỉ tốn
    // lượt gọi và làm chậm màn hình.
    retry: false,
    staleTime: 60_000,
  });

  if (query.isError) return null;

  const khos = query.data?.byWarehouse ?? [];
  const thons = khos.filter((k) => k.kind === "HAMLET");
  const hangONgoai = thons.reduce((sum, k) => sum + k.totalUnits, 0);

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <button
        aria-expanded={moRong}
        className="flex w-full items-center gap-2 p-4 text-left"
        onClick={() => setMoRong((truoc) => !truoc)}
        type="button"
      >
        <ColorIcon name="warehouse" size={18} tone="blue" />
        <span aria-hidden="true" className="text-xs text-[var(--text-muted)]">
          {moRong ? "▾" : "▸"}
        </span>
        <span className="font-semibold">Tồn kho toàn xã</span>
        <span className="text-sm text-[var(--text-muted)]">
          {query.isLoading
            ? "đang tải…"
            : khos.length === 0
              ? "chưa có vật tư nào"
              : `${khos.length} kho · ${hangONgoai.toLocaleString("vi")} đơn vị đang nằm ở ${thons.length} thôn`}
        </span>
      </button>

      {moRong && khos.length > 0 ? (
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
          {khos.map((kho) => (
            <TheKho key={kho.warehouseId} kho={kho} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Một kho, kèm những gì nó đang giữ.
 *
 * Chỉ hiện năm mặt hàng nhiều nhất rồi gộp phần còn lại thành một dòng. Kho tổng
 * có tới mười bảy mã vật tư; liệt kê hết thì mỗi thẻ dài bằng cả màn hình và
 * người đọc mất luôn khả năng so sánh giữa các thôn — vốn là lý do khối này tồn
 * tại.
 */
function TheKho({ kho }: { kho: WarehouseStock }) {
  const HIEN_TOI_DA = 5;
  const hien = kho.items.slice(0, HIEN_TOI_DA);
  const conLai = kho.items.length - hien.length;
  const laKhoTong = kho.kind === "CENTRAL";
  const trong = kho.totalUnits === 0;

  return (
    <article
      className="rounded-md border p-3"
      style={
        laKhoTong
          ? { borderColor: "var(--color-accent)", background: "var(--surface-2)" }
          : undefined
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="truncate text-sm font-semibold" title={kho.warehouseName}>
          {kho.warehouseName}
        </h4>
        {laKhoTong ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase text-[var(--color-accent)]">
            kho tổng
          </span>
        ) : null}
      </div>

      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        {trong
          ? "đang trống"
          : `${kho.totalUnits.toLocaleString("vi")} đơn vị · ${kho.itemCount} mã`}
      </p>

      {trong ? (
        /* Kho trống vẫn phải hiện. Bỏ nó đi thì người đọc tưởng thôn đó không
           tồn tại, trong khi "thôn này hết hàng" mới là thông tin cần biết. */
        <p className="mt-2 text-xs italic text-[var(--text-muted)]">Không còn vật tư nào</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {hien.map((mon) => (
            <li key={mon.itemSku}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate" title={mon.itemName}>
                  {mon.itemName}
                </span>
                <span className="shrink-0 font-mono font-semibold">
                  {mon.quantity.toLocaleString("vi")} {mon.unit}
                </span>
              </div>
              {/* Quy đổi ra lốc và lít cho hàng đếm theo chai — ba cách đếm cho
                  cùng một đống hàng, ai cũng đọc được ngay phần mình cần. */}
              {mon.conversion ? (
                <div className="text-[10px] text-[var(--text-muted)]">{mon.conversion}</div>
              ) : null}
            </li>
          ))}
          {conLai > 0 ? (
            <li className="pt-0.5 text-[var(--text-muted)]">và {conLai} mã khác</li>
          ) : null}
        </ul>
      )}
    </article>
  );
}

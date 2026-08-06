"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { getCommuneStock } from "@/lib/dashboard-api";

/**
 * Tồn kho TOÀN XÃ, hiện ngay trong tab Vật tư của kho tổng.
 *
 * Bảng tồn bên dưới chỉ đếm hàng nằm trong chính kho tổng. Hàng đã đẩy xuống các
 * thôn thì biến mất khỏi màn hình, nên lúc cần điều phối người trực tưởng xã hết
 * hàng trong khi ba thôn vẫn còn — rồi đi xin chi viện một thứ mình đang có.
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

  const rows = query.data ?? [];
  const coHangONgoai = rows.some((r) => r.atHamlets > 0);

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
            : rows.length === 0
              ? "chưa có vật tư nào"
              : coHangONgoai
                ? `${rows.length} mã vật tư — có hàng đang nằm ở kho thôn`
                : `${rows.length} mã vật tư — đều ở kho tổng`}
        </span>
      </button>

      {moRong && rows.length > 0 ? (
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Vật tư</th>
                <th className="px-4 py-2 text-right font-medium">Toàn xã</th>
                <th className="px-4 py-2 text-right font-medium">Ở kho tổng</th>
                <th className="px-4 py-2 font-medium">Đang nằm ở đâu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t align-top" key={row.itemSku}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{row.itemName}</div>
                    <div className="font-mono text-xs text-[var(--text-muted)]">{row.itemSku}</div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {row.total} {row.unit}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {row.atCentral} {row.unit}
                  </td>
                  <td className="px-4 py-2">
                    {/* Liệt kê từng kho thay vì chỉ một con số tổng: người đang
                        tìm chỗ lấy hàng cần biết gọi ai, không cần biết tổng. */}
                    <ul className="space-y-0.5">
                      {row.byWarehouse.map((kho) => (
                        <li className="flex justify-between gap-4" key={kho.warehouseId}>
                          <span className={kho.kind === "HAMLET" ? "text-[var(--text-muted)]" : ""}>
                            {kho.warehouseName}
                          </span>
                          <span className="font-mono">{kho.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

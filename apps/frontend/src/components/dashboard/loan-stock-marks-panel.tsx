"use client";

import { useQuery } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { getLoanStockMarks } from "@/lib/dashboard-api";

/**
 * Hàng đang mắc nợ với xã khác, hiện ngay trong tab Vật tư.
 *
 * Tồn kho là một con số duy nhất, không nói được bao nhiêu trong đó là hàng đi
 * mượn và bao nhiêu đã đưa đi cho mượn. Người nhìn vào con số ấy để quyết định
 * điều phối sẽ tưởng mình có nhiều hơn — hoặc ít hơn — thực tế mình sở hữu.
 *
 * KHÔNG có khoản nào thì khối này biến mất hẳn. Hiện một dòng "không mượn ai" chỉ
 * chiếm chỗ trong màn hình vốn đã dày số liệu.
 */
export function LoanStockMarksPanel() {
  const query = useQuery({
    queryKey: ["loan-stock-marks"],
    queryFn: getLoanStockMarks,
    refetchInterval: 30_000,
  });

  const marks = query.data ?? [];
  if (marks.length === 0) return null;

  return (
    <section className="rounded-md border p-4" style={{ borderColor: "var(--color-attention)" }}>
      <div className="flex items-center gap-2">
        <ColorIcon name="loan" size={18} tone="amber" />
        <h3 className="font-semibold">Hàng đang mắc nợ với xã khác</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {marks.map((mark) => (
          <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" key={mark.itemSku}>
            <span className="font-medium">{mark.itemName}</span>
            {mark.lentOut > 0 ? (
              <span className="text-[var(--text-muted)]">
                đang cho mượn{" "}
                <span className="font-mono font-semibold text-[var(--text)]">
                  {mark.lentOut} {mark.unit}
                </span>
              </span>
            ) : null}
            {mark.borrowedIn > 0 ? (
              <span className="text-[var(--text-muted)]">
                {/* Nói rõ "có trong kho nhưng không phải của mình": đây là chỗ
                    người điều phối dễ đếm nhầm thành hàng sẵn có nhất. */}
                đang mượn{" "}
                <span className="font-mono font-semibold text-[var(--text)]">
                  {mark.borrowedIn} {mark.unit}
                </span>{" "}
                (có trong kho nhưng phải trả)
              </span>
            ) : null}
            <span className="text-xs text-[var(--text-muted)]">· {mark.peers.join(", ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FIELD_FORCE_ROLE_LABEL } from "@safestock/shared-types";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import { errorMessage } from "@/lib/api";
import { confirmHoldingReturn, listRescueHoldings } from "@/lib/mission-api";
import { formatTimeAndDate } from "@/lib/date-format";

/**
 * Vật tư đội cứu hộ đang cầm, chưa trả về kho.
 *
 * Trước đây không sổ nào ghi việc này. Hàng bị trừ khỏi tồn ngay lúc kho xuất, và
 * khi nhiệm vụ đóng lại thì dấu vết cuối cùng cũng biến mất: sổ kho ghi "đã xuất",
 * còn hai chục áo phao nằm trên xe cho tới đợt kiểm kê sau mới lòi ra — mà lúc đó
 * thì không ai nhớ chúng đi theo chuyến nào.
 *
 * CHỈ thủ kho bấm được nút xác nhận. Để đội tự khai đã trả là tồn kho cộng lên
 * bằng lời nói, trong khi người duy nhất đối chiếu được hàng thật với sổ lại đứng
 * ngoài.
 */
export function RescueHoldingsPanel({
  canConfirmReturn,
  defaultOpen = true,
}: {
  canConfirmReturn: boolean;
  /**
   * Mở sẵn hay thu gọn sẵn lúc khối được dựng.
   *
   * Chỗ gọi quyết định vì nó là nơi biết nhiệm vụ đang ở bước nào; `CollapsiblePanel`
   * chỉ đọc giá trị này một lần lúc gắn vào cây, nên muốn khối tự đóng khi bước
   * việc đổi thì chỗ gọi phải đổi luôn `key` — xem `MissionView`.
   */
  defaultOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const holdings = useQuery({
    queryKey: ["rescue-holdings"],
    queryFn: () => listRescueHoldings(),
    refetchInterval: 30_000,
  });

  const confirm = useMutation({
    mutationFn: (holdingId: string) => confirmHoldingReturn(holdingId),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["rescue-holdings"] });
      // Tồn kho vừa đổi: bảng kho và thẻ nhiệm vụ đều đang hiện số cũ.
      void queryClient.invalidateQueries({ queryKey: ["commune-stock"] });
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: (cause: unknown) => {
      setError(errorMessage(cause, "Không xác nhận được hoàn trả."));
    },
  });

  const rows = holdings.data ?? [];
  if (holdings.isPending) return null;
  /*
   * KHÔNG còn khoản nào thì khối này biến mất hẳn.
   *
   * Trước đây nó vẫn đứng lại với dòng "Không còn khoản nào chờ hoàn trả" — một
   * khối chiếm chỗ để nói rằng nó không có gì để nói. Trang chi tiết nhiệm vụ ở
   * chặng lập tham mưu chỉ nên còn đúng danh sách vật tư đang phải soát; mỗi khối
   * rỗng xen vào là một lần người trực phải đọc để loại nó ra.
   *
   * Sổ tạm giữ đầy đủ vẫn xem được ở trang kho — đây chỉ là lối nhắc trong ngữ
   * cảnh một nhiệm vụ.
   */
  if (rows.length === 0) return null;

  return (
    <CollapsiblePanel
      title={`Vật tư ${FIELD_FORCE_ROLE_LABEL} đang giữ`}
      icon={<ColorIcon name="helmet" size={18} tone="amber" />}
      subtitle={`${rows.length} khoản chưa về kho.`}
      tone="var(--color-attention)"
      defaultOpen={defaultOpen}
    >
      <ul className="mt-3 space-y-2">
        {rows.map((holding) => (
          <li
            key={holding.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium">
                {holding.itemName}{" "}
                <span className="tabular">
                  {holding.quantity} {holding.unit}
                </span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Nhiệm vụ số {holding.mission.missionNo} · hoàn về {holding.warehouse.name} · giữ từ{" "}
                {formatTimeAndDate(holding.heldSince)}
              </p>
            </div>
            {canConfirmReturn && (
              <button
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate(holding.id)}
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-accent-fg)",
                  opacity: confirm.isPending ? 0.6 : 1,
                }}
                type="button"
              >
                Đã nhận lại
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-critical)" }}>
          {error}
        </p>
      )}
    </CollapsiblePanel>
  );
}

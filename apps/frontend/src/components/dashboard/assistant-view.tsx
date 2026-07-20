"use client";

import { Bot } from "lucide-react";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export function AssistantView({ warehouseId }: { warehouseId: string }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
          <Bot aria-hidden="true" size={18} strokeWidth={1.8} />
          <span>Trợ lý hỏi-đáp kho</span>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Hỏi về tồn kho, hạn dùng, sự cố và điểm sẵn sàng. Trợ lý chỉ trả lời từ dữ liệu kho hiện tại.
        </p>
      </div>

      <AssistantChat warehouseId={warehouseId} />
    </div>
  );
}

"use client";

import { ColorIcon } from "@/components/shared/color-icon";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export function AssistantView({ warehouseId }: { warehouseId: string }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
          <ColorIcon name="assistant" size={20} tone="blue" />
          <span>Tra cứu bằng câu hỏi</span>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Nhập câu hỏi bằng tiếng Việt để tìm số lượng, hạn dùng, sự cố hoặc khả năng đáp ứng của kho.
        </p>
      </div>

      <AssistantChat warehouseId={warehouseId} />
    </div>
  );
}

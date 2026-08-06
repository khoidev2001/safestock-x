"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import {
  normalizeInventoryInput,
  semanticSearchInventory,
  type SemanticInventoryResponse,
} from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-store";

export function SemanticInventoryTools({ warehouseId }: { warehouseId: string }) {
  const role = useAuth((state) => state.user?.role);
  const [query, setQuery] = useState("");
  const [rawName, setRawName] = useState("");
  const search = useMutation({
    mutationFn: (value: string) => semanticSearchInventory(warehouseId, value),
  });
  const normalize = useMutation({
    mutationFn: normalizeInventoryInput,
  });
  const canNormalize = role === "ADMIN" || role === "WAREHOUSE";

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length >= 2) search.mutate(value);
  };
  const submitNormalize = (event: FormEvent) => {
    event.preventDefault();
    const value = rawName.trim();
    if (value.length >= 2) normalize.mutate(value);
  };

  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2">
        <ColorIcon name="magic" size={20} tone="amber" />
        <div>
          <h2 className="text-sm font-semibold">Tìm và chuẩn hóa vật tư bằng embedding local</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Tìm theo công dụng, không cần nhớ đúng tên hay mã SKU.
          </p>
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${canNormalize ? "lg:grid-cols-2" : ""}`}>
        <ToolForm
          button="Tìm ngữ nghĩa"
          onSubmit={submitSearch}
          onValue={setQuery}
          placeholder="Ví dụ: đồ giữ ấm cho trẻ"
          value={query}
        >
          <SemanticResults data={search.data} loading={search.isPending} />
        </ToolForm>

        {canNormalize && (
          <ToolForm
            button="Gợi ý tên chuẩn"
            onSubmit={submitNormalize}
            onValue={setRawName}
            placeholder="Ví dụ: ao phao tre e"
            value={rawName}
          >
            <SemanticResults data={normalize.data} loading={normalize.isPending} normalize />
          </ToolForm>
        )}
      </div>
    </section>
  );
}

function ToolForm({
  button,
  children,
  onSubmit,
  onValue,
  placeholder,
  value,
}: {
  button: string;
  children: React.ReactNode;
  onSubmit: (event: FormEvent) => void;
  onValue: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-[var(--surface-2)] p-3">
      <form className="flex gap-2" onSubmit={onSubmit}>
        <input
          className="min-w-0 flex-1 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          onChange={(event) => onValue(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        <button
          className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
          disabled={value.trim().length < 2}
          type="submit"
        >
          {button}
        </button>
      </form>
      {children}
    </div>
  );
}

function SemanticResults({
  data,
  loading,
  normalize = false,
}: {
  data?: SemanticInventoryResponse;
  loading: boolean;
  normalize?: boolean;
}) {
  if (loading) return <p className="mt-3 text-sm text-[var(--text-muted)]">Đang vector hóa…</p>;
  if (!data) {
    return normalize ? (
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Chỉ gợi ý cho người duyệt; hệ thống không tự ghi hay đổi SKU.
      </p>
    ) : null;
  }
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {data.mode === "EMBEDDING" ? "Embedding local" : "Dự phòng theo từ khóa"}
        {normalize ? " · cần người duyệt" : ""}
      </p>
      {data.results.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Chưa có gợi ý phù hợp.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {data.results.map((item) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border bg-[var(--surface)] px-3 py-2"
              key={item.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {item.categoryName}
                  {item.availableQuantity != null
                    ? ` · tồn ${item.availableQuantity} ${item.unit}`
                    : ""}
                </p>
              </div>
              <span className="tabular text-xs font-semibold text-[var(--color-accent)]">
                {Math.round(item.score * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

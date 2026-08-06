"use client";

import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import type { WarehouseTree } from "@/lib/dashboard-api";

interface WarehouseMapProps {
  tree: WarehouseTree | undefined;
  isLoading: boolean;
}

export function WarehouseMap({ tree, isLoading }: WarehouseMapProps) {
  if (isLoading) {
    return <div className="h-[310px] animate-pulse rounded-md border bg-[var(--surface)]" />;
  }

  if (!tree) {
    return (
      <CollapsiblePanel
        className="rounded-md border bg-[var(--surface)] p-5"
        icon={<ColorIcon name="map" size={20} tone="blue" />}
        title="Sơ đồ kho"
        subtitle="Vị trí các kệ được sắp theo từng khu"
      >
        <p className="text-sm text-[var(--text-muted)]">Chưa có cây kho để hiển thị.</p>
      </CollapsiblePanel>
    );
  }

  return (
    <CollapsiblePanel
      className="rounded-md border bg-[var(--surface)] p-5"
      icon={<ColorIcon name="map" size={20} tone="blue" />}
      title="Sơ đồ kho"
      subtitle="Vị trí các kệ được sắp theo từng khu"
      badge={
        <span className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
          {tree.zones.length} khu
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {tree.zones.map((zone) => (
          <div key={zone.id} className="rounded-md border bg-[var(--surface-2)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{zone.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{zone.code}</p>
              </div>
              <span className="tabular text-xs text-[var(--text-muted)]">
                {zone.shelves.length} kệ
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {zone.shelves.map((shelf) => (
                <div key={shelf.id} className="min-h-20 rounded-md border bg-[var(--surface)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{shelf.code}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--text-muted)]">{shelf.name}</p>
                  <p className="tabular mt-2 text-xs font-medium">
                    {shelf._count?.batches ?? 0} lô
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

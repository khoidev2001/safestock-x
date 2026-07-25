"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useAuth } from "@/lib/auth-store";
import {
  listAllWarehouses,
  updateWarehouseLocation,
  type AdminWarehouse,
} from "@/lib/warehouse-api";

const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100dvh-190px)] min-h-[520px] animate-pulse rounded-md border bg-[var(--surface)]" />
  ),
});

/** Bản đồ kho trong xã (Leaflet + OSM + ranh giới xã). ADMIN bật dev mode để ghim toạ độ. */
export function MapView({ warehouseId }: { warehouseId: string }) {
  const isAdmin = useAuth((s) => s.user?.role) === "ADMIN";
  const qc = useQueryClient();
  const [devMode, setDevMode] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  // Toạ độ tạm (chưa lưu) theo id — cho phép kéo/click nhiều lần rồi Lưu.
  const [draft, setDraft] = useState<Record<string, { lat: number; lng: number }>>({});

  const query = useQuery({ queryKey: ["all-warehouses", warehouseId], queryFn: listAllWarehouses });

  const save = useMutation({
    mutationFn: ({ id, lat, lng }: { id: string; lat: number; lng: number }) =>
      updateWarehouseLocation(id, lat, lng),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-warehouses", warehouseId] });
    },
  });

  const warehouses = mergeDraft(query.data ?? [], draft);
  const unlocated = warehouses.filter((w) => w.lat == null || w.lng == null);

  function setDraftCoord(id: string, lat: number, lng: number) {
    setDraft((d) => ({ ...d, [id]: { lat, lng } }));
  }

  function saveOne(id: string) {
    const c = draft[id];
    if (!c) return;
    save.mutate({ id, lat: c.lat, lng: c.lng });
    setDraft((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    if (pickingId === id) setPickingId(null);
  }

  const dirtyIds = Object.keys(draft);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <MapCanvas
          warehouses={warehouses}
          devMode={devMode}
          pickingId={pickingId}
          onMarkerMove={setDraftCoord}
          onPickOnMap={(lat, lng) => {
            if (pickingId) setDraftCoord(pickingId, lat, lng);
          }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--text-muted)]">
          <Legend color="var(--color-accent, #2f9e6e)" label="Kho tổng xã" />
          <Legend color="var(--text-muted, #8a8f98)" label="Kho thôn" />
          <span className="text-[var(--border)]">|</span>
          {/* Màu ghim địa danh — khớp PLACE_COLORS trong map-canvas. */}
          <Legend color="#7a2e12" label="Thôn/xóm" />
          <Legend color="#d64545" label="Y tế" />
          <Legend color="#2f6fd6" label="Trường học" />
          <Legend color="#7b41c9" label="Hành chính" />
          <Legend color="#1f7a52" label="Chợ/cửa hàng" />
          <Legend color="#a06a1f" label="Tôn giáo" />
          <span>· Ranh giới 102 xã/phường tỉnh Đắk Lắk (OSM) · địa danh đã bỏ nhãn “huyện”</span>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-md border bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ColorIcon name="location" size={18} tone="blue" />
            <span>Kho trong xã ({warehouses.length})</span>
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setDevMode((v) => !v);
                setPickingId(null);
              }}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition active:translate-y-px ${
                devMode ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "border"
              }`}
            >
              <ColorIcon name="edit" size={17} tone="blue" />
              {devMode ? "Đang cập nhật vị trí" : "Cập nhật vị trí kho"}
            </button>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Chỉ quản trị xã ghim được toạ độ kho.
            </p>
          )}
        </section>

        {devMode && (
          <section className="rounded-md border bg-[var(--surface)] p-4">
            <h4 className="text-sm font-semibold">Ghim toạ độ</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Kéo dấu ghim, hoặc chọn một kho rồi bấm vào vị trí tương ứng trên bản đồ. Sau đó chọn
              Lưu.
            </p>
            <ul className="mt-3 space-y-2">
              {warehouses.map((w) => {
                const dirty = dirtyIds.includes(w.id);
                const picking = pickingId === w.id;
                return (
                  <li key={w.id} className="rounded-md border bg-[var(--surface-2)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{w.name}</p>
                        <p className="tabular text-xs text-[var(--text-muted)]">
                          {w.lat != null && w.lng != null
                            ? `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`
                            : "chưa ghim"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPickingId(picking ? null : w.id)}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                            picking
                              ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                              : "border"
                          }`}
                          title="Chọn vị trí trên bản đồ"
                        >
                          {picking ? "Đang chọn…" : "Chọn"}
                        </button>
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => saveOne(w.id)}
                            disabled={save.isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-semibold text-[var(--color-accent-fg)] disabled:opacity-60"
                          >
                            <ColorIcon name="save" size={15} tone="green" /> Lưu
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!devMode && unlocated.length > 0 && (
          <section className="rounded-md border bg-[var(--surface)] p-4">
            <h4 className="text-sm font-semibold text-[var(--color-attention)]">
              Chưa ghim toạ độ ({unlocated.length})
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
              {unlocated.map((w) => (
                <li key={w.id}>• {w.name}</li>
              ))}
            </ul>
            {isAdmin && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Bật chế độ ghim để đặt vị trí.
              </p>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

/** Ghép toạ độ tạm (draft) vào danh sách kho để map hiển thị ngay khi kéo/click. */
function mergeDraft(
  list: AdminWarehouse[],
  draft: Record<string, { lat: number; lng: number }>,
): AdminWarehouse[] {
  return list.map((w) => (draft[w.id] ? { ...w, lat: draft[w.id].lat, lng: draft[w.id].lng } : w));
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

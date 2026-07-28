"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { useAuth } from "@/lib/auth-store";
import {
  listAllWarehouses,
  updateWarehouseLocation,
  type AdminWarehouse,
} from "@/lib/warehouse-api";
import { warehouseLocationLabel } from "@/lib/warehouse-location";
import { MapMarkerGlyph, mapMarkerLabel, type MapMarkerKind } from "./map-markers";
import {
  beginWarehouseSave,
  clearMatchingSavedDraft,
  finishWarehouseSave,
  mergeWarehouseDraft,
  type WarehouseDraft,
} from "./map-view-state";

const MapCanvas = dynamic(() => import("./map-canvas").then((module) => module.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100dvh-190px)] min-h-[520px] animate-pulse rounded-md border bg-[var(--surface)]" />
  ),
});

/** Bản đồ kho trong xã. ADMIN bật chế độ chỉnh để ghim và lưu tọa độ kho. */
export function MapView({ warehouseId }: { warehouseId: string }) {
  const isAdmin = useAuth((state) => state.user?.role) === "ADMIN";
  const queryClient = useQueryClient();
  const [devMode, setDevMode] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WarehouseDraft>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [saveFeedback, setSaveFeedback] = useState<
    Record<string, { kind: "success" | "error"; message: string }>
  >({});

  const query = useQuery({
    queryKey: ["all-warehouses", warehouseId],
    queryFn: listAllWarehouses,
  });

  const save = useMutation({
    mutationFn: ({ id, lat, lng }: { id: string; lat: number; lng: number }) =>
      updateWarehouseLocation(id, lat, lng),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData<AdminWarehouse[]>(["all-warehouses", warehouseId], (current) =>
        current?.map((warehouse) => (warehouse.id === updated.id ? updated : warehouse)),
      );
      setDraft((current) => clearMatchingSavedDraft(current, variables.id, variables));
      setPickingId((current) => (current === variables.id ? null : current));
      setSaveFeedback((current) => ({
        ...current,
        [variables.id]: {
          kind: "success",
          message: `Đã lưu vị trí kho ${updated.name}.`,
        },
      }));
      void queryClient.invalidateQueries({
        queryKey: ["all-warehouses", warehouseId],
      });
    },
    onError: (reason: Error, variables) => {
      setSaveFeedback((current) => ({
        ...current,
        [variables.id]: {
          kind: "error",
          message: reason.message || "Không thể lưu vị trí kho. Draft vẫn được giữ để thử lại.",
        },
      }));
    },
    onSettled: (_data, _error, variables) => {
      pendingIdsRef.current = finishWarehouseSave(pendingIdsRef.current, variables.id);
      setPendingIds(pendingIdsRef.current);
    },
  });

  const persistedWarehouses = query.data ?? [];
  const warehouses = mergeWarehouseDraft(persistedWarehouses, draft);
  const unlocated = warehouses.filter(
    (warehouse) => warehouse.lat == null || warehouse.lng == null,
  );
  const dirtyIds = Object.keys(draft);

  function setDraftCoord(id: string, lat: number, lng: number) {
    setDraft((current) => ({ ...current, [id]: { lat, lng } }));
    setSaveFeedback((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function saveOne(id: string) {
    const coordinate = draft[id];
    if (!coordinate) return;
    const nextPending = beginWarehouseSave(pendingIdsRef.current, id);
    if (!nextPending) return;
    pendingIdsRef.current = nextPending;
    setPendingIds(nextPending);
    setSaveFeedback((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    save.mutate({ id, lat: coordinate.lat, lng: coordinate.lng });
  }

  function selectWarehouse(id: string) {
    setPickingId((current) => (current === id ? null : id));
    setSaveFeedback((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <MapCanvas
          warehouses={warehouses}
          persistedWarehouses={persistedWarehouses}
          devMode={devMode}
          pickingId={pickingId}
          onMarkerMove={setDraftCoord}
          onPickOnMap={(lat, lng) => {
            if (pickingId) setDraftCoord(pickingId, lat, lng);
          }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--text-muted)]">
          <MapLegend kind="central-warehouse" />
          <MapLegend kind="hamlet-warehouse" />
          <span className="text-[var(--border)]">|</span>
          <MapLegend kind="place" />
          <MapLegend kind="health" />
          <MapLegend kind="school" />
          <MapLegend kind="civic" />
          <MapLegend kind="commerce" />
          <MapLegend kind="worship" />
          <span>· Ranh giới xã/phường và địa danh do ứng dụng hiển thị trên ảnh vệ tinh</span>
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
                setDevMode((value) => !value);
                setPickingId(null);
                setSaveFeedback({});
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
              Chỉ quản trị xã ghim được tọa độ kho.
            </p>
          )}
          {query.isError ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Không tải được danh sách kho: {query.error.message || "vui lòng thử lại."}
              <button
                type="button"
                className="ml-1 font-semibold underline"
                onClick={() => void query.refetch()}
              >
                Thử lại
              </button>
            </p>
          ) : null}
        </section>

        {devMode && !query.isError ? (
          <section className="rounded-md border bg-[var(--surface)] p-4">
            <h4 className="text-sm font-semibold">Ghim tọa độ</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Chọn một kho, bấm đúng vị trí trên ảnh vệ tinh hoặc kéo icon của kho đang chọn. Draft
              chỉ mất sau khi backend xác nhận.
            </p>
            <ul className="mt-3 space-y-2">
              {warehouses.map((warehouse) => {
                const dirty = dirtyIds.includes(warehouse.id);
                const picking = pickingId === warehouse.id;
                const saving = pendingIds.has(warehouse.id);
                const feedback = saveFeedback[warehouse.id];
                return (
                  <li
                    key={warehouse.id}
                    className="rounded-md border bg-[var(--surface-2)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{warehouse.name}</p>
                        <p className="tabular text-xs text-[var(--text-muted)]">
                          {warehouse.lat != null && warehouse.lng != null
                            ? `${warehouse.lat.toFixed(5)}, ${warehouse.lng.toFixed(5)}`
                            : "chưa ghim"}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {warehouseLocationLabel(warehouse)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => selectWarehouse(warehouse.id)}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                            picking
                              ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                              : "border"
                          }`}
                          title="Chọn vị trí trên bản đồ"
                        >
                          {picking ? "Đang chọn…" : "Chọn"}
                        </button>
                        {dirty ? (
                          <button
                            type="button"
                            onClick={() => saveOne(warehouse.id)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-semibold text-[var(--color-accent-fg)] disabled:opacity-60"
                          >
                            <ColorIcon
                              className={saving ? "animate-spin" : undefined}
                              name={saving ? "loading" : "save"}
                              size={15}
                              tone="green"
                            />
                            {saving ? "Đang lưu…" : "Lưu"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {feedback?.kind === "error" ? (
                      <p
                        role="alert"
                        className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700"
                      >
                        {feedback.message} Draft chưa bị xóa; hãy kiểm tra kết nối rồi bấm Lưu lại.
                      </p>
                    ) : null}
                    {feedback?.kind === "success" ? (
                      <p
                        role="status"
                        className="mt-2 rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-700"
                      >
                        {feedback.message}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!devMode && unlocated.length > 0 ? (
          <section className="rounded-md border bg-[var(--surface)] p-4">
            <h4 className="text-sm font-semibold text-[var(--color-attention)]">
              Chưa ghim tọa độ ({unlocated.length})
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
              {unlocated.map((warehouse) => (
                <li key={warehouse.id}>
                  • {warehouse.name} — chưa xác minh được nhà văn hóa từ nguồn công khai
                </li>
              ))}
            </ul>
            {isAdmin ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Bật chế độ ghim để đặt vị trí.
              </p>
            ) : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function MapLegend({ kind }: { kind: MapMarkerKind }) {
  return (
    <span className="flex items-center gap-1.5">
      <MapMarkerGlyph kind={kind} size={22} />
      {mapMarkerLabel(kind)}
    </span>
  );
}

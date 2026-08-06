"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useAuth } from "@/lib/auth-store";
import type { CoordinateDraft } from "@/lib/map-marker-state";
import {
  beginWarehouseSave,
  clearMatchingSavedDraft,
  finishWarehouseSave,
  mergeWarehouseDraft,
} from "./map-view-state";
import {
  clearWarehouseLocation,
  listAllWarehouses,
  updateWarehouseLocation,
  type AdminWarehouse,
} from "@/lib/warehouse-api";
import { listHamlets, updateHamlet } from "@/lib/hamlet-api";
import type { MapMarkerTarget } from "./map-canvas";

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
  const [pickingTarget, setPickingTarget] = useState<MapMarkerTarget | null>(null);
  // Toạ độ tạm (chưa lưu) theo id — cho phép kéo/click nhiều lần rồi Lưu.
  const [warehouseDraft, setWarehouseDraft] = useState<CoordinateDraft>({});
  const [pendingWarehouseSaves, setPendingWarehouseSaves] = useState<Set<string>>(() => new Set());

  const query = useQuery({ queryKey: ["all-warehouses", warehouseId], queryFn: listAllWarehouses });
  const hamletsQuery = useQuery({
    queryKey: ["admin-hamlets"],
    queryFn: () => listHamlets("dong-xuan"),
  });

  /**
   * Điểm ứng phó của thôn đi kèm kho thôn: kho đặt ngay tại Nhà văn hoá, cũng là
   * chỗ tập kết khi thôn có sự cố. Một toạ độ, hai bảng.
   *
   * Trước đây phải ghim hai chỗ rời nhau nên lệch âm thầm — kho có toạ độ mà điểm
   * thôn chưa, hoặc ngược lại. Đã xảy ra hai lần, mỗi lần vài kho, và không có
   * thông báo nào. Nay ghim kho là điểm thôn theo luôn.
   */
  const syncHamletWithWarehouse = async (
    warehouseName: string,
    point: { lat: number; lng: number } | null,
  ) => {
    const hamletName = warehouseName.replace(/^Kho\s+thôn\s+/iu, "");
    if (hamletName === warehouseName) return; // Kho trung tâm, không có thôn tương ứng.
    const hamlet = (hamletsQuery.data ?? []).find((item) => item.name === hamletName);
    if (!hamlet) return;
    await updateHamlet(hamlet.id, {
      name: hamlet.name,
      aliases: hamlet.aliases,
      communeId: hamlet.communeId,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      // ADMIN tự tay đặt dấu ghim rồi bấm Lưu — đó chính là hành vi xác minh.
      verified: point != null,
    });
  };

  const save = useMutation({
    mutationFn: async ({
      id,
      name,
      lat,
      lng,
    }: {
      id: string;
      name: string;
      lat: number;
      lng: number;
    }) => {
      await updateWarehouseLocation(id, lat, lng);
      await syncHamletWithWarehouse(name, { lat, lng });
    },
    onSuccess: (_, variables) => {
      setWarehouseDraft((current) =>
        clearMatchingSavedDraft(current, variables.id, {
          lat: variables.lat,
          lng: variables.lng,
        }),
      );
      if (pickingTarget?.kind === "warehouse" && pickingTarget.id === variables.id) {
        setPickingTarget(null);
      }
      qc.invalidateQueries({ queryKey: ["all-warehouses", warehouseId] });
      qc.invalidateQueries({ queryKey: ["admin-hamlets"] });
    },
    onSettled: (_, __, variables) => {
      setPendingWarehouseSaves((current) => finishWarehouseSave(current, variables.id));
    },
  });

  const warehouses = mergeWarehouseDraft(query.data ?? [], warehouseDraft);
  const unlocated = warehouses.filter((w) => w.lat == null || w.lng == null);

  // Chỉ còn ghim kho; điểm ứng phó của thôn đi theo kho, xem syncHamletWithWarehouse.
  function setDraftCoord(_kind: MapMarkerTarget["kind"], id: string, lat: number, lng: number) {
    setWarehouseDraft((current) => ({ ...current, [id]: { lat, lng } }));
  }

  function saveOne(id: string) {
    const c = warehouseDraft[id];
    if (!c || pendingWarehouseSaves.has(id)) return;
    const warehouse = (query.data ?? []).find((item) => item.id === id);
    if (!warehouse) return;
    setPendingWarehouseSaves((current) => beginWarehouseSave(current, id) ?? current);
    save.mutate({ id, name: warehouse.name, lat: c.lat, lng: c.lng });
  }

  /** Xoá toạ độ kho và điểm thôn đi kèm, đưa cả hai về trạng thái chưa ghim. */
  const clearWarehousePin = useMutation({
    mutationFn: async (warehouse: AdminWarehouse) => {
      await clearWarehouseLocation(warehouse.id);
      await syncHamletWithWarehouse(warehouse.name, null);
    },
    onSuccess: (_, warehouse) => {
      setWarehouseDraft((current) => omitDraft(current, warehouse.id));
      if (pickingTarget?.kind === "warehouse" && pickingTarget.id === warehouse.id) {
        setPickingTarget(null);
      }
      qc.invalidateQueries({ queryKey: ["all-warehouses", warehouseId] });
      qc.invalidateQueries({ queryKey: ["admin-hamlets"] });
    },
  });

  const dirtyIds = Object.keys(warehouseDraft);

  return (
    // Panel chức năng chia theo tỉ lệ chứ không cố định 320px: thu thanh điều hướng
    // là chỗ trống chảy sang đây, chứ không dồn hết cho bản đồ.
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
      {/* Dính dưới header khi cuộn — danh sách 17 kho và 17 thôn bên phải dài hơn
          một màn hình, không có cái này thì ghim toạ độ phải cuộn lên xuống liên tục. */}
      <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <MapCanvas
          warehouses={warehouses}
          devMode={devMode}
          pickingTarget={pickingTarget}
          onMarkerMove={setDraftCoord}
          onPickOnMap={(lat, lng) => {
            if (!pickingTarget) return;
            setDraftCoord(pickingTarget.kind, pickingTarget.id, lat, lng);
          }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--text-muted)]">
          <Legend color="var(--color-accent, #2f9e6e)" label="Kho tổng xã" />
          <Legend color="var(--text-muted, #8a8f98)" label="Kho thôn" />
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
                setPickingTarget(null);
              }}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition active:translate-y-px ${
                devMode ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "border"
              }`}
            >
              <ColorIcon name="edit" size={17} tone="blue" />
              {devMode ? "Đang cập nhật marker" : "Cập nhật marker kho / thôn"}
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
                const picking = pickingTarget?.kind === "warehouse" && pickingTarget.id === w.id;
                return (
                  <li key={w.id} className="rounded-md border bg-[var(--surface-2)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{w.name}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {w.location ?? "Chưa có tên địa điểm"}
                        </p>
                        <p className="tabular text-xs text-[var(--text-muted)]">
                          {w.lat != null && w.lng != null
                            ? `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`
                            : w.kind === "HAMLET"
                              ? "Chưa xác minh vị trí Nhà văn hóa thôn"
                              : "Chưa ghim"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setPickingTarget(picking ? null : { kind: "warehouse", id: w.id })
                          }
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
                            disabled={pendingWarehouseSaves.has(w.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-semibold text-[var(--color-accent-fg)] disabled:opacity-60"
                          >
                            <ColorIcon name="save" size={15} tone="green" /> Lưu
                          </button>
                        )}
                        {/* Chỉ hiện khi có gì để xoá. Ghim sai vẫn tính là "có toạ
                            độ" nên hệ thống cứ thế điều xe tới — trắng thì bị từ
                            chối, an toàn hơn là điều tới chỗ sai mà không ai biết. */}
                        {w.lat != null || w.lng != null || dirty ? (
                          <button
                            type="button"
                            disabled={clearWarehousePin.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Xoá toạ độ ${w.name}?\n\n` +
                                    "Kho và điểm ứng phó của thôn cùng trở về trạng thái chưa " +
                                    "ghim, tạm thời không điều phối tới được cho tới khi ghim lại.",
                                )
                              ) {
                                clearWarehousePin.mutate(w);
                              }
                            }}
                            className="rounded-md border px-2 py-1 text-xs text-[var(--color-critical)] disabled:opacity-60"
                          >
                            Xoá ghim
                          </button>
                        ) : null}
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
              Kho chờ xác minh vị trí ({unlocated.length})
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
              {unlocated.map((w) => (
                <li key={w.id}>
                  • {w.name}
                  {w.kind === "HAMLET" ? " — Nhà văn hóa thôn" : ""}
                </li>
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

function omitDraft(draft: CoordinateDraft, id: string): CoordinateDraft {
  const next = { ...draft };
  delete next[id];
  return next;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

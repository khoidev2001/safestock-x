"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { mergeHamletCoordinateDrafts, type CoordinateDraft } from "@/lib/map-marker-state";
import {
  beginWarehouseSave,
  clearMatchingSavedDraft,
  finishWarehouseSave,
  mergeWarehouseDraft,
} from "./map-view-state";
import { listAllWarehouses, updateWarehouseLocation } from "@/lib/warehouse-api";
import { createHamlet, listHamlets, updateHamlet, type AdminHamlet } from "@/lib/hamlet-api";
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
  const [hamletDraft, setHamletDraft] = useState<CoordinateDraft>({});
  const [hamletForm, setHamletForm] = useState({ name: "", aliases: "", lat: "", lng: "" });

  const query = useQuery({ queryKey: ["all-warehouses", warehouseId], queryFn: listAllWarehouses });
  const hamletsQuery = useQuery({
    queryKey: ["admin-hamlets"],
    queryFn: () => listHamlets("dong-xuan"),
  });
  const hamletMutation = useMutation({
    mutationFn: () =>
      createHamlet({
        name: hamletForm.name,
        aliases: hamletForm.aliases
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        lat: hamletForm.lat === "" ? null : Number(hamletForm.lat),
        lng: hamletForm.lng === "" ? null : Number(hamletForm.lng),
        verified: false,
      }),
    onSuccess: () => {
      setHamletForm({ name: "", aliases: "", lat: "", lng: "" });
      qc.invalidateQueries({ queryKey: ["admin-hamlets"] });
    },
  });
  const verifyHamlet = useMutation({
    mutationFn: (hamlet: AdminHamlet) =>
      updateHamlet(hamlet.id, {
        name: hamlet.name,
        aliases: hamlet.aliases,
        communeId: hamlet.communeId,
        lat: hamlet.lat,
        lng: hamlet.lng,
        verified: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-hamlets"] }),
  });
  const saveHamletLocation = useMutation({
    mutationFn: ({ hamlet, lat, lng }: { hamlet: AdminHamlet; lat: number; lng: number }) =>
      updateHamlet(hamlet.id, {
        name: hamlet.name,
        aliases: hamlet.aliases,
        communeId: hamlet.communeId,
        lat,
        lng,
        verified: false,
      }),
    onSuccess: (_, variables) => {
      setHamletDraft((current) => omitDraft(current, variables.hamlet.id));
      if (pickingTarget?.kind === "hamlet" && pickingTarget.id === variables.hamlet.id) {
        setPickingTarget(null);
      }
      qc.invalidateQueries({ queryKey: ["admin-hamlets"] });
    },
  });

  const save = useMutation({
    mutationFn: ({ id, lat, lng }: { id: string; lat: number; lng: number }) =>
      updateWarehouseLocation(id, lat, lng),
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
    },
    onSettled: (_, __, variables) => {
      setPendingWarehouseSaves((current) => finishWarehouseSave(current, variables.id));
    },
  });

  const warehouses = mergeWarehouseDraft(query.data ?? [], warehouseDraft);
  const hamlets = mergeHamletCoordinateDrafts(hamletsQuery.data ?? [], hamletDraft);
  const unlocated = warehouses.filter((w) => w.lat == null || w.lng == null);

  function setDraftCoord(kind: MapMarkerTarget["kind"], id: string, lat: number, lng: number) {
    if (kind === "warehouse") {
      setWarehouseDraft((current) => ({
        ...current,
        [id]: { lat, lng },
      }));
      return;
    }
    setHamletDraft((current) => ({ ...current, [id]: { lat, lng } }));
  }

  function saveOne(id: string) {
    const c = warehouseDraft[id];
    if (!c || pendingWarehouseSaves.has(id)) return;
    setPendingWarehouseSaves((current) => beginWarehouseSave(current, id) ?? current);
    save.mutate({ id, lat: c.lat, lng: c.lng });
  }

  function saveHamletOne(hamlet: AdminHamlet) {
    const coordinate = hamletDraft[hamlet.id];
    if (!coordinate) return;
    saveHamletLocation.mutate({ hamlet, ...coordinate });
  }

  const dirtyIds = Object.keys(warehouseDraft);
  const dirtyHamletIds = Object.keys(hamletDraft);

  return (
    // Panel chức năng chia theo tỉ lệ chứ không cố định 320px: thu thanh điều hướng
    // là chỗ trống chảy sang đây, chứ không dồn hết cho bản đồ.
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
      {/* Dính dưới header khi cuộn — danh sách 17 kho và 17 thôn bên phải dài hơn
          một màn hình, không có cái này thì ghim toạ độ phải cuộn lên xuống liên tục. */}
      <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <MapCanvas
          warehouses={warehouses}
          hamlets={hamlets}
          devMode={devMode}
          pickingTarget={pickingTarget}
          onMarkerMove={setDraftCoord}
          onPickOnMap={(lat, lng) => {
            if (!pickingTarget) return;
            if (pickingTarget.kind === "hamlet" && pickingTarget.id === "__new__") {
              setHamletForm((current) => ({
                ...current,
                lat: lat.toFixed(6),
                lng: lng.toFixed(6),
              }));
              setPickingTarget(null);
              return;
            }
            setDraftCoord(pickingTarget.kind, pickingTarget.id, lat, lng);
          }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--text-muted)]">
          <Legend color="var(--color-accent, #2f9e6e)" label="Kho tổng xã" />
          <Legend color="var(--text-muted, #8a8f98)" label="Kho thôn" />
          {devMode ? (
            <>
              <Legend color="#7a2e12" label="Điểm thôn đã xác minh" />
              <Legend color="#d97706" label="Điểm thôn chờ xác minh" />
            </>
          ) : null}
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

        {isAdmin && (
          <section className="rounded-md border bg-[var(--surface)] p-4">
            <h4 className="text-sm font-semibold">Danh mục thôn / điểm cứu hộ</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Tạo tên chuẩn và alias trước; chỉ xác minh sau khi đã nhập đủ tọa độ.
            </p>
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-md border bg-[var(--surface-2)] px-2 py-1.5 text-sm"
                placeholder="Tên chuẩn, ví dụ Tân Bình"
                value={hamletForm.name}
                onChange={(event) =>
                  setHamletForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <input
                className="w-full rounded-md border bg-[var(--surface-2)] px-2 py-1.5 text-sm"
                placeholder="Alias, phân cách bằng dấu phẩy"
                value={hamletForm.aliases}
                onChange={(event) =>
                  setHamletForm((current) => ({
                    ...current,
                    aliases: event.target.value,
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded-md border bg-[var(--surface-2)] px-2 py-1.5 text-sm"
                  inputMode="decimal"
                  placeholder="Vĩ độ"
                  value={hamletForm.lat}
                  onChange={(event) =>
                    setHamletForm((current) => ({
                      ...current,
                      lat: event.target.value,
                    }))
                  }
                />
                <input
                  className="rounded-md border bg-[var(--surface-2)] px-2 py-1.5 text-sm"
                  inputMode="decimal"
                  placeholder="Kinh độ"
                  value={hamletForm.lng}
                  onChange={(event) =>
                    setHamletForm((current) => ({
                      ...current,
                      lng: event.target.value,
                    }))
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setDevMode(true);
                  setPickingTarget({ kind: "hamlet", id: "__new__" });
                }}
                className={`w-full rounded-md border px-3 py-2 text-sm font-medium ${
                  pickingTarget?.kind === "hamlet" && pickingTarget.id === "__new__"
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : ""
                }`}
              >
                {pickingTarget?.kind === "hamlet" && pickingTarget.id === "__new__"
                  ? "Bấm vị trí thôn trên bản đồ…"
                  : "Chọn tọa độ trên bản đồ"}
              </button>
              <button
                type="button"
                disabled={hamletMutation.isPending || !hamletForm.name.trim()}
                onClick={() => hamletMutation.mutate()}
                className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
              >
                {hamletMutation.isPending ? "Đang lưu…" : "Tạo thôn"}
              </button>
              {hamletMutation.error ? (
                <p role="alert" className="text-xs text-[var(--color-critical)]">
                  Không lưu được cấu hình thôn.
                </p>
              ) : null}
            </div>
            <ul className="mt-4 space-y-2">
              {hamlets.map((hamlet) => {
                const dirty = dirtyHamletIds.includes(hamlet.id);
                const picking = pickingTarget?.kind === "hamlet" && pickingTarget.id === hamlet.id;
                return (
                  <li
                    key={hamlet.id}
                    className="rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <b className="block truncate">{hamlet.name}</b>
                        <span className="text-xs text-[var(--text-muted)]">
                          {hamlet.lat != null && hamlet.lng != null
                            ? `${hamlet.lat.toFixed(5)}, ${hamlet.lng.toFixed(5)}`
                            : "chưa ghim"}
                        </span>
                      </span>
                      <span
                        className={`text-xs ${
                          hamlet.verified
                            ? "text-[var(--color-ready)]"
                            : "text-[var(--color-attention)]"
                        }`}
                      >
                        {dirty ? "Chờ lưu" : hamlet.verified ? "Đã xác minh" : "Chờ xác minh"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDevMode(true);
                          setPickingTarget(picking ? null : { kind: "hamlet", id: hamlet.id });
                        }}
                        className={`rounded-md px-2 py-1 text-xs ${
                          picking
                            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                            : "border"
                        }`}
                      >
                        {picking ? "Đang chọn…" : "Chọn trên bản đồ"}
                      </button>
                      {dirty ? (
                        <button
                          type="button"
                          disabled={saveHamletLocation.isPending}
                          onClick={() => saveHamletOne(hamlet)}
                          className="rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
                        >
                          Lưu vị trí
                        </button>
                      ) : null}
                      {!hamlet.verified ? (
                        <button
                          type="button"
                          disabled={
                            dirty ||
                            hamlet.lat == null ||
                            hamlet.lng == null ||
                            verifyHamlet.isPending
                          }
                          onClick={() => verifyHamlet.mutate(hamlet)}
                          className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Xác minh
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {saveHamletLocation.error ? (
              <p role="alert" className="mt-2 text-xs text-[var(--color-critical)]">
                Không lưu được vị trí thôn.
              </p>
            ) : null}
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

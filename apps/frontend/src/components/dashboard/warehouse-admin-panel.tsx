"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { formatCoordinate } from "@/lib/coordinate-input";
import type { LatLng } from "@/lib/geo";
import {
  clearWarehouseLocation,
  createWarehouse,
  deleteWarehouse,
  updateWarehouse,
  updateWarehouseLocation,
  type AdminWarehouse,
} from "@/lib/warehouse-api";

/**
 * Bảng quản lý kho của quản trị xã: thêm, sửa, xoá và ghim toạ độ.
 *
 * Đặt ngay cạnh bản đồ chứ không tách thành trang riêng, vì ba việc này gần như
 * luôn đi cùng nhau: thêm kho xong là phải chỉ chỗ nó đứng, mà chỉ chỗ thì phải
 * nhìn thấy những kho xung quanh để không ghim chồng lên nhau.
 */

interface Props {
  warehouses: AdminWarehouse[];
  /** Kho đang chờ ghim; null là không có ai đang ghim. */
  pinningId: string | null;
  /** Điểm vừa bấm trên bản đồ, chưa lưu. */
  draftPoint: LatLng | null;
  onStartPinning: (warehouse: AdminWarehouse) => void;
  onStopPinning: () => void;
}

type FormState = {
  id: string | null;
  name: string;
  location: string;
  kind: "CENTRAL" | "HAMLET";
};

const EMPTY_FORM: FormState = { id: null, name: "", location: "", kind: "HAMLET" };

export function WarehouseAdminPanel({
  warehouses,
  pinningId,
  draftPoint,
  onStartPinning,
  onStopPinning,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const pinning = warehouses.find((w) => w.id === pinningId) ?? null;

  // Đổi kho đang ghim thì lời nhắc của kho trước không còn đúng nữa.
  useEffect(() => setMessage(null), [pinningId]);

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["all-warehouses"] });
  }

  /** Lỗi từ máy chủ đã nói rõ vướng cái gì — giữ nguyên câu đó, đừng dịch lại. */
  function report(error: unknown, fallback: string) {
    setMessage({ tone: "error", text: error instanceof Error ? error.message : fallback });
  }

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      const payload = {
        name: state.name.trim(),
        location: state.location.trim() || null,
        kind: state.kind,
      };
      if (state.id) return updateWarehouse(state.id, payload);
      return createWarehouse({ ...payload, lat: null, lng: null });
    },
    onSuccess: async (warehouse, state) => {
      await refresh();
      setForm(null);
      setMessage({
        tone: "ok",
        text: state.id
          ? `Đã lưu "${warehouse.name}".`
          : `Đã thêm "${warehouse.name}". Bấm Ghim để chỉ chỗ kho này trên bản đồ.`,
      });
    },
    onError: (error) => report(error, "Chưa lưu được kho."),
  });

  const savePin = useMutation({
    mutationFn: async ({ id, point }: { id: string; point: LatLng }) =>
      updateWarehouseLocation(id, point.lat, point.lng),
    onSuccess: async (warehouse) => {
      await refresh();
      onStopPinning();
      setMessage({ tone: "ok", text: `Đã ghim "${warehouse.name}".` });
    },
    onError: (error) => report(error, "Chưa ghim được toạ độ."),
  });

  const clearPin = useMutation({
    mutationFn: (id: string) => clearWarehouseLocation(id),
    onSuccess: async (warehouse) => {
      await refresh();
      onStopPinning();
      setMessage({ tone: "ok", text: `Đã xoá toạ độ của "${warehouse.name}".` });
    },
    onError: (error) => report(error, "Chưa xoá được toạ độ."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: async (result) => {
      await refresh();
      setConfirmingDeleteId(null);
      setMessage({ tone: "ok", text: `Đã xoá kho "${result.name}".` });
    },
    onError: (error) => {
      setConfirmingDeleteId(null);
      report(error, "Chưa xoá được kho.");
    },
  });

  return (
    <section className="rounded-md border bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ColorIcon name="warehouse" size={18} tone="green" />
          <span>Quản lý kho</span>
        </div>
        <button
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px"
          onClick={() => {
            setForm(EMPTY_FORM);
            setMessage(null);
          }}
          type="button"
        >
          + Thêm kho
        </button>
      </div>

      {message && (
        <p
          className="mt-3 rounded-md border px-3 py-2 text-xs leading-relaxed"
          role={message.tone === "error" ? "alert" : "status"}
          style={
            message.tone === "error"
              ? {
                  color: "var(--color-critical)",
                  borderColor: "color-mix(in oklch, var(--color-critical) 35%, transparent)",
                  background: "color-mix(in oklch, var(--color-critical) 8%, transparent)",
                }
              : {
                  color: "var(--color-ready)",
                  borderColor: "color-mix(in oklch, var(--color-ready) 35%, transparent)",
                  background: "color-mix(in oklch, var(--color-ready) 8%, transparent)",
                }
          }
        >
          {message.text}
        </p>
      )}

      {/* Đang ghim thì lời hướng dẫn phải đứng ngay đây, cạnh nút Lưu — người dùng
          đang nhìn bản đồ, không ai đi tìm chú thích ở cuối trang. */}
      {pinning && (
        <div className="mt-3 rounded-md border border-[var(--color-accent)] bg-[var(--surface-2)] p-3">
          <p className="text-xs font-semibold">Đang ghim: {pinning.name}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Bấm vào vị trí kho trên bản đồ, xem lại rồi bấm Lưu.
          </p>
          <p className="tabular mt-2 text-sm font-semibold">
            {draftPoint
              ? formatCoordinate(draftPoint)
              : pinning.lat != null && pinning.lng != null
                ? `${formatCoordinate({ lat: pinning.lat, lng: pinning.lng })} (vị trí cũ)`
                : "Chưa chọn điểm nào"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition disabled:opacity-50"
              disabled={!draftPoint || savePin.isPending}
              onClick={() => draftPoint && savePin.mutate({ id: pinning.id, point: draftPoint })}
              type="button"
            >
              {savePin.isPending ? "Đang lưu" : "Lưu vị trí"}
            </button>
            {pinning.lat != null && pinning.lng != null && (
              <button
                className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface)]"
                disabled={clearPin.isPending}
                onClick={() => clearPin.mutate(pinning.id)}
                type="button"
              >
                Xoá toạ độ
              </button>
            )}
            <button
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface)]"
              onClick={onStopPinning}
              type="button"
            >
              Thôi
            </button>
          </div>
        </div>
      )}

      {form && (
        <form
          className="mt-3 space-y-2 rounded-md border bg-[var(--surface-2)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(form);
          }}
        >
          <p className="text-xs font-semibold">{form.id ? "Sửa kho" : "Thêm kho mới"}</p>
          <label className="block text-xs text-[var(--text-muted)]">
            Tên kho
            <input
              autoFocus
              className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Kho thôn Long Châu"
              required
              value={form.name}
            />
          </label>
          <label className="block text-xs text-[var(--text-muted)]">
            Địa điểm
            <input
              className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="Nhà văn hóa thôn Long Châu"
              value={form.location}
            />
          </label>
          <label className="block text-xs text-[var(--text-muted)]">
            Loại kho
            <select
              className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              onChange={(event) =>
                setForm({ ...form, kind: event.target.value as FormState["kind"] })
              }
              value={form.kind}
            >
              <option value="HAMLET">Kho thôn</option>
              <option value="CENTRAL">Kho tổng của xã</option>
            </select>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition disabled:opacity-50"
              disabled={save.isPending}
              type="submit"
            >
              {save.isPending ? "Đang lưu" : "Lưu"}
            </button>
            <button
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface)]"
              onClick={() => setForm(null)}
              type="button"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}

      <ul className="mt-3 space-y-2">
        {warehouses.map((warehouse) => (
          <li className="rounded-md border bg-[var(--surface-2)] px-3 py-2" key={warehouse.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{warehouse.name}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {warehouse.kind === "CENTRAL" ? "Kho tổng · " : ""}
                  {warehouse.location ?? "Chưa có tên địa điểm"}
                </p>
                <p className="tabular text-xs text-[var(--text-muted)]">
                  {warehouse.lat != null && warehouse.lng != null
                    ? formatCoordinate({ lat: warehouse.lat, lng: warehouse.lng })
                    : "Chưa ghim toạ độ"}
                </p>
              </div>
            </div>

            {confirmingDeleteId === warehouse.id ? (
              <div className="mt-2 rounded-md border border-[var(--color-critical)] p-2">
                <p className="text-xs">Xoá hẳn kho này? Thao tác không hoàn lại được.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded-md bg-[var(--color-critical)] px-3 py-1 text-xs font-semibold text-white transition disabled:opacity-50"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(warehouse.id)}
                    type="button"
                  >
                    {remove.isPending ? "Đang xoá" : "Xoá"}
                  </button>
                  <button
                    className="rounded-md border px-3 py-1 text-xs font-medium transition hover:bg-[var(--surface)]"
                    onClick={() => setConfirmingDeleteId(null)}
                    type="button"
                  >
                    Thôi
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button
                  className={ROW_BUTTON_CLASS}
                  onClick={() => {
                    setMessage(null);
                    onStartPinning(warehouse);
                  }}
                  type="button"
                >
                  Ghim
                </button>
                <button
                  className={ROW_BUTTON_CLASS}
                  onClick={() => {
                    setMessage(null);
                    setForm({
                      id: warehouse.id,
                      name: warehouse.name,
                      location: warehouse.location ?? "",
                      kind: warehouse.kind,
                    });
                  }}
                  type="button"
                >
                  Sửa
                </button>
                <button
                  className={`${ROW_BUTTON_CLASS} hover:border-[var(--color-critical)] hover:text-[var(--color-critical)]`}
                  onClick={() => {
                    setMessage(null);
                    setConfirmingDeleteId(warehouse.id);
                  }}
                  type="button"
                >
                  Xoá
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const ROW_BUTTON_CLASS =
  "w-full rounded border bg-[var(--surface)] px-2 py-1 text-xs transition-colors " +
  "hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

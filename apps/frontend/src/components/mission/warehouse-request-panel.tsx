"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { warehouseProgress } from "./warehouse-request-progress";
import {
  acceptWarehouseRequest,
  confirmWarehousePickup,
  prepareWarehouseRequest,
  reportWarehouseRequestDiscrepancy,
  reviewWarehouseRequest,
  type MissionWarehouseRequest,
} from "@/lib/mission-api";

export function WarehouseRequestPanel({
  missionId,
  requests,
  role,
  assignedWarehouseId,
}: {
  missionId: string;
  requests: MissionWarehouseRequest[];
  role?: string;
  assignedWarehouseId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const action = useMutation({
    mutationFn: async ({
      kind,
      request,
    }: {
      kind: "accept" | "prepare" | "discrepancy" | "review" | "pickup";
      request: MissionWarehouseRequest;
    }) => {
      if (kind === "accept") {
        return acceptWarehouseRequest(request.id, notes[request.id]?.trim() || undefined);
      }
      if (kind === "prepare") return prepareWarehouseRequest(request.id);
      if (kind === "pickup") {
        const raw = (quantities[request.id] ?? "").trim();
        // Bỏ trống nghĩa là lấy đủ. Bắt gõ lại đúng con số đã hiện sẵn chỉ tạo
        // thêm một chỗ để gõ nhầm, mà lấy đủ mới là trường hợp thường gặp.
        const receivedQuantity = raw === "" ? request.preparedQuantity : Number(raw);
        if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
          throw new Error("Số đã lấy phải là số nguyên không âm.");
        }
        const note = notes[request.id]?.trim();
        if (receivedQuantity < request.preparedQuantity && !note) {
          throw new Error(
            `Thiếu ${request.preparedQuantity - receivedQuantity} so với số đã soạn — phải ghi rõ lý do.`,
          );
        }
        return confirmWarehousePickup(request.id, { receivedQuantity, note: note || undefined });
      }
      if (kind === "discrepancy") {
        const note = notes[request.id]?.trim();
        if (!note || note.length < 3) throw new Error("Cần ghi rõ chênh lệch (ít nhất 3 ký tự).");
        return reportWarehouseRequestDiscrepancy(request.id, note);
      }
      const requestedQuantity = Number(quantities[request.id] ?? request.requestedQuantity);
      if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
        throw new Error("Số lượng duyệt phải là số nguyên dương.");
      }
      return reviewWarehouseRequest(request.id, {
        requestedQuantity,
        adminNote: notes[request.id]?.trim() || undefined,
      });
    },
    onMutate: () => setActionError(null),
    onSuccess: (_, variables) => {
      setNotes((current) => ({ ...current, [variables.request.id]: "" }));
      setQuantities((current) => ({ ...current, [variables.request.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : "Không cập nhật được yêu cầu vật tư"),
  });

  if (requests.length === 0) return null;
  const visible =
    role === "WAREHOUSE" && assignedWarehouseId
      ? requests.filter((request) => request.warehouseId === assignedWarehouseId)
      : requests;
  const preparedCount = requests.filter((request) => request.status === "PREPARED").length;
  const tienDoTheoKho = warehouseProgress(requests);

  return (
    <CollapsiblePanel
      headingId="warehouse-request-title"
      title="Chuẩn bị vật tư theo SKU"
      subtitle={
        <>
          {preparedCount}/{requests.length} vật tư đã xuất. Mỗi dòng chỉ được xuất một lần.
          {/* Con số gộp không nói được kho nào còn nợ. Điều phối đang chờ hàng chỉ
              cần đúng một thứ: gọi cho ai. */}
          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {tienDoTheoKho.map((kho) => (
              <span
                key={kho.warehouseId}
                className={kho.done ? "text-[var(--color-success)]" : "font-semibold"}
              >
                {kho.done ? "✓" : "•"} {kho.name} {kho.prepared}/{kho.total}
              </span>
            ))}
          </span>
        </>
      }
      badge={
        <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
          {preparedCount === requests.length ? "Đã hoàn tất" : "Đang chuẩn bị"}
        </span>
      }
    >
      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-[var(--text-muted)]">
          Kho đang đăng nhập không có vật tư được phân bổ trong phương án này.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {visible.map((request) => {
            const isOwnWarehouse =
              role === "WAREHOUSE" && request.warehouseId === assignedWarehouseId;
            const busy = action.isPending && action.variables?.request.id === request.id;
            return (
              <article key={request.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{request.itemName}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {request.warehouse?.name ?? request.warehouseId}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold">
                      {request.status === "PREPARED"
                        ? request.preparedQuantity
                        : request.requestedQuantity}{" "}
                      {request.unit}
                    </p>
                    <p className="mt-1 text-xs font-semibold">
                      {requestStatusLabel(request.status)}
                    </p>
                  </div>
                </div>

                {request.warehouseNote ? (
                  <p className="mt-3 rounded-md border border-amber-300/60 bg-amber-50/60 p-2.5 text-sm dark:bg-amber-950/20">
                    Kho báo: {request.warehouseNote}
                  </p>
                ) : null}
                {request.adminNote ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Điều phối ghi chú: {request.adminNote}
                  </p>
                ) : null}

                {isOwnWarehouse && request.status !== "PREPARED" ? (
                  <div className="mt-3 space-y-2">
                    <label
                      className="block text-xs font-medium"
                      htmlFor={`warehouse-note-${request.id}`}
                    >
                      Ghi chú hoặc chênh lệch thực tế
                    </label>
                    <textarea
                      id={`warehouse-note-${request.id}`}
                      value={notes[request.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                      maxLength={1_000}
                      rows={2}
                      className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      {request.status === "PENDING" ? (
                        <ActionButton
                          label="Tiếp nhận yêu cầu"
                          disabled={busy}
                          onClick={() => action.mutate({ kind: "accept", request })}
                        />
                      ) : (
                        <ActionButton
                          label="Xác nhận xuất vật tư"
                          disabled={busy}
                          onClick={() => action.mutate({ kind: "prepare", request })}
                        />
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => action.mutate({ kind: "discrepancy", request })}
                        className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                      >
                        Báo thiếu / sai
                      </button>
                    </div>
                  </div>
                ) : null}

                {request.status === "PICKED_UP" ? (
                  <p
                    className={
                      (request.pickedUpQuantity ?? 0) < request.preparedQuantity
                        ? "mt-3 rounded-md border border-amber-300/60 bg-amber-50/60 p-2.5 text-sm dark:bg-amber-950/20"
                        : "mt-3 text-sm text-[var(--text-muted)]"
                    }
                  >
                    Đã ký nhận {request.pickedUpQuantity ?? 0}/{request.preparedQuantity}{" "}
                    {request.unit}
                    {(request.pickedUpQuantity ?? 0) < request.preparedQuantity
                      ? ` — thiếu ${request.preparedQuantity - (request.pickedUpQuantity ?? 0)}. Lý do: ${request.pickupNote ?? "không ghi"}`
                      : " (đủ)"}
                  </p>
                ) : null}

                {isOwnWarehouse && request.status === "PREPARED" ? (
                  <div className="mt-3 space-y-2 rounded-md border p-3">
                    <p className="text-xs font-semibold">Người đi lấy ký nhận</p>
                    <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                      <div>
                        <label
                          className="block text-xs font-medium"
                          htmlFor={`pickup-quantity-${request.id}`}
                        >
                          Số thực lấy
                        </label>
                        <input
                          className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                          id={`pickup-quantity-${request.id}`}
                          max={request.preparedQuantity}
                          min={0}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          placeholder={String(request.preparedQuantity)}
                          type="number"
                          value={quantities[request.id] ?? ""}
                        />
                      </div>
                      <div>
                        <label
                          className="block text-xs font-medium"
                          htmlFor={`pickup-note-${request.id}`}
                        >
                          Thiếu thì ghi rõ vì sao
                        </label>
                        <input
                          className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                          id={`pickup-note-${request.id}`}
                          maxLength={1_000}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          placeholder="Kho hết hàng / xe không chở hết / lô bị ướt…"
                          value={notes[request.id] ?? ""}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      Để trống số thực lấy nghĩa là lấy đủ {request.preparedQuantity} {request.unit}
                      .
                    </p>
                    <ActionButton
                      disabled={busy}
                      label="Ký nhận đã lấy hàng"
                      onClick={() => action.mutate({ kind: "pickup", request })}
                    />
                  </div>
                ) : null}

                {role === "ADMIN" && request.status !== "PREPARED" && request.warehouseNote ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                    <label className="sr-only" htmlFor={`request-quantity-${request.id}`}>
                      Số lượng duyệt lại
                    </label>
                    <input
                      id={`request-quantity-${request.id}`}
                      type="number"
                      min={1}
                      max={request.requestedQuantity}
                      value={quantities[request.id] ?? request.requestedQuantity}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      className="rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                    />
                    <label className="sr-only" htmlFor={`admin-note-${request.id}`}>
                      Ghi chú điều phối
                    </label>
                    <input
                      id={`admin-note-${request.id}`}
                      value={notes[request.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                      placeholder="Ghi chú cho kho"
                      maxLength={1_000}
                      className="rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                    />
                    <ActionButton
                      label="Duyệt lại"
                      disabled={busy}
                      onClick={() => action.mutate({ kind: "review", request })}
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {actionError ? (
        <p role="alert" className="mt-3 text-sm text-[var(--color-critical)]">
          {actionError}
        </p>
      ) : null}
    </CollapsiblePanel>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent-fg)] disabled:opacity-60"
    >
      {disabled ? "Đang xử lý…" : label}
    </button>
  );
}

function requestStatusLabel(status: MissionWarehouseRequest["status"]): string {
  if (status === "PENDING") return "Chờ kho tiếp nhận";
  if (status === "ACCEPTED") return "Kho đã tiếp nhận";
  // "Đã xuất" và "đã có người cầm đi" là hai việc khác nhau, và khoảng giữa hai
  // việc ấy là nơi hàng bị thiếu mà không ai ghi lại.
  if (status === "PREPARED") return "Đã soạn — chờ người lấy";
  return "Đã ký nhận";
}

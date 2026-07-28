"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  acceptWarehouseRequest,
  listWarehouseRequests,
  prepareWarehouseRequest,
  reportWarehouseDiscrepancy,
  type WarehouseMissionRequest,
} from "@/lib/mission-api";

export function WarehouseRequestInbox() {
  const client = useQueryClient();
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["warehouse-requests"],
    queryFn: listWarehouseRequests,
    refetchInterval: 5000,
  });
  const action = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: () => client.invalidateQueries({ queryKey: ["warehouse-requests"] }),
  });

  const requests = query.data ?? [];
  return (
    <section className="app-panel p-5">
      <h2 className="font-semibold">Yêu cầu vật tư của kho</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Chỉ hiển thị phần vật tư được giao cho kho đang đăng nhập.
      </p>
      {query.isLoading ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">Đang tải yêu cầu…</p>
      ) : requests.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">Chưa có yêu cầu nào.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {requests.map((request) => (
            <WarehouseRequestCard
              key={request.id}
              request={request}
              note={noteById[request.id] ?? ""}
              onNote={(note) => setNoteById((current) => ({ ...current, [request.id]: note }))}
              busy={action.isPending}
              onAccept={() => action.mutate(() => acceptWarehouseRequest(request.id, noteById[request.id]))}
              onPrepare={() => action.mutate(() => prepareWarehouseRequest(request.id, noteById[request.id]))}
              onDiscrepancy={() =>
                action.mutate(() => reportWarehouseDiscrepancy(request.id, noteById[request.id] ?? ""))
              }
            />
          ))}
        </ul>
      )}
      {action.error && (
        <p className="mt-3 text-sm text-[var(--color-critical)]">
          {action.error instanceof Error ? action.error.message : "Chưa thể cập nhật yêu cầu."}
        </p>
      )}
    </section>
  );
}

function WarehouseRequestCard({
  request,
  note,
  onNote,
  busy,
  onAccept,
  onPrepare,
  onDiscrepancy,
}: {
  request: WarehouseMissionRequest;
  note: string;
  onNote: (value: string) => void;
  busy: boolean;
  onAccept: () => void;
  onPrepare: () => void;
  onDiscrepancy: () => void;
}) {
  return (
    <li className="rounded-md border bg-[var(--surface-2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{request.itemName}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {request.requestedQuantity} {request.unit} · nguồn báo cáo: {request.mission.warehouse.name}
          </p>
          {request.mission.location && (
            <p className="mt-1 text-sm">Vị trí cụ thể: {request.mission.location}</p>
          )}
        </div>
        <span className="rounded-md border px-2.5 py-1 text-xs font-semibold">
          {request.status === "PENDING"
            ? "Chờ tiếp nhận"
            : request.status === "ACCEPTED"
              ? "Đang chuẩn bị"
              : "Đã chuẩn bị xong"}
        </span>
      </div>
      {request.status !== "PREPARED" && (
        <>
          <textarea
            className="mt-3 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
            maxLength={1000}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Ghi chú kiểm đếm hoặc nội dung cần admin kiểm tra"
            rows={2}
            value={note}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {request.status === "PENDING" && (
              <button className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-50" disabled={busy} onClick={onAccept} type="button">
                Chấp nhận yêu cầu
              </button>
            )}
            {request.status === "ACCEPTED" && (
              <button className="rounded-md bg-[var(--color-ready)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={onPrepare} type="button">
                Đã chuẩn bị xong
              </button>
            )}
            <button className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || !note.trim()} onClick={onDiscrepancy} type="button">
              Báo thiếu / cần chỉnh sửa
            </button>
          </div>
        </>
      )}
      {request.warehouseNote && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">Ghi chú kho: {request.warehouseNote}</p>
      )}
    </li>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { ApiError } from "@/lib/api";
import { getSimulation, listFieldUpdates, type MissionFieldUpdate } from "@/lib/mission-api";

const INTENT_LABEL: Record<string, string> = {
  ARRIVED: "Đã đến điểm",
  ACCESS_BLOCKED: "Không tiếp cận được",
  ROUTE_HAZARD: "Tuyến/đường có nguy cơ",
  AFFECTED_PEOPLE_CHANGED: "Số người thay đổi",
  VULNERABLE_GROUP_REPORTED: "Có nhóm cần hỗ trợ ưu tiên",
  MORE_SUPPLIES_NEEDED: "Cần bổ sung vật tư",
  SUPPLIES_RECEIVED: "Đã nhận vật tư",
  SUPPLIES_DELIVERED: "Đã giao vật tư",
  CANNOT_CONTINUE: "Chưa thể tiếp tục",
  SITUATION_STABLE: "Tình hình ổn định",
  OTHER: "Cập nhật khác",
};

type PreliminarySimulation = NonNullable<
  MissionFieldUpdate["intentProvenance"]
>["preliminarySimulation"];

export function FieldUpdateTimeline({
  missionId,
  focusUpdateId,
}: {
  missionId: string;
  focusUpdateId?: string | null;
}) {
  const focusedItemRef = useRef<HTMLLIElement | null>(null);
  const focusedOnceRef = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["mission", missionId, "field-updates"],
    queryFn: () => listFieldUpdates(missionId),
    refetchInterval: 10_000,
  });
  useEffect(() => {
    if (!focusUpdateId || focusedOnceRef.current === focusUpdateId || !focusedItemRef.current)
      return;
    focusedOnceRef.current = focusUpdateId;
    focusedItemRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    focusedItemRef.current.focus({ preventScroll: true });
  }, [focusUpdateId, query.data]);

  // Không còn khối riêng: nằm gọn trong khối tham mưu, vì bằng chứng hiện trường
  // chính là nguồn làm bản tham mưu thay đổi — để tách ra thì phải cuộn qua lại
  // giữa hai khối mới đối chiếu được.
  return (
    <section aria-labelledby="field-update-timeline-title">
      <h4
        id="field-update-timeline-title"
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <ColorIcon name="mission" size={17} tone="blue" />
        Bằng chứng từ Lực lượng hiện trường
      </h4>
      <div className="mt-2">
        {query.isLoading && (
          <p className="text-sm text-[var(--text-muted)]">Đang tải cập nhật hiện trường…</p>
        )}
        {query.error && (
          <p className="mt-4 text-sm text-[var(--color-critical)]">
            {query.error instanceof ApiError
              ? query.error.message
              : "Không tải được cập nhật hiện trường."}
          </p>
        )}
        {!query.isLoading && !query.error && query.data?.length === 0 && (
          <p className="mt-4 rounded-md border border-dashed p-3 text-sm text-[var(--text-muted)]">
            Chưa có cập nhật được Lực lượng hiện trường xác nhận.
          </p>
        )}
        <ol className="space-y-3" aria-live="polite">
          {query.data?.map((update) => (
            <FieldUpdateItem
              key={update.id}
              update={update}
              focusRef={update.id === focusUpdateId ? focusedItemRef : undefined}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function FieldUpdateItem({
  update,
  focusRef,
}: {
  update: MissionFieldUpdate;
  focusRef?: RefObject<HTMLLIElement | null>;
}) {
  const intent = update.structuredIntent;
  const simulation = update.intentProvenance?.preliminarySimulation;
  const simulationQuery = useQuery({
    queryKey: ["mission", update.missionId, "simulation", simulation?.snapshotId],
    queryFn: () => getSimulation(update.missionId, simulation?.snapshotId as string),
    enabled: simulation?.status === "CREATED" && Boolean(simulation.snapshotId),
  });
  return (
    <li
      ref={focusRef}
      tabIndex={focusRef ? -1 : undefined}
      className={`rounded-md border bg-[var(--surface)] p-3${focusRef ? " ring-2 ring-[var(--color-accent)]" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
        <span>{formatTime(update.clientCapturedAt ?? update.createdAt)}</span>
        <span aria-hidden="true">•</span>
        <span>{update.inputMode === "VOICE_TRANSCRIPT" ? "Voice đã xác nhận" : "Nhập tay"}</span>
        {update.actor?.fullName && (
          <>
            <span aria-hidden="true">•</span>
            <span>{update.actor.fullName}</span>
          </>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{update.confirmedText}</p>
      {intent ? (
        <div className="mt-3 rounded-md bg-[var(--surface-2)] p-2.5 text-sm">
          <p className="font-medium">AI ghi nhận: {INTENT_LABEL[intent.kind] ?? intent.kind}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Độ tin cậy {Math.round(intent.confidence * 100)}% · cần ADMIN xác minh
          </p>
          {intent.unresolvedReferences.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-attention)]">
              Chưa xác minh: {intent.unresolvedReferences.join("; ")}
            </p>
          )}
          <SimulationStatus simulation={simulation} simulationSnapshot={simulationQuery.data} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          AI chưa gắn nhãn; nội dung gốc vẫn đã được lưu.
        </p>
      )}
    </li>
  );
}

function SimulationStatus({
  simulation,
  simulationSnapshot,
}: {
  simulation: PreliminarySimulation | undefined;
  simulationSnapshot: Awaited<ReturnType<typeof getSimulation>> | undefined;
}) {
  if (!simulation || simulation.status === "NOT_APPLICABLE") return null;
  if (simulation.status === "CREATED") {
    const metrics = simulationSnapshot?.input?.simulation?.delta.metrics ?? [];
    return (
      <div className="mt-2 text-xs text-[var(--color-ready)]">
        <p>Đã thử giả định sơ bộ trên một bản ghi tách biệt; phương án thực tế chưa đổi.</p>
        {metrics.length > 0 && (
          <p className="mt-1 text-[var(--text-muted)]">
            Delta:{" "}
            {metrics
              .map((metric) => `${metric.key} ${formatDelta(metric.change, metric.unit)}`)
              .join(" · ")}
          </p>
        )}
      </div>
    );
  }
  if (simulation.status === "BASELINE_MISSING") {
    return (
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Chưa có baseline để tạo What-if sơ bộ.
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-[var(--color-attention)]">
      Chưa tạo được What-if sơ bộ; cần ADMIN xem evidence gốc.
    </p>
  );
}

function formatDelta(change: number | null, unit: string) {
  if (change == null) return "chưa xác định";
  return `${change > 0 ? "+" : ""}${change} ${unit}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không rõ thời gian"
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

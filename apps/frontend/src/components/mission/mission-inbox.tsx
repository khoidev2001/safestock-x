"use client";

import { useMemo, useState } from "react";
import type { Mission } from "@/lib/mission-api";
import {
  filterMissionInbox,
  missionNeedsAction,
  type MissionInboxView,
} from "@/lib/mission-inbox-state";
import { FIELD_FORCE_ROLE_LABEL } from "@safestock/shared-types";

const INCIDENT_LABELS: Record<string, string> = {
  FLOOD: "Lũ lụt",
  STORM: "Bão",
  LANDSLIDE: "Sạt lở",
  FIRE: "Cháy",
  ISOLATION: "Cô lập",
  OTHER: "Khác",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_RESCUE: `Chờ ${FIELD_FORCE_ROLE_LABEL}`,
  RESCUE_CONFIRMED: `${FIELD_FORCE_ROLE_LABEL} đã nhận`,
  PENDING_WAREHOUSE: "Kho đang chuẩn bị",
  READY: "Sẵn sàng giao",
  COMPLETED: "Đã hoàn tất",
  REJECTED: `${FIELD_FORCE_ROLE_LABEL} từ chối`,
  DEFERRED: "Tạm hoãn",
  CANCELLED: "Đã hủy",
};

interface MissionInboxProps {
  missions: Mission[];
  selectedMissionId: string | null;
  role?: string;
  warehouseId?: string | null;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelect: (missionId: string) => void;
}

export function MissionInbox({
  missions,
  selectedMissionId,
  role,
  warehouseId,
  isLoading,
  error,
  onRetry,
  onSelect,
}: MissionInboxProps) {
  const [view, setView] = useState<MissionInboxView>("active");
  const [search, setSearch] = useState("");

  const counts = useMemo(
    () => ({
      active: filterMissionInbox(missions, {
        view: "active",
        search: "",
        role,
        warehouseId,
      }).length,
      closed: filterMissionInbox(missions, {
        view: "closed",
        search: "",
        role,
        warehouseId,
      }).length,
    }),
    [missions, role, warehouseId],
  );

  const visibleMissions = useMemo(
    () => filterMissionInbox(missions, { view, search, role, warehouseId }),
    [missions, role, search, view, warehouseId],
  );

  return (
    <section className="app-panel p-4 md:p-5" aria-labelledby="mission-inbox-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="mission-inbox-title" className="text-base font-semibold">
              Hộp nhiệm vụ
            </h2>
            {!isLoading && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
                {missions.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Việc cần bạn xử lý được đưa lên trước. Chọn một nhiệm vụ để xem chi tiết.
          </p>
        </div>

        <div className="w-full lg:max-w-sm">
          <label htmlFor="mission-search" className="sr-only">
            Tìm nhiệm vụ
          </label>
          <input
            id="mission-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo địa điểm hoặc tình huống"
            className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b" role="tablist" aria-label="Trạng thái nhiệm vụ">
        <InboxTab
          active={view === "active"}
          count={counts.active}
          id="mission-inbox-tab-active"
          label="Đang xử lý"
          onClick={() => setView("active")}
        />
        <InboxTab
          active={view === "closed"}
          count={counts.closed}
          id="mission-inbox-tab-closed"
          label="Đã kết thúc"
          onClick={() => setView("closed")}
        />
      </div>

      <div
        id="mission-inbox-panel"
        role="tabpanel"
        aria-labelledby={`mission-inbox-tab-${view}`}
        className="mt-4"
      >
        {isLoading ? (
          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Đang tải nhiệm vụ"
            aria-busy="true"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-lg border bg-[var(--surface-2)]"
              />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border border-[var(--color-critical)]/30 bg-[var(--color-critical)]/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm">
              Chưa tải được danh sách nhiệm vụ. Kết nối có thể đang gián đoạn.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
            >
              Thử lại
            </button>
          </div>
        ) : visibleMissions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">
              {search ? "Không tìm thấy nhiệm vụ phù hợp" : "Chưa có nhiệm vụ trong mục này"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {search
                ? "Thử tên địa điểm hoặc loại tình huống khác."
                : view === "active"
                  ? "Nhiệm vụ mới sẽ xuất hiện tại đây."
                  : "Nhiệm vụ hoàn tất hoặc đã hủy sẽ được lưu tại đây."}
            </p>
          </div>
        ) : (
          <div className="grid max-h-[380px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {visibleMissions.map((mission) => {
              const selected = mission.id === selectedMissionId;
              const needsAction = missionNeedsAction(mission, role, warehouseId);
              return (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => onSelect(mission.id)}
                  aria-current={selected ? "true" : undefined}
                  className={`min-h-32 rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 ${
                    selected
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                      : "bg-[var(--surface)] hover:border-[var(--text-muted)]/60 hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {INCIDENT_LABELS[mission.incidentType] ?? mission.incidentType}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-sm text-[var(--text-muted)]">
                        {mission.location || mission.hamletName || "Chưa ghi địa điểm"}
                      </p>
                    </div>
                    {needsAction && (
                      <span className="shrink-0 rounded-full bg-[var(--color-accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-accent-fg)]">
                        Cần xử lý
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3 text-xs">
                    <div>
                      <p className="font-medium">
                        {STATUS_LABELS[mission.status] ?? mission.status}
                      </p>
                      <p className="mt-1 text-[var(--text-muted)]">
                        {mission.affectedPeople.toLocaleString("vi-VN")} người
                      </p>
                    </div>
                    <time
                      dateTime={mission.createdAt}
                      className="text-right text-[var(--text-muted)]"
                    >
                      {formatMissionTime(mission.createdAt)}
                    </time>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function InboxTab({
  active,
  count,
  id,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  id: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls="mission-inbox-panel"
      aria-selected={active}
      onClick={onClick}
      className={`border-b-2 px-1 pb-2 text-sm font-semibold transition ${
        active
          ? "border-[var(--color-accent)] text-[var(--text)]"
          : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {label} <span className="ml-1 tabular-nums">{count}</span>
    </button>
  );
}

function formatMissionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không rõ thời gian";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

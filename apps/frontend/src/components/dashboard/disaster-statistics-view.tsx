"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { incidentTypeLabel } from "@safestock/shared-types";
import { ColorIcon, type ColorIconName } from "@/components/shared/color-icon";
import { Pagination, usePagination } from "@/components/shared/pagination";
import {
  getDisasterStatistics,
  type DisasterCategoryTotals,
  type DisasterQuantityTotals,
  type DisasterStatisticsEvent,
  type DisasterStatisticsMission,
} from "@/lib/disaster-statistics-api";

/**
 * Thống kê sau thiên tai.
 *
 * ĐỢT ở đây là một cơn bão, một trận lũ — "bão số 5", "bão số 6" — chứ không phải
 * một nhiệm vụ. Một cơn bão đi qua xã sinh ra hàng chục nhiệm vụ rải suốt nhiều
 * ngày, và câu hỏi người ta mang tới bảng này luôn là "cơn bão vừa rồi xã tiêu
 * hết bao nhiêu". Máy chủ gộp nhiệm vụ thành đợt theo nhịp xuất hiện của chúng;
 * mở một đợt ra thì thấy từng nhiệm vụ bên trong.
 *
 * Bảng này cố ý KHÔNG gộp "đã xuất kho" với "đã ký nhận" thành một con số duy
 * nhất, và cố ý không gọi phần chênh lệch giữa hai con số đó là thất thoát: kho
 * xuất 100 mà đội ký nhận 80 có thể chỉ vì xe không chở hết. Gộp lại là xoá mất
 * đúng chỗ người điều phối cần nhìn để biết phải gọi cho ai.
 */

/** Nhịp làm tươi. 15 giây đủ để bảng bám theo thao tác đang diễn ra ở kho. */
const REFRESH_INTERVAL_MS = 15_000;

export function DisasterStatisticsView() {
  const statisticsQuery = useQuery({
    queryKey: ["disaster-statistics"],
    queryFn: () => getDisasterStatistics(),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  if (statisticsQuery.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </div>
    );
  }

  if (statisticsQuery.isError) {
    return (
      <section className="rounded-md border border-red-300 bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-critical)]">
          <ColorIcon name="warning" size={20} tone="red" />
          Không tải được thống kê sau thiên tai
        </div>
        <button
          type="button"
          className="mt-3 rounded-md border px-3 py-1.5 text-sm transition hover:bg-[var(--surface-2)]"
          onClick={() => void statisticsQuery.refetch()}
        >
          Tải lại
        </button>
      </section>
    );
  }

  const data = statisticsQuery.data;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <SummaryCard
        totals={data.totals}
        eventCount={data.events.length}
        missionCount={data.events.reduce((sum, event) => sum + event.missionCount, 0)}
        generatedAt={data.generatedAt}
        isRefreshing={statisticsQuery.isFetching}
        onRefresh={() => void statisticsQuery.refetch()}
      />
      <EventList events={data.events} episodeGapDays={data.episodeGapDays} />
    </div>
  );
}

function SummaryCard({
  totals,
  eventCount,
  missionCount,
  generatedAt,
  isRefreshing,
  onRefresh,
}: {
  totals: DisasterQuantityTotals;
  eventCount: number;
  /** Tổng nhiệm vụ nằm trong ngần ấy đợt — nói rõ đợt KHÁC nhiệm vụ. */
  missionCount: number;
  generatedAt: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
            <ColorIcon name="insights" size={20} tone="green" />
            <span>
              Tổng hợp {eventCount} đợt thiên tai · {formatNumber(missionCount)} nhiệm vụ
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Cộng dồn toàn bộ các đợt đã phát hành phương án. Một đợt là một cơn bão hay một trận lũ,
            gồm tất cả nhiệm vụ phát sinh trong đợt đó. Phương án còn ở dạng nháp chưa xuất hàng nên
            không được tính vào đây.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">Số liệu chốt lúc</p>
          <p className="text-sm font-semibold tabular-nums">{formatDateTime(generatedAt)}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
          >
            <ColorIcon
              className={isRefreshing ? "animate-spin" : undefined}
              name="refresh"
              size={14}
              tone="blue"
            />
            {isRefreshing ? "Đang cập nhật…" : "Cập nhật ngay"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon="packageCheck"
          tone="green"
          label="Đã xuất kho"
          value={totals.issued}
          hint="Tồn kho đã bị trừ thật ở bước này"
        />
        <MetricTile
          icon="rescueTeam"
          tone="blue"
          label="Đội đã ký nhận"
          value={totals.pickedUp}
          hint="Số lượng thực nhận khi tới lấy hàng"
        />
        <MetricTile
          icon="warning"
          tone="amber"
          label="Chênh lệch ký nhận"
          value={totals.pickupGap}
          hint="Đã xuất nhưng chưa ký nhận hết — chưa chắc là mất"
        />
        <MetricTile
          icon="blocked"
          tone="red"
          label="Thất thoát"
          value={totals.lost + totals.returnedDamaged}
          hint={`Mất ${formatNumber(totals.lost)} · hỏng khi trả ${formatNumber(totals.returnedDamaged)}`}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <MetricTile
          icon="loan"
          tone="amber"
          label="Đã cho mượn"
          value={totals.loanedOut}
          hint="Vật tư tái sử dụng đưa ra hiện trường"
          compact
        />
        <MetricTile
          icon="transfer"
          tone="green"
          label="Đã hoàn trả"
          value={totals.returnedOk}
          hint="Thu về còn dùng được"
          compact
        />
        <MetricTile
          icon="time"
          tone="orange"
          label="Chưa thu hồi"
          value={totals.stillOnLoan}
          hint="Vẫn đang ở ngoài, chưa ghi nhận trả"
          compact
        />
      </div>

      {totals.loanedOut === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
          Chưa có phiếu mượn nào được gắn vào đợt thiên tai, nên phần hoàn trả và thất thoát đang là
          0. Số này chỉ lên khi phiếu mượn được lập kèm nhiệm vụ tương ứng — hệ thống không suy đoán
          từ các phiếu mượn rời.
        </p>
      ) : null}
    </section>
  );
}

function MetricTile({
  icon,
  tone,
  label,
  value,
  hint,
  compact = false,
}: {
  icon: ColorIconName;
  tone: "green" | "blue" | "amber" | "orange" | "red";
  label: string;
  value: number;
  hint: string;
  compact?: boolean;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        background: `color-mix(in oklch, var(--color-${toneVariable(tone)}) 6%, var(--surface))`,
        borderColor: `color-mix(in oklch, var(--color-${toneVariable(tone)}) 28%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <ColorIcon name={icon} size={compact ? 16 : 18} tone={tone} />
        <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
      </div>
      <p className={`mt-1 font-bold tabular-nums ${compact ? "text-lg" : "text-2xl"}`}>
        {formatNumber(value)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

/** Ánh xạ tone của ColorIcon sang biến màu trạng thái tương ứng trong globals.css. */
function toneVariable(tone: "green" | "blue" | "amber" | "orange" | "red"): string {
  if (tone === "green") return "ready";
  if (tone === "red") return "critical";
  if (tone === "amber" || tone === "orange") return "attention";
  return "accent";
}

function EventList({
  events,
  episodeGapDays,
}: {
  events: DisasterStatisticsEvent[];
  episodeGapDays: number;
}) {
  const pagination = usePagination(events);

  if (events.length === 0) {
    return (
      <section className="rounded-md border bg-[var(--surface)] p-5">
        <h3 className="text-sm font-semibold">Từng đợt thiên tai</h3>
        <p className="mt-4 rounded-md border border-dashed bg-[var(--surface-2)] p-6 text-center text-sm text-[var(--text-muted)]">
          Chưa có đợt thiên tai nào được phát hành phương án.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold">Từng đợt thiên tai</h3>
      {/* Nói thẳng luật gộp. Người đọc thấy hai nhiệm vụ cách nhau mười ngày nằm ở
          hai đợt khác nhau thì câu hỏi đầu tiên là "sao lại tách ra" — trả lời sẵn
          ở đây rẻ hơn nhiều so với để họ đi hỏi. */}
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Mỗi đợt là một cơn bão hay một trận lũ: các nhiệm vụ nối tiếp nhau được gộp làm một đợt, và
        đợt khép lại khi qua {episodeGapDays} ngày không có nhiệm vụ mới. Mở một đợt để xem chi tiết
        theo nhóm hàng và từng nhiệm vụ trong đợt.
      </p>
      <ul className="mt-4 space-y-3">
        {pagination.pageItems.map((event) => (
          <EventCard key={event.episodeId} event={event} episodeGapDays={episodeGapDays} />
        ))}
      </ul>
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={events.length}
        totalPages={pagination.totalPages}
      />
    </section>
  );
}

function EventCard({
  event,
  episodeGapDays,
}: {
  event: DisasterStatisticsEvent;
  episodeGapDays: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const places = episodePlaces(event);

  return (
    <li className="rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)]"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {/* Tên đợt là KHOẢNG NGÀY + loại tình huống. Hệ thống không có chỗ nào
                ghi "bão số 5", và bịa ra một cái tên không dữ liệu nào chống lưng
                thì tệ hơn hẳn việc gọi đúng cái đang biết chắc. */}
            <span>
              Đợt {formatDateRange(event.startedAt, event.lastMissionAt)} ·{" "}
              {describeIncidentTypes(event.incidentTypes)}
            </span>
            {event.ongoing ? (
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  background: "color-mix(in oklch, var(--color-attention) 14%, transparent)",
                  color: "var(--color-attention)",
                }}
              >
                Đang diễn ra
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {formatNumber(event.missionCount)} nhiệm vụ · {places} ·{" "}
            {formatNumber(event.peakAffectedPeople)} người ảnh hưởng (lúc cao nhất) ·{" "}
            {event.warehouses.length} kho tham gia
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
            <TimeFact label="Bắt đầu" value={event.startedAt} />
            <TimeFact label="Nhiệm vụ gần nhất" value={event.lastMissionAt} />
            <TimeFact label="Cập nhật gần nhất" value={event.lastActivityAt} />
          </dl>
          {event.ongoing ? (
            <p className="mt-1 text-xs text-[var(--color-attention)]">
              Số liệu còn đổi: nhiệm vụ mới trong {episodeGapDays} ngày tới vẫn được tính vào đợt
              này.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">Đã xuất kho</p>
            <p className="text-lg font-bold tabular-nums">{formatNumber(event.totals.issued)}</p>
          </div>
          <ColorIcon name={expanded ? "shrink" : "expand"} size={18} tone="blue" />
        </div>
      </button>

      {expanded ? (
        <>
          <EventBreakdown event={event} />
          <EpisodeMissions missions={event.missions} />
        </>
      ) : null}
    </li>
  );
}

/**
 * Danh sách nhiệm vụ trong đợt.
 *
 * Bảng phía trên trả lời "cả đợt tiêu hết bao nhiêu"; khối này trả lời câu hỏi
 * ngay sau đó — "tiêu vào những việc nào". Không có nó thì đợt là một con số
 * không kiểm chứng được, và người đối soát mất đường lần ngược về từng nhiệm vụ.
 */
function EpisodeMissions({ missions }: { missions: DisasterStatisticsMission[] }) {
  return (
    <div className="border-t p-4">
      <h4 className="text-xs font-semibold text-[var(--text-muted)]">
        {formatNumber(missions.length)} nhiệm vụ trong đợt
      </h4>
      <ul className="mt-2 space-y-2">
        {missions.map((mission) => (
          <li
            key={mission.missionId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-[var(--surface-2)] px-3 py-2 text-xs"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Nhiệm vụ số {mission.missionNo}</span>
              <StatusBadge status={mission.status} outcome={mission.deliveryOutcome} />
              <span className="text-[var(--text-muted)]">
                {mission.hamletName ?? mission.location ?? "Chưa xác định địa điểm"} ·{" "}
                {formatNumber(mission.affectedPeople)} người · {formatDateTime(mission.startedAt)}
              </span>
            </span>
            <span className="tabular-nums text-[var(--text-muted)]">
              Đã xuất{" "}
              <span className="font-semibold text-[var(--text)]">
                {formatNumber(mission.totals.issued)}
              </span>{" "}
              · đã ký nhận {formatNumber(mission.totals.pickedUp)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Các thôn có nhiệm vụ trong đợt.
 *
 * Liệt kê tối đa ba tên rồi gộp phần còn lại: một cơn bão lớn chạm cả chục thôn,
 * và một dòng phụ dài ba hàng thì không ai đọc.
 */
function episodePlaces(event: DisasterStatisticsEvent): string {
  const names = [
    ...new Set(
      event.missions
        .map((mission) => mission.hamletName ?? mission.location)
        .filter((name): name is string => Boolean(name?.trim())),
    ),
  ];
  if (names.length === 0) return "Chưa xác định địa điểm";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} thôn`;
}

/** Loại tình huống chính của đợt; còn loại khác thì nói có bao nhiêu loại nữa. */
function describeIncidentTypes(incidentTypes: string[]): string {
  if (incidentTypes.length === 0) return "Chưa rõ tình huống";
  const primary = incidentTypeLabel(incidentTypes[0]);
  return incidentTypes.length === 1 ? primary : `${primary} +${incidentTypes.length - 1} loại`;
}

/**
 * Khoảng ngày của đợt, dạng ngắn: "05/09 – 18/09/2026".
 *
 * Đây là DANH TÍNH của đợt trên màn hình, nên nó phải đọc lướt là nhận ra, không
 * phải một mốc thời gian đầy đủ tới giây như các cột bên dưới. Gói gọn trong một
 * ngày thì chỉ hiện một ngày.
 */
function formatDateRange(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const startLabel = start.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  const endLabel = end.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return startLabel === endLabel.slice(0, 5) ? endLabel : `${startLabel} – ${endLabel}`;
}

function EventBreakdown({ event }: { event: DisasterStatisticsEvent }) {
  if (event.categories.length === 0) {
    return (
      <div className="border-t p-4">
        <p className="rounded-md border border-dashed bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--text-muted)]">
          Đợt này chưa có yêu cầu vật tư nào gửi xuống kho.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 pr-3 font-medium">Nhóm hàng / mã hàng</th>
              <th className="py-2 pr-3 text-right font-medium">Cần</th>
              <th className="py-2 pr-3 text-right font-medium">Đã xuất</th>
              <th className="py-2 pr-3 text-right font-medium">Đã ký nhận</th>
              <th className="py-2 pr-3 text-right font-medium">Chênh lệch</th>
              <th className="py-2 pr-3 text-right font-medium">Đã trả</th>
              <th className="py-2 pr-3 text-right font-medium">Thất thoát</th>
              <th className="py-2 text-right font-medium">Đơn vị</th>
            </tr>
          </thead>
          <tbody>
            {event.categories.map((category) => (
              <CategoryRows key={category.categoryName} category={category} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="py-2 pr-3">Tổng đợt</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatNumber(event.totals.requested)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatNumber(event.totals.issued)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatNumber(event.totals.pickedUp)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatNumber(event.totals.pickupGap)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatNumber(event.totals.returnedOk)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatNumber(event.totals.lost + event.totals.returnedDamaged)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CategoryRows({ category }: { category: DisasterCategoryTotals }) {
  return (
    <>
      <tr className="border-b bg-[var(--surface-2)]">
        <td className="py-2 pr-3 font-semibold">
          {category.categoryName}
          <span className="ml-2 rounded-full border px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            {category.consumable ? "tiêu hao" : "tái sử dụng"}
          </span>
        </td>
        <NumberCell value={category.requested} />
        <NumberCell value={category.issued} />
        <NumberCell value={category.pickedUp} />
        <NumberCell value={category.pickupGap} warn />
        <NumberCell value={category.returnedOk} />
        <NumberCell value={category.lost + category.returnedDamaged} danger />
        <td className="py-2 text-right text-xs text-[var(--text-muted)]">{category.unit}</td>
      </tr>
      {category.items.map((item) => (
        <tr key={item.sku} className="border-b text-[var(--text-muted)]">
          <td className="py-1.5 pr-3 pl-5">
            {item.itemName}
            <span className="ml-2 text-xs opacity-70">{item.sku}</span>
          </td>
          <NumberCell value={item.requested} muted />
          <NumberCell value={item.issued} muted />
          <NumberCell value={item.pickedUp} muted />
          <NumberCell value={item.pickupGap} muted warn />
          <NumberCell value={item.returnedOk} muted />
          <NumberCell value={item.lost + item.returnedDamaged} muted danger />
          <td className="py-1.5 text-right text-xs">{item.unit}</td>
        </tr>
      ))}
    </>
  );
}

/** Ô số: chỉ tô màu khi giá trị khác 0, để mắt bắt đúng chỗ có vấn đề. */
function NumberCell({
  value,
  muted = false,
  warn = false,
  danger = false,
}: {
  value: number;
  muted?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  const color =
    value > 0 && danger
      ? "var(--color-critical)"
      : value > 0 && warn
        ? "var(--color-attention)"
        : undefined;
  return (
    <td
      className={`py-2 pr-3 text-right tabular-nums ${muted ? "text-xs" : ""}`}
      style={color ? { color, fontWeight: 600 } : undefined}
    >
      {formatNumber(value)}
    </td>
  );
}

function StatusBadge({ status, outcome }: { status: string; outcome: string | null }) {
  const { label, tone } = describeStatus(status, outcome);
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `color-mix(in oklch, ${tone} 14%, transparent)`, color: tone }}
    >
      {label}
    </span>
  );
}

function describeStatus(status: string, outcome: string | null): { label: string; tone: string } {
  if (status === "COMPLETED") {
    if (outcome === "PARTIAL") return { label: "Giao một phần", tone: "var(--color-attention)" };
    if (outcome === "FAILED") return { label: "Không giao được", tone: "var(--color-critical)" };
    return { label: "Đã hoàn tất", tone: "var(--color-ready)" };
  }
  if (status === "CANCELLED") return { label: "Đã huỷ", tone: "var(--color-critical)" };
  if (status === "REJECTED") return { label: "Bị từ chối", tone: "var(--color-critical)" };
  if (status === "DEFERRED") return { label: "Tạm hoãn", tone: "var(--color-attention)" };
  return { label: "Đang thực hiện", tone: "var(--color-accent)" };
}

function TimeFact({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="flex items-center gap-1">
      <dt className="opacity-80">{label}:</dt>
      <dd className="tabular-nums">{value ? formatDateTime(value) : "—"}</dd>
    </span>
  );
}

/** Ngày giờ đầy đủ tới giây — người đọc phải biết chính xác mốc chốt số. */
function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatNumber(value: number): string {
  return value.toLocaleString("vi-VN");
}

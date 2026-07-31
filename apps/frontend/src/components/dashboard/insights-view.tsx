"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import {
  getMonthlyReport,
  getDailyBriefing,
  getWarehouseInsights,
  type DailyBriefing,
  type ForecastItem,
  type MonthlyReport,
  type TrendItem,
  type WarehouseInsights,
  type WeatherDemandItem,
} from "@/lib/insights-api";

/** Theo dõi vận hành thường ngày: dự báo, hết hạn, cân bằng, thời tiết và báo cáo tháng. */
export function InsightsView({ warehouseId }: { warehouseId: string }) {
  const insightsQuery = useQuery({
    queryKey: ["insights", warehouseId],
    queryFn: () => getWarehouseInsights(warehouseId),
  });

  if (insightsQuery.isLoading) return <InsightsSkeleton />;
  if (insightsQuery.isError || !insightsQuery.data) {
    return (
      <Panel>
        <Header
          icon={<ColorIcon name="warning" size={20} tone="red" />}
          tone="var(--color-critical)"
          title="Không tải được dữ liệu theo dõi"
        />
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại sau.
        </p>
      </Panel>
    );
  }

  const data = insightsQuery.data;
  return (
    <div className="space-y-4">
      {data.weatherAlert?.alert && <WeatherBanner rainMm={data.weatherAlert.totalRainMm} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <DailyBriefingCard warehouseId={warehouseId} />
        <WeatherDemandCard data={data} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ForecastCard forecast={data.forecast} />
        <ExpiryCard data={data} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RebalanceCard data={data} />
        <MonthlyReportCard warehouseId={warehouseId} />
      </div>
    </div>
  );
}

function DailyBriefingCard({ warehouseId }: { warehouseId: string }) {
  const briefing = useQuery<DailyBriefing>({
    queryKey: ["daily-briefing", warehouseId],
    queryFn: () => getDailyBriefing(warehouseId),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <Header
          icon={<ColorIcon name="magic" size={20} tone="amber" />}
          tone="var(--color-accent)"
          title="Bản tin AI đầu ngày"
        />
        {briefing.data && (
          <span className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
            {briefing.data.source === "AI" ? "AI local" : "Bản dự phòng"}
          </span>
        )}
      </div>
      {briefing.isLoading ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">Đang tổng hợp tình hình vận hành…</p>
      ) : briefing.isError || !briefing.data ? (
        <p className="mt-4 text-sm text-[var(--color-critical)]">
          Chưa tạo được bản tin. Vui lòng kiểm tra kết nối LAN.
        </p>
      ) : (
        <>
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">
            {briefing.data.narrative}
          </p>
          <ul className="mt-4 space-y-2 border-t pt-3">
            {briefing.data.priorities.map((priority) => (
              <li className="flex gap-2 text-sm" key={priority}>
                <ColorIcon name="arrowRight" size={16} tone="orange" />
                <span>{priority}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function WeatherDemandCard({ data }: { data: WarehouseInsights }) {
  const risks = data.weatherDemand.filter((item) => item.atRisk);
  return (
    <Panel>
      <Header
        icon={<ColorIcon name="weather" size={20} tone="blue" />}
        tone="var(--color-accent)"
        title="Nhu cầu theo mưa 72 giờ"
      />
      {!data.weatherAlert ? (
        <Empty text="Chưa lấy được Open-Meteo; hệ thống không tự suy đoán lượng mưa." />
      ) : !data.weatherAlert.alert ? (
        <div className="mt-4">
          <p className="text-sm">
            Tổng mưa dự báo:{" "}
            <b className="tabular">{data.weatherAlert.totalRainMm.toFixed(1)} mm</b>.
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Chưa chạm ngưỡng 100 mm/72 giờ nên không nhân hệ số nhu cầu.
          </p>
          <RainDays daily={data.weatherAlert.daily} />
        </div>
      ) : risks.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm">
            Mưa dự báo <b className="tabular">{data.weatherAlert.totalRainMm.toFixed(1)} mm</b>,
            nhưng chưa đủ lịch sử xuất kho tin cậy để kết luận thiếu.
          </p>
          <RainDays daily={data.weatherAlert.daily} />
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            EWMA tiêu thụ × hệ số nhóm cứu trợ; số liệu chỉ dùng để cảnh báo sớm.
          </p>
          <ul className="mt-3 divide-y">
            {risks.slice(0, 6).map((item) => (
              <WeatherRiskRow item={item} key={item.sku} />
            ))}
          </ul>
          <RainDays daily={data.weatherAlert.daily} />
        </>
      )}
    </Panel>
  );
}

function WeatherRiskRow({ item }: { item: WeatherDemandItem }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.itemName}</p>
        <p className="text-xs text-[var(--text-muted)]">
          Tồn {item.currentQuantity} · dự báo cần {item.projectedDemand72h} {item.unit} · hệ số{" "}
          {item.demandFactor.toFixed(2)}
        </p>
      </div>
      <span className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-[var(--color-critical)]">
        Thiếu {item.shortage}
      </span>
    </li>
  );
}

function RainDays({ daily }: { daily: { date: string; precipitationMm: number }[] }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {daily.map((day) => (
        <div className="rounded-md bg-[var(--surface-2)] p-2 text-center" key={day.date}>
          <p className="text-[11px] text-[var(--text-muted)]">
            {new Date(`${day.date}T00:00:00`).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
            })}
          </p>
          <p className="tabular mt-1 text-sm font-semibold">{day.precipitationMm} mm</p>
        </div>
      ))}
    </div>
  );
}

function WeatherBanner({ rainMm }: { rainMm: number }) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border p-4"
      style={{
        background: "color-mix(in oklch, var(--color-critical) 8%, transparent)",
        borderColor: "var(--color-critical)",
      }}
    >
      <ColorIcon name="weather" size={24} tone="red" />
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--color-critical)" }}>
          Dự báo mưa lớn trong 72 giờ tới
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Tổng lượng mưa có thể đạt <b className="tabular">{Math.round(rainMm)} mm</b>. Cần rà soát
          vật tư chống lũ và khả năng tiếp cận kho.
        </p>
      </div>
    </div>
  );
}

function ForecastCard({ forecast }: { forecast: ForecastItem[] }) {
  // Ưu tiên hiện: cạn hẳn / sắp cạn trước, rồi theo daysLeft tăng dần.
  const sorted = [...forecast].sort((a, b) => rank(a) - rank(b));
  const critical = sorted.filter((f) => f.lowStock);

  return (
    <Panel>
      <Header
        icon={<ColorIcon name="inventory" size={20} tone="orange" />}
        tone="var(--color-accent)"
        title="Nguy cơ thiếu hàng"
      />
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Ước tính từ lượng xuất trong 30 ngày gần nhất.{" "}
        {critical.length > 0 && (
          <b style={{ color: "var(--color-critical)" }}>
            {critical.length} mặt hàng cần bổ sung sớm.
          </b>
        )}
      </p>
      {sorted.length === 0 ? (
        <Empty text="Chưa đủ dữ liệu xuất kho để ước tính." />
      ) : (
        <ul className="mt-4 divide-y">
          {sorted.slice(0, 8).map((f) => (
            <li key={f.sku} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.itemName}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Tồn {f.quantity} ·{" "}
                  {f.ewmaPerDay > 0
                    ? `${f.ewmaPerDay.toFixed(1)}/ngày gần đây`
                    : "chưa xuất kỳ này"}
                </p>
                {f.lowStock && f.reorderPoint > 0 && (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--color-critical)" }}>
                    Nên nhập khi tồn ≤ {Math.ceil(f.reorderPoint)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <DaysLeftBadge item={f} />
                <ConfidenceChip value={f.confidence} hasRate={f.ewmaPerDay > 0} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Dải "~X–Y ngày" (khoảng tin cậy ±1σ) thay cho một con số cứng. */
function DaysLeftBadge({ item }: { item: ForecastItem }) {
  if (item.daysLeft == null) {
    return <span className="shrink-0 text-xs text-[var(--text-muted)]">—</span>;
  }
  const center = Math.floor(item.daysLeft);
  const tone = item.lowStock
    ? "var(--color-critical)"
    : center < 21
      ? "var(--color-attention)"
      : "var(--color-ready)";

  let label: string;
  if (center <= 0) {
    label = "Đã cạn";
  } else {
    const lo = item.daysLeftLow != null ? Math.floor(item.daysLeftLow) : center;
    const hi = item.daysLeftHigh != null ? Math.ceil(item.daysLeftHigh) : center;
    label = hi > lo ? `~${lo}–${hi} ngày` : `~${center} ngày`;
  }
  return (
    <span
      className="tabular rounded-md px-2.5 py-1 text-xs font-semibold"
      style={{ background: `color-mix(in oklch, ${tone} 14%, transparent)`, color: tone }}
    >
      {label}
    </span>
  );
}

/** Chip độ tin cậy Cao/TB/Thấp — nói thẳng khi dữ liệu chưa đủ. */
function ConfidenceChip({ value, hasRate }: { value: number; hasRate: boolean }) {
  if (!hasRate) return null;
  const label = value >= 0.75 ? "Tin cậy cao" : value >= 0.4 ? "Tin cậy TB" : "Dữ liệu chưa đủ";
  const tone =
    value >= 0.75
      ? "var(--color-ready)"
      : value >= 0.4
        ? "var(--color-attention)"
        : "var(--text-muted)";
  return (
    <span className="text-[11px] font-medium" style={{ color: tone }}>
      {label}
    </span>
  );
}

function ExpiryCard({ data }: { data: WarehouseInsights }) {
  const alerts = data.expiryAlerts;
  return (
    <Panel>
      <Header
        icon={<ColorIcon name="time" size={20} tone="amber" />}
        tone="var(--color-accent)"
        title="Hạn dùng trong 30 ngày tới"
      />
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Ưu tiên các lô đã quá hạn hoặc gần đến hạn sử dụng.
      </p>
      {alerts.length === 0 ? (
        <Empty text="Không có lô nào sắp hết hạn trong 30 ngày." />
      ) : (
        <ul className="mt-4 divide-y">
          {alerts.slice(0, 8).map((a) => {
            const expired = a.daysUntilExpiry < 0;
            const tone = expired
              ? "var(--color-critical)"
              : a.daysUntilExpiry <= 7
                ? "var(--color-critical)"
                : "var(--color-attention)";
            return (
              <li key={a.batchId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.itemName}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    SL {a.quantity} · {a.sku}
                  </p>
                </div>
                <span
                  className="tabular shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold"
                  style={{
                    background: `color-mix(in oklch, ${tone} 14%, transparent)`,
                    color: tone,
                  }}
                >
                  {expired ? `Quá hạn ${-a.daysUntilExpiry}n` : `Còn ${a.daysUntilExpiry}n`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function RebalanceCard({ data }: { data: WarehouseInsights }) {
  const items = data.rebalance;
  return (
    <Panel>
      <Header
        icon={<ColorIcon name="transfer" size={20} tone="blue" />}
        tone="var(--color-accent)"
        title="Đề xuất điều chuyển"
      />
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Đối chiếu cùng một mặt hàng giữa các kho. Người phụ trách quyết định việc điều chuyển.
      </p>
      {items.length === 0 ? (
        <Empty text="Tồn kho giữa các kho trong xã đang cân bằng." />
      ) : (
        <ul className="mt-4 space-y-2">
          {items.slice(0, 8).map((r, i) => (
            <li
              key={`${r.sku}-${i}`}
              className="rounded-md border bg-[var(--surface-2)] px-3 py-2.5"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="truncate font-medium">{r.fromWarehouseName}</span>
                <ColorIcon name="arrowRight" size={16} tone="blue" />
                <span className="truncate font-medium">{r.toWarehouseName}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Chuyển <b className="tabular text-[var(--text)]">{r.suggestedQty}</b> {r.sku}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MonthlyReportCard({ warehouseId }: { warehouseId: string }) {
  const report = useMutation<MonthlyReport>({
    mutationFn: () => getMonthlyReport(warehouseId),
  });

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <Header
          icon={<ColorIcon name="report" size={20} tone="green" />}
          tone="var(--color-accent)"
          title="Nhận xét tháng"
        />
        <button
          type="button"
          onClick={() => report.mutate()}
          disabled={report.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="magic" size={16} tone="amber" />
          {report.isPending ? "Đang tổng hợp" : "Tạo nhận xét"}
        </button>
      </div>

      {!report.data && !report.isPending && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Tạo bản nhận xét ngắn về biến động xuất kho của tháng này so với tháng trước.
        </p>
      )}
      {report.isError && (
        <p className="mt-3 text-sm text-[var(--color-critical)]">
          Chưa thể tổng hợp nhận xét. Vui lòng thử lại.
        </p>
      )}
      {report.data && (
        <>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
            {report.data.narrative}
          </p>
          {report.data.trends.length > 0 && (
            <ul className="mt-4 divide-y border-t pt-2">
              {report.data.trends.slice(0, 6).map((t) => (
                <TrendRow key={t.sku} trend={t} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function TrendRow({ trend }: { trend: TrendItem }) {
  const pct = trend.changePercent;
  const isNew = pct == null && trend.currentTotal > 0;
  const up = (pct ?? 0) >= 0;
  const tone = isNew ? "var(--color-accent)" : up ? "var(--color-ready)" : "var(--color-critical)";
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{trend.itemName}</p>
        <p className="tabular text-xs text-[var(--text-muted)]">
          {trend.previousTotal} → {trend.currentTotal}
        </p>
      </div>
      <span
        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
        style={{ color: tone }}
      >
        {isNew ? (
          "Mới"
        ) : (
          <>
            {up ? (
              <ColorIcon name="trendUp" size={16} tone="green" />
            ) : (
              <ColorIcon name="trendDown" size={16} tone="red" />
            )}
            <span className="tabular">{Math.abs(pct ?? 0).toFixed(0)}%</span>
          </>
        )}
      </span>
    </li>
  );
}

/** Ưu tiên sắp xếp forecast: lowStock trước, trong nhóm theo daysLeft, null xuống cuối. */
function rank(f: ForecastItem): number {
  if (f.daysLeft == null) return 1e9;
  return f.daysLeft;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border bg-[var(--surface)] p-5">{children}</section>;
}

function Header({ icon, title, tone }: { icon: React.ReactNode; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: tone }}>
      {icon}
      <span>{title}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-md border border-dashed bg-[var(--surface-2)] p-6 text-center text-sm text-[var(--text-muted)]">
      {text}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-[340px] animate-pulse rounded-md border bg-[var(--surface)]" />
        <div className="h-[340px] animate-pulse rounded-md border bg-[var(--surface)]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-[240px] animate-pulse rounded-md border bg-[var(--surface)]" />
        <div className="h-[240px] animate-pulse rounded-md border bg-[var(--surface)]" />
      </div>
    </div>
  );
}

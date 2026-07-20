"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CloudRain,
  FileText,
  Package,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Clock,
} from "lucide-react";
import {
  getMonthlyReport,
  getWarehouseInsights,
  type ForecastItem,
  type MonthlyReport,
  type TrendItem,
  type WarehouseInsights,
} from "@/lib/insights-api";

/** Normal Mode: AI quản trị kho ngày thường — dự báo, hết hạn, cân bằng, thời tiết, báo cáo tháng. */
export function InsightsView({ warehouseId }: { warehouseId: string }) {
  const insightsQuery = useQuery({
    queryKey: ["insights", warehouseId],
    queryFn: () => getWarehouseInsights(warehouseId),
  });

  if (insightsQuery.isLoading) return <InsightsSkeleton />;
  if (insightsQuery.isError || !insightsQuery.data) {
    return (
      <Panel>
        <Header icon={<AlertTriangle size={18} strokeWidth={1.8} />} tone="var(--color-critical)" title="Không tải được insights" />
        <p className="mt-2 text-sm text-[var(--text-muted)]">Kiểm tra backend hoặc quyền `readiness:view`.</p>
      </Panel>
    );
  }

  const data = insightsQuery.data;
  return (
    <div className="space-y-4">
      {data.weatherAlert?.alert && <WeatherBanner rainMm={data.weatherAlert.totalRainMm} />}

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

function WeatherBanner({ rainMm }: { rainMm: number }) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border p-4"
      style={{ background: "color-mix(in oklch, var(--color-critical) 8%, transparent)", borderColor: "var(--color-critical)" }}
    >
      <CloudRain aria-hidden="true" size={22} strokeWidth={1.8} style={{ color: "var(--color-critical)" }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--color-critical)" }}>
          Cảnh báo mưa lớn 72h tới
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Dự báo tổng lượng mưa <b className="tabular">{Math.round(rainMm)}mm</b> — nguy cơ ngập/cô lập kho. Rà soát vật tư chống lũ.
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
      <Header icon={<Package size={18} strokeWidth={1.8} />} tone="var(--color-accent)" title="Dự báo cạn kho" />
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Theo tốc độ xuất trung bình 30 ngày. {critical.length > 0 && <b style={{ color: "var(--color-critical)" }}>{critical.length} mặt hàng cần nhập gấp.</b>}
      </p>
      {sorted.length === 0 ? (
        <Empty text="Chưa có dữ liệu xuất kho để dự báo." />
      ) : (
        <ul className="mt-4 divide-y">
          {sorted.slice(0, 8).map((f) => (
            <li key={f.sku} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.itemName}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Tồn {f.quantity} · {f.avgPerDay > 0 ? `${f.avgPerDay.toFixed(1)}/ngày` : "chưa xuất kỳ này"}
                </p>
              </div>
              <DaysLeftBadge item={f} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DaysLeftBadge({ item }: { item: ForecastItem }) {
  if (item.daysLeft == null) {
    return <span className="shrink-0 text-xs text-[var(--text-muted)]">—</span>;
  }
  const days = Math.floor(item.daysLeft);
  const tone = item.lowStock ? "var(--color-critical)" : days < 21 ? "var(--color-attention)" : "var(--color-ready)";
  return (
    <span
      className="tabular shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold"
      style={{ background: `color-mix(in oklch, ${tone} 14%, transparent)`, color: tone }}
    >
      {days <= 0 ? "Đã cạn" : `~${days} ngày`}
    </span>
  );
}

function ExpiryCard({ data }: { data: WarehouseInsights }) {
  const alerts = data.expiryAlerts;
  return (
    <Panel>
      <Header icon={<Clock size={18} strokeWidth={1.8} />} tone="var(--color-accent)" title="Sắp hết hạn (30 ngày)" />
      <p className="mt-1 text-sm text-[var(--text-muted)]">Lô gần hết hạn nhất lên đầu, gồm cả lô đã quá hạn.</p>
      {alerts.length === 0 ? (
        <Empty text="Không có lô nào sắp hết hạn trong 30 ngày." />
      ) : (
        <ul className="mt-4 divide-y">
          {alerts.slice(0, 8).map((a) => {
            const expired = a.daysUntilExpiry < 0;
            const tone = expired ? "var(--color-critical)" : a.daysUntilExpiry <= 7 ? "var(--color-critical)" : "var(--color-attention)";
            return (
              <li key={a.batchId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.itemName}</p>
                  <p className="text-xs text-[var(--text-muted)]">SL {a.quantity} · {a.sku}</p>
                </div>
                <span
                  className="tabular shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold"
                  style={{ background: `color-mix(in oklch, ${tone} 14%, transparent)`, color: tone }}
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
      <Header icon={<ArrowRight size={18} strokeWidth={1.8} />} tone="var(--color-accent)" title="Đề xuất điều chuyển" />
      <p className="mt-1 text-sm text-[var(--text-muted)]">Cân bằng tồn cùng mặt hàng giữa các kho trong xã. Hệ thống gợi ý, người điều phối quyết định.</p>
      {items.length === 0 ? (
        <Empty text="Tồn kho giữa các kho trong xã đang cân bằng." />
      ) : (
        <ul className="mt-4 space-y-2">
          {items.slice(0, 8).map((r, i) => (
            <li key={`${r.sku}-${i}`} className="rounded-md border bg-[var(--surface-2)] px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="truncate font-medium">{r.fromWarehouseName}</span>
                <ArrowRight aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" size={14} />
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
        <Header icon={<FileText size={18} strokeWidth={1.8} />} tone="var(--color-accent)" title="Báo cáo tháng" />
        <button
          type="button"
          onClick={() => report.mutate()}
          disabled={report.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <Sparkles size={14} strokeWidth={2} />
          {report.isPending ? "Đang sinh…" : "Sinh báo cáo"}
        </button>
      </div>

      {!report.data && !report.isPending && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Bấm <b>Sinh báo cáo</b> để AI phân tích xu hướng xuất kho tháng này so tháng trước.
        </p>
      )}
      {report.isError && (
        <p className="mt-3 text-sm text-[var(--color-critical)]">Không sinh được báo cáo. Thử lại.</p>
      )}
      {report.data && (
        <>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{report.data.narrative}</p>
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
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold" style={{ color: tone }}>
        {isNew ? (
          "Mới"
        ) : (
          <>
            {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
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

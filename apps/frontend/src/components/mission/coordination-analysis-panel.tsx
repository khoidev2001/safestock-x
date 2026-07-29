"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CoordinationAnalysis, CoordinationFact, WhatIfSimulationResult } from "@safestock/shared-types";
import { useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { ApiError } from "@/lib/api";
import {
  analyzeMission,
  getLatestCoordinationAnalysis,
  simulateMission,
  type CoordinationAnalysisSnapshot,
} from "@/lib/mission-api";

const FACT_TONE: Record<CoordinationFact["provenance"], string> = {
  REPORTED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  VERIFIED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  AI_INFERENCE: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  MISSING: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function CoordinationAnalysisPanel({ missionId }: { missionId: string }) {
  const queryClient = useQueryClient();
  const [assumptionText, setAssumptionText] = useState("");
  const latest = useQuery({
    queryKey: ["mission", missionId, "coordination-analysis"],
    queryFn: () => getLatestCoordinationAnalysis(missionId),
    refetchInterval: 15_000,
  });
  const run = useMutation({
    mutationFn: () => analyzeMission(missionId, { requestId: requestId() }),
    onSuccess: (result) => {
      queryClient.setQueryData(["mission", missionId, "coordination-analysis"], result.snapshot);
    },
  });
  const snapshot = latest.data;
  const analysis = snapshot?.result;
  const simulate = useMutation({
    mutationFn: () => {
      if (!snapshot) throw new Error("Chưa có baseline để mô phỏng");
      return simulateMission(missionId, {
        requestId: requestId("what-if"),
        baselineSnapshotId: snapshot.id,
        assumptionText,
      });
    },
  });
  return (
    <section className="app-panel p-5" aria-labelledby="coordination-analysis-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ColorIcon name="magic" size={18} tone="amber" />
            <h3 id="coordination-analysis-title" className="text-sm font-semibold">
              Phân tích tình huống và tham mưu điều phối
            </h3>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            AI chỉ trích xuất dữ kiện có nguồn; nhu cầu, kho, tuyến và mưa do hệ thống tính.
          </p>
        </div>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface)] active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="magic" size={16} tone="amber" />
          {run.isPending ? "Đang lập bản tham mưu…" : "Lập bản tham mưu"}
        </button>
      </div>

      <p className="mt-3 rounded-md border border-dashed bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
        Không tự duyệt, không dispatch, không thay đổi tồn kho và không liên hệ xã khác.
      </p>

      {run.error && <ErrorState error={run.error} />}
      {latest.isError && <ErrorState error={latest.error} />}
      {latest.isPending ? <AnalysisSkeleton /> : !analysis ? <EmptyState /> : <AnalysisBody analysis={analysis} snapshot={snapshot} />}
      {snapshot && (
        <WhatIfPanel
          value={assumptionText}
          onChange={setAssumptionText}
          onRun={() => simulate.mutate()}
          disabled={simulate.isPending || assumptionText.trim().length < 2}
          pending={simulate.isPending}
          error={simulate.error}
          result={simulate.data?.simulation ?? null}
        />
      )}
    </section>
  );
}

function AnalysisBody({ analysis, snapshot }: { analysis: CoordinationAnalysis; snapshot: CoordinationAnalysisSnapshot }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Trạng thái" value={statusLabel(analysis.status)} />
        <SummaryMetric label="Mức ưu tiên" value={analysis.urgency.level ? `${analysis.urgency.level}/5` : "Chờ dữ kiện"} />
        <SummaryMetric label="Độ đáp ứng nội xã" value={analysis.coordination.fulfillmentPercent == null ? "Chưa tính" : `${analysis.coordination.fulfillmentPercent}%`} />
      </div>

      <Section title="Dữ kiện và nguồn">
        <ul className="space-y-2" role="list">
          {analysis.facts.map((fact) => <FactRow key={fact.id} fact={fact} />)}
        </ul>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Cần xác minh / mâu thuẫn">
          {analysis.missingData.length + analysis.conflicts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Chưa phát hiện dữ kiện còn thiếu hoặc mâu thuẫn.</p>
          ) : (
            <ul className="space-y-2 text-sm" role="list">
              {analysis.missingData.map((item) => <li key={`${item.key}-${item.question}`}>• {item.question}<span className="block pl-3 text-xs text-[var(--text-muted)]">{item.impact}</span></li>)}
              {analysis.conflicts.map((item) => <li key={`${item.key}-${item.factIds.join("-")}`}>• {item.question}</li>)}
            </ul>
          )}
        </Section>
        <Section title="Câu hỏi ưu tiên">
          {analysis.priorityQuestion ? (
            <p className="text-sm">{analysis.priorityQuestion.question}<span className="mt-1 block text-xs text-[var(--text-muted)]">{analysis.priorityQuestion.expectedImpact}</span></p>
          ) : <p className="text-sm text-[var(--text-muted)]">Chưa có câu hỏi ưu tiên.</p>}
        </Section>
      </div>

      <Section title="Nhu cầu theo rule backend">
        <DataTable
          headers={["Vật tư", "Nhu cầu", "Cơ sở"]}
          rows={analysis.requirements.items.map((item) => [item.name, `${item.totalQuantity} ${item.unit}`, item.basis])}
          empty={analysis.requirements.reason ?? "Chưa có nhu cầu để hiển thị."}
        />
      </Section>

      <Section title="Điều phối nội xã">
        <DataTable
          headers={["Kho", "Vật tư", "Số lượng", "Tuyến"]}
          rows={analysis.coordination.allocations.map((item) => [item.warehouseName, item.sku, String(item.quantity), routeLabel(item.routeStatus, item.distanceKm, item.etaMinutes)])}
          empty={analysis.coordination.reason ?? "Chưa có phân bổ nội xã."}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Mưa và dự báo">
          <ul className="space-y-2 text-sm" role="list">
            {analysis.forecasts.map((forecast) => <li key={forecast.horizonHours}><span className="font-medium">{forecast.horizonHours} giờ:</span> {forecast.explanation}</li>)}
          </ul>
        </Section>
        <Section title="Liên xã khi thiếu nội xã">
          {analysis.coordination.externalContacts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Chưa kích hoạt: phương án nội xã chưa thiếu hoặc chưa đủ dữ kiện.</p>
          ) : (
            <ul className="space-y-2 text-sm" role="list">
              {analysis.coordination.externalContacts.map((contact) => (
                <li key={contact.communeName} className="rounded-md border bg-[var(--surface-2)] p-2">
                  <span className="font-medium">{contact.referencePoint.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{contact.phone ?? "Chưa có số liên hệ"} · {contact.disclaimer}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="border-t pt-3 text-xs text-[var(--text-muted)]">
        <p>{analysis.explanation.summary}</p>
        <p className="mt-1">Snapshot {snapshot.fingerprint.slice(0, 20)}… · rule {snapshot.ruleVersion} · tính lúc {formatDate(snapshot.computedAt)}</p>
      </div>
    </div>
  );
}

function FactRow({ fact }: { fact: CoordinationFact }) {
  const detail = fact.provenance === "MISSING" ? fact.question : stringifyValue(fact.value);
  return <li className="rounded-md border bg-[var(--surface)] p-2 text-sm"><span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${FACT_TONE[fact.provenance]}`}>{provenanceLabel(fact.provenance)}</span><span className="font-medium">{fact.key}</span><span className="ml-2">{detail}</span></li>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h4 className="text-sm font-semibold">{title}</h4><div className="mt-2">{children}</div></section>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-[var(--surface-2)] p-3"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
  return <div className="overflow-x-auto rounded-md border"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--surface-2)] text-xs text-[var(--text-muted)]"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${row.join("-")}-${rowIndex}`} className="border-t">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-3 py-2 align-top">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function AnalysisSkeleton() { return <div className="mt-4 space-y-2" aria-busy="true" aria-label="Đang tải bản tham mưu"><div className="h-16 animate-pulse rounded-md bg-[var(--surface-2)]" /><div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" /></div>; }
function EmptyState() { return <p className="mt-4 text-sm text-[var(--text-muted)]">Chưa có bản tham mưu. Hãy lập bản đầu tiên để xem dữ kiện, nhu cầu và các điểm cần xác minh.</p>; }
function ErrorState({ error }: { error: unknown }) { return <p role="alert" className="mt-3 text-sm text-[var(--color-critical)]">{error instanceof ApiError ? error.message : "Không tải được bản tham mưu. Vui lòng thử lại."}</p>; }
function statusLabel(status: CoordinationAnalysis["status"]) { return status === "VERIFIED" ? "Đã xác minh" : status === "NEEDS_CONFIRMATION" ? "Cần xác minh" : "Sơ bộ"; }
function provenanceLabel(provenance: CoordinationFact["provenance"]) { return provenance === "REPORTED" ? "Báo cáo" : provenance === "VERIFIED" ? "Đã xác minh" : provenance === "AI_INFERENCE" ? "AI suy luận" : "Chưa xác minh"; }
function routeLabel(status: string, distanceKm: number | null, etaMinutes: number | null) { return status === "AVAILABLE" ? `${distanceKm ?? "?"} km · ${etaMinutes ?? "?"} phút` : status === "UNKNOWN" ? "Chưa có tuyến" : "Không có tuyến"; }
function stringifyValue(value: unknown) { return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value); }
function displayMetricValue(value: number | null) { return value === null ? "?" : String(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function WhatIfPanel({
  value,
  onChange,
  onRun,
  disabled,
  pending,
  error,
  result,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  disabled: boolean;
  pending: boolean;
  error: unknown;
  result: WhatIfSimulationResult | null;
}) {
  return (
    <div className="mt-4 border-t pt-4">
      <Section title="What-if an toàn">
        <label className="block text-sm" htmlFor="what-if-input">
          Giả định bằng ngôn ngữ tự nhiên
        </label>
        <textarea
          id="what-if-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder="Ví dụ: nếu có 150 người cần hỗ trợ"
          className="mt-2 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={disabled}
            className="rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface)] disabled:opacity-60"
          >
            {pending ? "Đang mô phỏng…" : "Chạy What-if"}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            Chỉ tạo snapshot mô phỏng, không áp dụng vào phương án thật.
          </span>
        </div>
        {error ? <ErrorState error={error} /> : null}
        {result ? (
          <div className="mt-3 rounded-md border bg-[var(--surface-2)] p-3 text-sm">
            <p className="font-semibold">{result.label}</p>
            <ul className="mt-2 space-y-1" role="list">
              {result.delta.metrics.map((metric) => (
                <li key={metric.key}>
                  • {metric.key}: {displayMetricValue(metric.baseline)} →{" "}
                  {displayMetricValue(metric.simulated)} {metric.unit}
                </li>
              ))}
            </ul>
            {result.unresolvedAssumptions.length > 0 ? (
              <p className="mt-2 text-xs text-[var(--color-attention)]">
                Có giả định chưa xác định, chưa được áp dụng:{" "}
                {result.unresolvedAssumptions.map((item) => item.sourceText).join("; ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
function requestId(prefix = "analysis") { return typeof crypto !== "undefined" && "randomUUID" in crypto ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  incidentTypeLabel,
  type CoordinationAnalysis,
  type CoordinationFact,
  type WhatIfSimulationResult,
} from "@safestock/shared-types";
import { useState } from "react";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { FieldUpdateTimeline } from "./field-update-timeline";
import { ColorIcon } from "@/components/shared/color-icon";
import { ApiError } from "@/lib/api";
import {
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

export function CoordinationAnalysisPanel({
  missionId,
  fieldUpdateId,
  onRun,
  running = false,
  error = null,
}: {
  missionId: string;
  /** Bằng chứng cần cuộn tới khi mở từ chuông thông báo. */
  fieldUpdateId?: string | null;
  /**
   * Có thì khối này tự hiện nút "Lập bản tham mưu".
   *
   * Bình thường nút nằm cạnh "Tính nhu cầu vật tư" ở khối tình huống. Nhưng khối
   * đó ẩn khi nhiệm vụ đã phát hành, nên lúc ấy nút phải về đây — nếu không thì
   * không còn đường nào lập tham mưu cho một nhiệm vụ đang chạy.
   */
  onRun?: () => void;
  running?: boolean;
  error?: string | null;
}) {
  const [assumptionText, setAssumptionText] = useState("");
  const latest = useQuery({
    queryKey: ["mission", missionId, "coordination-analysis"],
    queryFn: () => getLatestCoordinationAnalysis(missionId),
    refetchInterval: 15_000,
  });
  const snapshot = latest.data;
  const analysis = snapshot?.result;
  const simulate = useMutation({
    mutationFn: () => {
      if (!snapshot) throw new Error("Chưa có bản tham mưu gốc để mô phỏng");
      return simulateMission(missionId, {
        requestId: requestId("what-if"),
        baselineSnapshotId: snapshot.id,
        assumptionText,
      });
    },
  });
  return (
    <CollapsiblePanel
      headingId="coordination-analysis-title"
      icon={<ColorIcon name="magic" size={18} tone="amber" />}
      title="Phân tích tình huống và tham mưu điều phối"
      subtitle="AI chỉ trích xuất dữ kiện có nguồn; nhu cầu, kho, tuyến và mưa do hệ thống tính."
      badge={
        onRun ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              if (!running) onRun();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              if (!running) onRun();
            }}
            className={`inline-flex items-center gap-2 rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface)] ${running ? "opacity-60" : ""}`}
          >
            <ColorIcon name="magic" size={16} tone="amber" />
            {running ? "Đang lập bản tham mưu…" : "Lập bản tham mưu"}
          </span>
        ) : null
      }
    >
      <p className="rounded-md border border-dashed bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
        Không tự duyệt, không tự điều động, không thay đổi tồn kho và không liên hệ xã khác.
      </p>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-[var(--color-critical)]">
          {error}
        </p>
      ) : null}
      {latest.isError && <ErrorState error={latest.error} />}
      {latest.isPending ? (
        <AnalysisSkeleton />
      ) : !analysis ? (
        <EmptyState />
      ) : (
        <AnalysisBody analysis={analysis} snapshot={snapshot} />
      )}
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

      <div className="mt-4 border-t pt-4">
        <FieldUpdateTimeline missionId={missionId} focusUpdateId={fieldUpdateId ?? null} />
      </div>
    </CollapsiblePanel>
  );
}

function AnalysisBody({
  analysis,
  snapshot,
}: {
  analysis: CoordinationAnalysis;
  snapshot: CoordinationAnalysisSnapshot;
}) {
  // Phân bổ chỉ mang mã SKU; tên và đơn vị lấy từ bảng nhu cầu ngay phía trên.
  const itemBySku = new Map(
    analysis.requirements.items.map((item) => [item.sku, { name: item.name, unit: item.unit }]),
  );
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Trạng thái" value={statusLabel(analysis.status)} />
        <SummaryMetric
          label="Mức ưu tiên"
          value={analysis.urgency.level ? `${analysis.urgency.level}/5` : "Chờ dữ kiện"}
        />
        <SummaryMetric
          label="Độ đáp ứng nội xã"
          value={
            analysis.coordination.fulfillmentPercent == null
              ? "Chưa tính"
              : `${analysis.coordination.fulfillmentPercent}%`
          }
        />
      </div>

      <Section title="Dữ kiện và nguồn">
        <ul className="space-y-2" role="list">
          {analysis.facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} />
          ))}
        </ul>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Cần xác minh / mâu thuẫn">
          {analysis.missingData.length + analysis.conflicts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Chưa phát hiện dữ kiện còn thiếu hoặc mâu thuẫn.
            </p>
          ) : (
            <ul className="space-y-2 text-sm" role="list">
              {analysis.missingData.map((item) => (
                <li key={`${item.key}-${item.question}`}>
                  • {item.question}
                  <span className="block pl-3 text-xs text-[var(--text-muted)]">{item.impact}</span>
                </li>
              ))}
              {analysis.conflicts.map((item) => (
                <li key={`${item.key}-${item.factIds.join("-")}`}>• {item.question}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Câu hỏi ưu tiên">
          {analysis.priorityQuestion ? (
            <p className="text-sm">
              {analysis.priorityQuestion.question}
              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                {analysis.priorityQuestion.expectedImpact}
              </span>
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Chưa có câu hỏi ưu tiên.</p>
          )}
        </Section>
      </div>

      <Section title="Nhu cầu theo định mức của hệ thống">
        <DataTable
          headers={["Vật tư", "Nhu cầu", "Cơ sở"]}
          rows={analysis.requirements.items.map((item) => [
            item.name,
            `${item.totalQuantity} ${item.unit}`,
            item.basis,
          ])}
          empty={analysis.requirements.reason ?? "Chưa có nhu cầu để hiển thị."}
        />
      </Section>

      <Section title="Điều phối nội xã">
        <DataTable
          headers={["Kho", "Vật tư lấy từ kho này", "Tuyến"]}
          rows={groupAllocationsByWarehouse(analysis.coordination.allocations, itemBySku).map(
            (group) => [group.warehouseName, group.items, group.route],
          )}
          empty={analysis.coordination.reason ?? "Chưa có phân bổ nội xã."}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Mưa và dự báo">
          <ul className="space-y-2 text-sm" role="list">
            {analysis.forecasts.map((forecast) => (
              <li key={forecast.horizonHours}>
                <span className="font-medium">{forecast.horizonHours} giờ:</span>{" "}
                {forecast.explanation}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Liên xã khi thiếu nội xã">
          {analysis.coordination.externalContacts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Chưa kích hoạt: phương án nội xã chưa thiếu hoặc chưa đủ dữ kiện.
            </p>
          ) : (
            <ul className="space-y-2 text-sm" role="list">
              {analysis.coordination.externalContacts.map((contact) => (
                <li
                  key={contact.communeName}
                  className="rounded-md border bg-[var(--surface-2)] p-2"
                >
                  <span className="font-medium">{contact.referencePoint.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {contact.phone ?? "Chưa có số liên hệ"} · {contact.disclaimer}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Chỉ giữ câu tóm tắt và giờ tính. Vân tay bản ghi cùng phiên bản định mức
          là thứ để đối chiếu khi truy vết chứ không phải thứ cán bộ trực cần đọc;
          chúng vẫn nằm nguyên trong bản ghi và nhật ký, chỉ là không bày ra đây. */}
      <div className="border-t pt-3 text-xs text-[var(--text-muted)]">
        <p>{analysis.explanation.summary}</p>
        <p className="mt-1">Tính lúc {formatDate(snapshot.computedAt)}</p>
      </div>
    </div>
  );
}

function FactRow({ fact }: { fact: CoordinationFact }) {
  const detail =
    fact.provenance === "MISSING" ? fact.question : stringifyValue(fact.value, fact.key);
  return (
    <li className="rounded-md border bg-[var(--surface)] p-2 text-sm">
      <span
        className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${FACT_TONE[fact.provenance]}`}
      >
        {provenanceLabel(fact.provenance)}
      </span>
      <span className="font-medium">{factKeyLabel(fact.key)}</span>
      <span className="ml-2">{detail}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-[var(--surface-2)] p-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

/**
 * Gộp phân bổ theo kho: mỗi kho một dòng, liệt kê vật tư lấy từ đó.
 *
 * Backend trả mỗi cặp (kho, vật tư) một dòng nên một kho góp bốn thứ là bốn dòng
 * lặp lại tên kho và quãng đường y hệt — đọc phải tự nhặt ra "kho này đưa những
 * gì", đúng câu người điều phối cần trả lời. Cùng một vật tư ở cùng một kho mà
 * backend tách thành nhiều lô cũng cộng lại làm một, vì với người đi lấy hàng thì
 * "570 lít nước" mới là con số dùng được, không phải "120 và 450".
 */
function groupAllocationsByWarehouse(
  allocations: CoordinationAnalysis["coordination"]["allocations"],
  itemBySku: Map<string, { name: string; unit: string }>,
) {
  const groups = new Map<
    string,
    { warehouseName: string; route: string; quantityBySku: Map<string, number> }
  >();
  for (const item of allocations) {
    const existing = groups.get(item.warehouseId) ?? {
      warehouseName: item.warehouseName,
      route: routeLabel(item.routeStatus, item.distanceKm, item.etaMinutes),
      quantityBySku: new Map<string, number>(),
    };
    existing.quantityBySku.set(
      item.sku,
      (existing.quantityBySku.get(item.sku) ?? 0) + item.quantity,
    );
    groups.set(item.warehouseId, existing);
  }
  return [...groups.values()].map((group) => ({
    warehouseName: group.warehouseName,
    route: group.route,
    items: [...group.quantityBySku.entries()]
      // Tên thật thay cho mã SKU: cán bộ đọc "Áo phao người lớn", không phải "LIFE-ADULT".
      .map(([sku, quantity]) => {
        const item = itemBySku.get(sku);
        return item ? `${item.name} ${quantity} ${item.unit}` : `${sku} ${quantity}`;
      })
      .join(" · "),
  }));
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row.join("-")}-${rowIndex}`} className="border-t">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="mt-4 space-y-2" aria-busy="true" aria-label="Đang tải bản tham mưu">
      <div className="h-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
    </div>
  );
}
function EmptyState() {
  return (
    <p className="mt-4 text-sm text-[var(--text-muted)]">
      Chưa có bản tham mưu. Bấm <b>Lập bản tham mưu</b> ở khối Tình huống khẩn cấp phía trên để xem
      dữ kiện, nhu cầu và các điểm cần xác minh.
    </p>
  );
}
function ErrorState({ error }: { error: unknown }) {
  return (
    <p role="alert" className="mt-3 text-sm text-[var(--color-critical)]">
      {error instanceof ApiError ? error.message : "Không tải được bản tham mưu. Vui lòng thử lại."}
    </p>
  );
}
function statusLabel(status: CoordinationAnalysis["status"]) {
  return status === "VERIFIED"
    ? "Đã xác minh"
    : status === "NEEDS_CONFIRMATION"
      ? "Cần xác minh"
      : "Sơ bộ";
}
function provenanceLabel(provenance: CoordinationFact["provenance"]) {
  return provenance === "REPORTED"
    ? "Báo cáo"
    : provenance === "VERIFIED"
      ? "Đã xác minh"
      : provenance === "AI_INFERENCE"
        ? "AI suy luận"
        : "Chưa xác minh";
}
function routeLabel(status: string, distanceKm: number | null, etaMinutes: number | null) {
  return status === "AVAILABLE"
    ? `${distanceKm ?? "?"} km · ${etaMinutes ?? "?"} phút`
    : status === "UNKNOWN"
      ? "Chưa có tuyến"
      : "Không có tuyến";
}
/** Tên khoá dữ kiện đọc được, thay cho mã hằng của backend. */
const FACT_KEY_LABEL: Record<string, string> = {
  LOCATION: "Địa điểm",
  AFFECTED_PEOPLE: "Số người ảnh hưởng",
  HOUSEHOLDS: "Số hộ",
  INCIDENT_TYPE: "Loại tình huống",
  WEATHER: "Thời tiết",
  ISOLATION_RISK: "Nguy cơ cô lập",
  PEOPLE_STRANDED: "Người mắc kẹt",
  VULNERABLE_GROUP: "Nhóm dễ tổn thương",
  ACCESS_CONDITION: "Khả năng tiếp cận",
  DURATION_HOURS: "Thời gian dự kiến",
  OTHER: "Thông tin khác",
};

function factKeyLabel(key: string) {
  return FACT_KEY_LABEL[key] ?? key;
}

/**
 * Đổi giá trị dữ kiện sang câu tiếng Việt đọc được.
 *
 * Trước đây chỗ này in thẳng giá trị thô, nên màn hình hiện `FLOOD` và cả khối
 * JSON `{"alert":false,"periodHours":72,...}` — dữ liệu đúng nhưng không ai ngoài
 * lập trình viên đọc được, mà đây là màn hình cán bộ xã nhìn để ra quyết định.
 */
function stringifyValue(value: unknown, key?: string) {
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return key === "INCIDENT_TYPE" ? incidentTypeLabel(value) : value;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object")
    return describeObjectValue(value as Record<string, unknown>);
  return String(value ?? "—");
}

/** Nhãn tiếng Việt cho các trường hay gặp trong giá trị dạng đối tượng (thời tiết…). */
const VALUE_FIELD_LABEL: Record<string, string> = {
  alert: "Cảnh báo",
  periodHours: "Khoảng thời gian",
  totalRainMm: "Tổng lượng mưa",
};

const VALUE_FIELD_UNIT: Record<string, string> = {
  periodHours: "giờ",
  totalRainMm: "mm",
};

function describeObjectValue(value: Record<string, unknown>) {
  return Object.entries(value)
    .map(([field, raw]) => {
      const label = VALUE_FIELD_LABEL[field] ?? field;
      const unit = VALUE_FIELD_UNIT[field];
      const text = typeof raw === "boolean" ? (raw ? "có" : "không") : String(raw ?? "—");
      return unit ? `${label}: ${text} ${unit}` : `${label}: ${text}`;
    })
    .join(" · ");
}
function displayMetricValue(value: number | null) {
  return value === null ? "?" : String(value);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
/** Các mẫu giả định hệ thống bóc tách được — bấm vào là điền sẵn vào ô. */
const WHAT_IF_EXAMPLES = [
  "nếu có 200 người cần hỗ trợ",
  "nếu kéo dài 72 giờ",
  "dự trữ thêm 20%",
  "bỏ kho thôn Long Châu",
];

const METRIC_LABEL: Record<string, string> = {
  requiredQuantity: "Tổng nhu cầu",
  allocatedQuantity: "Kho cấp được",
  fulfillmentPercent: "Độ đáp ứng",
};

function metricUnit(unit: string) {
  // "units" là đơn vị kỹ thuật của backend, không phải chữ để người dùng đọc.
  return unit === "%" ? "%" : "";
}

function directionLabel(direction: string) {
  if (direction === "INCREASED") return "(tăng)";
  if (direction === "DECREASED") return "(giảm)";
  return "(không đổi)";
}

function metricTone(direction: string) {
  if (direction === "DECREASED") return "var(--color-critical)";
  if (direction === "INCREASED") return "var(--color-attention)";
  return "var(--text)";
}

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
      <Section title="Thử giả định an toàn">
        <p className="text-sm text-[var(--text-muted)]">
          Hỏi &quot;nếu tình huống xấu hơn thì kho có đủ không?&quot; mà{" "}
          <b className="text-[var(--text)]">không đụng tới phương án đang chạy</b>. Kết quả là một
          bản mô phỏng riêng, đặt cạnh bản gốc để so.
        </p>
        <label className="mt-3 block text-sm font-medium" htmlFor="what-if-input">
          Giả định bằng lời
        </label>
        <textarea
          id="what-if-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder="Ví dụ: nếu có 150 người cần hỗ trợ"
          className="mt-2 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
        />
        {/* Nói thẳng hệ thống hiểu được gì. Đây là bộ luật cố định, KHÔNG phải AI
            đoán ý — không liệt kê ra thì người dùng gõ "nếu mưa to hơn" rồi thấy
            mọi con số y nguyên và kết luận là tính năng hỏng. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WHAT_IF_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onChange(example)}
              className="rounded-full border bg-[var(--surface-2)] px-2.5 py-1 text-xs transition hover:bg-[var(--surface)]"
            >
              {example}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={disabled}
            className="rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface)] disabled:opacity-60"
          >
            {pending ? "Đang mô phỏng…" : "Chạy thử giả định"}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            Chỉ tạo snapshot mô phỏng, không áp dụng vào phương án thật.
          </span>
        </div>
        {error ? <ErrorState error={error} /> : null}
        {result ? (
          <div className="mt-3 rounded-md border bg-[var(--surface-2)] p-3 text-sm">
            <p className="font-semibold">Kết quả mô phỏng (không áp dụng vào phương án thật)</p>
            <ul className="mt-2 space-y-1" role="list">
              {result.delta.metrics.map((metric) => (
                <li key={metric.key} className="flex flex-wrap items-baseline gap-1.5">
                  <span>{METRIC_LABEL[metric.key] ?? metric.key}:</span>
                  <span className="tabular text-[var(--text-muted)]">
                    {displayMetricValue(metric.baseline)}
                    {metricUnit(metric.unit)}
                  </span>
                  <span aria-hidden="true">→</span>
                  <b className="tabular" style={{ color: metricTone(metric.direction) }}>
                    {displayMetricValue(metric.simulated)}
                    {metricUnit(metric.unit)}
                  </b>
                  <span className="text-xs text-[var(--text-muted)]">
                    {directionLabel(metric.direction)}
                  </span>
                </li>
              ))}
            </ul>
            {result.unresolvedAssumptions.length > 0 ? (
              <p className="mt-2 rounded-md border border-dashed px-2.5 py-2 text-xs text-[var(--color-attention)]">
                Chưa hiểu được giả định “
                {result.unresolvedAssumptions.map((item) => item.sourceText).join("; ")}” nên các
                con số bên trên giữ nguyên. Hãy diễn đạt theo một trong các mẫu gợi ý phía trên.
              </p>
            ) : null}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
/** Khoá idempotency cho mỗi lượt bấm. Dùng chung với nút ở khối tình huống. */
export function requestId(prefix = "analysis") {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

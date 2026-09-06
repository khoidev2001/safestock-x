"use client";

import { useQuery } from "@tanstack/react-query";
import { describeItemQuantity, type CoordinationAnalysis } from "@safestock/shared-types";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { FieldUpdateTimeline } from "./field-update-timeline";
import { ColorIcon } from "@/components/shared/color-icon";
import { ApiError } from "@/lib/api";
import {
  getLatestCoordinationAnalysis,
  type CoordinationAnalysisSnapshot,
} from "@/lib/mission-api";

export function CoordinationAnalysisPanel({
  missionId,
  fieldUpdateId,
  onRun,
  running = false,
  defaultOpen,
}: {
  missionId: string;
  /** Bằng chứng cần cuộn tới khi mở từ chuông thông báo. */
  fieldUpdateId?: string | null;
  /**
   * Đường lập bản tham mưu ĐẦU TIÊN, chỉ dành cho nhiệm vụ đã phát hành.
   *
   * Lập xong rồi thì chỗ gọi không truyền nữa và nút biến mất vĩnh viễn: bản tham
   * mưu nay tự lập lại mỗi khi số liệu nhiệm vụ đổi, nên một nút mời bấm lại chỉ
   * lặp đúng việc hệ thống vừa tự làm — mỗi lượt bấm là một lượt gọi LLM và một
   * bản mới đè lên bản đang đọc dở.
   *
   * Vẫn phải giữ cho trường hợp nhiệm vụ phát hành mà chưa hề có bản tham mưu:
   * lúc đó khối khai tình huống đã ẩn, không còn đường nào khác.
   */
  onRun?: () => void;
  running?: boolean;
  /**
   * Mở sẵn hay thu gọn sẵn khi khối được dựng.
   *
   * Chỗ gọi quyết định, vì nó là nơi biết nhiệm vụ đang ở bước nào. `CollapsiblePanel`
   * chỉ đọc giá trị này lúc gắn vào cây, nên muốn khối tự đóng lúc bước việc đổi thì
   * chỗ gọi phải đổi luôn `key` — xem `MissionView`.
   */
  defaultOpen?: boolean;
}) {
  const latest = useQuery({
    queryKey: ["mission", missionId, "coordination-analysis"],
    queryFn: () => getLatestCoordinationAnalysis(missionId),
    refetchInterval: 15_000,
  });
  const snapshot = latest.data;
  const analysis = snapshot?.result;
  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
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

      {latest.isError && <ErrorState error={latest.error} />}
      {latest.isPending ? (
        <AnalysisSkeleton />
      ) : !analysis ? (
        <EmptyState />
      ) : (
        <AnalysisBody analysis={analysis} snapshot={snapshot} />
      )}
      {/* Không bọc trong div có viền: chưa có bằng chứng thì khối này trả về null,
          mà cái viền vẫn ở lại thành một vạch kẻ cụt không thuộc về gì cả. */}
      <FieldUpdateTimeline missionId={missionId} focusUpdateId={fieldUpdateId ?? null} />
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

      <Section title="Nhu cầu theo định mức của hệ thống">
        <DataTable
          headers={["Vật tư", "Nhu cầu", "Cơ sở"]}
          rows={analysis.requirements.items.map((item) => [
            item.name,
            // Nước hiện cả hai con số: kho bốc theo CHAI, định mức đối chiếu theo LÍT.
            describeItemQuantity(item.sku, item.totalQuantity, item.unit),
            item.basis,
          ])}
          empty={analysis.requirements.reason ?? "Chưa có nhu cầu để hiển thị."}
        />
      </Section>

      <Section title="Điều phối nội xã">
        <DataTable
          headers={["Kho", "Những vật tư cần lấy", "Khoảng cách"]}
          rows={groupAllocationsByWarehouse(analysis.coordination.allocations, itemBySku).map(
            (group) => [group.warehouseName, group.items, group.route],
          )}
          empty={analysis.coordination.reason ?? "Chưa có phân bổ nội xã."}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Dự báo là thông tin nền, không phải việc phải làm ngay: gấp lại để
            phần điều phối lên trên màn hình, ai cần thì mở ra đọc. */}
        <details className="self-start rounded-md border bg-[var(--surface-2)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">
            Mưa và dự báo
            {analysis.forecasts.length > 0 ? ` (${analysis.forecasts.length} mốc)` : ""}
          </summary>
          {analysis.forecasts.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">Chưa có số liệu dự báo.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm" role="list">
              {analysis.forecasts.map((forecast) => (
                <li key={forecast.horizonHours}>
                  <span className="font-medium">{forecast.horizonHours} giờ:</span>{" "}
                  {forecast.explanation}
                </li>
              ))}
            </ul>
          )}
        </details>
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
function routeLabel(status: string, distanceKm: number | null, etaMinutes: number | null) {
  return status === "AVAILABLE"
    ? `${distanceKm ?? "?"} km · ${etaMinutes ?? "?"} phút`
    : status === "UNKNOWN"
      ? "Chưa có tuyến"
      : "Không có tuyến";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
/** Các mẫu giả định hệ thống bóc tách được — bấm vào là điền sẵn vào ô. */

/** Khoá idempotency cho mỗi lượt bấm. Dùng chung với nút ở khối tình huống. */
export function requestId(prefix = "analysis") {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

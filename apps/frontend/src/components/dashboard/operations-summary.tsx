"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { TabLink } from "@/components/shared/tab-link";
import { Pagination, usePagination } from "@/components/shared/pagination";
import {
  getCommuneLowStock,
  getIncidentTimeline,
  type IncidentSummary,
  type InventoryBatch,
  type WarehouseReadiness,
} from "@/lib/dashboard-api";
import {
  INCIDENT_ACTION_LABEL,
  INCIDENT_KIND_LABEL,
  SENSOR_EVENT_LABEL,
  incidentSeverity,
} from "@/lib/incident-labels";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { InterCommuneLoanSummary } from "./inter-commune-loan-summary";

/** Lô còn từ ngần này món trở xuống thì coi là sắp cạn. */
const LOW_QUANTITY = 10;

/** Bao nhiêu dòng hiện sẵn trước khi phải bấm "xem thêm". */
const PREVIEW_ROWS = 6;

/** Mỗi trang của bảng "lô còn ít". Toàn xã có thể tới vài trăm lô. */
const LOW_STOCK_PAGE_SIZE = 10;

interface OperationsSummaryProps {
  readiness: WarehouseReadiness | null | undefined;
  batches: InventoryBatch[] | undefined;
  incidents: IncidentSummary[] | undefined;
  warehouseId: string;
}

/**
 * Hai việc đang cần để mắt tới: lô nào sắp cạn, và sự cố nào đang mở.
 *
 * Trước đây khối này là bốn thẻ chỉ có CON SỐ — "Lô còn ít: 6", "Sự cố mở: 1".
 * Con số nói có việc nhưng không nói việc gì, nên người trực phải sang tab khác
 * rồi tự dò lại từ đầu mới biết sáu lô ấy là lô nào. Đó là hai lượt chuyển trang
 * cho một câu hỏi mà màn hình này đáng lẽ trả lời được ngay.
 *
 * Thẻ "Khả năng điều phối" đã bỏ: kết luận điều phối nằm ngay khối bên dưới, kèm
 * đủ lý do, còn ở đây nó chỉ lặp lại đúng một dòng chữ.
 */
export function OperationsSummary({
  readiness,
  batches,
  incidents,
  warehouseId,
}: OperationsSummaryProps) {
  const recommendation =
    readiness?.recommendedActions?.[0] ?? readiness?.recommendations?.[0]?.message;

  return (
    <section className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <LowStockPanel batches={batches} warehouseId={warehouseId} />
        <OpenIncidentsPanel incidents={incidents} />
      </div>

      {/* Ngay dưới tồn kho: con số tồn ở trên không tách được phần hàng đi mượn
          phải trả lại và phần đã đưa đi chưa lấy về. */}
      <InterCommuneLoanSummary />

      <div className="app-panel border-t-2 p-4" style={{ borderTopColor: "var(--color-accent)" }}>
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
          <ColorIcon name="workflow" size={19} tone="blue" />
          Việc cần làm
        </div>
        <p className="mt-3 text-lg font-semibold">
          {recommendation ? "Có việc cần làm" : "Ổn định"}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {recommendation ?? "Chưa phát sinh việc cần xử lý"}
        </p>
      </div>
    </section>
  );
}

/** Một dòng "lô còn ít", gộp từ hai nguồn có hình dạng khác nhau. */
interface LowStockRow {
  batchId: string;
  batchCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  /** Null khi chỉ đọc được kho của chính mình — lúc đó không có gì để phân biệt. */
  warehouseName: string | null;
  location: string;
}

type LowStockSort = "asc" | "desc";

const LOW_STOCK_SORTS: { value: LowStockSort; label: string }[] = [
  { value: "asc", label: "Ít đến nhiều" },
  { value: "desc", label: "Nhiều đến ít" },
];

/**
 * Những lô sắp cạn của TOÀN XÃ.
 *
 * Đọc theo xã chứ không theo một kho: bảng tồn của kho tổng không chứa hàng đã
 * đẩy xuống thôn, nên dòng "xuồng cứu hộ còn 6 chiếc" trước đây không nói được
 * sáu chiếc ấy nằm ở đâu — mà "kho nào" mới là thứ quyết định cho xe chạy đi đâu.
 *
 * Kho thôn gọi vào đường toàn xã sẽ bị từ chối (403); lúc đó quay về đúng danh
 * sách lô của chính kho mình và bỏ cột tên kho, vì cả danh sách chỉ có một kho
 * thì cột đó lặp lại một cái tên ở mọi dòng.
 *
 * PHÂN TRANG chứ không phải nút "xem thêm": mở toàn xã ra thì danh sách nhảy từ
 * tám lô lên gần hai trăm, mà nút xem thêm đổ hết ngần ấy dòng vào giữa trang và
 * đẩy mọi khối bên dưới ra khỏi màn hình.
 *
 * Kèm vị trí kệ vì việc kế tiếp sau khi đọc dòng này là đi tới đó đếm lại — biết
 * "áo phao còn 4 chiếc" mà không biết nó nằm khu nào thì vẫn phải tra tiếp.
 */
function LowStockPanel({
  batches,
  warehouseId,
}: {
  batches: InventoryBatch[] | undefined;
  warehouseId: string;
}) {
  const [sort, setSort] = useState<LowStockSort>("asc");

  const communeQuery = useQuery({
    queryKey: ["commune-low-stock", warehouseId, LOW_QUANTITY],
    queryFn: () => getCommuneLowStock(warehouseId, LOW_QUANTITY),
    enabled: Boolean(warehouseId),
    // Không thử lại: 403 là câu trả lời dứt khoát cho kho thôn, thử lại chỉ tốn
    // lượt gọi và làm chậm màn hình.
    retry: false,
    staleTime: 60_000,
  });

  const rows: LowStockRow[] | undefined = useMemo(() => {
    if (communeQuery.data) {
      return communeQuery.data.items.map((item) => ({
        batchId: item.batchId,
        batchCode: item.batchCode,
        itemName: item.itemName,
        unit: item.unit,
        quantity: item.quantity,
        warehouseName: item.warehouseName,
        location:
          item.zoneName && item.shelfCode
            ? `${item.zoneName} / kệ ${item.shelfCode}`
            : "chưa xếp lên kệ",
      }));
    }
    if (!communeQuery.isError) return undefined;
    return (batches ?? [])
      .filter((batch) => batch.quantity <= LOW_QUANTITY)
      .map((batch) => ({
        batchId: batch.id,
        batchCode: batch.batchCode,
        itemName: batch.item.name,
        unit: batch.item.category.unit,
        quantity: batch.quantity,
        warehouseName: null,
        location: batch.shelf
          ? `${batch.shelf.zone.name} / kệ ${batch.shelf.code}`
          : "chưa xếp lên kệ",
      }));
  }, [batches, communeQuery.data, communeQuery.isError]);

  /**
   * Sắp ở web chứ không xin máy chủ sắp lại: cả danh sách đã nằm sẵn trong tay,
   * gọi thêm một lượt mạng chỉ để đảo thứ tự là bắt người dùng chờ một thứ máy
   * họ làm được ngay.
   *
   * Hai lô cùng số lượng thì xếp theo tên hàng — không có mốc phụ thì thứ tự
   * giữa chúng đổi mỗi lần vẽ lại, và bảng gần hai trăm dòng toàn số 0 nhảy loạn
   * ngay dưới con trỏ.
   */
  const sorted = useMemo(() => {
    if (!rows) return undefined;
    return [...rows].sort(
      (a, b) =>
        (sort === "asc" ? a.quantity - b.quantity : b.quantity - a.quantity) ||
        a.itemName.localeCompare(b.itemName, "vi") ||
        a.batchCode.localeCompare(b.batchCode),
    );
  }, [rows, sort]);

  const pagination = usePagination(sorted ?? [], LOW_STOCK_PAGE_SIZE);

  return (
    <div className="app-panel flex flex-col">
      <PanelHeader
        count={sorted?.length ?? 0}
        countLabel="lô"
        href="/inventory"
        hrefLabel="Mở kho vật tư →"
        icon={<ColorIcon name="packageSearch" size={19} tone="orange" />}
        subtitle={`Còn từ ${LOW_QUANTITY} món trở xuống`}
        title="Lô còn ít"
      />

      {sorted === undefined ? (
        <PanelSkeleton />
      ) : sorted.length === 0 ? (
        <PanelEmpty text="Không có lô nào sắp cạn." />
      ) : (
        <>
          <div className="flex items-center justify-end gap-2 px-4 pb-2">
            <label className="text-xs text-[var(--text-muted)]" htmlFor="lo-con-it-sap-xep">
              Sắp xếp
            </label>
            <select
              className="select-field rounded-md border bg-[var(--surface)] py-1.5 pl-2.5 text-xs"
              id="lo-con-it-sap-xep"
              onChange={(event) => {
                setSort(event.target.value as LowStockSort);
                // Về trang 1 khi đổi thứ tự: người vừa chọn "nhiều nhất trước"
                // đang ở trang 7 sẽ nhận được khúc giữa của danh sách mới, không
                // phải thứ họ vừa xin xem.
                pagination.setPage(1);
              }}
              value={sort}
            >
              {LOW_STOCK_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="px-4">
            <ul className="divide-y">
              {pagination.pageItems.map((row) => (
                <li className="flex items-baseline justify-between gap-3 py-2.5" key={row.batchId}>
                  <div className="min-w-0">
                    {/* Tên KHO đứng cùng hàng với tên hàng, ngay sau nó: câu hỏi kế
                        tiếp sau "cái gì sắp hết" luôn là "ở đâu", và tên khu/kệ ở
                        dòng dưới trả lời một câu hẹp hơn hẳn — trong kho ấy, chỗ nào. */}
                    <p className="truncate text-sm font-medium">
                      {row.itemName}
                      {row.warehouseName ? (
                        <span className="font-normal text-[var(--text-muted)]">
                          {" · "}
                          {row.warehouseName}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {row.batchCode} · {row.location}
                    </p>
                  </div>
                  {/* Số lượng tô đỏ khi đã cạn hẳn: lô 0 món không phải "còn ít",
                      nó là một dòng sổ cần dọn chứ không phải hàng để điều đi. */}
                  <span
                    className="tabular shrink-0 text-sm font-semibold"
                    style={row.quantity === 0 ? { color: "var(--color-critical)" } : undefined}
                  >
                    {row.quantity.toLocaleString("vi")} {row.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Pagination
            label="lô"
            onPageChange={pagination.setPage}
            padding="px-4 py-3"
            page={pagination.page}
            pageSize={pagination.pageSize}
            showSummary={false}
            totalItems={sorted.length}
            totalPages={pagination.totalPages}
          />
        </>
      )}
    </div>
  );
}

/**
 * Sự cố đang mở, nghiêm trọng nhất lên trước; bấm vào một dòng để đọc chi tiết.
 *
 * Mở BẢNG ngay tại đây thay vì chuyển sang tab Sự cố: người đang đọc trang tổng
 * quan thường chỉ cần biết chuyện gì xảy ra rồi quay lại việc đang làm, mà chuyển
 * tab là mất chỗ đang đọc. Ai cần tiếp nhận hay đóng sự cố thì bảng có đường dẫn
 * sang tab Sự cố — nơi giữ các nút đổi trạng thái.
 */
function OpenIncidentsPanel({ incidents }: { incidents: IncidentSummary[] | undefined }) {
  const [showAll, setShowAll] = useState(false);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);

  const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...(incidents ?? [])].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      // Cùng mức thì mới nhất trước: sự cố vừa bật là thứ chưa ai kịp nhìn.
      new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_ROWS);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div className="app-panel flex flex-col">
      {/* "Chưa có ai tiếp nhận" chứ không phải "chưa xử lý xong": danh sách này
          lọc đúng state=OPEN, nên sự cố đã có người nhận KHÔNG nằm ở đây. Ghi
          rộng hơn thực tế thì người trực tưởng cả kho chỉ còn ngần này việc. */}
      <PanelHeader
        count={sorted.length}
        countLabel="sự cố"
        href="/incident"
        hrefLabel="Mở trang sự cố →"
        icon={<ColorIcon name="incident" size={19} tone="red" />}
        subtitle="Chưa có ai tiếp nhận"
        title="Sự cố chưa xử lý"
      />

      {incidents === undefined ? (
        <PanelSkeleton />
      ) : sorted.length === 0 ? (
        <PanelEmpty text="Kho đang vận hành bình thường." />
      ) : (
        <div className="p-4 pt-0">
          <ul className="divide-y">
            {visible.map((incident) => {
              const severity = incidentSeverity(incident.severity);
              return (
                <li key={incident.id}>
                  <button
                    className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    onClick={() => setOpenIncidentId(incident.id)}
                    title={`Xem chi tiết: ${incident.title}`}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{incident.title}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {INCIDENT_KIND_LABEL[incident.kind] ?? incident.kind} ·{" "}
                        {formatDateTime(incident.detectedAt)}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold"
                      style={{
                        color: severity.color,
                        background: `color-mix(in oklch, ${severity.color} 12%, transparent)`,
                      }}
                    >
                      {severity.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {hiddenCount > 0 ? (
            <ShowMoreButton count={hiddenCount} noun="sự cố" onClick={() => setShowAll(true)} />
          ) : null}
        </div>
      )}

      <IncidentDetailDialog
        incidentId={openIncidentId}
        onClose={() => setOpenIncidentId(null)}
        summary={sorted.find((incident) => incident.id === openIncidentId) ?? null}
      />
    </div>
  );
}

/**
 * Chi tiết một sự cố: vì sao hệ thống kết luận như vậy, và đã ai động tới chưa.
 *
 * Phần tóm tắt vẽ NGAY từ dòng vừa bấm, không đợi mạng: người dùng bấm vào một
 * dòng họ đã đọc rồi, mở ra thấy ô trống chờ tải là thấy màn hình thụt lùi. Bằng
 * chứng và lịch sử xử lý mới cần gọi thêm, nên chỉ mình chúng có trạng thái tải.
 */
function IncidentDetailDialog({
  incidentId,
  onClose,
  summary,
}: {
  incidentId: string | null;
  onClose: () => void;
  summary: IncidentSummary | null;
}) {
  useBodyScrollLock(incidentId !== null);

  const query = useQuery({
    queryKey: ["incident-timeline", incidentId],
    queryFn: () => getIncidentTimeline(incidentId as string),
    enabled: Boolean(incidentId),
  });

  useEffect(() => {
    if (!incidentId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [incidentId, onClose]);

  if (!incidentId || !summary) return null;

  const severity = incidentSeverity(summary.severity);
  const detail = query.data;
  const explanation = detail?.explanation ?? summary.explanation ?? null;

  return (
    <div
      aria-label={`Chi tiết sự cố: ${summary.title}`}
      aria-modal="true"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-lg border bg-[var(--surface)] shadow-xl">
        <div
          className="flex items-start justify-between gap-3 border-b p-5"
          style={{ borderLeftWidth: 3, borderLeftColor: severity.color }}
        >
          <div className="min-w-0">
            <h3 className="font-semibold">{summary.title}</h3>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              {INCIDENT_KIND_LABEL[summary.kind] ?? summary.kind} · độ tin cậy{" "}
              {Math.round(summary.confidence * 100)}%
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-xs font-semibold"
                style={{
                  color: severity.color,
                  background: `color-mix(in oklch, ${severity.color} 12%, transparent)`,
                }}
              >
                {severity.label}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                Phát hiện {formatDateTime(summary.detectedAt)}
              </span>
            </div>
          </div>
          <button
            aria-label="Đóng"
            className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--surface-2)]"
            onClick={onClose}
            type="button"
          >
            Đóng
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Giải thích AI tự sinh khi sự cố mới bật (backend enrich). */}
          {explanation ? (
            <div
              className="flex items-start gap-2 rounded-md p-3"
              style={{
                background: "color-mix(in oklch, #7c3aed 10%, transparent)",
                border: "1px solid color-mix(in oklch, #7c3aed 35%, transparent)",
              }}
            >
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white"
                style={{ background: "#7c3aed" }}
              >
                AI
              </span>
              <p className="text-sm leading-relaxed">{explanation}</p>
            </div>
          ) : null}

          <section>
            <h4 className="text-sm font-semibold">Bằng chứng từ cảm biến</h4>
            {query.isLoading ? (
              <div className="mt-2 h-16 animate-pulse rounded-md bg-[var(--surface-2)]" aria-busy="true" />
            ) : query.isError ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Chưa tải được bằng chứng. Kết nối có thể đang gián đoạn.
              </p>
            ) : (detail?.evidence.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Sự cố này không dựa trên số đo cảm biến nào.
              </p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {detail?.evidence.map((item) => (
                  <li className="flex items-baseline justify-between gap-3 py-2" key={item.id}>
                    <div className="min-w-0">
                      <p className="truncate">
                        {SENSOR_EVENT_LABEL[item.eventType] ?? item.eventType}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {item.deviceCode} · {formatDateTime(item.occurredAt)}
                      </p>
                    </div>
                    <span className="tabular shrink-0 font-medium">{item.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold">Đã xử lý tới đâu</h4>
            {query.isLoading ? (
              <div className="mt-2 h-10 animate-pulse rounded-md bg-[var(--surface-2)]" aria-busy="true" />
            ) : (detail?.actions.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Chưa ai tiếp nhận sự cố này.
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {detail?.actions.map((action) => (
                  <li key={action.id}>
                    <span className="font-medium">
                      {INCIDENT_ACTION_LABEL[action.action] ?? action.action}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {" · "}
                      {formatDateTime(action.createdAt)}
                    </span>
                    {action.note ? (
                      <p className="text-xs text-[var(--text-muted)]">{action.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Nút đổi trạng thái nằm ở tab Sự cố, không nhân bản sang đây: hai chỗ
            cùng tiếp nhận được một sự cố là hai chỗ phải nhớ đồng bộ trạng thái. */}
        <div className="border-t p-4">
          {/* Đóng hộp thoại trước khi đi: để mở thì nó còn nằm đó lúc quay
              lại trang này, che mất đúng danh sách người dùng vừa rời khỏi. */}
          <TabLink
            className="text-sm font-medium text-[var(--color-accent)] hover:underline"
            href="/incident"
            onClick={onClose}
          >
            Tiếp nhận hoặc đóng sự cố ở trang Sự cố →
          </TabLink>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  count,
  countLabel,
  href,
  hrefLabel,
  icon,
  subtitle,
  title,
}: {
  count: number;
  countLabel: string;
  href: string;
  hrefLabel: string;
  icon: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4">
      <div className="flex items-baseline gap-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
        {count > 0 ? (
          <span className="tabular text-sm text-[var(--text-muted)]">
            {count} {countLabel}
          </span>
        ) : null}
      </div>
      <TabLink
        className="text-sm font-medium text-[var(--color-accent)] hover:underline"
        href={href}
      >
        {hrefLabel}
      </TabLink>
      <p className="w-full text-xs text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="p-4 pt-0" aria-busy="true">
      <div className="h-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
    </div>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <p className="px-4 pb-4 text-sm text-[var(--text-muted)]">{text}</p>;
}

function ShowMoreButton({
  count,
  noun,
  onClick,
}: {
  count: number;
  noun: string;
  onClick: () => void;
}) {
  return (
    <button
      className="mt-3 text-sm font-medium text-[var(--color-accent)] hover:underline"
      onClick={onClick}
      type="button"
    >
      Xem thêm {count} {noun} nữa
    </button>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

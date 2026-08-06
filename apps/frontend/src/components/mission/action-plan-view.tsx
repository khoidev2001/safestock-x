"use client";

import dynamic from "next/dynamic";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import type { ActionPlan } from "@/lib/mission-api";
import type { LatLng } from "@/lib/geo";

const IncidentMap = dynamic(() => import("./incident-map").then((m) => m.IncidentMap), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-md border bg-[var(--surface)]" />,
});

/**
 * Kể lại thứ tự lấy hàng bằng lời, dựng từ chính quãng đường đã tính.
 *
 * Không nhờ AI viết đoạn này: mọi chữ ở đây đều suy ra được từ số liệu, mà đã suy
 * ra được thì để mô hình viết chỉ tạo thêm một chỗ có thể sai. Kho chưa tính được
 * tuyến xếp cuối và nói rõ là chưa có tuyến, không giả vờ nó ở xa.
 */
interface DispatchStop {
  id: string;
  name: string;
  /** "0.7 km · ~2 phút", hoặc câu báo chưa tính được tuyến. */
  reach: string;
  routed: boolean;
  /** Nhãn ngắn cho chặng đầu / chặng cuối. */
  note: string | null;
  items: string;
}

function describeDispatchOrder(warehouses: ActionPlan["warehouses"]): DispatchStop[] {
  const routed = warehouses
    .filter((w) => w.routeStatus === "ROUTED" && w.distanceKm != null)
    .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number));
  const unrouted = warehouses.filter((w) => w.routeStatus !== "ROUTED" || w.distanceKm == null);

  const listItems = (w: ActionPlan["warehouses"][number]) =>
    w.contributions.map((item) => `${item.itemName} ${item.quantity} ${item.unit}`).join(" · ");

  const stops: DispatchStop[] = routed.map((w, index) => ({
    id: w.id,
    name: w.name,
    reach: `${w.distanceKm} km · ~${w.etaMinutes} phút`,
    routed: true,
    note: index === 0 ? "gần nhất, lấy trước" : index === routed.length - 1 ? "xa nhất" : null,
    items: listItems(w),
  }));

  for (const w of unrouted) {
    stops.push({
      id: w.id,
      name: w.name,
      reach: "Chưa tính được tuyến — cần liên hệ trực tiếp",
      routed: false,
      note: null,
      items: listItems(w),
    });
  }
  return stops;
}

/** Màu theo mức khẩn cấp 1-5 — trực quan, người chưa rành nghiệp vụ đọc được ngay. */
const SEVERITY = [
  { label: "Rất thấp", color: "var(--color-ready)" },
  { label: "Thấp", color: "var(--color-ready)" },
  { label: "Trung bình", color: "var(--color-attention)" },
  { label: "Cao", color: "var(--color-degraded)" },
  { label: "Rất cao", color: "var(--color-critical)" },
];

export function ActionPlanView({
  plan,
  incidentPoint,
}: {
  plan: ActionPlan;
  incidentPoint?: LatLng | null;
}) {
  const sev = SEVERITY[Math.min(4, Math.max(0, plan.severityLevel - 1))];
  const dispatchOrder = describeDispatchOrder(plan.warehouses);

  return (
    <div className="space-y-4">
      {/* Chỉ báo khi phương án KHÔNG do AI lập.
          Trường hợp bình thường thì câu "được hỗ trợ tự động" chẳng thêm gì —
          lần nào cũng hiện thì thành nền, không ai đọc. Còn lúc AI không gọi được
          và hệ thống rơi về quy tắc nghiệp vụ thì đó là tin phải nói: nội dung
          định tính sơ sài hơn hẳn, người đọc cần biết để không tin quá mức. */}
      {plan.generatedBy !== "ai" && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-attention)]">
          <ColorIcon name="warning" size={16} tone="amber" />
          Phương án dự phòng được lập từ quy tắc nghiệp vụ (AI chưa sẵn sàng)
        </div>
      )}

      {/* 1. Đánh giá tình huống + mức khẩn cấp */}
      <CollapsiblePanel
        className="rounded-md border p-5"
        style={{ background: `color-mix(in oklch, ${sev.color} 8%, var(--surface))` }}
        icon={<ColorIcon name="warning" size={19} tone="red" />}
        title="Đánh giá tình huống"
        badge={
          <span
            className="rounded-md px-3 py-1 text-sm font-semibold"
            style={{ background: sev.color, color: "white" }}
          >
            Mức {plan.severityLevel}/5 · {sev.label}
          </span>
        }
      >
        <ul className="space-y-1.5">
          {plan.severityReason.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span style={{ color: sev.color }}>•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-4 border-t pt-3 text-sm text-[var(--text-muted)]">
          <span>
            Độ tin cậy: <b className="text-[var(--text)]">{plan.confidence}%</b>
          </span>
          <span>
            Đáp ứng kho: <b className="text-[var(--text)]">{plan.fulfillment}%</b>
          </span>
        </div>
      </CollapsiblePanel>

      {/* 3. Phương án cấp phát vật tư */}
      <Panel
        icon={<ColorIcon name="inventory" size={19} tone="orange" />}
        title="Phương án cấp phát"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--text-muted)]">
                <th className="pb-2 pr-3 font-medium">Vật tư</th>
                <th className="pb-2 pr-3 text-right font-medium">Cần</th>
                <th className="pb-2 pr-3 text-right font-medium">Cấp</th>
                <th className="pb-2 pr-3 text-right font-medium">Thiếu</th>
                <th className="pb-2 font-medium">Lấy từ kho</th>
              </tr>
            </thead>
            <tbody>
              {plan.allocations.map((a) => (
                <tr key={a.sku} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{a.itemName}</td>
                  <td className="tabular py-2 pr-3 text-right">{a.required}</td>
                  <td className="tabular py-2 pr-3 text-right">{a.allocated}</td>
                  <td
                    className="tabular py-2 pr-3 text-right font-semibold"
                    style={{
                      color: a.shortage > 0 ? "var(--color-critical)" : "var(--color-ready)",
                    }}
                  >
                    {a.shortage > 0 ? a.shortage : "—"}
                  </td>
                  <td className="py-2 text-xs text-[var(--text-muted)]">
                    {a.fromWarehouses.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Mục tiêu + điều phối kho trong một khối: mục tiêu nói phải đạt được gì
          trong 6 giờ đầu, danh sách kho nói lấy hàng ở đâu và mất bao lâu để tới.
          Đọc rời hai khối thì phải nhớ vế này để hiểu vế kia; ghép lại còn lấp
          được khoảng trống bên trái khung bản đồ vuông. */}
      {(plan.warehouses.length > 0 || plan.narrative.objectives.length > 0) && (
        <Panel
          icon={<ColorIcon name="location" size={19} tone="blue" />}
          title="Mục tiêu 6 giờ đầu và điều phối kho"
        >
          {/* Danh sách kho bên trái, bản đồ bên phải.
              Xếp bản đồ nằm dưới thì nó chiếm trọn bề ngang, mà khung vuông nên
              cao gần bằng cả màn hình — phải cuộn qua nó mới đọc tiếp được. Đặt
              cạnh nhau vừa thu nhỏ bản đồ vừa cho đọc quãng đường và nhìn vị trí
              kho cùng lúc, đúng cặp thông tin người dùng đang so. */}
          <div className={incidentPoint ? "grid gap-4 lg:grid-cols-2" : undefined}>
            <div className="min-w-0">
              {plan.narrative.objectives.length > 0 && (
                <>
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <ColorIcon name="target" size={17} tone="blue" />
                    Mục tiêu 6 giờ đầu
                  </h4>
                  <ol className="mb-4 mt-2 space-y-2">
                    {plan.narrative.objectives.map((o, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-[var(--color-accent-fg)]">
                          {i + 1}
                        </span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {plan.warehouses.length > 0 && (
                <h4 className="mb-2 text-sm font-semibold">
                  Kho tham gia và thời gian tới điểm nạn
                </h4>
              )}
              {/* auto-fill thay vì số cột cố định: cùng một danh sách phải vừa cột
                  hẹp (khi có bản đồ bên cạnh) vừa cột rộng (khi không có), không
                  phải đoán breakpoint cho từng trường hợp. */}
              <div className="grid content-start gap-2 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
                {plan.warehouses.map((w) => (
                  <div key={w.id} className="rounded-md border bg-[var(--surface-2)] p-3">
                    <p className="text-sm font-medium">{w.name}</p>
                    <p className="tabular mt-1 text-xs text-[var(--text-muted)]">
                      {w.routeStatus === "ROUTED" && w.distanceKm != null
                        ? `${w.distanceKm} km · ~${w.etaMinutes} phút`
                        : `Chưa tính được tuyến (${w.routeStatus})`}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                      {w.contributions.map((item) => (
                        <li key={item.sku}>
                          {item.itemName}: <b>{item.quantity}</b> {item.unit}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {/* Diễn giải bằng lời cho đúng bảng số ngay trên.
                  Bảng thẻ cho biết kho nào góp gì, nhưng người điều hành còn cần
                  biết ĐI THEO THỨ TỰ NÀO — thứ đó nằm ở cột quãng đường, phải tự
                  so từng thẻ mới ra. Câu này nói thẳng ra, và là câu dựng từ chính
                  số liệu đã tính chứ không phải AI viết thêm. */}
              {dispatchOrder.length > 0 && (
                <div className="mt-3 rounded-md border border-dashed bg-[var(--surface-2)] p-3">
                  <p className="text-sm font-semibold">Thứ tự lấy hàng (gần đến xa)</p>
                  <ol className="mt-2 space-y-2">
                    {dispatchOrder.map((stop, index) => (
                      <li key={stop.id} className="flex gap-2.5 text-sm">
                        <span className="tabular w-5 shrink-0 text-right font-semibold text-[var(--text-muted)]">
                          {index + 1}.
                        </span>
                        <span className="min-w-0">
                          <span className="font-medium">{stop.name}</span>
                          <span
                            className="tabular ml-2 text-xs"
                            style={{
                              color: stop.routed ? "var(--text-muted)" : "var(--color-attention)",
                            }}
                          >
                            {stop.reach}
                          </span>
                          {stop.note ? (
                            <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                              {stop.note}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                            {stop.items}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            {incidentPoint ? (
              <IncidentMap warehouses={plan.warehouses} incidentPoint={incidentPoint} />
            ) : null}
          </div>
        </Panel>
      )}

      {/* 5. Phương án theo giai đoạn */}
      <Panel
        icon={<ColorIcon name="time" size={19} tone="amber" />}
        title="Phương án theo giai đoạn"
      >
        <div className="space-y-3">
          {plan.narrative.phases.map((ph) => (
            <div key={ph.window} className="rounded-md border bg-[var(--surface-2)] p-3">
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent-fg)]">
                <ColorIcon name="time" size={15} tone="amber" />
                {ph.window}
              </div>
              <ul className="space-y-1.5">
                {ph.actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <ColorIcon className="mt-0.5" name="success" size={17} tone="green" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      {/* 6 + 7. Cảnh báo + Dự báo (2 cột) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          icon={<ColorIcon name="warning" size={19} tone="red" />}
          title="Cảnh báo"
          tone="var(--color-degraded)"
        >
          <ul className="space-y-2">
            {plan.narrative.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <ColorIcon className="mt-0.5" name="warning" size={16} tone="red" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={<ColorIcon name="trendUp" size={19} tone="green" />} title="Dự báo">
          <div className="space-y-3">
            {plan.forecasts.map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-sm">
                  <span>{f.label}</span>
                  <span className="tabular font-semibold">{f.probability}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${f.probability}%`,
                      background:
                        f.probability >= 60 ? "var(--color-critical)" : "var(--color-attention)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 8. Câu hỏi bổ sung */}
      <Panel icon={<ColorIcon name="help" size={19} tone="blue" />} title="Thông tin cần bổ sung">
        <div className="flex flex-wrap gap-2">
          {plan.narrative.followUpQuestions.map((q, i) => (
            <span key={i} className="rounded-md border bg-[var(--surface-2)] px-3 py-1.5 text-sm">
              {q}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/**
 * Mọi khối của kế hoạch đều gập được — kế hoạch đầy đủ dài vài màn hình, người
 * dùng thường chỉ soi một phần. Dùng chung CollapsiblePanel với các khối bên
 * ngoài để cách gập/mở ở đâu cũng giống nhau.
 */
function Panel({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <CollapsiblePanel
      className="rounded-md border bg-[var(--surface)] p-5"
      icon={icon}
      title={title}
      tone={tone}
    >
      {children}
    </CollapsiblePanel>
  );
}

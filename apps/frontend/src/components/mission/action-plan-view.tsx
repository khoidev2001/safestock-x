"use client";

import dynamic from "next/dynamic";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import type { ActionPlan, MissionStatus } from "@/lib/mission-api";
import type { LatLng } from "@/lib/geo";
import { describeItemQuantity } from "@safestock/shared-types";
import { completedStepIndex } from "./workflow-progress";

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
  /** Mỗi vật tư một dòng — gộp thành một câu thì kho góp bốn thứ đọc thành một khối chữ. */
  items: string[];
}

function describeDispatchOrder(warehouses: ActionPlan["warehouses"]): DispatchStop[] {
  const routed = warehouses
    .filter((w) => w.routeStatus === "ROUTED" && w.distanceKm != null)
    .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number));
  const unrouted = warehouses.filter((w) => w.routeStatus !== "ROUTED" || w.distanceKm == null);

  const listItems = (w: ActionPlan["warehouses"][number]) =>
    w.contributions.map(
      (item) => `${item.itemName} ${describeItemQuantity(item.sku, item.quantity, item.unit)}`,
    );

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

/**
 * Số lượng cho bảng cấp phát: chỉ số và đơn vị gốc, KHÔNG kèm quy đổi.
 *
 * Khác `describeItemQuantity` mà danh sách điều phối kho bên dưới dùng: chỗ đó là
 * lệnh cho người đi lấy hàng, biết "300 lít" giúp họ ước được cần bao nhiêu chỗ trên
 * xe. Bảng này là bảng đối chiếu bốn cột số cạnh nhau, thêm ngoặc quy đổi vào từng ô
 * là mỗi hàng dài gấp đôi và cột "Vật tư" bị bóp đến mức tên vật tư vỡ làm ba dòng —
 * trong khi con số cần so ở đây vẫn là số chai.
 */
function formatQuantity(quantity: number, unit: string): string {
  return `${quantity.toLocaleString("vi")} ${unit}`;
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
  status,
  warehouseSlot,
}: {
  plan: ActionPlan;
  incidentPoint?: LatLng | null;
  /** Trạng thái nhiệm vụ — quyết định khối nào còn đáng mở sẵn. */
  status: MissionStatus;
  /** Khối "Chuẩn bị vật tư theo SKU", chèn ngay dưới phần điều phối kho. */
  warehouseSlot?: React.ReactNode;
}) {
  const sev = SEVERITY[Math.min(4, Math.max(0, plan.severityLevel - 1))];
  const dispatchOrder = describeDispatchOrder(plan.warehouses);
  /**
   * Việc đã rời khỏi bàn điều phối chưa.
   *
   * Đọc qua `completedStepIndex` thay vì liệt kê tay các status: thanh tiến trình
   * ngay trên đầu trang đã dùng đúng hàm đó, nên khối nào đóng khối nào mở luôn
   * khớp với bước đang sáng trên thanh. Liệt kê tay thì thêm một status mới vào
   * luồng là hai nơi lệch nhau mà không ai để ý.
   */
  const atWarehouseStep = completedStepIndex(status) >= 0;

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

      {/* 1. Đánh giá tình huống + mức khẩn cấp

          THU GỌN từ lúc việc sang tay kho. Khối này là căn cứ để người trực quyết
          định duyệt hay không; duyệt xong rồi thì nó chỉ còn là hồ sơ, mà nó lại
          đứng đầu trang nên mở sẵn là đẩy phần đang chạy — kho chuẩn bị tới đâu,
          hiện trường đã đi chưa — xuống dưới màn hình.

          `key` đổi theo cờ vì `CollapsiblePanel` chỉ đọc `defaultOpen` lúc dựng:
          không có nó, phát hành xong khối vẫn nằm mở tới khi tải lại trang. */}
      <CollapsiblePanel
        key={atWarehouseStep ? "da-sang-kho" : "con-o-dieu-phoi"}
        defaultOpen={!atWarehouseStep}
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
            Đáp ứng kho: <b className="text-[var(--text)]">{plan.fulfillment}%</b>
          </span>
        </div>
      </CollapsiblePanel>

      {/* 3. Phương án cấp phát vật tư — thu gọn ngay khi phát hành.
          Bảng bốn cột Cần/Cấp/Thiếu là căn cứ để người trực quyết định có duyệt hay
          không. Bấm duyệt xong là đã trả lời câu hỏi đó; từ đó trở đi việc nằm ở kho,
          và thứ họ cần thấy là danh sách SKU phải xuất ngay bên dưới. Để bảng này mở
          sẵn chỉ đẩy phần đang chạy xuống dưới màn hình. */}
      <Panel
        key={atWarehouseStep ? "da-phat-hanh-cap-phat" : "con-nhap-cap-phat"}
        defaultOpen={!atWarehouseStep}
        icon={<ColorIcon name="inventory" size={19} tone="orange" />}
        title="Phương án cấp phát"
      >
        <div className="overflow-x-auto">
          {/* Kẻ ô đầy đủ, không chỉ gạch ngang giữa các dòng.
              Bốn cột số nằm sát nhau mà chỉ có gạch ngang thì mắt không biết con số
              đang đọc thuộc cột nào — "150 chiếc  150 chiếc" đứng cạnh nhau trông
              như một ô, phải dóng ngược lên hàng tiêu đề mới biết đâu là Cần đâu là
              Cấp. Nền xám cho hàng tiêu đề để nó tách hẳn khỏi phần dữ liệu. */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--surface-2)] text-left text-xs text-[var(--text-muted)]">
                <th className="border px-3 py-2 font-medium">Vật tư</th>
                <th className="border px-3 py-2 text-right font-medium">Cần</th>
                <th className="border px-3 py-2 text-right font-medium">Cấp</th>
                <th className="border px-3 py-2 text-right font-medium">Thiếu</th>
                <th className="border px-3 py-2 font-medium">Lấy từ kho</th>
              </tr>
            </thead>
            <tbody>
              {plan.allocations.map((a) => (
                <tr key={a.sku}>
                  <td className="border px-3 py-2 font-medium">{a.itemName}</td>
                  {/* Đơn vị nằm NGAY TRONG ô số. Trước đây ba ô này là số trần,
                      phải đọc một dòng chú thích riêng dưới tên vật tư mới biết đang
                      đếm theo chai hay theo lít — mà dòng đó chỉ nói cho đúng hai ô
                      Cần/Cấp, còn ô Thiếu thì người đọc tự suy. */}
                  <td className="tabular whitespace-nowrap border px-3 py-2 text-right">
                    {formatQuantity(a.required, a.unit)}
                  </td>
                  <td className="tabular whitespace-nowrap border px-3 py-2 text-right">
                    {formatQuantity(a.allocated, a.unit)}
                  </td>
                  <td
                    className="tabular whitespace-nowrap border px-3 py-2 text-right font-semibold"
                    style={{
                      color: a.shortage > 0 ? "var(--color-critical)" : "var(--color-ready)",
                    }}
                  >
                    {a.shortage > 0 ? formatQuantity(a.shortage, a.unit) : "—"}
                  </td>
                  <td className="border px-3 py-2 text-xs text-[var(--text-muted)]">
                    {a.fromWarehouses.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Khối điều phối kho: đi kho nào, xa bao nhiêu, lấy những gì.
          Tên khối nói đúng ba thứ nằm trong nó. Trước đây khối này còn gánh thêm
          danh sách "Mục tiêu 6 giờ đầu" do AI viết, nên tiêu đề phải ghép hai vế
          chẳng liên quan nhau — người đọc lướt tiêu đề không biết mở ra sẽ thấy
          việc điều phối hay thấy một đoạn văn. */}
      {plan.warehouses.length > 0 && (
        <Panel
          // Cùng mốc với khối cấp phát. Khối này còn nặng nhất trang vì kèm bản đồ,
          // nên mở sẵn sau khi phát hành là đẩy khối SKU ngay dưới nó ra khỏi tầm mắt
          // — đúng khối mà kho cần bấm. Cần xem lại tuyến thì mở ra, một cú bấm.
          key={atWarehouseStep ? "da-phat-hanh-dieu-phoi" : "con-nhap-dieu-phoi"}
          defaultOpen={!atWarehouseStep}
          icon={<ColorIcon name="location" size={19} tone="blue" />}
          title="Điều phối kho: quãng đường và vật tư cần lấy"
        >
          {/* Danh sách kho bên trái, bản đồ bên phải.
              Xếp bản đồ nằm dưới thì nó chiếm trọn bề ngang, mà khung vuông nên
              cao gần bằng cả màn hình — phải cuộn qua nó mới đọc tiếp được. Đặt
              cạnh nhau vừa thu nhỏ bản đồ vừa cho đọc quãng đường và nhìn vị trí
              kho cùng lúc, đúng cặp thông tin người dùng đang so. */}
          <div className={incidentPoint ? "grid gap-4 lg:grid-cols-2" : undefined}>
            <div className="min-w-0">
              {/* MỘT danh sách duy nhất cho phần điều phối kho.
                  Trước đây trên là lưới thẻ "Kho tham gia và thời gian tới điểm nạn",
                  dưới là danh sách "Thứ tự lấy hàng" — hai khối kể đúng cùng một bộ
                  số (tên kho, quãng đường, ETA, vật tư góp), chỉ khác cách xếp. Đọc
                  hai lần cùng một thứ đã tốn màn hình, mà nguy hơn là chúng có thể
                  nhìn như hai danh sách khác nhau khi số kho nhiều.

                  Giữ lại bản CÓ THỨ TỰ vì nó nói thêm được điều lưới thẻ không nói:
                  đi kho nào trước. Thứ tự đó nằm ở quãng đường, xem lưới thẻ thì
                  phải tự so từng thẻ mới ra. */}
              {dispatchOrder.length > 0 && (
                <div className="rounded-md border border-dashed bg-[var(--surface-2)] p-3">
                  <p className="text-sm font-semibold">Thứ tự lấy hàng (gần đến xa)</p>
                  <ol className="mt-2 space-y-2">
                    {dispatchOrder.map((stop, index) => (
                      <li key={stop.id} className="flex gap-2.5 text-sm">
                        <span className="tabular w-5 shrink-0 text-right font-semibold text-[var(--text-muted)]">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
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
                          <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
                            {stop.items.map((item, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span aria-hidden="true">–</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            {incidentPoint ? (
              /* Bản đồ cao bằng đúng cột bên trái.
                 Khung vuông mặc định lấy chiều cao từ BỀ NGANG cột, nên nó chẳng
                 liên quan gì tới cột bên cạnh: danh sách dài thì bản đồ hụt một
                 khoảng trống ở đáy, danh sách ngắn thì bản đồ thò ra. Ô lưới vốn
                 đã được kéo cao bằng hàng, chỉ cần cho nó thành cột flex rồi để
                 khung bản đồ ăn hết phần còn lại sau chú giải.

                 `min-h` giữ sàn cho ca danh sách chỉ có một kho — lúc đó bản đồ
                 co theo sẽ thấp tới mức không đọc được tuyến nào. */
              <IncidentMap
                warehouses={plan.warehouses}
                incidentPoint={incidentPoint}
                className="flex h-full flex-col gap-2"
                frameClassName="relative isolate min-h-[320px] w-full flex-1 overflow-hidden rounded-md border"
              />
            ) : null}
          </div>
        </Panel>
      )}

      {/* 4. Chuẩn bị vật tư theo SKU — việc của kho, đứng ngay dưới bảng điều phối
          kho vì nó chính là danh sách trong bảng đó chờ người bấm xuất. Khối do
          `mission-view` dựng và truyền xuống: nó cần các mutation và quyền của
          trang, còn ở đây chỉ quyết định NÓ ĐỨNG ĐÂU. */}
      {warehouseSlot}

      {/* 6 + 7. Cảnh báo + Dự báo (2 cột)

          Hai khối này THU GỌN SẴN. Chúng là phần tham khảo — cảnh báo ghi rõ "chỉ
          tham khảo", dự báo là xác suất — trong khi thứ quyết định việc duyệt nằm ở
          các khối trên. Mở sẵn thì chúng đẩy nút duyệt xuống thêm gần một màn hình,
          mà người trực phần lớn thời gian không cần tới. */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          icon={<ColorIcon name="warning" size={19} tone="red" />}
          title="Cảnh báo (chỉ tham khảo)"
          tone="var(--color-degraded)"
          defaultOpen={false}
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

        <Panel
          icon={<ColorIcon name="trendUp" size={19} tone="green" />}
          title="Dự báo"
          defaultOpen={false}
        >
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
  defaultOpen,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: string;
  /** Bỏ trống là mở sẵn; đặt false cho khối chỉ xem khi cần. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <CollapsiblePanel
      className="rounded-md border bg-[var(--surface)] p-5"
      icon={icon}
      title={title}
      tone={tone}
      defaultOpen={defaultOpen}
    >
      {children}
    </CollapsiblePanel>
  );
}

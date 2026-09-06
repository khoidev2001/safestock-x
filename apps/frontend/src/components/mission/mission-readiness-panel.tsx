import {
  LITERS_PER_WATER_BOTTLE,
  litersFromBottles,
  WATER_BOTTLE_SKU,
} from "@safestock/shared-types";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import type { MissionReadinessAssessment, MissionReadinessStatus } from "@/lib/mission-api";

/**
 * Vì sao nhiệm vụ này cần tới món đó — tra theo SKU.
 *
 * Bảng nhu cầu chỉ nói "cần 200 chai", không nói vì sao lại là nước chứ không
 * phải can 20 lít, vì sao áo phao trẻ em tách riêng khỏi áo người lớn, hay vì sao
 * đèn pin lại ít hơn số người. Người duyệt phương án phải trả lời đúng những câu
 * đó trước khi ký, mà chúng đang nằm trong bảng định mức của backend — chỗ họ
 * không mở ra được.
 *
 * Cố ý chỉ ghi LÝ DO và CƠ SỞ tính (theo người lớn, theo ca y tế, theo nhóm),
 * không chép lại hệ số. Hệ số nằm ở `mission.config.ts` và có thể đổi; câu chữ ở
 * đây mà chép số thì đến lúc đó nó thành lời nói dối, còn lý do thì vẫn đúng.
 */
const ITEM_REASONS: Readonly<Record<string, string>> = {
  "LIFE-ADULT":
    "Nước lũ chảy xiết, người lớn phải tự nổi được khi lội qua chỗ ngập và khi dìu người khác ra. Tính theo số người lớn — tức tổng số người trừ trẻ em, vì trẻ em đã có áo cỡ riêng.",
  "LIFE-CHILD":
    "Áo phao người lớn quá rộng so với trẻ em, sóng đánh một cái là tuột khỏi người. Mỗi trẻ em cần một áo đúng cỡ, tính theo ô “Trẻ em”.",
  "WATER-01":
    "Ngập và mất điện làm hỏng nguồn nước tại chỗ: giếng nhiễm bẩn, máy bơm không chạy. Đây là phần nước uống cầm tay phát tận nơi, tính theo số người và số ngày bị cô lập.",
  "FIRSTAID-01":
    "Cầm máu, sát trùng và thay băng cho người bị thương trong lúc chưa đưa được ra ngoài. Tính theo ô “Ca y tế” đã khai, không phải theo tổng số người.",
  "TORCH-01":
    "Mất điện thì tìm người và di chuyển trong nhà ngập ban đêm đều mù. Cấp theo nhóm để soi đường chung, không phải mỗi người một chiếc.",
  "CANVAS-01":
    "Bão tốc mái: che tạm chỗ ở và che hàng cứu trợ khỏi mưa trong lúc chờ lợp lại. Cấp theo nhóm hộ, không phải theo đầu người.",
};

const STATUS_META: Record<MissionReadinessStatus, { label: string; color: string }> = {
  READY: { label: "Đủ khả năng đáp ứng", color: "var(--color-ready)" },
  NEEDS_ACTION: { label: "Đáp ứng một phần", color: "var(--color-attention)" },
  NOT_DISPATCHABLE: { label: "Chưa thể điều phối", color: "var(--color-critical)" },
};

export function MissionReadinessPanel({
  assessment,
  defaultOpen,
}: {
  assessment: MissionReadinessAssessment;
  /**
   * Mở sẵn hay thu gọn sẵn khi khối được dựng.
   *
   * Chỗ gọi quyết định vì nó là nơi biết nhiệm vụ đang ở bước nào. `CollapsiblePanel`
   * chỉ đọc giá trị này lúc gắn vào cây, nên muốn khối tự đóng khi bước việc đổi thì
   * chỗ gọi phải đổi luôn `key` — xem `MissionView`.
   */
  defaultOpen?: boolean;
}) {
  const meta = STATUS_META[assessment.status];
  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      // KHÔNG `overflow-hidden`: bong bóng "vì sao cần món này" của dòng cuối
      // cùng thò xuống dưới mép khối, có overflow-hidden là bị cắt mất một nửa.
      // Khối có sẵn padding nên các góc bo vẫn sạch mà không cần cắt.
      className="rounded-md border bg-[var(--surface)] px-5 py-4"
      icon={<StatusIcon status={assessment.status} />}
      title="Khả năng đáp ứng nhiệm vụ"
      subtitle={
        <span className="font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
      }
      badge={<span className="tabular text-sm font-semibold">{assessment.fulfillment}%</span>}
    >
      {assessment.blockers.length > 0 && (
        <div className="mb-3 space-y-2 rounded-md bg-[color-mix(in_oklch,var(--color-critical)_6%,transparent)] px-4 py-3">
          {assessment.blockers.map((blocker) => {
            // Khối này trước đây chỉ nhận loại KHÔNG lấy được cái nào, nên nhãn ghi
            // cứng "Thiếu hoàn toàn". Nay nó nhận cả loại thiếu một phần — giữ nhãn
            // cũ là nói sai hẳn về một loại đã lấy được 13/100.
            const item = assessment.items.find((row) => row.sku === blocker.sku);
            const isCompletelyMissing = !item || item.allocated === 0;
            return (
              <div key={blocker.sku}>
                <p className="text-sm font-semibold">
                  {isCompletelyMissing
                    ? `Thiếu hoàn toàn: ${blocker.itemName}`
                    : `Thiếu ${item.shortage.toLocaleString("vi")}${item.unit ? ` ${item.unit}` : ""}: ${blocker.itemName}`}
                </p>
                {/* Mỗi lý do MỘT DÒNG, không nối bằng dấu chấm giữa.
                    Một xã có mười mấy kho, nối hết lại thành một khối chữ đặc dài
                    năm sáu dòng — người trực nhìn vào chỉ thấy "có gì đó hỏng",
                    không đọc ra được kho nào còn bao nhiêu. Mà đây lại đúng là chỗ
                    trả lời câu hỏi "vì sao thiếu". */}
                <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-muted)]">
                  {blocker.reasons.map((reason, i) => (
                    <li className="flex gap-1.5" key={i}>
                      <span aria-hidden="true">–</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="divide-y rounded-md border">
        {assessment.items.map((item) => (
          <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3" key={item.sku}>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{item.itemName}</span>
                <WhyNeeded itemName={item.itemName} reason={ITEM_REASONS[item.sku]} />
              </p>
              {/* Có đơn vị thì "760/760" mới đọc được là chai hay bộ. Thiếu 0 thì
                  không nhắc: dòng nào cũng kết bằng "thiếu 0" là dạy mắt bỏ qua
                  đúng chữ "thiếu". */}
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Đáp ứng {item.allocated.toLocaleString("vi")}/{item.required.toLocaleString("vi")}
                {item.unit ? ` ${item.unit}` : ""}
                {item.shortage > 0
                  ? `, thiếu ${item.shortage.toLocaleString("vi")}${item.unit ? ` ${item.unit}` : ""}`
                  : ""}
              </p>
              {item.sku === WATER_BOTTLE_SKU && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Chai {LITERS_PER_WATER_BOTTLE.toLocaleString("vi")} lít · quy ra{" "}
                  {litersFromBottles(item.required).toLocaleString("vi")} lít nước uống
                </p>
              )}
            </div>
            <span
              className="self-center text-xs font-semibold"
              style={{ color: STATUS_META[item.status].color }}
            >
              {STATUS_META[item.status].label}
            </span>
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

/**
 * Dấu hỏi giải thích vì sao nhiệm vụ cần món này.
 *
 * Dùng `title` của trình duyệt thay cho hộp thoại tự vẽ: khối này nằm trong một
 * panel có `overflow-hidden` để chạy hoạt ảnh thu gọn, nên mọi bong bóng tự vẽ ở
 * dòng đầu hoặc dòng cuối đều bị cắt mất một nửa. Đổi `overflow` thì hỏng hoạt
 * ảnh. `title` không bị cắt, đọc được ở mọi trình duyệt, và trình đọc màn hình
 * lấy được qua `aria-label`.
 *
 * SKU lạ (danh mục mở rộng sau này) thì không vẽ gì — thà không có lời giải thích
 * còn hơn hiện một câu chung chung nghe như đã giải thích.
 */
function WhyNeeded({ itemName, reason }: { itemName: string; reason?: string }) {
  if (!reason) return null;
  return (
    <span className="why-tip shrink-0">
      {/* <button> chứ không phải <span tabIndex>: bàn phím Tab tới được, và trình
          đọc màn hình đọc ra "nút" nên người dùng biết ở đây có gì để mở. */}
      <button
        type="button"
        aria-label={`Vì sao cần ${itemName}`}
        className="why-tip-trigger"
        // Bấm không làm gì thêm: chạm trên điện thoại vẫn đưa được focus vào nút,
        // và :focus-within lo phần hiện bong bóng.
        onClick={(event) => event.preventDefault()}
      >
        <ColorIcon name="help" size={15} tone="blue" />
      </button>
      <span role="tooltip" className="why-tip-bubble">
        {reason}
      </span>
    </span>
  );
}

function StatusIcon({ status }: { status: MissionReadinessStatus }) {
  if (status === "READY") return <ColorIcon name="success" size={22} tone="green" />;
  if (status === "NOT_DISPATCHABLE") return <ColorIcon name="blocked" size={22} tone="red" />;
  return <ColorIcon name="warning" size={22} tone="amber" />;
}

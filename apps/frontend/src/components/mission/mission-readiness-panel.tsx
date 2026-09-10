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

/**
 * Nhãn nói TÌNH TRẠNG, không nói việc phải làm.
 *
 * Khối này nay chỉ còn một việc: soi lại xem đủ hay chưa. Mọi hành động — hỏi
 * mượn xã lân cận, gửi lại yêu cầu, phân bổ lại — đã dời lên khối "Mượn vật tư
 * liên xã" nằm ngay dưới bảng điều phối nội xã, nơi người trực đang nhìn danh
 * sách kho nào cấp gì. Để nút ở cả hai nơi là mời bấm hai lần cho một chỗ thiếu.
 *
 * `label` là câu cho dòng tiêu đề khối; `itemLabel` là câu ngắn cho cột bên phải
 * của từng vật tư — chỗ đó hẹp, câu dài xuống dòng làm vỡ cả hàng.
 */
const STATUS_META: Record<
  MissionReadinessStatus,
  { label: string; itemLabel: string; color: string }
> = {
  READY: {
    label: "Đã đáp ứng đủ",
    itemLabel: "Đủ",
    color: "var(--color-ready)",
  },
  NEEDS_ACTION: {
    label: "Chưa đáp ứng đủ",
    itemLabel: "Thiếu một phần",
    color: "var(--color-attention)",
  },
  NOT_DISPATCHABLE: {
    label: "Chưa đáp ứng đủ",
    itemLabel: "Chưa có hàng",
    color: "var(--color-critical)",
  },
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
  const shortCount = assessment.items.filter((item) => item.shortage > 0).length;
  const readyCount = assessment.items.length - shortCount;

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
          {/* Con số nói thẳng cái mà người đọc vừa tự đếm trên bảng bên dưới.
              Không có nó thì một tỉ lệ như 87% treo lơ lửng, và câu hỏi kế tiếp
              luôn là "87% của cái gì". */}
          {assessment.items.length > 0 ? (
            <span className="font-normal text-[var(--text-muted)]">
              {" "}
              · {readyCount}/{assessment.items.length} loại vật tư đã đủ
            </span>
          ) : null}
        </span>
      }
      badge={<span className="tabular text-sm font-semibold">{assessment.fulfillment}%</span>}
    >
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
              className="self-center whitespace-nowrap text-xs font-semibold"
              style={{ color: STATUS_META[item.status].color }}
            >
              {STATUS_META[item.status].itemLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Một câu chỉ đường, KHÔNG phải một nút. Khối này cố ý không có hành động
          nào; nói ra chỗ có hành động thì người đọc không phải đi tìm. */}
      {shortCount > 0 ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Phần còn thiếu hỏi mượn ở khối “Mượn vật tư liên xã”, ngay dưới bảng điều phối nội xã của
          bản tham mưu. Hàng về kho là con số ở đây tự cập nhật.
        </p>
      ) : null}
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

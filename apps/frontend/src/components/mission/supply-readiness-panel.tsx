"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FIELD_FORCE_ROLE_LABEL,
  LITERS_PER_WATER_BOTTLE,
  litersFromBottles,
  WATER_BOTTLE_SKU,
} from "@safestock/shared-types";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { errorMessage } from "@/lib/api";
import {
  getAddableItems,
  getReadinessPreview,
  updateMissionRequirements,
  type Mission,
  type MissionReadinessAssessment,
  type MissionReadinessStatus,
  type MissionRequirement,
} from "@/lib/mission-api";
import { stripDiacritics } from "@/lib/vi-text";

/**
 * "Khả năng đáp ứng nhiệm vụ" — MỘT khối, hai câu trả lời cùng lúc.
 *
 * Trước đây đây là hai khối rời: "Bản tham mưu — vật tư cần dùng" (sửa được số)
 * và "Khả năng đáp ứng nhiệm vụ" (kho có đủ không). Hai bảng cùng liệt kê đúng
 * một danh sách vật tư, chỉ khác một cột — nên người trực sửa số ở bảng trên rồi
 * phải cuộn xuống bảng dưới để biết cú sửa vừa rồi có làm kho hụt hàng không, và
 * bảng dưới lại chỉ đổi sau khi lập kế hoạch, tức là hàng chục phút và trọn một
 * chặng hiện trường chốt số về sau.
 *
 * Gộp lại thì cú sửa và hậu quả của nó nằm trên CÙNG MỘT DÒNG: đổi ô "Cần" xong
 * là cột bên phải nói ngay đủ hay thiếu bao nhiêu.
 *
 * Số liệu tính theo `required` — con số ADMIN chốt — nên nó đọc ra y hệt ở mọi
 * bước, kể cả sau khi hiện trường đã chốt phần lấy từ kho. Phần "lấy bao nhiêu từ
 * kho" là câu hỏi khác và có bảng riêng ("Bản tham mưu — vật tư cần dùng").
 */

/** Vì sao nhiệm vụ này cần tới món đó — tra theo SKU. */
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

/** Một thay đổi ADMIN vừa bấm, đang chờ xác nhận lần hai. */
interface PendingChange {
  kind: "edit" | "remove";
  row: MissionRequirement;
  /** Số cần sau khi đổi; 0 nghĩa là bỏ hẳn món này. */
  required: number;
}

type ReadinessItem = MissionReadinessAssessment["items"][number];

export function SupplyReadinessPanel({
  mission,
  editable,
  defaultOpen = true,
}: {
  mission: Mission;
  /** ADMIN còn sửa được danh sách không (chỉ khi nhiệm vụ còn nháp). */
  editable: boolean;
  defaultOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newSku, setNewSku] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Thay đổi đang chờ người dùng xác nhận lần hai.
   *
   * Sửa số và xoá món đều GHI THẲNG xuống nhiệm vụ, không có bước hoàn tác nào ở
   * phía sau: đây là bộ số mà lực lượng hiện trường sắp trả lời và kho sắp soạn
   * theo. Bấm nhầm "Xoá" ở dòng cạnh bên là mất hẳn một món, và nó chỉ lộ ra lúc
   * đội tới nơi thiếu hàng.
   */
  const [pending, setPending] = useState<PendingChange | null>(null);

  /**
   * Khả năng đáp ứng tính theo danh sách ĐANG hiện, không phải ảnh chụp cũ.
   *
   * Khoá truy vấn kèm "chữ ký" của danh sách vật tư, nên chỉ cần một món đổi số là
   * react-query tự coi bản cũ là của một danh sách khác và tải lại — người dùng
   * không phải bấm gì thêm, và cũng không có cảnh bảng nói "đủ" cho một con số đã
   * bị sửa từ lúc nào.
   */
  const requirementSignature = mission.requirements
    .map((requirement) => `${requirement.sku}:${requirement.required}`)
    .sort()
    .join("|");
  const readiness = useQuery({
    queryKey: ["mission", mission.id, "readiness-preview", requirementSignature],
    queryFn: () => getReadinessPreview(mission.id),
    staleTime: 30_000,
  });

  const addable = useQuery({
    queryKey: ["mission", mission.id, "addable-items"],
    queryFn: () => getAddableItems(mission.id),
    enabled: editable && adding,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (changes: { sku: string; required: number }[]) =>
      updateMissionRequirements(mission.id, changes),
    onSuccess: () => {
      setError(null);
      setDrafts({});
      setAdding(false);
      setNewSku("");
      setNewQuantity("");
      // Danh mục "còn thêm được món nào" đổi theo: món vừa thêm phải rời khỏi nó.
      void queryClient.invalidateQueries({ queryKey: ["mission", mission.id, "addable-items"] });
      void queryClient.invalidateQueries({ queryKey: ["mission", mission.id], exact: true });
    },
    onError: (cause: unknown) => {
      setError(errorMessage(cause, "Không lưu được thay đổi."));
    },
  });

  const rows = useMemo(
    () => [...mission.requirements].sort((a, b) => a.itemName.localeCompare(b.itemName, "vi")),
    [mission.requirements],
  );

  const readinessBySku = useMemo(() => {
    const map = new Map<string, ReadinessItem>();
    for (const item of readiness.data?.items ?? []) map.set(item.sku, item);
    return map;
  }, [readiness.data]);

  const options = useMemo(() => {
    const items = addable.data ?? [];
    const needle = stripDiacritics(search.trim().toLowerCase());
    if (!needle) return items;
    return items.filter((item) =>
      stripDiacritics(`${item.itemName} ${item.sku}`.toLowerCase()).includes(needle),
    );
  }, [addable.data, search]);

  const assessment = readiness.data;
  const meta = assessment ? STATUS_META[assessment.status] : null;

  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      // KHÔNG `overflow-hidden`: bong bóng "vì sao cần món này" của dòng cuối thò
      // xuống dưới mép khối, cắt là mất một nửa.
      className="rounded-md border bg-[var(--surface)] px-5 py-4"
      icon={<StatusIcon status={assessment?.status} />}
      title="Khả năng đáp ứng nhiệm vụ"
      subtitle={
        readiness.isPending ? (
          <span className="text-[var(--text-muted)]">Đang tính theo tồn kho của xã…</span>
        ) : meta ? (
          <span className="font-semibold" style={{ color: meta.color }}>
            {meta.label}
            {editable ? (
              <span className="font-normal text-[var(--text-muted)]">
                {" "}
                · sửa số ở cột <b>Cần</b>, bảng tự tính lại ngay
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Chưa tính được khả năng đáp ứng.</span>
        )
      }
      badge={
        assessment ? (
          <span className="tabular text-sm font-semibold">{assessment.fulfillment}%</span>
        ) : null
      }
    >
      {assessment && assessment.blockers.length > 0 && (
        <div className="mb-3 space-y-2 rounded-md bg-[color-mix(in_oklch,var(--color-critical)_6%,transparent)] px-4 py-3">
          {assessment.blockers.map((blocker) => {
            const item = readinessBySku.get(blocker.sku);
            const completelyMissing = !item || item.allocated === 0;
            return (
              <div key={blocker.sku}>
                <p className="text-sm font-semibold">
                  {completelyMissing
                    ? `Thiếu hoàn toàn: ${blocker.itemName}`
                    : `Thiếu ${item.shortage.toLocaleString("vi")}${item.unit ? ` ${item.unit}` : ""}: ${blocker.itemName}`}
                </p>
                {/* Mỗi lý do MỘT DÒNG: một xã có mười mấy kho, nối hết lại thành
                    một khối chữ đặc thì người trực chỉ thấy "có gì đó hỏng". */}
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

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Chưa có vật tư nào. Thêm ít nhất một món trước khi gửi cho {FIELD_FORCE_ROLE_LABEL}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="pb-2 font-medium">Vật tư</th>
                <th className="pb-2 font-medium tabular">Cần</th>
                <th className="pb-2 font-medium">Đơn vị</th>
                <th className="pb-2 text-right font-medium">Khả năng đáp ứng</th>
                {editable && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RequirementRow
                  key={row.sku}
                  row={row}
                  item={readinessBySku.get(row.sku)}
                  editable={editable}
                  stale={readiness.isFetching}
                  draft={drafts[row.sku]}
                  busy={save.isPending}
                  onDraftChange={(value) =>
                    setDrafts((current) => ({ ...current, [row.sku]: value }))
                  }
                  onSave={(required) => setPending({ kind: "edit", row, required })}
                  onRemove={() => setPending({ kind: "remove", row, required: 0 })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <div className="mt-4">
          {adding ? (
            <div className="rounded-md border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--text-muted)]">
                Chỉ hiện những món còn tồn dùng được ở kho nào đó trong xã — thêm món không có hàng
                thì tới bước phát hành mới vỡ.
              </p>
              <input
                className="cell-input mt-2 w-full"
                placeholder="Tìm theo tên hoặc mã vật tư"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label="Vật tư cần thêm"
                className="cell-select mt-2 w-full"
                value={newSku}
                onChange={(event) => setNewSku(event.target.value)}
              >
                <option value="">
                  {addable.isPending ? "Đang tải danh mục…" : "— Chọn vật tư —"}
                </option>
                {options.map((item) => (
                  <option key={item.sku} value={item.sku}>
                    {item.itemName} (còn {item.available} {item.unit})
                  </option>
                ))}
              </select>
              <input
                aria-label="Số lượng cần"
                className="cell-input mt-2 w-full"
                inputMode="numeric"
                placeholder="Số lượng cần"
                value={newQuantity}
                onChange={(event) => setNewQuantity(event.target.value)}
              />
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-medium"
                  disabled={!newSku || !newQuantity || save.isPending}
                  onClick={() => {
                    const quantity = Number(newQuantity);
                    if (!Number.isInteger(quantity) || quantity < 1) {
                      setError("Số lượng phải là số nguyên lớn hơn 0.");
                      return;
                    }
                    save.mutate([{ sku: newSku, required: quantity }]);
                  }}
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-accent-fg)",
                    opacity: !newSku || !newQuantity || save.isPending ? 0.5 : 1,
                  }}
                  type="button"
                >
                  Thêm vào bản tham mưu
                </button>
                <button
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                  }}
                  type="button"
                >
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <button
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium"
              onClick={() => setAdding(true)}
              type="button"
            >
              + Thêm vật tư
            </button>
          )}
        </div>
      )}

      {readiness.isError && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-critical)" }}>
          Không tính được khả năng đáp ứng. Danh sách vật tư vẫn sửa được; tải lại trang để tính
          lại.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-critical)" }}>
          {error}
        </p>
      )}

      <ConfirmDialog
        open={pending !== null}
        tone={pending?.kind === "remove" ? "destructive" : "neutral"}
        title={pending?.kind === "remove" ? "Xoá vật tư khỏi bản tham mưu?" : "Đổi số lượng cần?"}
        message={pending ? confirmMessage(pending) : ""}
        confirmLabel={pending?.kind === "remove" ? "Xoá khỏi bản tham mưu" : "Đổi số lượng"}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          save.mutate([{ sku: pending.row.sku, required: pending.required }]);
          setPending(null);
        }}
      />
    </CollapsiblePanel>
  );
}

/**
 * Câu hỏi lại, viết đủ SỐ CŨ và SỐ MỚI.
 *
 * "Bạn có chắc không?" không giúp được gì: người bấm nhầm cũng chắc y như người
 * bấm đúng. Thứ chặn được cú nhầm là nhìn thấy đúng tên món và con số sắp bị thay
 * — đó là chỗ họ nhận ra mình đang đứng ở dòng bên cạnh.
 */
function confirmMessage(pending: PendingChange): string {
  const { row, required, kind } = pending;
  if (kind === "remove") {
    return `Bỏ "${row.itemName}" (${row.required} ${row.unit}) khỏi bản tham mưu. Lực lượng hiện trường sẽ không được hỏi về món này, và kho cũng không soạn.`;
  }
  return `"${row.itemName}": ${row.required} ${row.unit} → ${required} ${row.unit}. Đây là con số lực lượng hiện trường sẽ dựa vào để chốt phần phải lấy từ kho.`;
}

function RequirementRow({
  row,
  item,
  editable,
  stale,
  draft,
  busy,
  onDraftChange,
  onSave,
  onRemove,
}: {
  row: MissionRequirement;
  /** Phần đánh giá của chính món này; chưa tính xong thì chưa có. */
  item?: ReadinessItem;
  editable: boolean;
  /** Đang tính lại theo con số vừa sửa — làm mờ cột đánh giá thay vì nói số cũ. */
  stale: boolean;
  draft?: string;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onSave: (required: number) => void;
  onRemove: () => void;
}) {
  const value = draft ?? String(row.required);
  const parsed = Number(value);
  const changed = value !== String(row.required);
  const valid = Number.isInteger(parsed) && parsed > 0;

  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-2 pr-3">
        <span className="flex items-center gap-1.5">
          <span>{row.itemName}</span>
          <WhyNeeded itemName={row.itemName} reason={ITEM_REASONS[row.sku]} />
        </span>
        {row.source === "ADMIN_ADDED" && (
          <span className="text-[10px] text-[var(--text-muted)]">(thêm tay)</span>
        )}
        {row.sku === WATER_BOTTLE_SKU && (
          <span className="block text-xs text-[var(--text-muted)]">
            Chai {LITERS_PER_WATER_BOTTLE.toLocaleString("vi")} lít · quy ra{" "}
            {litersFromBottles(row.required).toLocaleString("vi")} lít nước uống
          </span>
        )}
      </td>
      <td className="py-2 pr-3 tabular">
        {editable ? (
          <input
            aria-label={`Số lượng cần của ${row.itemName}`}
            className="cell-input w-20"
            inputMode="numeric"
            onChange={(event) => onDraftChange(event.target.value)}
            value={value}
          />
        ) : (
          row.required
        )}
      </td>
      <td className="py-2 pr-3 text-[var(--text-muted)]">{row.unit}</td>
      {/* Kết luận và CON SỐ đứng chung một chỗ.
          Trước đây "Đáp ứng 1/1 chiếc" nằm dưới tên vật tư còn "Đủ khả năng đáp
          ứng" nằm tận mép phải cùng hàng — hai nửa của một câu, cách nhau cả bề
          ngang bảng, nên mắt phải chạy đi chạy lại mới ghép được chúng lại. */}
      <td className="py-2 text-right">
        <ReadinessCell item={item} stale={stale} unit={row.unit} />
      </td>
      {editable && (
        <td className="py-2 pl-3 text-right">
          {changed && (
            <button
              className="mr-2 rounded-md px-2 py-1 text-xs font-medium"
              disabled={!valid || busy}
              onClick={() => onSave(parsed)}
              style={{
                background: "var(--color-accent)",
                color: "var(--color-accent-fg)",
                opacity: !valid || busy ? 0.5 : 1,
              }}
              type="button"
            >
              Lưu
            </button>
          )}
          <button
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
            disabled={busy}
            onClick={onRemove}
            style={{ color: "var(--color-critical)" }}
            type="button"
          >
            Xoá
          </button>
        </td>
      )}
    </tr>
  );
}

/** "Đủ khả năng đáp ứng 1/1 chiếc" — kết luận trước, con số ngay sau nó. */
function ReadinessCell({
  item,
  stale,
  unit,
}: {
  item?: ReadinessItem;
  stale: boolean;
  unit: string;
}) {
  if (!item) {
    return <span className="text-xs text-[var(--text-muted)]">Đang tính…</span>;
  }
  const meta = STATUS_META[item.status];
  return (
    <span
      className={`text-xs font-semibold ${stale ? "opacity-50" : ""}`}
      style={{ color: meta.color }}
    >
      {meta.label} {item.allocated.toLocaleString("vi")}/{item.required.toLocaleString("vi")}{" "}
      {item.unit ?? unit}
      {item.shortage > 0 ? (
        <span className="block font-normal">
          thiếu {item.shortage.toLocaleString("vi")} {item.unit ?? unit}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Dấu hỏi giải thích vì sao nhiệm vụ cần món này.
 *
 * Dùng `title` của trình duyệt thay cho hộp thoại tự vẽ: khối này nằm trong một
 * panel có `overflow-hidden` lúc chạy hoạt ảnh thu gọn, nên mọi bong bóng tự vẽ ở
 * dòng đầu hoặc dòng cuối đều bị cắt mất một nửa.
 */
function WhyNeeded({ itemName, reason }: { itemName: string; reason?: string }) {
  if (!reason) return null;
  return (
    <span className="why-tip shrink-0">
      <button
        type="button"
        aria-label={`Vì sao cần ${itemName}`}
        className="why-tip-trigger"
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

function StatusIcon({ status }: { status?: MissionReadinessStatus }) {
  if (status === "READY") return <ColorIcon name="success" size={22} tone="green" />;
  if (status === "NOT_DISPATCHABLE") return <ColorIcon name="blocked" size={22} tone="red" />;
  return <ColorIcon name="warning" size={22} tone="amber" />;
}

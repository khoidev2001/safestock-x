"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FIELD_FORCE_ROLE_LABEL, pickupDecisionLabel } from "@safestock/shared-types";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import { formatPublicPhone, getPublicCommuneContacts } from "@/lib/contact-api";
import { getReadinessPreview, type Mission, type MissionRequirement } from "@/lib/mission-api";
import { FieldUpdateTimeline } from "./field-update-timeline";

/**
 * Bản tham mưu SAU KHI hiện trường đã trả lời: mỗi món phải lấy bao nhiêu từ kho.
 *
 * Khối này chỉ để ĐỌC. Chỗ sửa số nằm ở "Khả năng đáp ứng nhiệm vụ" phía trên và
 * chỉ mở khi nhiệm vụ còn nháp — sửa dưới chân người đang trả lời là cách chắc
 * chắn nhất để hai bên chốt hai con số khác nhau.
 *
 * Cột "Hiện trường chốt" mới là thứ khối này tồn tại để nói. Cột "Cần" đứng cạnh
 * làm mốc so: lệch giữa hai cột nghĩa là đội đang cầm sẵn phần chênh đó, và đó
 * đúng là phần kho KHÔNG phải soạn lại.
 */
export function AdvisoryPlanPanel({
  mission,
  fieldUpdateId,
  defaultOpen = true,
}: {
  mission: Mission;
  /** Bằng chứng cần cuộn tới khi mở từ chuông thông báo. */
  fieldUpdateId?: string | null;
  defaultOpen?: boolean;
}) {
  const rows = useMemo(
    () => [...mission.requirements].sort((a, b) => a.itemName.localeCompare(b.itemName, "vi")),
    [mission.requirements],
  );
  const decided = rows.some((row) => row.pickupDecision);

  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      title="Bản tham mưu — vật tư cần dùng"
      icon={<ColorIcon name="workflow" size={18} tone="blue" />}
      subtitle={
        decided
          ? `${FIELD_FORCE_ROLE_LABEL} đã chốt số cần lấy từ kho.`
          : `Đang chờ ${FIELD_FORCE_ROLE_LABEL} chốt số cần lấy từ kho.`
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Bản tham mưu chưa có vật tư nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="pb-2 font-medium">Vật tư</th>
                <th className="pb-2 font-medium tabular">Cần</th>
                <th className="pb-2 font-medium">Đơn vị</th>
                <th className="pb-2 font-medium">Hiện trường chốt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <DecisionRow key={row.sku} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ExternalCommuneContacts missionId={mission.id} />

      {/* Bằng chứng hiện trường nằm TRONG khối tham mưu: nó chính là nguồn làm bản
          tham mưu đổi. Tách ra một khối riêng thì phải cuộn qua lại giữa hai chỗ
          mới đối chiếu được lời kể với con số nó sinh ra. */}
      <FieldUpdateTimeline missionId={mission.id} focusUpdateId={fieldUpdateId ?? null} />
    </CollapsiblePanel>
  );
}

function DecisionRow({ row }: { row: MissionRequirement }) {
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-2 pr-3">
        {row.itemName}
        {row.source === "ADMIN_ADDED" && (
          <span className="ml-2 text-[10px] text-[var(--text-muted)]">(thêm tay)</span>
        )}
      </td>
      <td className="py-2 pr-3 tabular">{row.required}</td>
      <td className="py-2 pr-3 text-[var(--text-muted)]">{row.unit}</td>
      <td className="py-2 pr-3">
        {row.pickupDecision ? (
          <span>
            {pickupDecisionLabel(row.pickupDecision)}
            {row.warehouseQuantity ? (
              <span className="text-[var(--text-muted)]">
                {" "}
                — lấy {row.warehouseQuantity} {row.unit}
              </span>
            ) : null}
            {row.heldQuantity ? (
              <span className="text-[var(--text-muted)]">
                {" "}
                · đội đang giữ {row.heldQuantity} {row.unit}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Chưa trả lời</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Liên xã khi thiếu vật tư ở nội xã — số điện thoại phải gọi khi cụm kho hụt hàng.
 *
 * Trước đây nó nằm trong khối "Phân tích tình huống và tham mưu điều phối", tức
 * cách chỗ người ta ĐỌC RA con số thiếu hai ba khối cuộn. Mà hai thứ đó là một
 * câu: "thiếu 87 áo phao" và "gọi ai để có 87 áo phao" chỉ có nghĩa khi đứng cạnh
 * nhau.
 *
 * Danh bạ là dữ liệu tĩnh đã xác minh, KHÔNG do AI sinh — nên nó vẫn đọc được kể
 * cả khi chưa ai chạy phân tích, và không kèm câu miễn trừ nào ngoài đúng câu
 * "chưa xác nhận có hàng" của chính danh bạ.
 */
function ExternalCommuneContacts({ missionId }: { missionId: string }) {
  /**
   * Đọc GHÉP khoá với truy vấn của khối khả năng đáp ứng để dùng chung bộ nhớ đệm.
   *
   * Không có `requirementSignature` ở đây nên khoá không trùng tuyệt đối; đây chỉ
   * cần biết CÓ thiếu hay không, một câu trả lời đổi chậm hơn nhiều so với từng ô
   * số — nên một lượt gọi riêng, cache 30 giây là đủ.
   */
  const readiness = useQuery({
    queryKey: ["mission", missionId, "readiness-preview", "external-contacts"],
    queryFn: () => getReadinessPreview(missionId),
    staleTime: 30_000,
  });
  const contacts = useQuery({
    queryKey: ["public-commune-contacts"],
    queryFn: () => getPublicCommuneContacts(),
    staleTime: 10 * 60_000,
  });

  const neighbors = (contacts.data ?? []).filter((contact) => contact.scope === "NEIGHBOR");
  const shortages = (readiness.data?.items ?? []).filter((item) => item.shortage > 0);

  return (
    <section className="mt-5 border-t pt-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <ColorIcon name="location" size={17} tone="blue" />
        Liên xã khi thiếu vật tư ở nội xã
      </h4>
      {shortages.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {readiness.isPending
            ? "Đang đối chiếu với tồn kho của xã…"
            : "Cụm kho trong xã đang đủ hàng cho bản tham mưu này — chưa cần gọi xã khác."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            Nội xã còn thiếu{" "}
            <b>
              {shortages
                .map((item) => `${item.itemName} ${item.shortage} ${item.unit ?? ""}`.trim())
                .join(" · ")}
            </b>
            . Liên hệ xã lân cận trước khi phát hành.
          </p>
          {neighbors.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Chưa có danh bạ xã lân cận đã xác minh.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm" role="list">
              {neighbors.map((contact) => (
                <li
                  key={contact.communeName}
                  className="rounded-md border bg-[var(--surface-2)] px-3 py-2"
                >
                  <span className="font-medium">{contact.communeName}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {contact.contactTitle} ·{" "}
                    {contact.phone ? (
                      // `tel:` để người trực bấm một cái là gọi — họ đang cầm điện
                      // thoại và đọc số rồi bấm tay là chỗ dễ nhầm một chữ số nhất.
                      <a className="underline" href={`tel:${contact.phone}`}>
                        {formatPublicPhone(contact.phone)}
                      </a>
                    ) : (
                      "chưa có số liên hệ"
                    )}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {contact.referencePoint.name} — đề xuất liên hệ, chưa xác nhận có hàng
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

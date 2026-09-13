"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { ApiError } from "@/lib/api";
import {
  changeMissionRequirement,
  listRequirementOptions,
  type MissionRequirement,
} from "@/lib/mission-api";

/**
 * Số dòng vật tư mỗi trang.
 *
 * Một bản tham mưu đủ loại chạm hơn hai chục dòng, và bảng này chỉ là một trong
 * năm khối của phần phân tích — để nó chạy dài hết cỡ thì các khối điều phối, mượn
 * liên xã và dự báo bên dưới bị đẩy khỏi màn hình, trong khi chúng mới là chỗ có
 * việc phải làm.
 *
 * KHÔNG lọc bớt dòng nào: vẫn đủ số vật tư của bản ghi nhiệm vụ, chỉ là cắt thành
 * từng trang. Thứ tự cũng giữ nguyên như máy chủ trả về, trừ những dòng vừa thêm
 * trong lượt làm việc này — xem `recentlyAddedSkus`.
 */
const REQUIREMENTS_PER_PAGE = 10;

/**
 * Bảng vật tư của bản tham mưu, ADMIN sửa được tại chỗ.
 *
 * Định mức của hệ thống là ĐIỂM XUẤT PHÁT, không phải kết luận. Nó tính theo đầu
 * người và số ngày, nên nó không biết thôn này vừa được xã bên cạnh tiếp tế nước
 * hôm qua, hay nhà văn hoá đang chứa thêm ba chục người từ thôn khác chạy sang.
 * Người trực biết những điều đó và trước nay chỉ còn cách chấp nhận con số máy
 * đưa ra rồi tự bù trừ trong đầu.
 *
 * Sửa xong thì khả năng đáp ứng TÍNH LẠI ngay theo số mới — đó mới là điều khiến
 * việc sửa có nghĩa: chỉnh con số mà mức đáp ứng đứng yên thì nó chỉ là ghi chú.
 */
export function RequirementEditor({
  missionId,
  requirements,
  editable,
}: {
  missionId: string;
  requirements: MissionRequirement[];
  /**
   * Nhiệm vụ còn sửa được không.
   *
   * Đã duyệt và phát hành thì các kho đang cầm phiếu xuất theo đúng con số này;
   * đổi nhu cầu lúc đó là đổi lệnh dưới tay người đang bốc hàng. Máy chủ chặn lần
   * nữa — ở đây chỉ là không bày ra nút cho một việc chắc chắn bị từ chối.
   */
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  /** SKU đang mở ô nhập để sửa số lượng. */
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState("");
  const [adding, setAdding] = useState(false);
  const [addSku, setAddSku] = useState("");
  const [addQuantity, setAddQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Việc đang chờ người dùng xác nhận.
   *
   * Sửa và xoá đều hỏi lại, vì cả hai đều làm bản tham mưu tính lại từ đầu và xoá
   * mất kế hoạch cứu hộ đã lập. Thêm thì không hỏi: nó chỉ cộng thêm một dòng, và
   * dòng vừa thêm sửa hay xoá được ngay tại chỗ.
   */
  const [pending, setPending] = useState<
    | { kind: "update"; sku: string; itemName: string; from: number; to: number; unit: string }
    | { kind: "remove"; sku: string; itemName: string }
    | null
  >(null);
  /**
   * Vật tư vừa thêm trong lượt làm việc này, mới nhất đứng trước.
   *
   * Máy chủ nối dòng mới vào cuối danh sách, nên thêm dòng thứ 11 trong lúc đang ở
   * trang 1 thì bảng không đổi gì — người dùng vừa bấm "Thêm vào phương án" mà
   * không thấy kết quả sẽ tưởng việc thêm thất bại và bấm lại. Đưa dòng ấy lên đầu
   * thì cái vừa làm nằm đúng chỗ mắt đang nhìn, và sửa hay xoá lại được ngay.
   *
   * Chỉ là thứ tự HIỂN THỊ và chỉ trong lượt này: tải lại trang thì bảng về đúng
   * thứ tự của bản ghi. Không cần ghim lâu hơn — mục đích là xác nhận thao tác vừa
   * rồi, không phải định nghĩa lại thứ tự của bản tham mưu.
   */
  const [recentlyAddedSkus, setRecentlyAddedSkus] = useState<string[]>([]);

  const orderedRequirements = useMemo(() => {
    if (recentlyAddedSkus.length === 0) return requirements;
    const pinned = [...new Set(recentlyAddedSkus)]
      .map((sku) => requirements.find((requirement) => requirement.sku === sku))
      // Lọc `undefined`: dòng đã ghim vẫn có thể bị xoá ngay sau đó.
      .filter((requirement): requirement is MissionRequirement => requirement != null);
    // `new Set` ở trên là để hàm tự đúng chứ không dựa vào nơi gọi: một mã lọt vào
    // danh sách ghim hai lần sẽ thành hai dòng giống nhau trong bảng.
    const pinnedSkus = new Set(pinned.map((requirement) => requirement.sku));
    return [...pinned, ...requirements.filter((r) => !pinnedSkus.has(r.sku))];
  }, [recentlyAddedSkus, requirements]);

  const { page, pageItems, pageSize, setPage, totalPages } = usePagination(
    orderedRequirements,
    REQUIREMENTS_PER_PAGE,
  );

  const options = useQuery({
    queryKey: ["mission", missionId, "requirement-options"],
    queryFn: () => listRequirementOptions(missionId),
    // Chỉ tải khi form thêm MỞ RA: phần lớn lượt mở nhiệm vụ là để đọc, và danh
    // sách này phải quét tồn kho cả cụm kho rồi trừ phần đã hứa cho nhiệm vụ khác.
    enabled: editable && adding,
    staleTime: 30_000,
  });

  const change = useMutation({
    mutationFn: (input: {
      missionId: string;
      change: Parameters<typeof changeMissionRequirement>[1];
    }) => changeMissionRequirement(input.missionId, input.change),
    onMutate: () => setError(null),
    onSuccess: (_result, input) => {
      setEditingSku(null);
      setAdding(false);
      setAddSku("");
      setAddQuantity("");
      if (input.change.op === "add") {
        const { sku } = input.change;
        // Lọc trùng trước khi nối: thêm rồi xoá rồi thêm lại cùng một món thì nó
        // chỉ được đứng ở một chỗ, và là chỗ đầu.
        setRecentlyAddedSkus((current) => [sku, ...current.filter((it) => it !== sku)]);
        // Về trang 1 vì dòng mới nay nằm ở đó.
        setPage(1);
      }
      // Nhiệm vụ mang theo `readinessAssessment` vừa tính lại, nên chỉ cần bảo
      // lượt truy vấn nhiệm vụ tải lại là khối "Khả năng đáp ứng" tự đổi theo.
      queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
      queryClient.invalidateQueries({ queryKey: ["mission", missionId, "requirement-options"] });
    },
    onError: (e) =>
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Không cập nhật được vật tư trong bản tham mưu.",
      ),
  });

  const busy = change.isPending;
  // Đã có trong bản tham mưu rồi thì không mời thêm lần nữa — thêm trùng bị máy
  // chủ từ chối, và một dòng chọn được nhưng bấm vào là báo lỗi thì tệ hơn là
  // không có dòng đó.
  const addableOptions = (options.data ?? []).filter((option) => !option.alreadyInPlan);
  const selectedOption = addableOptions.find((option) => option.sku === addSku);

  return (
    <div className="space-y-2">
      <ConfirmDialog
        open={pending?.kind === "update"}
        title="Đổi số lượng vật tư?"
        message={
          pending?.kind === "update"
            ? `${pending.itemName}: ${pending.from.toLocaleString("vi")} → ${pending.to.toLocaleString("vi")} ${pending.unit}. Hệ thống sẽ phân bổ lại toàn bộ vật tư theo tồn kho hiện tại, và kế hoạch cứu hộ đã lập (nếu có) sẽ bị xoá để lập lại trên số mới.`
            : ""
        }
        confirmLabel="Đổi số lượng"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind !== "update") return;
          const { sku, to } = pending;
          setPending(null);
          change.mutate({ missionId, change: { op: "update", sku, quantity: to } });
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "remove"}
        title="Bỏ vật tư khỏi bản tham mưu?"
        message={
          pending?.kind === "remove"
            ? `${pending.itemName} sẽ không còn trong phương án, và không kho nào phải chuẩn bị nó nữa. Hệ thống phân bổ lại phần còn lại, kế hoạch cứu hộ đã lập (nếu có) sẽ bị xoá để lập lại.`
            : ""
        }
        confirmLabel="Bỏ khỏi phương án"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind !== "remove") return;
          const { sku } = pending;
          setPending(null);
          change.mutate({ missionId, change: { op: "remove", sku } });
        }}
      />

      {requirements.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-[var(--text-muted)]">
          Bản tham mưu chưa có vật tư nào.
          {editable ? " Thêm bằng nút bên dưới, hoặc lập lại bản tham mưu." : ""}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Vật tư</th>
                <th className="px-3 py-2 text-right font-medium">Nhu cầu</th>
                <th className="px-3 py-2 text-right font-medium">Kho đáp ứng</th>
                {editable ? <th className="px-3 py-2 text-right font-medium">Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((requirement) => {
                const editing = editingSku === requirement.sku;
                return (
                  <tr className="border-t align-top" key={requirement.sku}>
                    <td className="px-3 py-2 font-medium">{requirement.itemName}</td>
                    <td className="px-3 py-2 text-right">
                      {editing ? (
                        <input
                          aria-label={`Số lượng ${requirement.itemName}`}
                          autoFocus
                          className="tabular w-24 rounded-md border bg-[var(--surface)] px-2 py-1 text-right text-sm"
                          inputMode="numeric"
                          onChange={(event) =>
                            setEditingQuantity(event.target.value.replace(/\D/g, "").slice(0, 7))
                          }
                          value={editingQuantity}
                        />
                      ) : (
                        <span className="tabular whitespace-nowrap">
                          {requirement.required.toLocaleString("vi")} {requirement.unit}
                        </span>
                      )}
                    </td>
                    {/* Số kho đáp ứng được nằm NGAY CẠNH ô nhập: người sửa đang
                        cân đúng hai con số này với nhau, tách chúng sang hai khối
                        là bắt họ nhớ một con số trong lúc gõ con số kia. */}
                    <td className="px-3 py-2 text-right">
                      <span
                        className="tabular whitespace-nowrap"
                        style={{
                          color:
                            requirement.shortage > 0
                              ? "var(--color-critical)"
                              : "var(--color-ready)",
                        }}
                      >
                        {requirement.allocated.toLocaleString("vi")} {requirement.unit}
                      </span>
                      {requirement.shortage > 0 ? (
                        <span className="block text-xs text-[var(--color-critical)]">
                          thiếu {requirement.shortage.toLocaleString("vi")}
                        </span>
                      ) : null}
                    </td>
                    {editable ? (
                      /* Sát mép phải của bảng: hai cột số bên trái đã căn phải,
                         để cột nút căn trái thì giữa bảng hở một khoảng trắng
                         chạy dọc và mắt phải nhảy qua nó ở mỗi dòng. */
                      <td className="px-3 py-2 text-right">
                        {editing ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <RowButton
                              disabled={busy || !editingQuantity || Number(editingQuantity) < 1}
                              onClick={() => {
                                const next = Number(editingQuantity);
                                if (!Number.isInteger(next) || next < 1) {
                                  setError("Số lượng phải là số nguyên dương.");
                                  return;
                                }
                                if (next === requirement.required) {
                                  setEditingSku(null);
                                  return;
                                }
                                setPending({
                                  kind: "update",
                                  sku: requirement.sku,
                                  itemName: requirement.itemName,
                                  from: requirement.required,
                                  to: next,
                                  unit: requirement.unit,
                                });
                              }}
                              tone="accent"
                            >
                              Lưu
                            </RowButton>
                            <RowButton disabled={busy} onClick={() => setEditingSku(null)}>
                              Huỷ
                            </RowButton>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <RowButton
                              disabled={busy}
                              onClick={() => {
                                setError(null);
                                setEditingSku(requirement.sku);
                                setEditingQuantity(String(requirement.required));
                              }}
                            >
                              Sửa
                            </RowButton>
                            <RowButton
                              disabled={busy}
                              onClick={() => {
                                setError(null);
                                setPending({
                                  kind: "remove",
                                  sku: requirement.sku,
                                  itemName: requirement.itemName,
                                });
                              }}
                              tone="critical"
                            >
                              Xoá
                            </RowButton>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Đệm ngang 0 để chân trang thẳng hàng với hai mép bảng phía trên — mặc
          định `px-5` là gutter cho thẻ bảng không có đệm riêng, còn khối này đã
          nằm trong một `Section` có đệm. */}
      <Pagination
        label="vật tư"
        onPageChange={(next) => {
          // Đang mở ô sửa mà lật trang thì ô ấy trôi sang trang khác: đóng lại để
          // không còn một lần sửa treo lơ lửng ngoài màn hình.
          setEditingSku(null);
          setPage(next);
        }}
        padding="px-0 pt-2"
        page={page}
        pageSize={pageSize}
        totalItems={orderedRequirements.length}
        totalPages={totalPages}
      />

      {editable ? (
        adding ? (
          <div className="space-y-2 rounded-md border border-dashed bg-[var(--surface-2)] p-3">
            {/* Nói rõ vì sao danh sách ngắn hơn danh mục vật tư của xã. Không nói
                thì người dùng đi tìm một món họ biết là có và kết luận hệ thống
                sót — trong khi câu trả lời đúng là kho không còn để cấp. */}
            <p className="text-xs text-[var(--text-muted)]">
              Chỉ hiện vật tư mà cụm kho trong xã còn ít nhất 1 đơn vị lấy ra được ngay (đã trừ
              phần đã hứa cho nhiệm vụ khác).
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Vật tư
                </span>
                <select
                  className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                  disabled={options.isPending || busy}
                  onChange={(event) => setAddSku(event.target.value)}
                  value={addSku}
                >
                  <option value="">
                    {options.isPending
                      ? "Đang tra tồn kho cả xã…"
                      : addableOptions.length === 0
                        ? "— Không còn vật tư nào để thêm —"
                        : "— Chọn vật tư —"}
                  </option>
                  {addableOptions.map((option) => (
                    <option key={option.sku} value={option.sku}>
                      {option.itemName} — còn {option.availableQuantity.toLocaleString("vi")}{" "}
                      {option.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  Số lượng{selectedOption ? ` (${selectedOption.unit})` : ""}
                </span>
                <input
                  className="tabular w-28 rounded-md border bg-[var(--surface)] px-3 py-2 text-right text-sm"
                  inputMode="numeric"
                  onChange={(event) =>
                    setAddQuantity(event.target.value.replace(/\D/g, "").slice(0, 7))
                  }
                  placeholder="0"
                  value={addQuantity}
                />
              </label>
              <button
                className="min-h-10 rounded-md bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
                disabled={busy || !addSku || Number(addQuantity) < 1}
                onClick={() => {
                  const quantity = Number(addQuantity);
                  if (!Number.isInteger(quantity) || quantity < 1) {
                    setError("Số lượng phải là số nguyên dương.");
                    return;
                  }
                  change.mutate({
                    missionId,
                    change: { op: "add", sku: addSku, quantity },
                  });
                }}
                type="button"
              >
                {busy ? "Đang tính lại…" : "Thêm vào phương án"}
              </button>
              <button
                className="min-h-10 rounded-md border bg-[var(--surface)] px-3 text-sm font-semibold transition hover:bg-[var(--surface-3)] disabled:opacity-60"
                disabled={busy}
                onClick={() => {
                  setAdding(false);
                  setAddSku("");
                  setAddQuantity("");
                }}
                type="button"
              >
                Đóng
              </button>
            </div>
            {options.isError ? (
              <p className="text-xs text-[var(--color-critical)]">
                Không tra được tồn kho của xã. Thử lại sau ít phút.
              </p>
            ) : null}
          </div>
        ) : (
          <button
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-60"
            disabled={busy}
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
            type="button"
          >
            <ColorIcon name="inventory" size={16} tone="green" />
            Thêm vật tư
          </button>
        )
      ) : null}

      <div aria-live="polite" className="min-h-4">
        {error ? <p className="text-xs text-[var(--color-critical)]">{error}</p> : null}
        {busy ? (
          <p className="text-xs text-[var(--text-muted)]">
            Đang phân bổ lại theo tồn kho hiện tại…
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RowButton({
  children,
  disabled,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "accent" | "critical";
}) {
  return (
    <button
      className="rounded-md border px-2.5 py-1 text-xs font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      style={
        tone === "critical"
          ? { borderColor: "var(--color-critical)", color: "var(--color-critical)" }
          : tone === "accent"
            ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" }
            : undefined
      }
      type="button"
    >
      {children}
    </button>
  );
}

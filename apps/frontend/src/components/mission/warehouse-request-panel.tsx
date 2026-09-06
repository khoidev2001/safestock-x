"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import {
  BULK_ACTION_LABEL,
  planBulkAction,
  warehouseProgress,
} from "./warehouse-request-progress";
import {
  acceptWarehouseRequest,
  confirmWarehousePickup,
  prepareWarehouseRequest,
  reportWarehouseRequestDiscrepancy,
  reviewWarehouseRequest,
  type MissionStatus,
  type MissionWarehouseRequest,
} from "@/lib/mission-api";

export function WarehouseRequestPanel({
  missionId,
  requests,
  role,
  assignedWarehouseId,
  missionStatus,
}: {
  missionId: string;
  requests: MissionWarehouseRequest[];
  role?: string;
  assignedWarehouseId?: string | null;
  /** Nhiệm vụ đã đóng thì khối này thu gọn — xem chú thích ở `CollapsiblePanel` bên dưới. */
  missionStatus: MissionStatus;
}) {
  const queryClient = useQueryClient();
  /**
   * Kho đang được chọn để xem chi tiết. `null` = chưa ai bấm, lấy kho đầu danh sách.
   *
   * Giữ ở dạng "chưa chọn" thay vì gán sẵn id kho đầu tiên: danh sách kho đổi theo
   * dữ liệu tải về (kho xuất xong thì tụt xuống cuối), gán cứng lúc dựng thì lần
   * đầu vào trang đã chọn một kho, còn lần sau vào lại chọn kho khác mà không ai
   * bấm gì.
   */
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const action = useMutation({
    mutationFn: async ({
      kind,
      request,
    }: {
      kind: "accept" | "prepare" | "discrepancy" | "review" | "pickup";
      request: MissionWarehouseRequest;
    }) => {
      if (kind === "accept") {
        return acceptWarehouseRequest(request.id, notes[request.id]?.trim() || undefined);
      }
      if (kind === "prepare") return prepareWarehouseRequest(request.id);
      if (kind === "pickup") {
        const raw = (quantities[request.id] ?? "").trim();
        // Bỏ trống nghĩa là lấy đủ. Bắt gõ lại đúng con số đã hiện sẵn chỉ tạo
        // thêm một chỗ để gõ nhầm, mà lấy đủ mới là trường hợp thường gặp.
        const receivedQuantity = raw === "" ? request.preparedQuantity : Number(raw);
        if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
          throw new Error("Số đã lấy phải là số nguyên không âm.");
        }
        const note = notes[request.id]?.trim();
        if (receivedQuantity < request.preparedQuantity && !note) {
          throw new Error(
            `Thiếu ${request.preparedQuantity - receivedQuantity} so với số đã soạn — phải ghi rõ lý do.`,
          );
        }
        return confirmWarehousePickup(request.id, { receivedQuantity, note: note || undefined });
      }
      if (kind === "discrepancy") {
        const note = notes[request.id]?.trim();
        if (!note || note.length < 3) throw new Error("Cần ghi rõ chênh lệch (ít nhất 3 ký tự).");
        return reportWarehouseRequestDiscrepancy(request.id, note);
      }
      const requestedQuantity = Number(quantities[request.id] ?? request.requestedQuantity);
      if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
        throw new Error("Số lượng duyệt phải là số nguyên dương.");
      }
      return reviewWarehouseRequest(request.id, {
        requestedQuantity,
        adminNote: notes[request.id]?.trim() || undefined,
      });
    },
    onMutate: () => setActionError(null),
    onSuccess: (_, variables) => {
      setNotes((current) => ({ ...current, [variables.request.id]: "" }));
      setQuantities((current) => ({ ...current, [variables.request.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : "Không cập nhật được yêu cầu vật tư"),
  });

  /**
   * Làm cả loạt trong MỘT lượt bấm — cùng ba việc của từng dòng, chỉ khác là chạy hết.
   *
   * Kho thôn thường nhận cả chục dòng SKU cho một nhiệm vụ, và thao tác thật gần như
   * luôn là "tiếp nhận hết, xuất hết, ký hết": người của kho đứng trước đống hàng đã
   * soạn sẵn chứ không xét từng món. Bắt bấm mười lần giữa lúc lũ đang lên là bắt họ
   * trả giá cho một chi tiết của phần mềm.
   *
   * CHẠY TUẦN TỰ, không `Promise.all`. Mỗi lượt gọi đều đụng vào tồn kho và ghi giao
   * dịch; bắn song song thì backend phải chịu mười giao dịch cùng lúc trên cùng một
   * lô hàng, và lỗi tranh chấp sẽ nổ ra ở đúng chỗ khó lần nhất. Chậm hơn vài trăm
   * mili-giây, đổi lại thứ tự rõ ràng và biết chính xác dừng ở dòng nào.
   */
  const bulkAction = useMutation({
    mutationFn: async ({
      kind,
      requests: targets,
    }: {
      kind: "accept" | "prepare" | "pickup";
      requests: MissionWarehouseRequest[];
    }) => {
      let done = 0;
      for (const request of targets) {
        try {
          if (kind === "accept") {
            await acceptWarehouseRequest(request.id, notes[request.id]?.trim() || undefined);
          } else if (kind === "prepare") {
            await prepareWarehouseRequest(request.id);
          } else {
            // Hàng loạt = LẤY ĐỦ. Dòng nào người dùng đã gõ số khác đều bị loại khỏi
            // danh sách này từ trước (xem `bulkPickupRows`), nên ở đây không có ca
            // nào phải đoán xem họ định ký nhận bao nhiêu.
            await confirmWarehousePickup(request.id, {
              receivedQuantity: request.preparedQuantity,
            });
          }
          done += 1;
        } catch (error) {
          // Nói rõ ĐÃ XONG MẤY DÒNG trước khi vỡ. Chỉ ném lỗi gốc thì người dùng
          // không biết nên bấm lại cả loạt hay chỉ còn vài dòng cuối — mà bấm lại
          // cả loạt sau khi bảy dòng đã xuất là chuyện phải tránh.
          const reason = error instanceof Error ? error.message : "lỗi không rõ";
          throw new Error(
            done === 0
              ? `Không làm được dòng nào: ${reason}`
              : `Đã xong ${done}/${targets.length} dòng rồi dừng ở “${request.itemName}”: ${reason}`,
          );
        }
      }
      return done;
    },
    onMutate: () => setActionError(null),
    onSuccess: (_, variables) => {
      setNotes((current) => {
        const next = { ...current };
        for (const request of variables.requests) delete next[request.id];
        return next;
      });
      setQuantities((current) => {
        const next = { ...current };
        for (const request of variables.requests) delete next[request.id];
        return next;
      });
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : "Không cập nhật được cả loạt"),
    // Tải lại DÙ THÀNH CÔNG HAY KHÔNG: loạt vỡ giữa chừng vẫn để lại những dòng đã
    // xong thật. Chỉ tải lại ở nhánh thành công thì màn hình còn hiện chúng là "chờ
    // xử lý", và người dùng bấm lại lần nữa lên đúng thứ vừa xuất.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
    },
  });

  if (requests.length === 0) return null;
  // Kho đăng nhập chỉ được xem phần của chính mình — thẻ kho khác vẫn hiện để họ
  // biết cả đoàn còn nợ ai, nhưng không mở ra được từng dòng vật tư của kho đó.
  const lockedToOwnWarehouse = role === "WAREHOUSE" && Boolean(assignedWarehouseId);
  // Đã xuất gồm cả khoản đã có người ký nhận mang đi — không thì kho vừa làm
  // xong lại lùi về "chưa xong" ngay lúc người lấy hàng ký tên.
  const preparedCount = requests.filter(
    (request) => request.status === "PREPARED" || request.status === "PICKED_UP",
  ).length;
  // XONG là khi ĐỘI ĐÃ KÝ NHẬN, không phải khi kho vừa xuất. Hàng ra sân kho mà
  // chưa ai tới lấy thì việc chưa xong — người cần vẫn chưa có.
  const pickedUpCount = requests.filter((request) => request.status === "PICKED_UP").length;
  const warehouseProgressRows = warehouseProgress(requests);

  /**
   * Danh sách bên dưới chỉ hiện vật tư của MỘT kho.
   *
   * Một nhiệm vụ lớn có gần ba chục dòng trải trên mười mấy kho; đổ hết ra một
   * danh sách thì người của kho nào cũng phải cuộn qua phần của kho khác để tìm
   * phần của mình, và điều phối muốn kiểm một kho thì phải tự lọc bằng mắt theo
   * dòng tên kho nhỏ dưới tên vật tư.
   *
   * Kho đang chọn không còn trong dữ liệu (vừa tải lại, phương án đổi) thì lùi về
   * kho đầu danh sách thay vì để danh sách trống — trống trông y như "kho này
   * không phải chuẩn bị gì", một câu trả lời sai.
   */
  const selectedStillExists = warehouseProgressRows.some(
    (row) => row.warehouseId === selectedWarehouseId,
  );
  const activeWarehouseId = lockedToOwnWarehouse
    ? (assignedWarehouseId as string)
    : selectedStillExists
      ? (selectedWarehouseId as string)
      : (warehouseProgressRows[0]?.warehouseId ?? null);
  const activeWarehouseName =
    warehouseProgressRows.find((row) => row.warehouseId === activeWarehouseId)?.name ?? null;
  const visible = activeWarehouseId
    ? requests.filter((request) => request.warehouseId === activeWarehouseId)
    : requests;

  /**
   * Các dòng NGƯỜI ĐANG ĐĂNG NHẬP tự tay làm được, trong đúng kho đang xem.
   *
   * Cùng điều kiện với nút của từng dòng (`isOwnWarehouse` bên dưới): điều phối xem
   * được mọi kho nhưng không xuất hộ kho nào, nên nút hàng loạt cũng không được hiện
   * cho họ. Một nút "xuất tất cả" mà bấm vào thì hỏng là tệ hơn không có nút.
   */
  const bulkTargets = visible.filter(
    (request) => role === "WAREHOUSE" && request.warehouseId === assignedWarehouseId,
  );
  // Ba mốc nối đuôi, mỗi lúc chỉ lộ ra một — quy tắc nằm trong hàm thuần bên
  // `warehouse-request-progress`, chốt bằng test.
  const bulk = planBulkAction(bulkTargets, (request) => quantities[request.id] ?? "");
  const partialPickupCount = bulk.partialPickupCount;

  return (
    <CollapsiblePanel
      /* THU GỌN khi hiện trường đã gửi kết quả: bảng này là việc phải làm của kho,
         nhiệm vụ đóng rồi thì không còn dòng nào chờ ai bấm. Dòng tóm tắt "x/y vật
         tư kho đã xuất" vẫn đọc được lúc gập nên không mất thông tin nào.

         `key` đổi theo cờ vì `CollapsiblePanel` chỉ đọc `defaultOpen` lúc dựng. */
      key={missionStatus === "COMPLETED" ? "nhiem-vu-da-dong" : "nhiem-vu-dang-chay"}
      defaultOpen={missionStatus !== "COMPLETED"}
      headingId="warehouse-request-title"
      title="Chuẩn bị vật tư theo SKU"
      subtitle={
        <>
          {preparedCount}/{requests.length} vật tư kho đã xuất · {pickedUpCount}/{requests.length}{" "}
          đội đã ký nhận.
          {/* Con số gộp không nói được kho nào còn nợ. Điều phối đang chờ hàng chỉ
              cần đúng một thứ: gọi cho ai. */}
          {/* Mỗi kho một thẻ có MÀU: xanh lá là xong, cam là còn nợ. Màu đọc
              được từ xa và trong một cái liếc, còn con số thì phải dừng lại đọc
              — mà lúc đang điều phối thì không ai dừng lại. Vẫn giữ dấu ✓ / •
              bên cạnh cho người phân biệt màu kém. */}
          <span className="mt-2 flex flex-wrap gap-1.5">
            {warehouseProgressRows.map((warehouse) => {
              const isActive = warehouse.warehouseId === activeWarehouseId;
              const selectable = !lockedToOwnWarehouse;
              const select = () => setSelectedWarehouseId(warehouse.warehouseId);
              return (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    selectable ? "cursor-pointer" : ""
                  }`}
                  key={warehouse.warehouseId}
                  /* Thẻ nằm TRONG nút gập/mở của khối, nên không dùng <button> lồng
                   nhau được — HTML không cho, và một cú bấm sẽ vừa chọn kho vừa
                   gập cả khối lại. `role="button"` + chặn nổi bọt cho đúng một
                   việc xảy ra, giống nút "Lập bản tham mưu" trong khối tham mưu. */
                  role={selectable ? "button" : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  aria-pressed={selectable ? isActive : undefined}
                  onClick={
                    selectable
                      ? (event) => {
                          event.stopPropagation();
                          select();
                        }
                      : undefined
                  }
                  onKeyDown={
                    selectable
                      ? (event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          select();
                        }
                      : undefined
                  }
                  style={{
                    ...(warehouse.done
                      ? {
                          borderColor: "var(--color-ready)",
                          color: "var(--color-ready)",
                          background: "color-mix(in srgb, var(--color-ready) 10%, transparent)",
                        }
                      : warehouse.awaitingPickup
                        ? {
                            borderColor: "var(--color-accent)",
                            color: "var(--color-accent)",
                            background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                          }
                        : {
                            borderColor: "var(--color-attention)",
                            color: "var(--color-attention)",
                            background:
                              "color-mix(in srgb, var(--color-attention) 12%, transparent)",
                          }),
                    // Vòng ngoài cho thẻ đang mở, vẽ bằng chính màu trạng thái của thẻ
                    // (`currentColor`) nên nó không cướp mất nghĩa của ba màu xanh /
                    // cam / vàng. Dùng box-shadow chứ không đổi bề dày viền: đổi viền
                    // là thẻ to thêm 2px và cả hàng thẻ nhích chỗ mỗi lần bấm.
                    ...(isActive
                      ? { boxShadow: "0 0 0 2px color-mix(in srgb, currentColor 40%, transparent)" }
                      : null),
                  }}
                >
                  {/* Ba dấu cho ba mốc, để người phân biệt màu kém vẫn đọc được:
                    • chưa xuất xong · → đã xuất, chờ đội lấy · ✓ đội đã ký nhận. */}
                  <span aria-hidden="true">
                    {warehouse.done ? "✓" : warehouse.awaitingPickup ? "→" : "•"}
                  </span>
                  {warehouse.name}
                  <span className="font-mono font-normal">
                    {/* Hiện số ĐỘI ĐÃ KÝ khi kho xuất xong — đó mới là việc còn lại. */}
                    {warehouse.awaitingPickup || warehouse.done
                      ? `${warehouse.pickedUp}/${warehouse.total} đã lấy`
                      : `${warehouse.prepared}/${warehouse.total} đã xuất`}
                  </span>
                  <span className="sr-only">
                    {warehouse.done
                      ? " — đội đã ký nhận đủ"
                      : warehouse.awaitingPickup
                        ? " — kho đã xuất, chờ đội tới lấy"
                        : " — kho chưa xuất xong"}
                  </span>
                </span>
              );
            })}
          </span>
        </>
      }
      badge={
        /**
         * KẾT QUẢ CỨU HỘ THẮNG TIẾN ĐỘ KHO.
         *
         * Ba nhãn còn lại chỉ đọc phần việc của chính kho — đã xuất mấy dòng, đội đã
         * ký mấy dòng. Nhưng khi hiện trường đã báo giao xong thì chuyện đó kết thúc
         * rồi, và trưởng thôn nhìn vào thẻ này để biết hàng của mình cuối cùng có tới
         * nơi hay không. Giữ nguyên "Đang chuẩn bị" lúc nhiệm vụ đã đóng là để họ
         * tưởng còn phải làm gì đó, trong khi thứ họ cần biết — chuyến đi thành công —
         * lại không hiện ở đâu trên thẻ.
         *
         * Vẫn hiện kể cả khi kho còn dòng chưa ký nhận: đó là hai sự thật khác nhau,
         * và dòng tóm tắt "x/y đội đã ký nhận" ngay dưới tiêu đề vẫn nói phần còn dở.
         */
        missionStatus === "COMPLETED" ? (
          <span
            className="rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{
              borderColor: "var(--color-ready)",
              color: "var(--color-ready)",
              background: "color-mix(in srgb, var(--color-ready) 10%, transparent)",
            }}
          >
            Cứu hộ đã hoàn thành
          </span>
        ) : (
          <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
            {pickedUpCount === requests.length
              ? "Đã hoàn tất"
              : preparedCount === requests.length
                ? "Chờ đội tới lấy"
                : "Đang chuẩn bị"}
          </span>
        )
      }
    >
      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-[var(--text-muted)]">
          Kho đang đăng nhập không có vật tư được phân bổ trong phương án này.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Nói rõ đang xem kho nào. Không có dòng này thì một danh sách hai dòng
              trông y như "cả nhiệm vụ chỉ cần hai món" — vòng chỉ báo trên thẻ kho
              là dấu hiệu duy nhất, mà nó nằm tận trên đầu khối. */}
          {activeWarehouseName ? (
            <p className="text-xs text-[var(--text-muted)]">
              Đang xem <b className="text-[var(--text)]">{activeWarehouseName}</b> —{" "}
              {visible.length} vật tư
              {lockedToOwnWarehouse ? "" : ". Bấm thẻ kho phía trên để xem kho khác."}
            </p>
          ) : null}

          {/* Nút làm cả loạt, đặt TRÊN danh sách.
              Đặt dưới thì với mười dòng SKU nó nằm ngoài màn hình, và người dùng cuộn
              tới cuối bấm từng nút một xong mới thấy — đúng lúc không còn tác dụng. */}
          {bulk.kind ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
              <ActionButton
                label={`${BULK_ACTION_LABEL[bulk.kind]} (${bulk.rows.length} vật tư)`}
                disabled={bulkAction.isPending || action.isPending}
                onClick={() =>
                  bulkAction.mutate({
                    kind: bulk.kind as "accept" | "prepare" | "pickup",
                    requests: bulk.rows,
                  })
                }
              />
              <span className="text-xs text-[var(--text-muted)]">
                {bulk.kind === "pickup"
                  ? `Ký nhận ĐỦ số đã soạn cho ${bulk.rows.length} vật tư.`
                  : `Làm lần lượt cho ${bulk.rows.length} vật tư của kho này.`}
                {/* Nói thẳng còn dòng nào bị bỏ lại và vì sao. Im lặng bỏ qua thì
                    người dùng bấm xong tưởng hết việc, trong khi dòng thiếu hàng —
                    đúng dòng cần chú ý nhất — vẫn nằm đó chờ. */}
                {bulk.kind === "pickup" && partialPickupCount > 0
                  ? ` Còn ${partialPickupCount} vật tư đang khai lấy thiếu, phải ký riêng kèm lý do.`
                  : ""}
              </span>
            </div>
          ) : partialPickupCount > 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-[var(--text-muted)]">
              {partialPickupCount} vật tư đang khai lấy thiếu — ký riêng từng dòng kèm lý do,
              không ký gộp được.
            </p>
          ) : null}
          <div className="divide-y rounded-md border">
            {visible.map((request) => {
              const isOwnWarehouse =
                role === "WAREHOUSE" && request.warehouseId === assignedWarehouseId;
              // Đang chạy cả loạt thì khoá hết nút của từng dòng: bấm chen vào giữa
              // là hai đường cùng đổi trạng thái một bản ghi.
              const busy =
                bulkAction.isPending ||
                (action.isPending && action.variables?.request.id === request.id);
              return (
                <article key={request.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{request.itemName}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {request.warehouse?.name ?? request.warehouseId}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold">
                        {request.status === "PREPARED"
                          ? request.preparedQuantity
                          : request.requestedQuantity}{" "}
                        {request.unit}
                      </p>
                      <p className="mt-1 text-xs font-semibold">
                        {requestStatusLabel(request.status)}
                      </p>
                    </div>
                  </div>

                  {request.warehouseNote ? (
                    <p className="mt-3 rounded-md border border-amber-300/60 bg-amber-50/60 p-2.5 text-sm dark:bg-amber-950/20">
                      Kho báo: {request.warehouseNote}
                    </p>
                  ) : null}
                  {request.adminNote ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Điều phối ghi chú: {request.adminNote}
                    </p>
                  ) : null}

                  {isOwnWarehouse && request.status !== "PREPARED" ? (
                    <div className="mt-3 space-y-2">
                      <label
                        className="block text-xs font-medium"
                        htmlFor={`warehouse-note-${request.id}`}
                      >
                        Ghi chú hoặc chênh lệch thực tế
                      </label>
                      <textarea
                        id={`warehouse-note-${request.id}`}
                        value={notes[request.id] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                        }
                        maxLength={1_000}
                        rows={2}
                        className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        {request.status === "PENDING" ? (
                          <ActionButton
                            label="Tiếp nhận yêu cầu"
                            disabled={busy}
                            onClick={() => action.mutate({ kind: "accept", request })}
                          />
                        ) : (
                          <ActionButton
                            label="Xác nhận xuất vật tư"
                            disabled={busy}
                            onClick={() => action.mutate({ kind: "prepare", request })}
                          />
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => action.mutate({ kind: "discrepancy", request })}
                          className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                        >
                          Báo thiếu / sai
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {request.status === "PICKED_UP" ? (
                    <p
                      className={
                        (request.pickedUpQuantity ?? 0) < request.preparedQuantity
                          ? "mt-3 rounded-md border border-amber-300/60 bg-amber-50/60 p-2.5 text-sm dark:bg-amber-950/20"
                          : "mt-3 text-sm text-[var(--text-muted)]"
                      }
                    >
                      Đã ký nhận {request.pickedUpQuantity ?? 0}/{request.preparedQuantity}{" "}
                      {request.unit}
                      {(request.pickedUpQuantity ?? 0) < request.preparedQuantity
                        ? ` — thiếu ${request.preparedQuantity - (request.pickedUpQuantity ?? 0)}. Lý do: ${request.pickupNote ?? "không ghi"}`
                        : " (đủ)"}
                    </p>
                  ) : null}

                  {isOwnWarehouse && request.status === "PREPARED" ? (
                    <div className="mt-3 space-y-2 rounded-md border p-3">
                      <p className="text-xs font-semibold">Người đi lấy ký nhận</p>
                      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                        <div>
                          <label
                            className="block text-xs font-medium"
                            htmlFor={`pickup-quantity-${request.id}`}
                          >
                            Số thực lấy
                          </label>
                          <input
                            className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                            id={`pickup-quantity-${request.id}`}
                            max={request.preparedQuantity}
                            min={0}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            placeholder={String(request.preparedQuantity)}
                            type="number"
                            value={quantities[request.id] ?? ""}
                          />
                        </div>
                        <div>
                          <label
                            className="block text-xs font-medium"
                            htmlFor={`pickup-note-${request.id}`}
                          >
                            Thiếu thì ghi rõ vì sao
                          </label>
                          <input
                            className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                            id={`pickup-note-${request.id}`}
                            maxLength={1_000}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            placeholder="Kho hết hàng / xe không chở hết / lô bị ướt…"
                            value={notes[request.id] ?? ""}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Để trống số thực lấy nghĩa là lấy đủ {request.preparedQuantity}{" "}
                        {request.unit}.
                      </p>
                      <ActionButton
                        disabled={busy}
                        label="Ký nhận đã lấy hàng"
                        onClick={() => action.mutate({ kind: "pickup", request })}
                      />
                    </div>
                  ) : null}

                  {role === "ADMIN" && request.status !== "PREPARED" && request.warehouseNote ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                      <label className="sr-only" htmlFor={`request-quantity-${request.id}`}>
                        Số lượng duyệt lại
                      </label>
                      <input
                        id={`request-quantity-${request.id}`}
                        type="number"
                        min={1}
                        max={request.requestedQuantity}
                        value={quantities[request.id] ?? request.requestedQuantity}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        className="rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                      />
                      <label className="sr-only" htmlFor={`admin-note-${request.id}`}>
                        Ghi chú điều phối
                      </label>
                      <input
                        id={`admin-note-${request.id}`}
                        value={notes[request.id] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                        }
                        placeholder="Ghi chú cho kho"
                        maxLength={1_000}
                        className="rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                      />
                      <ActionButton
                        label="Duyệt lại"
                        disabled={busy}
                        onClick={() => action.mutate({ kind: "review", request })}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {actionError ? (
        <p role="alert" className="mt-3 text-sm text-[var(--color-critical)]">
          {actionError}
        </p>
      ) : null}
    </CollapsiblePanel>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent-fg)] disabled:opacity-60"
    >
      {disabled ? "Đang xử lý…" : label}
    </button>
  );
}

function requestStatusLabel(status: MissionWarehouseRequest["status"]): string {
  if (status === "PENDING") return "Chờ kho tiếp nhận";
  if (status === "ACCEPTED") return "Kho đã tiếp nhận";
  // "Đã xuất" và "đã có người cầm đi" là hai việc khác nhau, và khoảng giữa hai
  // việc ấy là nơi hàng bị thiếu mà không ai ghi lại.
  if (status === "PREPARED") return "Đã soạn — chờ đội cứu hộ lấy";
  return "Đã ký nhận";
}

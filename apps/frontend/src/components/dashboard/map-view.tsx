"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import {
  coordinateParseMessage,
  formatCoordinate,
  isInsideBounds,
  parseCoordinateInput,
} from "@/lib/coordinate-input";
import type { LatLng } from "@/lib/geo";
import { useAuth } from "@/lib/auth-store";
import { listAllWarehouses, type AdminWarehouse } from "@/lib/warehouse-api";
import { CLUSTER_BOUNDS, PROVINCE_BOUNDS } from "./map-tiles";
import { WarehouseAdminPanel } from "./warehouse-admin-panel";

/**
 * ĐÚNG bản đồ của điều phối cứu hộ, không phải một bản dựng lại cho giống.
 *
 * Hai bản đồ từng là hai component riêng, và chúng trôi khỏi nhau theo từng lần
 * sửa: bên điều phối có ảnh vệ tinh, nút toàn màn hình, nhãn tên kho thường trực
 * và chú giải vẽ đúng hình trên bản đồ; bên kho vẫn là nền offline không chữ với
 * chú giải chấm tròn. Cùng một cụm kho mà nhìn ra hai thứ khác nhau thì người trực
 * phải học lại bản đồ mỗi lần đổi tab. Dùng chung một component thì mọi cải tiến
 * của bên này mặc nhiên có ở bên kia.
 *
 * Khác biệt duy nhất: bấm lên bản đồ chỉ có tác dụng khi quản trị xã đang ghim
 * toạ độ cho một kho. Ngoài lúc đó, dấu ghim đỏ chỉ đến từ ô nhập toạ độ bên phải
 * — người xem bản đồ để tra cứu không vô tình dời kho bằng một cú bấm trượt.
 */
const IncidentMap = dynamic(
  () => import("@/components/mission/incident-map").then((m) => m.IncidentMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100dvh-190px)] min-h-[520px] animate-pulse rounded-md border bg-[var(--surface)]" />
    ),
  },
);

/** Trang này không có form nào đứng cạnh, nên bản đồ lấy gần hết chiều cao màn hình. */
const MAP_FRAME_CLASS =
  "relative isolate h-[calc(100dvh-190px)] min-h-[520px] w-full overflow-hidden rounded-md border";

const EXAMPLE_COORDINATE = "13.353243, 109.082512";

interface LookupPin {
  point: LatLng;
  /**
   * Đổi mỗi lần bấm tra, kể cả khi nhập lại đúng toạ độ cũ.
   *
   * Người dùng hay phóng to đi xem chỗ khác rồi muốn quay lại điểm vừa tra. Nếu
   * khung nhìn chỉ nhảy khi toạ độ đổi thì bấm "Ghim toạ độ" lần hai không có tác
   * dụng gì, trông như nút hỏng.
   */
  token: number;
}

/** Bản đồ kho trong xã — xem vị trí các kho và tra một toạ độ lấy từ nhiệm vụ. */
export function MapView({ warehouseId }: { warehouseId: string }) {
  const [input, setInput] = useState("");
  const [pin, setPin] = useState<LookupPin | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ngoài cụm 5 xã thì vẫn ghim, nhưng phải nói trước là không phóng to xem gần
  // được — bản đồ sẽ tự dội về vùng có ảnh và người dùng tưởng mình bấm hụt.
  const [warning, setWarning] = useState<string | null>(null);
  // Kho đang được ghim toạ độ; null = không ai đang ghim, bản đồ trở lại chỉ-đọc.
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [draftPoint, setDraftPoint] = useState<LatLng | null>(null);
  const role = useAuth((state) => state.user?.role);
  const canManage = role === "ADMIN";

  const query = useQuery({ queryKey: ["all-warehouses", warehouseId], queryFn: listAllWarehouses });
  const warehouses = query.data ?? [];
  const pinningWarehouse = warehouses.find((w) => w.id === pinningId) ?? null;
  const unlocated = warehouses.filter((w) => w.lat == null || w.lng == null);

  function submitCoordinate() {
    const parsed = parseCoordinateInput(input);
    if (!parsed.ok) {
      setError(coordinateParseMessage(parsed.reason));
      setWarning(null);
      return;
    }
    if (!isInsideBounds(parsed.point, PROVINCE_BOUNDS)) {
      // Ngoài khung tile là ngoài chỗ Leaflet cho kéo tới: có ghim cũng không ai
      // nhìn thấy dấu ghim đó, nên từ chối thẳng còn hơn ghim vào chỗ khuất.
      setError("Toạ độ nằm ngoài vùng bản đồ đang có (Đắk Lắk và cụm xã Đồng Xuân).");
      setWarning(null);
      return;
    }
    setError(null);
    setWarning(
      isInsideBounds(parsed.point, CLUSTER_BOUNDS)
        ? null
        : "Toạ độ nằm ngoài cụm xã Đồng Xuân — chỉ xem được ở mức nhìn xa, không phóng to tới từng mái nhà.",
    );
    setPin((current) => ({ point: parsed.point, token: (current?.token ?? 0) + 1 }));
  }

  /** Bắt đầu ghim cho một kho: bản đồ bay tới vị trí cũ nếu có, và nhận cú bấm. */
  function startPinning(warehouse: AdminWarehouse) {
    setPinningId(warehouse.id);
    setDraftPoint(
      warehouse.lat != null && warehouse.lng != null
        ? { lat: warehouse.lat, lng: warehouse.lng }
        : null,
    );
    setPin(null);
    setError(null);
    setWarning(null);
  }

  function stopPinning() {
    setPinningId(null);
    setDraftPoint(null);
  }

  function clearPin() {
    setPin(null);
    setInput("");
    setError(null);
    setWarning(null);
  }

  return (
    // Panel chức năng chia theo tỉ lệ chứ không cố định 320px: thu thanh điều hướng
    // là chỗ trống chảy sang đây, chứ không dồn hết cho bản đồ.
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
      {/* Dính dưới header khi cuộn — danh sách kho bên phải dài hơn một màn hình,
          không có cái này thì vừa dò danh sách vừa nhìn bản đồ phải cuộn liên tục. */}
      <div className="xl:sticky xl:top-20 xl:self-start">
        <IncidentMap
          // Không có phương án nào ở trang này nên không kho nào "đang tiếp tế":
          // tất cả vào lớp kho nền, vẽ xám, hình nhà lớn/nhà thường phân biệt
          // kho tổng với kho thôn.
          warehouses={[]}
          baseWarehouses={warehouses}
          incidentPoint={draftPoint ?? pin?.point ?? null}
          // Chỉ gắn tay bấm khi đang ghim cho một kho cụ thể.
          onPickIncident={pinningId ? (point) => setDraftPoint(point) : undefined}
          keepIncidentFocus={pin != null || draftPoint != null}
          focusKey={
            draftPoint
              ? `pin-${pinningId}`
              : pin
                ? `${formatCoordinate(pin.point)}#${pin.token}`
                : ""
          }
          pointLabel={pinningWarehouse ? `Vị trí ${pinningWarehouse.name}` : "Vị trí tra cứu"}
          // Ghim kho thì xem trước bằng chính ngôi nhà xanh sẽ hiện sau khi lưu,
          // không mượn ghim SOS đỏ của điểm gặp nạn.
          pointVariant={
            pinningWarehouse
              ? pinningWarehouse.kind === "CENTRAL"
                ? "central"
                : "hamlet"
              : "incident"
          }
          frameClassName={MAP_FRAME_CLASS}
        />
      </div>

      <aside className="space-y-4">
        <section className="rounded-md border bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ColorIcon name="target" size={18} tone="red" />
            <span>Tra toạ độ</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Chép dòng toạ độ ở nhiệm vụ (ví dụ {EXAMPLE_COORDINATE}) rồi dán vào đây để xem đúng chỗ
            đó nằm ở đâu giữa các kho.
          </p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitCoordinate();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              inputMode="decimal"
              aria-label="Toạ độ cần xem"
              aria-invalid={error != null}
              placeholder={EXAMPLE_COORDINATE}
              className="tabular min-w-0 flex-1 rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-fg)] transition active:translate-y-px"
            >
              Ghim
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-xs text-[var(--color-critical)]">
              {error}
            </p>
          )}
          {warning && <p className="mt-2 text-xs text-[var(--color-attention)]">{warning}</p>}
          {pin && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-md border bg-[var(--surface-2)] px-3 py-2">
              <span className="min-w-0">
                <span className="block text-xs text-[var(--text-muted)]">Đang ghim</span>
                <span className="tabular block truncate text-sm font-semibold">
                  {formatCoordinate(pin.point)}
                </span>
              </span>
              <button
                type="button"
                onClick={clearPin}
                className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition hover:bg-[var(--surface)]"
              >
                Xoá ghim
              </button>
            </div>
          )}
        </section>

        {canManage ? (
          <WarehouseAdminPanel
            draftPoint={draftPoint}
            onStartPinning={startPinning}
            onStopPinning={stopPinning}
            pinningId={pinningId}
            warehouses={warehouses}
          />
        ) : null}

        {/* Danh sách chỉ-đọc dành cho người không có quyền sửa. Với quản trị xã thì
            bảng quản lý bên trên đã liệt kê đúng những kho này kèm nút thao tác —
            hiện thêm một lần nữa chỉ làm cột phải dài gấp đôi. */}
        {canManage ? null : (
        <section className="rounded-md border bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ColorIcon name="location" size={18} tone="blue" />
            <span>Kho trong xã ({warehouses.length})</span>
          </div>
          <ul className="mt-3 space-y-2">
            {warehouses.map((w) => (
              <li key={w.id} className="rounded-md border bg-[var(--surface-2)] px-3 py-2">
                <p className="truncate text-sm font-medium">{w.name}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {w.location ?? "Chưa có tên địa điểm"}
                </p>
                <p className="tabular text-xs text-[var(--text-muted)]">
                  {w.lat != null && w.lng != null
                    ? formatCoordinate({ lat: w.lat, lng: w.lng })
                    : w.kind === "HAMLET"
                      ? "Chưa xác minh vị trí Nhà văn hóa thôn"
                      : "Chưa ghim"}
                </p>
              </li>
            ))}
          </ul>
        </section>
        )}

        {unlocated.length > 0 && (
          <section className="rounded-md border bg-[var(--surface)] p-4">
            <h4 className="text-sm font-semibold text-[var(--color-attention)]">
              Kho chờ xác minh vị trí ({unlocated.length})
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
              {unlocated.map((w) => (
                <li key={w.id}>
                  • {w.name}
                  {w.kind === "HAMLET" ? " — Nhà văn hóa thôn" : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

/**
 * Lộ trình lấy vật tư của lực lượng hiện trường: ghép TUYẾN (kho → điểm nạn) với
 * TRẠNG THÁI SOẠN HÀNG của từng dòng vật tư, thành danh sách "đi kho nào, xa bao
 * nhiêu, lấy những gì, kho đã xuất chưa".
 *
 * Hai nguồn phải ghép lại vì mỗi nguồn chỉ có một nửa câu trả lời:
 *
 * - `warehouse-routes` biết kho ở đâu, cách điểm nạn bao xa, đi mất bao lâu —
 *   nhưng chỉ có số lượng ĐƯỢC PHÂN BỔ lúc lập phương án, không biết kho đã soạn
 *   xong chưa.
 * - `mission.warehouseRequests` biết từng dòng đang PENDING/ACCEPTED/PREPARED/
 *   PICKED_UP — nhưng không có toạ độ, không có quãng đường.
 *
 * Người đi lấy hàng cần cả hai trong CÙNG một thẻ: đi kho gần trước, và biết kho
 * nào đã soạn xong để khỏi tới nơi rồi ngồi chờ.
 *
 * Không có mạng nên chỉ còn một nguồn thì vẫn dựng được danh sách — thiếu thông
 * tin còn hơn màn hình trắng khi người ta đang đứng ngoài hiện trường.
 */

export type PickupItemStatus = "PENDING" | "ACCEPTED" | "PREPARED" | "PICKED_UP";

export interface PickupRouteInput {
  id: string;
  name: string;
  kind: "CENTRAL" | "HAMLET";
  lat: number;
  lng: number;
  distanceKm: number | null;
  etaMinutes: number | null;
  routeStatus: string;
  contributions: { sku: string; itemName: string; quantity: number; unit: string }[];
}

export interface PickupRequestInput {
  warehouseId: string;
  sku: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  preparedQuantity: number;
  pickedUpQuantity: number | null;
  status: PickupItemStatus;
  warehouse?: { id: string; name: string };
}

export interface PickupItem {
  sku: string;
  itemName: string;
  unit: string;
  /** Số phải lấy: số kho đã soạn nếu đã soạn, còn lại là số theo phương án. */
  quantity: number;
  status: PickupItemStatus | null;
  pickedUpQuantity: number | null;
}

export interface PickupStop {
  warehouseId: string;
  name: string;
  kind: "CENTRAL" | "HAMLET" | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  routeStatus: string | null;
  items: PickupItem[];
  /** Số dòng kho đã soạn xong (kể cả đã có người ký nhận) trên tổng số dòng. */
  readyCount: number;
  pickedUpCount: number;
  totalCount: number;
}

const STATUS_LABEL: Record<PickupItemStatus, string> = {
  PENDING: "Kho chưa tiếp nhận",
  ACCEPTED: "Kho đang chuẩn bị",
  PREPARED: "Đã soạn xong · tới lấy được",
  PICKED_UP: "Đã xuất kho",
};

export function pickupItemStatusLabel(status: PickupItemStatus | null): string {
  return status ? STATUS_LABEL[status] : "Theo phương án";
}

/** Trạng thái gộp của cả một kho — thứ người đi lấy hàng liếc một cái là biết. */
export function pickupStopStateLabel(stop: PickupStop): {
  label: string;
  tone: "done" | "ready" | "waiting";
} {
  if (stop.totalCount > 0 && stop.pickedUpCount === stop.totalCount) {
    return { label: "Đã xuất kho đủ", tone: "done" };
  }
  if (stop.readyCount === 0) return { label: "Kho đang chuẩn bị", tone: "waiting" };
  if (stop.readyCount === stop.totalCount)
    return { label: "Soạn xong · tới lấy được", tone: "ready" };
  return { label: `Soạn xong ${stop.readyCount}/${stop.totalCount}`, tone: "waiting" };
}

/**
 * Ghép tuyến + yêu cầu vật tư thành các điểm lấy hàng, KHO GẦN ĐIỂM NẠN LÊN TRƯỚC.
 *
 * Sắp theo quãng đường chứ không theo tên: người đi lấy hàng đọc từ trên xuống là
 * đúng thứ tự nên đi. Kho chưa tính được tuyến (mất OSRM, chưa ghim toạ độ) xuống
 * cuối — không biết xa gần thì không được chen lên trước kho đã biết là gần.
 */
export function buildPickupPlan(
  routes: PickupRouteInput[],
  requests: PickupRequestInput[],
): PickupStop[] {
  const stops = new Map<string, PickupStop>();

  for (const route of routes) {
    stops.set(route.id, {
      warehouseId: route.id,
      name: route.name,
      kind: route.kind,
      distanceKm: route.distanceKm,
      etaMinutes: route.etaMinutes,
      routeStatus: route.routeStatus,
      items: route.contributions.map((contribution) => ({
        sku: contribution.sku,
        itemName: contribution.itemName,
        unit: contribution.unit,
        quantity: contribution.quantity,
        status: null,
        pickedUpQuantity: null,
      })),
      readyCount: 0,
      pickedUpCount: 0,
      totalCount: route.contributions.length,
    });
  }

  for (const request of requests) {
    let stop = stops.get(request.warehouseId);
    if (!stop) {
      // Kho có phần vật tư nhưng chưa tính được tuyến: vẫn phải hiện, vì hàng
      // đang nằm ở đó. Bỏ đi là người đi lấy thiếu mất một điểm dừng.
      stop = {
        warehouseId: request.warehouseId,
        name: request.warehouse?.name ?? "Kho chưa rõ tên",
        kind: null,
        distanceKm: null,
        etaMinutes: null,
        routeStatus: null,
        items: [],
        readyCount: 0,
        pickedUpCount: 0,
        totalCount: 0,
      };
      stops.set(request.warehouseId, stop);
    }

    // Số kho ĐÃ SOẠN mới là số thực sự mang đi được; chỉ khi chưa soạn mới lấy
    // số theo phương án. Hiện số phương án cho dòng đã soạn thiếu là để người ta
    // tới nơi mới biết hụt.
    const quantity =
      request.status === "PICKED_UP"
        ? (request.pickedUpQuantity ?? request.preparedQuantity)
        : request.status === "PREPARED"
          ? request.preparedQuantity
          : request.requestedQuantity;

    const existing = stop.items.find((item) => item.sku === request.sku);
    if (existing) {
      existing.quantity = quantity;
      existing.status = request.status;
      existing.pickedUpQuantity = request.pickedUpQuantity;
      existing.unit = request.unit || existing.unit;
      existing.itemName = request.itemName || existing.itemName;
    } else {
      stop.items.push({
        sku: request.sku,
        itemName: request.itemName,
        unit: request.unit,
        quantity,
        status: request.status,
        pickedUpQuantity: request.pickedUpQuantity,
      });
    }
  }

  for (const stop of stops.values()) {
    stop.totalCount = stop.items.length;
    stop.readyCount = stop.items.filter(
      (item) => item.status === "PREPARED" || item.status === "PICKED_UP",
    ).length;
    stop.pickedUpCount = stop.items.filter((item) => item.status === "PICKED_UP").length;
    stop.items.sort((left, right) => left.itemName.localeCompare(right.itemName, "vi"));
  }

  return [...stops.values()]
    .filter((stop) => stop.items.length > 0)
    .sort((left, right) => {
      const leftKm = left.distanceKm;
      const rightKm = right.distanceKm;
      if (leftKm == null && rightKm == null) return left.name.localeCompare(right.name, "vi");
      if (leftKm == null) return 1;
      if (rightKm == null) return -1;
      if (leftKm !== rightKm) return leftKm - rightKm;
      return left.name.localeCompare(right.name, "vi");
    });
}

/** "0.8 km · ~6 phút" — hoặc lý do vì sao chưa có con số nào. */
export function formatTravel(distanceKm: number | null, etaMinutes: number | null): string {
  if (distanceKm == null || etaMinutes == null) return "Chưa tính được quãng đường";
  return `${distanceKm.toFixed(1)} km · ~${etaMinutes} phút`;
}

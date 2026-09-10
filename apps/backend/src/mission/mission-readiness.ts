import { Allocation, overallFulfillment } from "./mission.compute";

export type MissionReadinessStatus = "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";

export interface MissionItemReadiness {
  sku: string;
  itemName: string;
  /** Đơn vị kho đếm (chai, chiếc, bộ…) — thiếu nó thì "760/760" không rõ là gì. */
  unit: string;
  required: number;
  allocated: number;
  shortage: number;
  fulfillment: number;
  status: MissionReadinessStatus;
}

export interface MissionReadinessBlocker {
  sku: string;
  itemName: string;
  reasons: string[];
}

export interface MissionReadinessAssessment {
  status: MissionReadinessStatus;
  fulfillment: number;
  items: MissionItemReadiness[];
  blockers: MissionReadinessBlocker[];
  recommendedActions: string[];
}

/** Đánh giá khả năng đáp ứng theo nhiệm vụ; loại yếu nhất quyết định kết quả. */
export function assessMissionReadiness(
  allocations: Allocation[],
  unavailableReasonsBySku: Map<string, string[]> = new Map(),
): MissionReadinessAssessment {
  const items = allocations.map((allocation): MissionItemReadiness => {
    const fulfillment =
      allocation.required > 0
        ? Math.round((allocation.allocated / allocation.required) * 100)
        : 100;
    const status: MissionReadinessStatus =
      fulfillment === 100
        ? "READY"
        : allocation.allocated === 0
          ? "NOT_DISPATCHABLE"
          : "NEEDS_ACTION";
    return {
      sku: allocation.sku,
      itemName: allocation.itemName,
      unit: allocation.unit,
      required: allocation.required,
      allocated: allocation.allocated,
      shortage: allocation.shortage,
      fulfillment,
      status,
    };
  });

  /**
   * Nêu lý do cho MỌI loại còn thiếu, không riêng loại không lấy được cái nào.
   *
   * Trước đây chỉ loại `NOT_DISPATCHABLE` (lấy được 0) mới được kèm lý do. Lấy được
   * một phần thì toàn bộ phần giải thích bị vứt đi, và màn hình chỉ còn "thiếu 87"
   * trơ trọi: người trực nhìn danh sách kho thấy mười mấy kho đang có áo phao, chỉ
   * một kho được lấy, và không có gì nói vì sao — họ kết luận hệ thống tính sai.
   *
   * Lý do thì hệ thống ĐÃ tính sẵn và đúng thứ họ cần biết, ví dụ "Kho cứu trợ
   * trung tâm Đồng Xuân: còn 120 nhưng đã hứa 314 cho nhiệm vụ khác chưa xuất".
   * Thiếu vì kho trống và thiếu vì hàng đã có người đặt gạch là hai tình huống dẫn
   * tới hai hành động khác hẳn nhau — một bên là đi mượn xã khác, một bên là xem
   * lại mấy nhiệm vụ đang giữ chỗ mà không chạy tiếp.
   *
   * Loại KHÔNG LẤY ĐƯỢC CÁI NÀO xếp trước: `assertMissionDispatchable` đọc
   * `blockers[0]` để dựng câu báo lỗi, nên phần tử đầu phải là thứ thật sự chặn.
   */
  const shortItems = items.filter((item) => item.shortage > 0);
  const blockers = [
    ...shortItems.filter((item) => item.status === "NOT_DISPATCHABLE"),
    ...shortItems.filter((item) => item.status !== "NOT_DISPATCHABLE"),
  ].map((item) => ({
    sku: item.sku,
    itemName: item.itemName,
    reasons: unavailableReasonsBySku.get(item.sku) ?? [
      item.allocated === 0
        ? "Không có lô vật tư đủ điều kiện để cấp phát."
        : `Cả cụm kho chỉ còn ${item.allocated} ${item.unit} đủ điều kiện; phần còn lại phải lấy từ nguồn ngoài xã.`,
    ],
  }));

  const hasShortage = items.some((item) => item.status === "NEEDS_ACTION");
  // Đọc thẳng từ `items`, KHÔNG đếm `blockers` nữa: từ nay `blockers` còn chứa cả
  // loại thiếu một phần, mà thiếu một phần vẫn điều phối được. Đếm nó là khoá luôn
  // những nhiệm vụ trước giờ vẫn phát hành bình thường.
  const notDispatchable = items.some((item) => item.status === "NOT_DISPATCHABLE");
  const status: MissionReadinessStatus = notDispatchable
    ? "NOT_DISPATCHABLE"
    : hasShortage
      ? "NEEDS_ACTION"
      : "READY";

  return {
    status,
    fulfillment: overallFulfillment(allocations),
    items,
    blockers,
    recommendedActions: items
      .filter((item) => item.shortage > 0)
      .map((item) => `Bổ sung ${item.shortage} ${item.itemName} từ kho hoặc nguồn khác.`),
  };
}

/**
 * Tính lại % đáp ứng của một ẢNH CHỤP đã lưu trong cơ sở dữ liệu.
 *
 * `readinessAssessment` được chốt lại lúc lập phương án và không tính lại khi
 * đọc — cố ý, vì tính lại phải quét tồn kho cả cụm kho và sẽ cho ra con số khác
 * với phiếu mà các kho đang cầm. Nhưng khi CÔNG THỨC đổi (min → trung bình theo
 * loại), mọi bản ghi cũ vẫn mang con số tính bằng công thức cũ, và một nhiệm vụ
 * đang mở trên màn hình sẽ ghi 0% trong khi bảng bên dưới nó ghi mười ba dòng
 * "Đủ" — đúng cái mâu thuẫn mà việc đổi công thức sinh ra để dẹp.
 *
 * Chỗ này KHÔNG phân bổ lại gì hết: nó chỉ cộng chia trên `items` đã lưu, tức
 * vẫn đúng những con số mà các kho đang làm theo. Nhờ vậy không cần chạy migration
 * và cũng không có nguy cơ số trên màn hình lệch khỏi phiếu xuất.
 *
 * Trả `null` khi ảnh chụp không đọc được (bản ghi quá cũ, thiếu `items`) — bên
 * gọi giữ nguyên con số đã lưu, thà cũ còn hơn bịa.
 */
export function fulfillmentFromSnapshot(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const items = (snapshot as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const allocations: Allocation[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return null;
    const { required, allocated } = item as { required?: unknown; allocated?: unknown };
    if (typeof required !== "number" || typeof allocated !== "number") return null;
    allocations.push({
      sku: "",
      itemName: "",
      unit: "",
      required,
      allocated,
      shortage: Math.max(0, required - allocated),
      batches: [],
    });
  }
  if (allocations.length === 0) return null;
  return overallFulfillment(allocations);
}

/**
 * Gắn lại % đáp ứng tính theo công thức hiện hành vào một nhiệm vụ đọc từ DB.
 *
 * Sửa cả hai chỗ cùng lúc — cột `fulfillment` và `fulfillment` trong ảnh chụp —
 * vì giao diện đọc cả hai: huy hiệu phần trăm lấy từ ảnh chụp, còn danh sách
 * nhiệm vụ và bản kế hoạch cứu hộ lấy từ cột. Sửa một chỗ là dựng lên đúng kiểu
 * mâu thuẫn "hai con số khác nhau cho cùng một nhiệm vụ".
 */
export function withCurrentFulfillment<
  T extends { fulfillment: number; readinessAssessment: R },
  R,
>(mission: T): T {
  const recomputed = fulfillmentFromSnapshot(mission.readinessAssessment);
  if (recomputed === null || recomputed === mission.fulfillment) return mission;
  return {
    ...mission,
    fulfillment: recomputed,
    readinessAssessment: {
      ...(mission.readinessAssessment as object),
      fulfillment: recomputed,
    } as R,
  };
}

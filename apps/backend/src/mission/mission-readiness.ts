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

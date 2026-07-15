import { ReadinessComponentKey } from "@safestock/shared-types";
import { ComponentScore } from "./readiness.types";

export interface Recommendation {
  component: ReadinessComponentKey;
  message: string;
}

/** Ngưỡng điểm thành phần dưới mức này thì sinh đề xuất khắc phục. */
const RECOMMEND_BELOW = 80;

/** Gợi ý hành động theo từng thành phần bị trừ điểm. */
const ACTION_BY_COMPONENT: Record<ReadinessComponentKey, string> = {
  quantityAvailability: "Kiểm kê thực tế để xác nhận số lượng và bổ sung nếu thiếu",
  itemCondition: "Kiểm tra, bảo trì hoặc thay thế vật tư hư hỏng",
  expiry: "Ưu tiên sử dụng hoặc thay mới vật tư sắp hết hạn",
  accessibility: "Dọn lối đi và mở khóa khu vực để lấy vật tư nhanh",
  environment: "Điều chỉnh nhiệt độ/độ ẩm về ngưỡng an toàn",
  dataReliability: "Kiểm kê lại và kiểm tra cảm biến để cập nhật dữ liệu",
};

/**
 * Sinh đề xuất cải thiện từ breakdown điểm — hàm THUẦN.
 *
 * Với mỗi thành phần điểm thấp (< RECOMMEND_BELOW), tạo 1 đề xuất kèm lý do cụ
 * thể (từ reasons của thành phần) + hành động khắc phục. Sắp theo điểm tăng dần
 * (thành phần yếu nhất đề xuất trước).
 */
export function buildRecommendations(
  components: ComponentScore[],
): Recommendation[] {
  return components
    .filter((component) => component.score < RECOMMEND_BELOW)
    .sort((a, b) => a.score - b.score)
    .map((component) => {
      const cause = component.reasons[0];
      const action = ACTION_BY_COMPONENT[component.key];
      return {
        component: component.key,
        message: cause ? `${cause}. ${action}` : action,
      };
    });
}

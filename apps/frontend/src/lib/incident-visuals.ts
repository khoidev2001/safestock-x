import { IncidentType } from "@safestock/shared-types";
import type { ColorIconName } from "@/components/shared/color-icon";

/**
 * Biểu tượng riêng cho từng loại thiên tai.
 *
 * Trước đây mọi thẻ thông báo dùng chung một cái chuông, nên nhìn thoáng qua thì
 * báo cáo ngập và báo cáo cháy giống hệt nhau — người trực phải đọc hết chữ mới
 * biết đang có việc gì. Một hình vẽ đọc nhanh hơn một dòng chữ, và lúc đang gấp
 * thì chênh lệch đó là thật.
 *
 * Loại không rõ thì về dấu cảnh báo chung, KHÔNG đoán bừa một hình cụ thể: một
 * ngọn lửa vẽ nhầm cho vụ ngập còn tệ hơn là không vẽ gì.
 */
const BIEU_TUONG: Readonly<Record<IncidentType, ColorIconName>> = {
  [IncidentType.FLOOD]: "flood",
  [IncidentType.STORM]: "storm",
  [IncidentType.LANDSLIDE]: "landslide",
  [IncidentType.FIRE]: "fire",
  [IncidentType.ISOLATION]: "isolation",
  [IncidentType.OTHER]: "warning",
};

export function incidentIconName(type?: string | null): ColorIconName {
  if (!type) return "warning";
  return BIEU_TUONG[type as IncidentType] ?? "warning";
}

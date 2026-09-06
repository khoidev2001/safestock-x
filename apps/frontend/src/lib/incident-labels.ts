/**
 * Nhãn tiếng Việt của sự cố kho — một nguồn duy nhất cho mọi màn hình.
 *
 * Ba bảng này trước nằm rải trong `incident-view.tsx` và `simulator-panel.tsx`.
 * Khối sự cố trên trang Tổng quan là chỗ thứ ba cần đúng bộ nhãn ấy, và mã như
 * `SUSPECTED_LOSS` hay `GATEWAY_OFFLINE` lọt ra màn hình là chuyện đã xảy ra rồi
 * — nên gom về đây thay vì chép thêm một bản nữa.
 */

export const INCIDENT_SEVERITY: Record<string, { label: string; color: string }> = {
  LOW: { label: "Thấp", color: "var(--color-ready)" },
  MEDIUM: { label: "Trung bình", color: "var(--color-attention)" },
  HIGH: { label: "Cao", color: "var(--color-degraded)" },
  CRITICAL: { label: "Nghiêm trọng", color: "var(--color-critical)" },
};

/** Mức không nhận ra được thì coi như trung bình — không bỏ trắng ô nghiêm trọng. */
export function incidentSeverity(severity: string) {
  return INCIDENT_SEVERITY[severity] ?? INCIDENT_SEVERITY.MEDIUM;
}

export const INCIDENT_KIND_LABEL: Record<string, string> = {
  SUSPECTED_LOSS: "Nghi thất thoát",
  SENSOR_FAULT: "Lỗi cảm biến",
  BAD_STORAGE: "Bảo quản kém",
  FIRE_RISK: "Nghi cháy",
  POWER_OUTAGE: "Mất điện",
  MISPLACED_ITEM: "Vật tư sai vị trí",
  STAT_ANOMALY: "Bất thường cảm biến",
  PREDICTIVE_WARNING: "Cảnh báo sớm",
};

/** Sự kiện cảm biến — vừa là dòng nhật ký ở tab Cảm biến, vừa là bằng chứng của sự cố. */
export const SENSOR_EVENT_LABEL: Record<string, string> = {
  TEMP_READING: "Ghi nhận nhiệt độ",
  TEMPERATURE_HIGH: "Nhiệt độ vượt ngưỡng",
  HUMID_READING: "Ghi nhận độ ẩm",
  HUMIDITY_HIGH: "Độ ẩm vượt ngưỡng",
  WEIGHT_CHANGED: "Khối lượng thay đổi",
  SIGNAL_UNSTABLE: "Tín hiệu không ổn định",
  DOOR_OPEN: "Cửa được mở",
  DOOR_CLOSE: "Cửa đã đóng",
  RFID_DETECTED: "Phát hiện vật tư qua cổng RFID",
  GATEWAY_OFFLINE: "Bộ kết nối mất liên lạc",
  GATEWAY_ONLINE: "Bộ kết nối hoạt động trở lại",
  VISION_DETECTION: "Camera phát hiện thay đổi",
  SMOKE_READING: "Ghi nhận nồng độ khói",
  POWER_OFF: "Mất nguồn điện",
  POWER_ON: "Nguồn điện hoạt động trở lại",
};

/** Hành động đã làm trên sự cố — lịch sử xử lý đọc trong bảng chi tiết. */
export const INCIDENT_ACTION_LABEL: Record<string, string> = {
  ACKNOWLEDGE: "Đã tiếp nhận",
  ASSIGN: "Đã phân công",
  RESOLVE: "Đã xử lý xong",
};

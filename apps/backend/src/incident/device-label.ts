/**
 * Đổi mã kỹ thuật của thiết bị thành tên đọc được, để đưa vào tiêu đề sự cố.
 *
 * VÌ SAO CẦN: bảng `VirtualDevice` chỉ có cột `code` (`smoke_main`, `scale_B2`),
 * không có cột tên. Ghép thẳng mã vào tiêu đề thì người nhận thư đọc được câu
 * "Dự đoán smoke_main sẽ vượt ngưỡng" — vừa không hiểu, vừa làm cả bản tin trông
 * như log kỹ thuật lọt ra ngoài. Người trực kho không biết `smoke_main` là gì,
 * họ biết "cảm biến khói khu chính".
 *
 * Mã KHÔNG biến mất: nó vẫn nằm trong `evidence[].deviceCode` của mọi sự cố, nên
 * người kỹ thuật vẫn tra được đúng thiết bị.
 */

/** Tên loại thiết bị, viết thường để ghép được vào giữa câu. */
const DEVICE_TYPE_LABEL: Record<string, string> = {
  TEMPERATURE: "cảm biến nhiệt độ",
  HUMIDITY: "cảm biến độ ẩm",
  LOADCELL: "cân tải",
  SMOKE: "cảm biến khói",
  DOOR: "cảm biến cửa kho",
  RFID_GATEWAY: "cổng RFID",
  CAMERA_AI: "camera AI",
  POWER: "đồng hồ nguồn điện",
  GATEWAY: "bộ kết nối",
};

/**
 * Đuôi mã nói chỗ đặt: `main` là khu chính, một chữ cái là khu, chữ kèm số là kệ.
 *
 * Đuôi lạ thì trả về null chứ không đoán bừa — gọi sai chỗ còn tệ hơn không gọi
 * tên chỗ nào, vì người trực sẽ chạy nhầm khu.
 */
function describePlace(suffix: string): string | null {
  const s = suffix.trim();
  if (!s) return null;
  if (s.toLowerCase() === "main") return "khu chính";
  if (/^[A-Za-z]$/.test(s)) return `khu ${s.toUpperCase()}`;
  if (/^[A-Za-z]\d+$/.test(s)) return `kệ ${s.toUpperCase()}`;
  if (/^\d+$/.test(s)) return `số ${s}`;
  return null;
}

/**
 * Tên đọc được của một thiết bị, ví dụ `smoke_main` -> "cảm biến khói khu chính".
 *
 * Loại thiết bị chưa khai trong bảng trên thì trả nguyên mã: thà đưa mã kỹ thuật
 * còn hơn đưa một cái tên bịa ra.
 */
export function describeDevice(deviceType: string, deviceCode: string): string {
  const kind = DEVICE_TYPE_LABEL[deviceType];
  if (!kind) return deviceCode;

  const place = describePlace(deviceCode.split("_").slice(1).join("_"));
  if (place) return `${kind} ${place}`;
  // Biết loại nhưng không đọc được chỗ đặt: vẫn phải phân biệt được thiết bị nào,
  // nên kèm mã trong ngoặc thay vì bỏ đi.
  return `${kind} (${deviceCode})`;
}

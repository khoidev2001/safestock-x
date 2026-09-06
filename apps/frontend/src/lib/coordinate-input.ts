import type { LatLng } from "./geo";

/**
 * Đọc cặp toạ độ người dùng gõ/dán vào ô tra cứu của bản đồ kho.
 *
 * Nguồn thật của chuỗi này là dòng "Tọa độ điểm gặp nạn" hiện dưới bản đồ điều
 * phối — người trực đọc qua điện thoại hoặc chép sang, nên phải chịu được cả cách
 * đọc rời rạc ("13.353243 109.082512") lẫn chuỗi chép nguyên có ngoặc, dấu chấm
 * phẩy hay ký hiệu độ. Không đoán thêm gì ngoài mấy dạng đó: gõ nhầm một con số
 * mà vẫn ghim được thì người xem tưởng mình đang nhìn đúng chỗ.
 */
export type CoordinateParseFailure = "empty" | "format" | "range";

export type CoordinateParseResult =
  { ok: true; point: LatLng } | { ok: false; reason: CoordinateParseFailure };

/** Ngoặc, ký hiệu độ và khoảng trắng lạ chỉ là thứ đi kèm khi chép — bỏ đi trước khi tách số. */
const DECORATION = /[()[\]°'"]/gu;
const SEPARATOR = /[\s,;]+/u;

export function parseCoordinateInput(raw: string): CoordinateParseResult {
  const cleaned = raw.replace(DECORATION, " ").trim();
  if (cleaned === "") return { ok: false, reason: "empty" };

  const parts = cleaned.split(SEPARATOR).filter((part) => part !== "");
  if (parts.length !== 2) return { ok: false, reason: "format" };

  // Number() thay vì parseFloat(): parseFloat("13.3abc") trả 13.3 và nuốt luôn
  // phần rác phía sau, tức là chấp nhận một chuỗi hỏng như thể nó hợp lệ.
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "format" };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, reason: "range" };

  return { ok: true, point: { lat, lng } };
}

export function coordinateParseMessage(reason: CoordinateParseFailure): string {
  switch (reason) {
    case "empty":
      return "Hãy nhập toạ độ, ví dụ 13.353243, 109.082512";
    case "range":
      return "Vĩ độ phải trong -90…90, kinh độ -180…180 — xem có nhập ngược thứ tự không";
    default:
      return "Cần đúng hai số: vĩ độ rồi kinh độ, ví dụ 13.353243, 109.082512";
  }
}

/** Cùng cách viết với dòng toạ độ dưới bản đồ điều phối, để chép qua lại là khớp. */
export function formatCoordinate(point: LatLng): string {
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}

export type LatLngBounds = [[number, number], [number, number]];

/** Điểm có nằm trong khung [[latNam, lngTay], [latBac, lngDong]] của gói tile không. */
export function isInsideBounds(point: LatLng, bounds: LatLngBounds): boolean {
  const [[south, west], [north, east]] = bounds;
  return point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east;
}

/**
 * Quy ước cỡ chai nước cứu trợ — một nguồn duy nhất cho cả backend lẫn web.
 *
 * Backend dùng nó để tính định mức cần bao nhiêu CHAI từ chuẩn Sphere (tính theo
 * LÍT), web dùng nó để hiện lại số lít tương ứng cho người đọc. Trước đây mỗi bên
 * giữ một hằng số riêng; lệch nhau là hai màn hình nói hai con số cho cùng một
 * đống hàng, mà không ai biết bên nào đúng.
 */

/** SKU nước uống đóng chai trong danh mục vật tư. */
export const WATER_BOTTLE_SKU = "WATER-01";

/**
 * Dung tích một chai, tính bằng lít.
 *
 * 1,5 lít là chai nước cứu trợ phát cho hộ dân — đúng thứ danh mục vật tư đang
 * mô tả: `unitWeightKg` của WATER-01 trong seed là 1,5 kg, tức một chai 1,5 lít
 * chứ không phải chai nhỏ cầm tay.
 *
 * Trước đây để 0,35 lít trong khi cân nặng vẫn ghi 1,5 kg. Hai con số tả hai món
 * hàng khác nhau, và cái sai chỉ lộ ra ở bảng nhu cầu: 190 người trong hai ngày
 * cần tới 16 286 chai — một con số không ai bốc nổi khỏi kệ, mà cả xã cũng chỉ
 * trữ 6 210 chai.
 */
export const LITERS_PER_WATER_BOTTLE = 1.5;

/**
 * Đổi số chai sang lít, làm tròn 2 chữ số.
 *
 * Không làm tròn thì sai số nhị phân rò ra màn hình: 12 * 0,35 cho ra
 * 4,199999999999999.
 */
export function litersFromBottles(bottles: number, litersPerBottle = LITERS_PER_WATER_BOTTLE): number {
  return Math.round(Math.max(0, bottles) * litersPerBottle * 100) / 100;
}

/**
 * Câu hiển thị cho một dòng vật tư: nước thì kèm số lít, thứ khác giữ nguyên.
 *
 * Người điều phối cần CHAI để biết bốc bao nhiêu khỏi kệ, nhưng cần LÍT để đối
 * chiếu với định mức lít/người/ngày. Bắt họ tự nhân giữa lúc đang gấp là chỗ dễ
 * sai nhất, nên hiện sẵn cả hai — và nói rõ đâu là chai, đâu là lít.
 */
export function describeItemQuantity(sku: string, quantity: number, unit: string): string {
  const formattedQuantity = quantity.toLocaleString("vi");
  if (sku !== WATER_BOTTLE_SKU) return `${formattedQuantity} ${unit}`;
  return `${formattedQuantity} ${unit} (${litersFromBottles(quantity).toLocaleString("vi")} lít)`;
}

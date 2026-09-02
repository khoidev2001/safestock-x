import { LIT_MOI_CHAI_NUOC } from "@safestock/shared-types";

/**
 * Số chai trong một lốc. Quy ước CHUNG cho mọi loại nước, không riêng từng loại.
 *
 * Đóng lốc là chuyện của việc bốc xếp, không phải của dung tích: một lốc là một
 * lần hai tay bê được, và ở kho xã thì luôn là mười hai chai bất kể chai to nhỏ.
 */
export const CHAI_MOI_LOC = 12;

/**
 * Dung tích mặc định của một chai nước, tính bằng lít.
 *
 * Lấy thẳng `LIT_MOI_CHAI_NUOC` của gói dùng chung — 1,5 lít, đúng cỡ chai nước
 * cứu trợ phát cho hộ dân. Một bên tính định mức cần bao nhiêu chai, một bên đổi
 * số chai đã có ra lít; mỗi bên giữ một hằng số riêng là hai màn hình nói hai con
 * số cho cùng một đống hàng.
 */
export const LIT_MOI_CHAI_MAC_DINH = LIT_MOI_CHAI_NUOC;

export interface QuyDoiChai {
  /** Số chai — đây mới là con số kho đếm và xuất. */
  bottles: number;
  /** Số lốc nguyên. */
  packs: number;
  /** Số chai lẻ ngoài các lốc nguyên. */
  looseBottles: number;
  /** Tổng dung tích, để đối chiếu với định mức tính theo lít. */
  liters: number;
}

/**
 * Đổi số CHAI sang lốc và lít.
 *
 * Kho đếm theo chai vì người ta bốc từng chai khỏi kệ — không ai đong lít ra
 * khỏi kho. Nhưng định mức cứu trợ lại tính theo lít mỗi người mỗi ngày, còn
 * việc điều xe thì tính theo lốc. Ba cách đếm cho cùng một đống hàng, nên phải
 * có một chỗ duy nhất đổi qua lại; mỗi nơi tự nhân chia là mỗi nơi ra một số.
 *
 * CHAI là con số gốc, lít và lốc suy ra từ nó. Làm ngược lại — lưu lít rồi chia
 * ra chai — thì phép chia lẻ sinh ra những nửa chai không tồn tại trên kệ.
 */
export function quyDoiChai(bottles: number, litMoiChai = LIT_MOI_CHAI_MAC_DINH): QuyDoiChai {
  const soChai = Math.max(0, Math.floor(bottles));
  return {
    bottles: soChai,
    packs: Math.floor(soChai / CHAI_MOI_LOC),
    looseBottles: soChai % CHAI_MOI_LOC,
    // Làm tròn 2 chữ số: cỡ chai lẻ sinh sai số nhị phân (12 * 0,35 ra
    // 4,199999999999999). Để nguyên thì con số đó rò ra tận màn hình và mọi phép
    // so sánh bằng đều trượt.
    liters: Math.round(soChai * litMoiChai * 100) / 100,
  };
}

/**
 * Câu mô tả gọn để hiện lên màn hình: "484 chai (40 lốc lẻ 4) · 2 420 lít".
 *
 * Hiện cả ba con số thay vì bắt người đọc tự nhân: người phụ trách xe cần lốc,
 * người tính định mức cần lít, người đứng ở kệ cần chai. Ai cũng đọc được ngay
 * phần mình cần, không ai phải nhẩm.
 */
export function moTaQuyDoi(bottles: number, litMoiChai = LIT_MOI_CHAI_MAC_DINH): string {
  const q = quyDoiChai(bottles, litMoiChai);
  const phanLoc =
    q.packs === 0
      ? null
      : q.looseBottles === 0
        ? `${q.packs} lốc`
        : `${q.packs} lốc lẻ ${q.looseBottles}`;
  const dauSo = `${q.bottles.toLocaleString("vi")} chai`;
  return phanLoc
    ? `${dauSo} (${phanLoc}) · ${q.liters.toLocaleString("vi")} lít`
    : `${dauSo} · ${q.liters.toLocaleString("vi")} lít`;
}

/**
 * Số CHAI cần để đủ lượng lít yêu cầu — luôn làm tròn LÊN.
 *
 * Làm tròn xuống là thiếu nước cho đúng số người đã tính. Thừa nửa chai thì
 * không ai chết; thiếu nửa chai thì có người không được uống.
 */
export function chaiCanCho(liters: number, litMoiChai = LIT_MOI_CHAI_MAC_DINH): number {
  if (litMoiChai <= 0) throw new Error("Dung tích chai phải lớn hơn 0");
  return Math.ceil(Math.max(0, liters) / litMoiChai);
}

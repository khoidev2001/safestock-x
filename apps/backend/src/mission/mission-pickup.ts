export interface PickupInput {
  /** Số kho đã soạn ra và ghi vào sổ. */
  preparedQuantity: number;
  /** Số người đi lấy thật sự cầm đi. */
  receivedQuantity: number;
  note?: string | null;
}

export interface PickupResult {
  receivedQuantity: number;
  shortage: number;
  /** Ghi chú đã chuẩn hoá; luôn có giá trị khi thiếu hàng. */
  note: string | null;
}

export class PickupError extends Error {}

/**
 * Kiểm bước XÁC NHẬN LẤY HÀNG: người đi lấy cầm đi bao nhiêu, thiếu thì vì sao.
 *
 * Vì sao phải có bước này: kho bấm "đã chuẩn bị" là sổ ghi đủ số đã yêu cầu, và
 * từ đó trở đi mọi màn hình đều tin là hàng đã đi đủ. Nhưng chuyện hay xảy ra
 * nhất ở kho lúc mưa bão là soạn được tám trên mười — hết hàng, lô ướt, xe không
 * chở hết. Không có chỗ nào ghi lại thì hai bên chỉ phát hiện ra lúc đến nơi phát
 * cho dân, mà lúc ấy thì không xoay kịp nữa.
 *
 * THIẾU THÌ BẮT BUỘC GHI LÝ DO. Con số thiếu một mình không dùng được: người điều
 * phối cần biết thiếu vì kho hết hàng (phải xin xã khác) hay vì xe không chở hết
 * (chuyến sau lấy nốt) — hai việc khác hẳn nhau. Bắt buộc ở đây không phải là làm
 * khó người dùng, mà vì đúng lúc này họ là người DUY NHẤT biết lý do.
 *
 * Lấy DƯ thì chặn thẳng: kho chỉ soạn ra chừng ấy, cầm đi nhiều hơn nghĩa là số
 * liệu sai ở đâu đó chứ không phải hàng tự sinh ra.
 */
export function validatePickup(input: PickupInput): PickupResult {
  const { preparedQuantity, receivedQuantity } = input;

  if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
    throw new PickupError("Số lượng đã lấy phải là số nguyên không âm");
  }
  if (receivedQuantity > preparedQuantity) {
    throw new PickupError(
      `Không lấy được nhiều hơn số kho đã soạn (${preparedQuantity}). Nhập đúng số thực nhận.`,
    );
  }

  const shortage = preparedQuantity - receivedQuantity;
  const note = (input.note ?? "").trim();
  if (shortage > 0 && note.length === 0) {
    throw new PickupError(
      `Thiếu ${shortage} so với số đã soạn — phải ghi rõ lý do thiếu để bên điều phối biết cách xoay.`,
    );
  }

  return { receivedQuantity, shortage, note: note.length > 0 ? note : null };
}

/** Gộp ghi chú thiếu của nhiều mã vật tư thành một dòng đọc được cho thông báo. */
export function summarizeShortages(
  rows: { itemName: string; unit: string; shortage: number; note: string | null }[],
): string | null {
  const thieu = rows.filter((r) => r.shortage > 0);
  if (thieu.length === 0) return null;
  return thieu
    .map((r) => `${r.itemName} thiếu ${r.shortage} ${r.unit}${r.note ? ` (${r.note})` : ""}`)
    .join("; ");
}

import { AvailableBatch } from "./mission.compute";

/**
 * Vật tư ĐÃ HỨA cho nhiệm vụ khác nhưng CHƯA rời kho.
 *
 * Tồn kho trong `ItemBatch.quantity` chỉ nói "còn bao nhiêu trên kệ", không nói
 * "còn bao nhiêu chưa ai đặt gạch". Hai chuyện đó lệch nhau suốt khoảng từ lúc
 * điều phối phát hành nhiệm vụ tới lúc kho thật sự xuất hàng.
 *
 * Không tính chuyện này thì hai quản trị viên của cùng một xã, duyệt hai nhiệm vụ
 * cách nhau vài giây, đều thấy kho Long Châu "đủ 10 áo phao" và đều phát hành —
 * tới lúc kho xuất mới vỡ ra là chỉ có 10 cái cho 15 suất. Lỗi nổ ở kho, muộn,
 * và người phải xử lý là trưởng thôn chứ không phải người vừa gây ra nó.
 */
export interface Commitment {
  warehouseId: string;
  sku: string;
  quantity: number;
}

/** Khoá tra cứu; gộp ở một chỗ để hai bên ghi và đọc không lệch nhau. */
export function commitmentKey(warehouseId: string, sku: string): string {
  return `${warehouseId}::${sku}`;
}

export function commitmentMap(commitments: Commitment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of commitments) {
    const key = commitmentKey(item.warehouseId, item.sku);
    map.set(key, (map.get(key) ?? 0) + Math.max(item.quantity, 0));
  }
  return map;
}

/**
 * Trừ phần đã hứa ra khỏi danh sách lô khả dụng.
 *
 * Cam kết ghi theo (kho, SKU) còn tồn nằm theo từng LÔ, nên phải rải phần đã hứa
 * lên các lô của đúng kho đó. Rải theo đúng thứ tự mà bộ phân bổ sẽ tiêu thụ (lô
 * hết hạn sớm trước) để con số còn lại khớp với thứ thật sự lấy được — rải ngược
 * thứ tự thì tổng vẫn đúng nhưng phần dư lại nằm ở lô mà bộ phân bổ không đụng tới.
 *
 * Lô bị ăn hết thì biến mất khỏi danh sách, kèm một lý do để giao diện nói được
 * "hết vì đã hứa cho nhiệm vụ khác" thay vì im lặng thiếu hàng.
 */
export function subtractCommitments(
  available: AvailableBatch[],
  commitments: Map<string, number>,
): { available: AvailableBatch[]; consumedReasons: { sku: string; reason: string }[] } {
  if (commitments.size === 0) return { available, consumedReasons: [] };

  const remaining = new Map(commitments);
  const byKey = new Map<string, AvailableBatch[]>();
  for (const batch of available) {
    if (!batch.warehouseId) continue;
    const key = commitmentKey(batch.warehouseId, batch.sku);
    const list = byKey.get(key);
    if (list) list.push(batch);
    else byKey.set(key, [batch]);
  }

  const consumedReasons: { sku: string; reason: string }[] = [];
  const shrunk = new Map<string, number>();

  for (const [key, batches] of byKey) {
    const promised = remaining.get(key) ?? 0;
    let owed = promised;
    if (owed <= 0) continue;
    const physicalStock = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    // Hết hạn sớm dùng trước — cùng quy tắc với bộ phân bổ. Lô không hạn xếp cuối.
    const ordered = [...batches].sort(
      (a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity),
    );
    for (const batch of ordered) {
      if (owed <= 0) break;
      const taken = Math.min(batch.quantity, owed);
      shrunk.set(batch.batchId, batch.quantity - taken);
      owed -= taken;
    }
    if (owed > 0 || batches.some((b) => (shrunk.get(b.batchId) ?? b.quantity) === 0)) {
      const name = batches[0]?.warehouseName ?? "kho nguồn";
      // Kèm CON SỐ. "Đã hứa cho nhiệm vụ khác" không nói được là hết sạch hay chỉ
      // vơi đi — người đọc ra kho thấy hàng còn nguyên rồi tưởng hệ thống tính sai.
      consumedReasons.push({
        sku: batches[0].sku,
        reason: `${name}: còn ${physicalStock} nhưng đã hứa ${promised} cho nhiệm vụ khác chưa xuất`,
      });
    }
  }

  return {
    available: available
      .map((batch) =>
        shrunk.has(batch.batchId)
          ? { ...batch, quantity: shrunk.get(batch.batchId) as number }
          : batch,
      )
      .filter((batch) => batch.quantity > 0),
    consumedReasons,
  };
}

/** Một dòng thiếu hụt phát hiện lúc phát hành: kho này không còn đủ như phương án ghi. */
export interface Shortfall {
  warehouseId: string;
  warehouseName: string;
  sku: string;
  itemName: string;
  unit: string;
  requested: number;
  /** Còn dùng được sau khi trừ phần đã hứa cho các nhiệm vụ khác. */
  stillAvailable: number;
  /** Số thật đang nằm trên kệ, chưa trừ gì. */
  physicalStock: number;
  /** Phần đã hứa cho các nhiệm vụ khác nhưng chưa xuất. */
  promisedToOthers: number;
}

/**
 * Câu báo cho người vừa bấm phát hành.
 *
 * Phải nói CẢ HAI con số: bao nhiêu đang nằm trên kệ, và bao nhiêu trong đó đã
 * hứa cho nhiệm vụ khác. Bản đầu chỉ ghi "chỉ còn 0/100 chai" — người dùng ra kho
 * thấy hàng chất đầy, quay lại kết luận hệ thống tính sai, trong khi hệ thống
 * đúng: hàng có thật nhưng đã có chủ. Thiếu vế thứ hai thì câu báo tự biến thành
 * một lời nói dối.
 */
export function shortfallMessage(shortfalls: Shortfall[]): string {
  const details = shortfalls
    .map(
      (item) =>
        `${item.itemName} ở ${item.warehouseName}: cần ${item.requested} ${item.unit}, ` +
        `kho còn ${item.physicalStock} nhưng đã hứa ${item.promisedToOthers} cho nhiệm vụ khác ` +
        `nên chỉ dùng được ${item.stillAvailable}`,
    )
    .join(". ");
  return (
    `Chưa phát hành được. ${details}. ` +
    `Phương án đã được tính lại theo phần thật sự còn trống (lấy thêm từ kho khác nếu có). ` +
    `Muốn giải phóng phần đã hứa thì phải hoàn tất hoặc huỷ các nhiệm vụ đang giữ chúng.`
  );
}

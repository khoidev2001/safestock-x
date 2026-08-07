export interface BatchForRollup {
  warehouseId: string;
  warehouseName: string;
  warehouseKind: "CENTRAL" | "HAMLET";
  itemSku: string;
  itemName: string;
  unit: string;
  quantity: number;
  /** Phần đang cho mượn — nằm trong sổ nhưng không còn trong tay. */
  onLoan: number;
}

export interface WarehouseShare {
  warehouseId: string;
  warehouseName: string;
  kind: "CENTRAL" | "HAMLET";
  quantity: number;
}

export interface CommuneStockRow {
  itemSku: string;
  itemName: string;
  unit: string;
  /** Tổng toàn xã — tổng đúng bằng tổng các phần bên dưới, không tính riêng. */
  total: number;
  /** Kho tổng giữ bao nhiêu, để so ngay với phần nằm rải ở các thôn. */
  atCentral: number;
  atHamlets: number;
  /** Từng kho một, kho nhiều hàng nhất lên trước. */
  byWarehouse: WarehouseShare[];
}

/**
 * Gom tồn kho của CẢ XÃ về theo mã vật tư, kèm phân rã từng kho đang giữ bao nhiêu.
 *
 * Vì sao cần: người trực ở kho tổng chỉ nhìn được hàng nằm trong chính kho tổng.
 * Hàng đã đẩy xuống các thôn thì biến mất khỏi màn hình, nên lúc cần điều phối họ
 * tưởng xã hết hàng trong khi ba thôn vẫn còn — rồi đi xin chi viện một thứ mình
 * đang có. Bảng này trả lại cái nhìn toàn xã mà không đụng gì tới cách nhập xuất.
 *
 * TRỪ PHẦN ĐANG CHO MƯỢN. Hàng đã rời kho sang xã khác thì đếm vào là đếm một thứ
 * mình không điều được — đúng cái sai mà bảng này sinh ra để chữa.
 *
 * Tổng luôn suy từ các phần, không cộng riêng một đường: nuôi hai con số song song
 * là nuôi thêm một chỗ để lệch, mà lệch thì chỉ lộ ra lúc đối chiếu cuối kỳ.
 */
export function communeStockRollup(batches: BatchForRollup[]): CommuneStockRow[] {
  const theoSku = new Map<string, CommuneStockRow & { _kho: Map<string, WarehouseShare> }>();

  for (const b of batches) {
    const conLai = Math.max(0, b.quantity - b.onLoan);
    if (conLai === 0) continue;

    let dong = theoSku.get(b.itemSku);
    if (!dong) {
      dong = {
        itemSku: b.itemSku,
        itemName: b.itemName,
        unit: b.unit,
        total: 0,
        atCentral: 0,
        atHamlets: 0,
        byWarehouse: [],
        _kho: new Map(),
      };
      theoSku.set(b.itemSku, dong);
    }

    const phan = dong._kho.get(b.warehouseId) ?? {
      warehouseId: b.warehouseId,
      warehouseName: b.warehouseName,
      kind: b.warehouseKind,
      quantity: 0,
    };
    phan.quantity += conLai;
    dong._kho.set(b.warehouseId, phan);

    dong.total += conLai;
    if (b.warehouseKind === "CENTRAL") dong.atCentral += conLai;
    else dong.atHamlets += conLai;
  }

  return [...theoSku.values()]
    .map(({ _kho, ...dong }) => ({
      ...dong,
      // Kho nhiều hàng nhất lên trước: người đang tìm chỗ lấy hàng đọc dòng đầu là
      // biết gọi ai, không phải quét hết danh sách.
      byWarehouse: [...(_kho as Map<string, WarehouseShare>).values()].sort(
        (a, b) => b.quantity - a.quantity || a.warehouseName.localeCompare(b.warehouseName, "vi"),
      ),
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName, "vi"));
}

export interface WarehouseStockItem {
  itemSku: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  kind: "CENTRAL" | "HAMLET";
  /** Tổng số đơn vị hàng kho này đang giữ, gộp mọi mã vật tư. */
  totalUnits: number;
  /** Bao nhiêu mã vật tư khác nhau — số này nói lên độ đa dạng, khác với tổng. */
  itemCount: number;
  items: WarehouseStockItem[];
}

/**
 * Tồn kho toàn xã gom THEO KHO, mỗi kho liệt kê những gì nó đang giữ.
 *
 * Khác `communeStockRollup` ở câu hỏi nó trả lời. Gom theo vật tư trả lời "mặt
 * hàng này cả xã còn bao nhiêu"; gom theo kho trả lời "thôn này đang có những
 * gì" — và đó mới là câu người trực hỏi khi cần điều một chuyến xe tới một thôn,
 * hoặc khi muốn biết thôn nào đang trống.
 *
 * Kho tổng luôn đứng đầu vì nó là nơi điều phối nhìn trước tiên; các thôn xếp
 * theo tên để lần nào mở ra cũng ở đúng chỗ cũ, không nhảy theo số lượng.
 *
 * Kho KHÔNG CÒN GÌ vẫn được giữ lại nếu nó có xuất hiện trong dữ liệu: "thôn này
 * trống" là một thông tin, còn bỏ nó đi thì người đọc tưởng thôn đó không tồn
 * tại. Kho chưa từng nhập hàng lần nào thì không có lô nào nên vốn không nằm
 * trong dữ liệu đầu vào — đó là giới hạn đã biết của cách tính từ lô hàng.
 */
export function communeStockByWarehouse(batches: BatchForRollup[]): WarehouseStock[] {
  const theoKho = new Map<string, WarehouseStock & { _sku: Map<string, WarehouseStockItem> }>();

  for (const b of batches) {
    let kho = theoKho.get(b.warehouseId);
    if (!kho) {
      kho = {
        warehouseId: b.warehouseId,
        warehouseName: b.warehouseName,
        kind: b.warehouseKind,
        totalUnits: 0,
        itemCount: 0,
        items: [],
        _sku: new Map(),
      };
      theoKho.set(b.warehouseId, kho);
    }

    const conLai = Math.max(0, b.quantity - b.onLoan);
    if (conLai === 0) continue;

    const mon = kho._sku.get(b.itemSku) ?? {
      itemSku: b.itemSku,
      itemName: b.itemName,
      unit: b.unit,
      quantity: 0,
    };
    mon.quantity += conLai;
    kho._sku.set(b.itemSku, mon);
    kho.totalUnits += conLai;
  }

  return [...theoKho.values()]
    .map(({ _sku, ...kho }) => {
      const items = [...(_sku as Map<string, WarehouseStockItem>).values()].sort(
        (a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName, "vi"),
      );
      return { ...kho, items, itemCount: items.length };
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "CENTRAL" ? -1 : 1;
      return a.warehouseName.localeCompare(b.warehouseName, "vi");
    });
}

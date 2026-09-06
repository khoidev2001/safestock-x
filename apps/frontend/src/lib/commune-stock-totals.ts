import { litersFromBottles, WATER_BOTTLE_SKU } from "@safestock/shared-types";
import type { WarehouseStock, WarehouseStockItem } from "@/lib/dashboard-api";

/**
 * BA RỔ RỜI NHAU, không rổ nào chứa rổ nào: đồ dùng đếm bằng chiếc/bộ/tấm, lương
 * thực đếm bằng kg, nước đếm bằng lít. Cộng chung thì con số tổng vừa gộp cân gạo
 * vừa gộp chai nước vào cùng một chữ "vật tư" — đọc lên nghe to nhưng không trả
 * lời được câu nào.
 *
 * Mỗi mặt hàng vì thế chỉ được đếm đúng một lần, ở đúng một rổ.
 *
 * Đặt ở đây chứ không nằm trong một component, vì hai màn hình cùng đọc con số
 * này: khối tồn kho ở tab Vật tư và khối tổng quan vật tư ở trang Tổng quan. Mỗi
 * bên tự phân loại lấy thì sớm muộn cũng có ngày hai trang nói hai con số khác
 * nhau cho cùng một đống hàng, mà không ai biết bên nào đúng.
 */

/**
 * Lương thực = hàng đếm theo kg.
 *
 * Trong danh mục hiện tại chỉ nhóm FOOD (gạo, lương khô) dùng kg; DTO không trả
 * về nhóm nên phân loại theo đơn vị, giống cách máy chủ nhận ra hàng đếm theo chai.
 */
export const isFoodItem = (item: WarehouseStockItem) => item.unit === "kg";

/**
 * Nước bắt theo SKU chứ không theo đơn vị: "Can nước 20 lít" là vỏ can rỗng, cộng
 * nó vào thì xã có thêm nước trên màn hình mà không có giọt nào ngoài kho.
 */
export const isWaterItem = (item: WarehouseStockItem) => item.itemSku === WATER_BOTTLE_SKU;

export interface CommuneStockTotals {
  /** Phần còn lại sau khi tách lương thực và nước — đếm theo số món của từng mã. */
  supplyUnits: number;
  /** Số mã vật tư khác nhau trong rổ này, để biết con số trên gom từ bao nhiêu thứ. */
  supplySkuCount: number;
  foodKg: number;
  waterLiters: number;
  warehouseCount: number;
}

/** Cộng tồn của cả xã về ba con số đọc được, từ danh sách kho mà máy chủ trả về. */
export function communeStockTotals(warehouses: WarehouseStock[]): CommuneStockTotals {
  const allItems = warehouses.flatMap((warehouse) => warehouse.items);
  const sumQuantity = (items: WarehouseStockItem[]) =>
    items.reduce((sum, item) => sum + item.quantity, 0);

  const supplyItems = allItems.filter((item) => !isFoodItem(item) && !isWaterItem(item));

  return {
    supplyUnits: sumQuantity(supplyItems),
    // Cùng một mã nằm ở năm kho vẫn là MỘT thứ hàng, nên đếm theo mã chứ không
    // đếm theo dòng — đếm dòng thì con số phồng lên theo số kho.
    supplySkuCount: new Set(supplyItems.map((item) => item.itemSku)).size,
    foodKg: sumQuantity(allItems.filter(isFoodItem)),
    waterLiters: litersFromBottles(sumQuantity(allItems.filter(isWaterItem))),
    warehouseCount: warehouses.length,
  };
}

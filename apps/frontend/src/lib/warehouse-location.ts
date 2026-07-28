import type { AdminWarehouse } from "./warehouse-api";

export function warehouseLocationLabel(warehouse: AdminWarehouse): string {
  if (warehouse.locationMethod?.startsWith("CULTURAL_HOUSE_")) {
    return "Nhà văn hóa thôn đã đối chiếu";
  }
  if (warehouse.locationMethod === "MANUAL_ADMIN") return "Vị trí do quản trị viên xác nhận";
  if (warehouse.lat != null && warehouse.lng != null) return "Vị trí cũ chưa có nguồn";
  return "Chưa xác minh nhà văn hóa";
}

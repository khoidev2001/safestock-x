import { apiFetch } from "./api";

export interface AdminWarehouse {
  id: string;
  name: string;
  location: string | null;
  kind: "CENTRAL" | "HAMLET";
  communeId: string;
  lat: number | null;
  lng: number | null;
}

export function listAllWarehouses(): Promise<AdminWarehouse[]> {
  return apiFetch<AdminWarehouse[]>("/api/admin/warehouses");
}

export function updateWarehouseLocation(
  id: string,
  lat: number,
  lng: number,
): Promise<AdminWarehouse> {
  return apiFetch<AdminWarehouse>(`/api/admin/warehouses/${id}/location`, {
    method: "PATCH",
    body: JSON.stringify({ lat, lng }),
  });
}

/** Xoá toạ độ kho, đưa về trạng thái chưa ghim. */
export function clearWarehouseLocation(id: string): Promise<AdminWarehouse> {
  return apiFetch<AdminWarehouse>(`/api/admin/warehouses/${id}/location`, {
    method: "PATCH",
    body: JSON.stringify({ lat: null, lng: null }),
  });
}

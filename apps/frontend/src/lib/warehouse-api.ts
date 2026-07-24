import { apiFetch } from "./api";

export interface AdminWarehouse {
  id: string;
  name: string;
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

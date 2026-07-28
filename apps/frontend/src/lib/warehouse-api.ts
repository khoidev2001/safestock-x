import { apiFetch } from "./api";

export interface AdminWarehouse {
  id: string;
  name: string;
  kind: "CENTRAL" | "HAMLET";
  communeId: string;
  lat: number | null;
  lng: number | null;
  locationKey?: string | null;
  locationMethod?:
    | "CULTURAL_HOUSE_GOOGLE_MAPS"
    | "CULTURAL_HOUSE_OSM"
    | "CULTURAL_HOUSE_OFFICIAL"
    | "MANUAL_ADMIN"
    | "LEGACY_UNSPECIFIED"
    | null;
  locationSourceName?: string | null;
  locationSourceUrl?: string | null;
  locationSourceRef?: string | null;
  locationCheckedAt?: string | null;
  locationMethodNote?: string | null;
  locationUpdatedAt?: string | null;
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

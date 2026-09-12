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

export interface WarehouseInput {
  name: string;
  location: string | null;
  kind: "CENTRAL" | "HAMLET";
  lat: number | null;
  lng: number | null;
}

export function createWarehouse(input: WarehouseInput): Promise<AdminWarehouse> {
  return apiFetch<AdminWarehouse>("/api/admin/warehouses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWarehouse(
  id: string,
  input: Partial<WarehouseInput>,
): Promise<AdminWarehouse> {
  return apiFetch<AdminWarehouse>(`/api/admin/warehouses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Xoá kho.
 *
 * Máy chủ từ chối khi kho còn lô hàng, tài khoản phụ trách hoặc hồ sơ điều phối,
 * và câu từ chối nói rõ vướng cái gì — hiện thẳng câu đó cho người dùng thay vì
 * dịch lại thành "không xoá được".
 */
export function deleteWarehouse(id: string): Promise<{ id: string; name: string }> {
  return apiFetch<{ id: string; name: string }>(`/api/admin/warehouses/${id}`, {
    method: "DELETE",
  });
}

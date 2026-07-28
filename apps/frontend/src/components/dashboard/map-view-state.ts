import type { AdminWarehouse } from "../../lib/warehouse-api";

export interface WarehouseCoordinate {
  lat: number;
  lng: number;
}

export type WarehouseDraft = Record<string, WarehouseCoordinate>;

export function beginWarehouseSave(
  pendingIds: ReadonlySet<string>,
  warehouseId: string,
): Set<string> | null {
  if (pendingIds.has(warehouseId)) return null;
  const next = new Set(pendingIds);
  next.add(warehouseId);
  return next;
}

export function finishWarehouseSave(
  pendingIds: ReadonlySet<string>,
  warehouseId: string,
): Set<string> {
  const next = new Set(pendingIds);
  next.delete(warehouseId);
  return next;
}

export function mergeWarehouseDraft(
  warehouses: AdminWarehouse[],
  draft: WarehouseDraft,
): AdminWarehouse[] {
  return warehouses.map((warehouse) =>
    draft[warehouse.id]
      ? {
          ...warehouse,
          lat: draft[warehouse.id].lat,
          lng: draft[warehouse.id].lng,
        }
      : warehouse,
  );
}

export function clearMatchingSavedDraft(
  draft: WarehouseDraft,
  warehouseId: string,
  savedCoordinate: WarehouseCoordinate,
): WarehouseDraft {
  const current = draft[warehouseId];
  if (
    !current ||
    current.lat !== savedCoordinate.lat ||
    current.lng !== savedCoordinate.lng
  ) {
    return draft;
  }

  const next = { ...draft };
  delete next[warehouseId];
  return next;
}

import { BadRequestException } from "@nestjs/common";

export interface MissionAllocationRow {
  batchId: string;
  qty: number;
  warehouseId: string;
  warehouseName?: string;
  expiryDate?: string | Date | null;
  [key: string]: unknown;
}

export interface MissionRequirementForRequest {
  sku: string;
  itemName: string;
  unit: string;
  allocations: unknown;
}

export interface MissionWarehouseRequestCreate {
  missionId: string;
  warehouseId: string;
  sku: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  allocations: MissionAllocationRow[];
}

/** Materialize AI allocation rows into deterministic warehouse + SKU work items. */
export function buildWarehouseRequestCreates(
  missionId: string,
  requirements: MissionRequirementForRequest[],
): MissionWarehouseRequestCreate[] {
  const grouped = new Map<string, MissionWarehouseRequestCreate>();
  for (const requirement of requirements) {
    for (const allocation of validAllocationRows(requirement.allocations)) {
      const key = `${allocation.warehouseId}\u0000${requirement.sku}`;
      const current = grouped.get(key);
      if (current) {
        current.requestedQuantity += allocation.qty;
        current.allocations.push(allocation);
        continue;
      }
      grouped.set(key, {
        missionId,
        warehouseId: allocation.warehouseId,
        sku: requirement.sku,
        itemName: requirement.itemName,
        unit: requirement.unit,
        requestedQuantity: allocation.qty,
        allocations: [allocation],
      });
    }
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.warehouseId.localeCompare(right.warehouseId) ||
      left.sku.localeCompare(right.sku),
  );
}

/** Convert persisted allocation JSON into the inventory bulk-export contract. */
export function requestBatchItems(
  allocations: unknown,
): { batchId: string; quantity: number }[] {
  return validAllocationRows(allocations).map((allocation) => ({
    batchId: allocation.batchId,
    quantity: allocation.qty,
  }));
}

/**
 * ADMIN may only reduce a pending request. The original FIFO/FEFO allocation
 * order is preserved; increasing requires re-running the plan.
 */
export function resizeRequestAllocations(
  allocations: unknown,
  requestedQuantity: number,
): MissionAllocationRow[] {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    throw new BadRequestException("Số lượng yêu cầu không hợp lệ");
  }
  const rows = validAllocationRows(allocations);
  const available = rows.reduce((sum, row) => sum + row.qty, 0);
  if (requestedQuantity > available) {
    throw new BadRequestException("Số lượng vượt quá phần vật tư đã được phân bổ");
  }
  let remaining = requestedQuantity;
  return rows.flatMap((row) => {
    if (remaining <= 0) return [];
    const qty = Math.min(row.qty, remaining);
    remaining -= qty;
    return [{ ...row, qty }];
  });
}

function validAllocationRows(value: unknown): MissionAllocationRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    if (
      typeof record.batchId !== "string" ||
      record.batchId.trim() === "" ||
      typeof record.warehouseId !== "string" ||
      record.warehouseId.trim() === "" ||
      typeof record.qty !== "number" ||
      !Number.isInteger(record.qty) ||
      record.qty <= 0
    ) {
      return [];
    }
    return [{ ...record, batchId: record.batchId, warehouseId: record.warehouseId, qty: record.qty }];
  });
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Permission, roleHasPermission } from "@safestock/shared-types";
import { useMemo, useState } from "react";
import {
  getInventoryBatches,
  getInventoryCatalog,
  getTransferDestinations,
  getWarehouseTree,
  type InventoryBatch,
} from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-store";
import { InventoryActionDialog } from "./inventory-action-dialog";
import { InventoryBulkExportDialog } from "./inventory-bulk-export-dialog";
import { CommuneStockPanel } from "./commune-stock-panel";
import { LoanStockMarksPanel } from "./loan-stock-marks-panel";
import { InventoryQrDialog } from "./inventory-qr-dialog";
import { InventoryReceivingDialog } from "./inventory-receiving-dialog";
import { InventoryHistory } from "./inventory-history";
import { InventoryTable, type InventoryRowAction } from "./inventory-table";
import { SemanticInventoryTools } from "./semantic-inventory-tools";
import { WarehouseMap } from "./warehouse-map";

export function InventoryWorkspace({ warehouseId }: { warehouseId: string }) {
  const queryClient = useQueryClient();
  const role = useAuth((state) => state.user?.role);
  const [selected, setSelected] = useState<InventoryBatch | null>(null);
  const [action, setAction] = useState<InventoryRowAction | null>(null);
  const [printBatch, setPrintBatch] = useState<InventoryBatch | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [message, setMessage] = useState("");

  const batches = useQuery({
    queryKey: ["inventory-batches", warehouseId],
    queryFn: () => getInventoryBatches(warehouseId),
  });
  const tree = useQuery({
    queryKey: ["warehouse-tree", warehouseId],
    queryFn: () => getWarehouseTree(warehouseId),
  });
  const catalog = useQuery({
    queryKey: ["inventory-catalog"],
    queryFn: getInventoryCatalog,
  });
  const hasPermission = (permission: Permission) =>
    Boolean(role && roleHasPermission(role, permission));
  const transferDestinations = useQuery({
    queryKey: ["inventory-transfer-destinations", warehouseId],
    queryFn: () => getTransferDestinations(warehouseId),
    enabled: hasPermission(Permission.INVENTORY_EXPORT),
  });
  const allowedActions = useMemo<InventoryRowAction[]>(() => {
    if (!role) return [];
    const allowed: InventoryRowAction[] = [];
    if (roleHasPermission(role, Permission.INVENTORY_IMPORT)) allowed.push("IMPORT");
    if (roleHasPermission(role, Permission.INVENTORY_EXPORT)) {
      allowed.push("EXPORT");
      if (!transferDestinations.isLoading && !transferDestinations.isError) {
        allowed.push("TRANSFER");
      }
    }
    if (roleHasPermission(role, Permission.INVENTORY_ADJUST)) {
      allowed.push("ADJUST", "CONDITION");
    }
    if (roleHasPermission(role, Permission.INVENTORY_RECONCILE)) {
      allowed.push("RECONCILE");
    }
    if (roleHasPermission(role, Permission.LOAN_MANAGE)) allowed.push("BORROW");
    return allowed;
  }, [role, transferDestinations.isError, transferDestinations.isLoading]);
  const shelves = useMemo(
    () =>
      (tree.data?.zones ?? []).flatMap((zone) =>
        zone.shelves.map((shelf) => ({ ...shelf, zoneLabel: `${zone.code} · ${zone.name}` })),
      ),
    [tree.data],
  );
  const transferShelves = useMemo(
    () =>
      (transferDestinations.data ?? []).flatMap((warehouse) =>
        warehouse.zones.flatMap((zone) =>
          zone.shelves.map((shelf) => ({
            ...shelf,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            zoneLabel: `${warehouse.name} · ${zone.code} · ${zone.name}`,
          })),
        ),
      ),
    [transferDestinations.data],
  );

  const refresh = async (successMessage: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] }),
      queryClient.invalidateQueries({ queryKey: ["warehouse-tree", warehouseId] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-transfer-destinations"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["open-loans", warehouseId] }),
      queryClient.invalidateQueries({ queryKey: ["warehouse-readiness", warehouseId] }),
    ]);
    setMessage(successMessage);
    setSelected(null);
    setAction(null);
    setReceiving(false);
    setBulk(false);
  };

  return (
    <div className="space-y-4">
      {/* Đặt TRƯỚC bảng tồn kho: tồn kho là một con số duy nhất, không nói được
          bao nhiêu trong đó là hàng đi mượn. Thấy con số trước rồi mới thấy chú
          thích thì đã kịp hiểu nhầm. */}
      <LoanStockMarksPanel />
      {/* Kho tổng nhìn được hàng đang nằm ở các thôn. Bảng tồn ngay bên dưới
          chỉ đếm hàng trong chính kho tổng, nên thiếu khối này người trực
          tưởng xã hết hàng trong khi các thôn vẫn còn. */}
      <CommuneStockPanel warehouseId={warehouseId} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-[var(--surface)] p-4">
        <div>
          <p className="font-semibold">Vận hành kho hằng ngày</p>
          <p className="text-sm text-[var(--text-muted)]">
            Tiếp nhận, xuất, chuyển, mượn-trả, kiểm kê và in QR.
          </p>
        </div>
        {hasPermission(Permission.INVENTORY_IMPORT) ||
        hasPermission(Permission.INVENTORY_BULK_EXPORT) ? (
          <div className="flex gap-2">
            {hasPermission(Permission.INVENTORY_BULK_EXPORT) ? (
              <button
                className="rounded-md border px-3 py-2 text-sm font-semibold"
                onClick={() => setBulk(true)}
              >
                Xuất nhiều lô
              </button>
            ) : null}
            {hasPermission(Permission.INVENTORY_IMPORT) ? (
              <button
                className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-fg)]"
                onClick={() => setReceiving(true)}
              >
                Tiếp nhận lô mới
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {message ? (
        <div
          className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900"
          role="status"
        >
          {message}
        </div>
      ) : null}
      {tree.isError || catalog.isError ? (
        <div
          className="rounded-md border border-red-300 p-3 text-sm text-[var(--color-critical)]"
          role="alert"
        >
          Không tải được cấu trúc kệ hoặc danh mục. Các thao tác ghi đang tạm khóa để tránh chọn sai
          dữ liệu.
        </div>
      ) : null}
      {transferDestinations.isError ? (
        <div className="rounded-md border border-amber-300 p-3 text-sm" role="alert">
          Không tải được danh sách kho/kệ đích. Chức năng điều chuyển tạm khóa; nhập, xuất và kiểm
          kê vẫn hoạt động bình thường.
          <button
            className="ml-2 rounded border px-2 py-1"
            onClick={() => void transferDestinations.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : null}

      <SemanticInventoryTools warehouseId={warehouseId} />
      <InventoryTable
        allowedActions={tree.isError || catalog.isError ? [] : allowedActions}
        batches={batches.data}
        isError={batches.isError}
        isLoading={batches.isLoading}
        onAction={(batch, nextAction) => {
          setSelected(batch);
          setAction(nextAction);
          setMessage("");
        }}
        onPrint={setPrintBatch}
        onRetry={() => void batches.refetch()}
      />
      <WarehouseMap isLoading={tree.isLoading} tree={tree.data} />
      <InventoryHistory warehouseId={warehouseId} />

      {action && selected ? (
        <InventoryActionDialog
          action={action}
          batch={selected}
          onClose={() => {
            setAction(null);
            setSelected(null);
          }}
          onSuccess={refresh}
          shelves={action === "TRANSFER" ? transferShelves : shelves}
        />
      ) : null}
      {receiving ? (
        <InventoryReceivingDialog
          catalog={catalog.data ?? []}
          onClose={() => setReceiving(false)}
          onSuccess={async (result) => {
            await refresh("Đã tiếp nhận lô mới và tạo nhãn QR.");
            setPrintBatch(result.batch);
          }}
          open
          shelves={shelves}
        />
      ) : null}
      {bulk ? (
        <InventoryBulkExportDialog
          batches={batches.data ?? []}
          onClose={() => setBulk(false)}
          onSuccess={refresh}
          open
        />
      ) : null}
      <InventoryQrDialog batch={printBatch} onClose={() => setPrintBatch(null)} />
    </div>
  );
}

import { useNetInfo } from "@react-native-community/netinfo";
import {
  CameraView as ExpoCameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type CameraViewProps,
} from "expo-camera";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  adjustBatch,
  borrowBatch,
  bulkExportBatches,
  createMutationRequestId,
  exportBatch,
  fetchFirstWarehouse,
  fetchInventoryCatalog,
  fetchOpenLoans,
  fetchTransferDestinations,
  fetchBatchQr,
  fetchWarehouseBatches,
  fetchWarehouseTree,
  fetchWarehouses,
  importBatch,
  receiveInventoryBatch,
  reconcileBatch,
  returnLoan,
  semanticSearchInventory,
  setBatchCondition,
  transferBatch,
  type AuthUser,
  type BatchQrLabel,
  type InventoryBatch,
  type InventoryCatalogItem,
  type LoanRecord,
  type WarehouseSummary,
  type WarehouseTree,
} from "./api";
import {
  canPerformInventoryAction,
  parseScannedInventoryCode,
  validateLoanReturn,
  type InventoryAction,
} from "./inventory-state";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";
import { c } from "./styles";

interface InventorySnapshot {
  warehouse: WarehouseSummary;
  tree: WarehouseTree;
  batches: InventoryBatch[];
  loans: LoanRecord[];
}

interface BatchAction {
  key: InventoryAction;
  label: string;
}

const CompatibleCameraView = ExpoCameraView as unknown as ComponentType<CameraViewProps>;

const BATCH_ACTIONS: BatchAction[] = [
  { key: "import", label: "Nhập kho" },
  { key: "export", label: "Xuất kho" },
  { key: "transfer", label: "Chuyển kho/kệ" },
  { key: "reconcile", label: "Kiểm kê" },
  { key: "adjust", label: "Điều chỉnh" },
  { key: "condition", label: "Báo tình trạng" },
  { key: "borrow", label: "Mượn vật tư" },
];

export function InventoryScreen({ token, user }: { token: string; user: AuthUser }) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [section, setSection] = useState<"stock" | "loans">("stock");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<InventoryBatch | null>(null);
  const [selectedAction, setSelectedAction] = useState<InventoryAction | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<LoanRecord | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Nhãn QR đang xem. Tải theo yêu cầu chứ không tải sẵn cho cả kho: một kho
  // vài trăm lô, tải hết là vài trăm ảnh không ai xem tới.
  const [qrLabel, setQrLabel] = useState<BatchQrLabel | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const openQrLabel = useCallback(
    async (batch: InventoryBatch) => {
      setQrLoading(true);
      try {
        setQrLabel(await fetchBatchQr(token, batch.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tạo được mã QR cho lô này");
      } finally {
        setQrLoading(false);
      }
    },
    [token],
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [receivingOpen, setReceivingOpen] = useState(false);
  const [semanticSkus, setSemanticSkus] = useState<string[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseSummary[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    user.warehouseId ?? null,
  );
  /**
   * Đang xem DANH SÁCH kho thay vì lòng một kho.
   *
   * Trước đây danh sách chỉ hiện đúng một lần, lúc chưa chọn kho nào; sau đó
   * cách duy nhất để đổi kho là hàng chip cuộn ngang trên đầu màn hình. Hàng
   * chip ấy vừa chiếm chỗ vừa không tìm được: xã có hơn chục kho, muốn tới kho
   * cuối phải vuốt ngang qua tất cả các kho đứng trước.
   */
  const [browsingWarehouses, setBrowsingWarehouses] = useState(false);
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const netInfo = useNetInfo();
  const snapshotRef = useRef<InventorySnapshot | null>(null);

  const load = useCallback(
    async (options?: { refresh?: boolean; skipCache?: boolean }) => {
      if (options?.refresh) setRefreshing(true);
      else if (!snapshotRef.current) setLoading(true);
      setError(null);

      let hasCachedData = Boolean(snapshotRef.current);

      try {
        let warehouse: WarehouseSummary | null = null;
        if (user.warehouseId) {
          warehouse = {
            id: user.warehouseId,
            name: user.warehouseName ?? "Kho phụ trách",
          };
        } else if (user.role === "ADMIN") {
          let warehouseList = warehouseOptions;
          if (warehouseList.length === 0) {
            warehouseList = await fetchWarehouses(token);
            setWarehouseOptions(warehouseList);
          }
          let preferredWarehouseId = selectedWarehouseId;
          if (!preferredWarehouseId) {
            try {
              const cachedPreference = await readOfflineCache<{
                warehouseId: string;
              }>(user.id, "warehouse-selection");
              const cachedWarehouseId = cachedPreference?.data.warehouseId;
              if (
                cachedWarehouseId &&
                warehouseList.some((option) => option.id === cachedWarehouseId)
              ) {
                preferredWarehouseId = cachedWarehouseId;
                setSelectedWarehouseId(cachedWarehouseId);
              }
            } catch {
              // Preference lỗi chỉ làm hiện lại bộ chọn kho.
            }
          }
          if (!preferredWarehouseId) {
            if (warehouseList.length === 0) {
              throw new Error("Đơn vị chưa có kho để vận hành.");
            }
            setLoading(false);
            return;
          }
          warehouse = warehouseList.find((option) => option.id === preferredWarehouseId) ?? null;
          if (!warehouse) {
            throw new Error("Kho đã chọn không còn thuộc đơn vị.");
          }
        } else {
          warehouse = await fetchFirstWarehouse(token);
        }
        const cacheScope = `inventory:${warehouse.id}`;
        if (!snapshotRef.current && !options?.skipCache) {
          try {
            const cached = await readOfflineCache<InventorySnapshot>(user.id, cacheScope);
            if (cached) {
              hasCachedData = true;
              snapshotRef.current = cached.data;
              setSnapshot(cached.data);
              setCacheStoredAt(cached.storedAt);
              setLoading(false);
            }
          } catch {
            // Tiếp tục tải live.
          }
        }
        const [tree, batches, loans] = await Promise.all([
          fetchWarehouseTree(token, warehouse.id),
          fetchWarehouseBatches(token, warehouse.id),
          fetchOpenLoans(token, warehouse.id),
        ]);
        const live = { warehouse, tree, batches, loans };
        snapshotRef.current = live;
        setSnapshot(live);
        setCacheStoredAt(null);
        await writeOfflineCache(user.id, cacheScope, live);
      } catch (loadError) {
        setError(
          hasCachedData
            ? "Không kết nối được ungphonhanh.life. Dữ liệu kho đang ở chế độ chỉ đọc."
            : loadError instanceof Error
              ? loadError.message
              : "Không tải được nghiệp vụ kho",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      selectedWarehouseId,
      token,
      user.id,
      user.role,
      user.warehouseId,
      user.warehouseName,
      warehouseOptions,
    ],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selectWarehouse = (warehouseId: string) => {
    setBrowsingWarehouses(false);
    setWarehouseQuery("");
    // Bấm lại đúng kho đang mở: chỉ đóng danh sách, không tải lại từ đầu. Xoá
    // snapshot ở đây là bắt người dùng chờ một lượt mạng cho thứ họ đã có.
    if (warehouseId === selectedWarehouseId) return;
    snapshotRef.current = null;
    setSnapshot(null);
    setCacheStoredAt(null);
    setQuery("");
    setSemanticSkus(null);
    setError(null);
    setLoading(true);
    setSelectedWarehouseId(warehouseId);
    void writeOfflineCache(user.id, "warehouse-selection", {
      warehouseId,
    }).catch(() => {
      // Không chặn thao tác nếu thiết bị không lưu được preference.
    });
  };

  /**
   * Lọc kho theo tên, bỏ dấu để gõ "ky du" vẫn ra "Kho thôn Kỳ Đu".
   *
   * Không ai gõ dấu khi đang đứng giữa kho, và bàn phím điện thoại còn tự sửa
   * chính tả — bắt gõ đúng dấu là bắt người dùng chiến đấu với bàn phím.
   */
  const filteredWarehouses = useMemo(() => {
    const keyword = stripDiacritics(warehouseQuery);
    if (!keyword) return warehouseOptions;
    return warehouseOptions.filter((warehouse) =>
      stripDiacritics(warehouse.name).includes(keyword),
    );
  }, [warehouseOptions, warehouseQuery]);

  const filteredBatches = useMemo(() => {
    if (snapshot && semanticSkus) {
      const skus = new Set(semanticSkus);
      return snapshot.batches.filter((batch) => skus.has(batch.item.sku));
    }
    const keyword = query.trim().toLocaleLowerCase("vi");
    if (!snapshot || !keyword) return snapshot?.batches ?? [];
    return snapshot.batches.filter((batch) =>
      [
        batch.item.sku,
        batch.item.name,
        batch.batchCode ?? batch.code,
        batch.shelf.code,
        batch.shelf.zone.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword)),
    );
  }, [query, semanticSkus, snapshot]);

  const offline = Boolean(cacheStoredAt) || netInfo.isConnected === false;

  const finishMutation = async (message: string) => {
    setSuccess(message);
    setSelectedBatch(null);
    setSelectedAction(null);
    setSelectedLoan(null);
    setBulkOpen(false);
    setReceivingOpen(false);
    await load({ skipCache: true });
  };

  const openAction = (batch: InventoryBatch, action: InventoryAction) => {
    if (offline) {
      setError("Ngoại tuyến chỉ cho phép xem dữ liệu đã lưu.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSelectedBatch(batch);
    setSelectedAction(action);
  };

  const runSemanticSearch = async () => {
    const value = query.trim();
    if (offline || value.length < 2 || !snapshot) return;
    setSemanticLoading(true);
    setError(null);
    try {
      const result = await semanticSearchInventory(token, snapshot.warehouse.id, value);
      setSemanticSkus(result.results.map((item) => item.sku));
      setSuccess(
        result.mode === "EMBEDDING"
          ? `Đã tìm bằng embedding local: ${result.results.length} gợi ý`
          : `Embedding chưa sẵn sàng; có ${result.results.length} gợi ý theo từ khóa`,
      );
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : "Không tìm ngữ nghĩa được vật tư",
      );
    } finally {
      setSemanticLoading(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <View style={local.center}>
        <ActivityIndicator color={c.amber} size="large" />
        <Text style={local.muted}>Đang tải kho và phiếu mượn…</Text>
      </View>
    );
  }

  /*
    Danh sách kho là một MÀN HÌNH riêng, không phải một dải chip trên đầu trang.
    
    Xã có hơn chục kho. Dải chip cuộn ngang bắt người dùng vuốt qua từng kho một
    để tới kho cuối, không tìm được theo tên, mà vẫn chiếm một khoảng chiều cao
    trên mọi màn hình kể cả khi họ đang làm việc trong đúng một kho suốt buổi.
    
    Hiện ở hai lúc: chưa mở kho nào (lần đầu), và khi người dùng chủ động bấm
    "Đổi kho" từ trong lòng một kho.
  */
  if (user.role === "ADMIN" && warehouseOptions.length > 0 && (!snapshot || browsingWarehouses)) {
    return (
      <View style={local.chooserScreen}>
        <Text style={local.eyebrow}>PHẠM VI VẬN HÀNH</Text>
        <Text style={local.title}>Chọn kho cần quản lý</Text>
        <Text style={local.chooserHint}>
          Mọi số liệu, phiếu mượn và thao tác sau đó chỉ áp dụng cho kho đã chọn.
        </Text>
        {error ? <Text style={local.error}>{error}</Text> : null}

        <TextInput
          accessibilityLabel="Tìm kho theo tên"
          autoCorrect={false}
          onChangeText={setWarehouseQuery}
          placeholder="Tìm kho theo tên, ví dụ: Kỳ Đu"
          placeholderTextColor={c.muted}
          style={local.chooserSearch}
          value={warehouseQuery}
        />

        {filteredWarehouses.length === 0 ? (
          <Text style={local.chooserEmpty}>Không có kho nào khớp “{warehouseQuery}”.</Text>
        ) : (
          <ScrollView
            contentContainerStyle={local.chooserList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filteredWarehouses.map((warehouse) => {
              const isCurrent = warehouse.id === selectedWarehouseId;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={warehouse.id}
                  onPress={() => selectWarehouse(warehouse.id)}
                  style={[local.chooserOption, isCurrent && local.chooserOptionCurrent]}
                >
                  <View style={local.chooserOptionMain}>
                    <Text style={local.chooserOptionText}>{warehouse.name}</Text>
                    {/* Đánh dấu kho đang mở: người dùng bấm "Đổi kho" rồi đổi ý
                        cần biết quay lại đâu, mà mười cái tên thôn nhìn giống nhau. */}
                    {isCurrent ? <Text style={local.chooserBadge}>đang mở</Text> : null}
                  </View>
                  <Text style={local.link}>{isCurrent ? "Quay lại →" : "Mở kho →"}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Chỉ có đường lui khi đang thật sự có kho để lui về. Lần đầu vào app
            thì chưa mở kho nào, hiện nút "Đóng" là hứa một chỗ không tồn tại. */}
        {snapshot ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBrowsingWarehouses(false);
              setWarehouseQuery("");
            }}
            style={local.chooserCancel}
          >
            <Text style={local.chooserCancelText}>Đóng, giữ kho đang mở</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={local.center}>
        <Text style={local.errorTitle}>Không tải được dữ liệu kho</Text>
        <Text style={local.muted}>{error}</Text>
        <Pressable
          style={[local.primary, local.stackedAction]}
          onPress={() => void load({ skipCache: true })}
        >
          <Text style={local.primaryText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={local.screen}>
      <View style={local.header}>
        <View style={{ flex: 1 }}>
          <Text style={local.eyebrow}>NGHIỆP VỤ KHO MOBILE</Text>
          <Text style={local.title}>{snapshot.warehouse.name}</Text>
          <Text style={local.subtitle}>
            {snapshot.batches.length} lô · {snapshot.loans.length} phiếu đang mở
          </Text>
        </View>
        <View style={[local.statusDot, { backgroundColor: offline ? c.amber : c.green }]} />
      </View>

      {/* Đổi kho là một cú bấm mở DANH SÁCH, không phải một dải chip nằm thường
          trực trên đầu màn hình. Người trực làm việc trong một kho suốt buổi;
          dải chip lấy chỗ của họ mỗi lần cuộn để phục vụ một thao tác hiếm. */}
      {user.role === "ADMIN" && warehouseOptions.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setBrowsingWarehouses(true)}
          style={local.switchWarehouse}
        >
          <Text style={local.switchWarehouseText}>
            Đổi kho ({warehouseOptions.length} kho trong xã)
          </Text>
        </Pressable>
      ) : null}

      {offline ? (
        <View style={local.offline} accessibilityRole="alert">
          <Text style={local.offlineTitle}>Ngoại tuyến · chỉ đọc</Text>
          <Text style={local.offlineText}>Mọi thao tác nhập/xuất/chuyển/hoàn đều đã khóa.</Text>
        </View>
      ) : null}
      {error ? <Text style={local.error}>{error}</Text> : null}
      {success ? <Text style={local.success}>{success}</Text> : null}

      <View style={local.segment}>
        <Segment label="Tồn kho" active={section === "stock"} onPress={() => setSection("stock")} />
        <Segment
          label={`Mượn · trả (${snapshot.loans.length})`}
          active={section === "loans"}
          onPress={() => setSection("loans")}
        />
      </View>

      {section === "stock" ? (
        <>
          <View style={local.searchRow}>
            <TextInput
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setSemanticSkus(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Nhập SKU, tên, mã lô hoặc vị trí"
              placeholderTextColor={c.muted}
              style={local.searchInput}
              accessibilityLabel="Tìm vật tư bằng SKU hoặc tên"
            />
            <Pressable
              disabled={offline || query.trim().length < 2 || semanticLoading}
              style={[local.aiSearchButton, (offline || query.trim().length < 2) && local.disabled]}
              onPress={() => void runSemanticSearch()}
              accessibilityRole="button"
            >
              <Text style={local.aiSearchText}>{semanticLoading ? "…" : "AI"}</Text>
            </Pressable>
            <Pressable
              style={local.scanButton}
              onPress={() => setScannerOpen(true)}
              accessibilityRole="button"
            >
              <Text style={local.scanText}>QR</Text>
            </Pressable>
          </View>
          {canPerformInventoryAction(user.role, "bulk-export") ? (
            <>
              <Pressable
                disabled={offline}
                onPress={() => setReceivingOpen(true)}
                style={[local.bulkButton, offline && local.disabled]}
              >
                <Text style={local.bulkText}>Tiếp nhận lô mới</Text>
              </Pressable>
              <Pressable
                disabled={offline}
                onPress={() => setBulkOpen(true)}
                style={[local.bulkButton, offline && local.disabled]}
              >
                <Text style={local.bulkText}>Xuất nhiều lô khẩn cấp</Text>
              </Pressable>
            </>
          ) : null}

          <FlatList
            data={filteredBatches}
            keyExtractor={(batch) => batch.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={c.amber}
                onRefresh={() => void load({ refresh: true, skipCache: true })}
              />
            }
            contentContainerStyle={local.listContent}
            ListEmptyComponent={
              <View style={local.empty}>
                <Text style={local.muted}>Không tìm thấy lô phù hợp.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <BatchCard
                batch={item}
                role={user.role}
                readOnly={offline}
                onAction={(action) => openAction(item, action)}
                onShowQr={() => void openQrLabel(item)}
              />
            )}
          />
        </>
      ) : (
        <FlatList
          data={snapshot.loans}
          keyExtractor={(loan) => loan.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={c.amber}
              onRefresh={() => void load({ refresh: true, skipCache: true })}
            />
          }
          contentContainerStyle={local.listContent}
          ListEmptyComponent={
            <View style={local.empty}>
              <Text style={local.muted}>Không có phiếu mượn đang mở.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <LoanCard
              loan={item}
              readOnly={offline || !canPerformInventoryAction(user.role, "return")}
              onReturn={() => {
                setError(null);
                setSuccess(null);
                setSelectedLoan(item);
              }}
            />
          )}
        />
      )}

      <Modal visible={Boolean(qrLabel) || qrLoading} transparent animationType="fade">
        <View style={local.qrOverlay}>
          <View style={local.qrCard}>
            {qrLoading || !qrLabel ? (
              <ActivityIndicator color={c.primary} size="large" />
            ) : (
              <>
                <Text style={local.qrItemName}>{qrLabel.itemName}</Text>
                <Text style={local.qrBatchCode}>Lô {qrLabel.batchCode}</Text>
                {/* Nền trắng cố định: mã QR đọc bằng độ tương phản, đặt lên nền
                    tối là máy quét đọc chậm hoặc không đọc được. */}
                <View style={local.qrImageFrame}>
                  <Image
                    source={{ uri: qrLabel.dataUrl }}
                    style={local.qrImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={local.qrHint}>
                  Đưa màn hình này cho máy khác quét, hoặc chụp lại để in nhãn dán lên lô.
                </Text>
              </>
            )}
            <Pressable onPress={() => setQrLabel(null)} style={local.qrCloseButton}>
              <Text style={local.qrCloseText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <QrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onCode={({ sku, batchCode }) => {
          setQuery(batchCode ?? sku);
          setSemanticSkus(null);
          setScannerOpen(false);
          setSuccess(batchCode ? `Đã quét SKU ${sku} · lô ${batchCode}` : `Đã quét SKU ${sku}`);
        }}
        onError={setError}
      />

      {selectedBatch && selectedAction ? (
        <BatchActionModal
          token={token}
          batch={selectedBatch}
          tree={snapshot.tree}
          action={selectedAction}
          onClose={() => {
            setSelectedBatch(null);
            setSelectedAction(null);
          }}
          onSuccess={finishMutation}
        />
      ) : null}

      {selectedLoan ? (
        <ReturnLoanModal
          token={token}
          loan={selectedLoan}
          onClose={() => setSelectedLoan(null)}
          onSuccess={finishMutation}
        />
      ) : null}

      {bulkOpen ? (
        <BulkExportModal
          token={token}
          batches={snapshot.batches}
          onClose={() => setBulkOpen(false)}
          onSuccess={finishMutation}
        />
      ) : null}
      {receivingOpen ? (
        <ReceiveBatchModal
          token={token}
          tree={snapshot.tree}
          onClose={() => setReceivingOpen(false)}
          onSuccess={finishMutation}
        />
      ) : null}
    </View>
  );
}

function BatchCard({
  batch,
  role,
  readOnly,
  onAction,
  onShowQr,
}: {
  batch: InventoryBatch;
  role: string;
  readOnly: boolean;
  onAction: (action: InventoryAction) => void;
  onShowQr: () => void;
}) {
  const actions = BATCH_ACTIONS.filter((action) => canPerformInventoryAction(role, action.key));
  const conditionColor =
    batch.condition === "DAMAGED" ? c.red : batch.condition === "NEEDS_CHECK" ? c.amber : c.green;
  return (
    <View style={local.card}>
      <View style={local.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={local.sku}>{batch.item.sku}</Text>
          <Text style={local.itemName}>{batch.item.name}</Text>
        </View>
        <Text style={local.quantity}>
          {batch.quantity}{" "}
          <Text style={local.unit}>{batch.item.category?.unit ?? batch.item.unit ?? "đơn vị"}</Text>
        </Text>
      </View>
      <View style={local.metaRow}>
        <Text style={local.meta}>Lô {batch.batchCode ?? batch.code}</Text>
        <Text style={local.meta}>
          {batch.shelf.zone.code}-{batch.shelf.code}
        </Text>
        <Text style={[local.meta, { color: conditionColor }]}>
          {conditionLabel(batch.condition)}
        </Text>
      </View>
      {actions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={local.chipScroller}
          contentContainerStyle={local.actionScroller}
        >
          {actions.map((action) => (
            <Pressable
              key={action.key}
              disabled={readOnly}
              onPress={() => onAction(action.key)}
              style={[local.actionChip, readOnly && local.disabled]}
            >
              <Text style={local.actionText}>{action.label}</Text>
            </Pressable>
          ))}
          {/* Xem được cả khi chỉ đọc: in nhãn không đụng vào tồn kho. */}
          <Pressable key="qr" onPress={onShowQr} style={local.actionChip}>
            <Text style={local.actionText}>Mã QR</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * Bỏ dấu tiếng Việt để so khớp khi tìm kho.
 *
 * Người trực đứng giữa kho, một tay cầm hàng — họ gõ "ky du" chứ không gõ
 * "Kỳ Đu", và bàn phím điện thoại còn tự sửa chính tả giúp. Bắt gõ đúng dấu là
 * bắt họ chiến đấu với bàn phím giữa lúc đang vội.
 */
function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function LoanCard({
  loan,
  readOnly,
  onReturn,
}: {
  loan: LoanRecord;
  readOnly: boolean;
  onReturn: () => void;
}) {
  const outstanding = loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost;
  return (
    <View style={local.card}>
      <Text style={local.sku}>{loan.batch.item.sku}</Text>
      <Text style={local.itemName}>{loan.batch.item.name}</Text>
      <View style={local.loanFacts}>
        <Text style={local.meta}>Mượn {loan.quantity}</Text>
        <Text style={local.meta}>Đã hoàn {loan.quantity - outstanding}</Text>
        <Text style={[local.meta, { color: outstanding > 0 ? c.amber : c.green }]}>
          Còn nợ {outstanding}
        </Text>
      </View>
      <Pressable
        disabled={readOnly}
        onPress={onReturn}
        style={[local.primarySmall, readOnly && local.disabled]}
      >
        <Text style={local.primaryText}>Hoàn vật tư</Text>
      </Pressable>
    </View>
  );
}

function BatchActionModal({
  token,
  batch,
  tree,
  action,
  onClose,
  onSuccess,
}: {
  token: string;
  batch: InventoryBatch;
  tree: WarehouseTree;
  action: InventoryAction;
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(action === "adjust" ? String(batch.quantity) : "1");
  const [note, setNote] = useState("");
  const [missionId, setMissionId] = useState("");
  const [toShelfId, setToShelfId] = useState("");
  const [applyOverride, setApplyOverride] = useState(false);
  const [condition, setCondition] = useState<"NEW" | "USED" | "NEEDS_CHECK" | "DAMAGED">(
    "NEEDS_CHECK",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => createMutationRequestId("inventory"));
  const [destinationTrees, setDestinationTrees] = useState<WarehouseTree[] | null>(
    action === "transfer" ? null : [tree],
  );
  const [destinationError, setDestinationError] = useState<string | null>(null);

  const loadDestinations = useCallback(async () => {
    if (action !== "transfer") return;
    setDestinationError(null);
    try {
      setDestinationTrees(await fetchTransferDestinations(token, tree.id));
    } catch (loadError) {
      setDestinationTrees(null);
      setDestinationError(
        loadError instanceof Error ? loadError.message : "Không tải được kho/kệ đích.",
      );
    }
  }, [action, token, tree.id]);

  useEffect(() => {
    void loadDestinations();
  }, [loadDestinations]);

  const shelves = (destinationTrees ?? []).flatMap((warehouse) =>
    warehouse.zones.flatMap((zone) => zone.shelves.map((shelf) => ({ ...shelf, zone, warehouse }))),
  );

  const submit = async () => {
    const numeric = Number(quantity);
    if (!Number.isInteger(numeric) || numeric < 0) {
      setError("Số lượng phải là số nguyên không âm.");
      return;
    }
    if (action !== "adjust" && action !== "reconcile" && numeric <= 0) {
      setError("Số lượng phải lớn hơn 0.");
      return;
    }
    if ((action === "condition" || action === "adjust") && note.trim().length < 3) {
      setError("Cần ghi lý do ít nhất 3 ký tự.");
      return;
    }
    if (action === "transfer" && !toShelfId) {
      setError("Chọn kho và kệ đích.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (action === "import") {
        await importBatch(token, batch.id, numeric, note.trim() || undefined, requestId);
      } else if (action === "export") {
        await exportBatch(token, batch.id, numeric, note.trim() || undefined, requestId);
      } else if (action === "transfer") {
        await transferBatch(
          token,
          batch.id,
          toShelfId,
          numeric,
          note.trim() || undefined,
          requestId,
        );
      } else if (action === "reconcile") {
        await reconcileBatch(
          token,
          batch.id,
          numeric,
          applyOverride,
          note.trim() || undefined,
          requestId,
        );
      } else if (action === "adjust") {
        await adjustBatch(token, batch.id, numeric, note.trim(), requestId);
      } else if (action === "condition") {
        await setBatchCondition(token, batch.id, condition, note.trim(), requestId);
      } else if (action === "borrow") {
        await borrowBatch(token, batch.id, numeric, missionId.trim() || undefined, requestId);
      }
      await onSuccess(`${actionLabel(action)} thành công cho ${batch.item.sku}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Thao tác thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <ScrollView style={local.modal} contentContainerStyle={local.modalContent}>
          <Text style={local.modalEyebrow}>{actionLabel(action)}</Text>
          <Text style={local.modalTitle}>{batch.item.name}</Text>
          <Text style={local.modalMeta}>
            {batch.item.sku} · lô {batch.batchCode ?? batch.code} · tồn {batch.quantity}
          </Text>

          {action === "condition" ? (
            <>
              <FieldLabel text="Tình trạng mới" />
              <View style={local.optionWrap}>
                {(["NEW", "USED", "NEEDS_CHECK", "DAMAGED"] as const).map((value) => (
                  <Option
                    key={value}
                    label={conditionLabel(value)}
                    active={condition === value}
                    onPress={() => setCondition(value)}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <FieldLabel
                text={
                  action === "reconcile"
                    ? "Số đếm thực tế"
                    : action === "adjust"
                      ? "Tồn hệ thống mới"
                      : "Số lượng"
                }
              />
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                style={local.modalInput}
                accessibilityLabel="Số lượng"
              />
            </>
          )}

          {action === "transfer" ? (
            <>
              <FieldLabel text="Kho và kệ đích" />
              {!destinationTrees && !destinationError ? (
                <ActivityIndicator color={c.amber} />
              ) : destinationError ? (
                <View>
                  <Text style={local.error}>{destinationError}</Text>
                  <Pressable onPress={() => void loadDestinations()}>
                    <Text style={local.link}>Tải lại danh sách đích</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={local.optionWrap}>
                  {shelves
                    .filter((shelf) => shelf.id !== batch.shelf.id && !shelf.isLocked)
                    .map((shelf) => (
                      <Option
                        key={shelf.id}
                        label={`${shelf.warehouse.name} · ${shelf.zone.code}-${shelf.code}`}
                        active={toShelfId === shelf.id}
                        onPress={() => setToShelfId(shelf.id)}
                      />
                    ))}
                </View>
              )}
            </>
          ) : null}

          {action === "reconcile" ? (
            <Pressable
              onPress={() => setApplyOverride((value) => !value)}
              style={[local.overrideToggle, applyOverride && { borderColor: c.amber }]}
            >
              <View style={[local.checkbox, applyOverride && { backgroundColor: c.amber }]} />
              <View style={{ flex: 1 }}>
                <Text style={local.overrideTitle}>Áp dụng chênh lệch vào tồn</Text>
                <Text style={local.overrideNote}>
                  Tắt để chỉ lưu kết quả kiểm kê, không sửa tồn hệ thống.
                </Text>
              </View>
            </Pressable>
          ) : null}

          {action === "borrow" ? (
            <>
              <FieldLabel text="Mã nhiệm vụ (không bắt buộc)" />
              <TextInput
                value={missionId}
                onChangeText={setMissionId}
                autoCapitalize="none"
                style={local.modalInput}
                placeholder="Mission ID"
                placeholderTextColor={c.muted}
              />
            </>
          ) : null}

          <FieldLabel
            text={action === "condition" || action === "adjust" ? "Lý do bắt buộc" : "Ghi chú"}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            style={[local.modalInput, local.noteInput]}
            placeholder="Mô tả nguồn, tình trạng hoặc lý do"
            placeholderTextColor={c.muted}
          />
          {error ? <Text style={local.error}>{error}</Text> : null}
          <View style={local.modalButtons}>
            <Pressable disabled={busy} onPress={onClose} style={local.secondary}>
              <Text style={local.secondaryText}>Hủy</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void submit()}
              style={[local.primary, busy && local.disabled]}
            >
              <Text style={local.primaryText}>{busy ? "Đang xử lý…" : "Xác nhận"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ReturnLoanModal({
  token,
  loan,
  onClose,
  onSuccess,
}: {
  token: string;
  loan: LoanRecord;
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const outstanding = loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost;
  const [ok, setOk] = useState("0");
  const [damaged, setDamaged] = useState("0");
  const [lost, setLost] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => createMutationRequestId("loan-return"));

  const submit = async () => {
    const input = {
      ok: Number(ok),
      damaged: Number(damaged),
      lost: Number(lost),
    };
    const validation = validateLoanReturn(outstanding, input);
    if (!validation.valid) {
      setError(validation.reason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await returnLoan(token, loan.id, { ...input, requestId });
      await onSuccess(`Đã hoàn ${validation.total} ${loan.batch.item.name}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không hoàn được phiếu");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <View style={[local.modal, local.modalContent]}>
          <Text style={local.modalEyebrow}>HOÀN VẬT TƯ</Text>
          <Text style={local.modalTitle}>{loan.batch.item.name}</Text>
          <Text style={local.modalMeta}>Còn nợ {outstanding}</Text>
          <ReturnField label="Tốt / sử dụng được" value={ok} onChange={setOk} />
          <ReturnField label="Hỏng / cần kiểm tra" value={damaged} onChange={setDamaged} />
          <ReturnField label="Mất" value={lost} onChange={setLost} />
          {error ? <Text style={local.error}>{error}</Text> : null}
          <View style={local.modalButtons}>
            <Pressable disabled={busy} onPress={onClose} style={local.secondary}>
              <Text style={local.secondaryText}>Hủy</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void submit()}
              style={[local.primary, busy && local.disabled]}
            >
              <Text style={local.primaryText}>{busy ? "Đang xử lý…" : "Xác nhận hoàn"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ReceiveBatchModal({
  token,
  tree,
  onClose,
  onSuccess,
}: {
  token: string;
  tree: WarehouseTree;
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<InventoryCatalogItem[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [itemId, setItemId] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState("");
  const [note, setNote] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [unit, setUnit] = useState("");
  const [consumable, setConsumable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => createMutationRequestId("receive"));
  const shelves = tree.zones.flatMap((zone) => zone.shelves.map((shelf) => ({ ...shelf, zone })));

  useEffect(() => {
    fetchInventoryCatalog(token)
      .then(setCatalog)
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh mục vật tư"),
      );
  }, [token]);

  const submit = async () => {
    const amount = Number(quantity);
    if (!shelfId || !batchCode.trim() || !Number.isInteger(amount) || amount <= 0) {
      setError("Chọn kệ, nhập mã lô và số lượng nguyên dương.");
      return;
    }
    if (mode === "existing" && !itemId) {
      setError("Chọn vật tư trong danh mục.");
      return;
    }
    if (mode === "new" && [sku, name, categoryName, unit].some((value) => !value.trim())) {
      setError("Vật tư mới cần SKU, tên, danh mục và đơn vị.");
      return;
    }
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      setError("Hạn dùng phải theo dạng YYYY-MM-DD.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await receiveInventoryBatch(token, {
        itemId: mode === "existing" ? itemId : undefined,
        newItem:
          mode === "new"
            ? {
                sku: sku.trim(),
                name: name.trim(),
                consumable,
                categoryName: categoryName.trim(),
                unit: unit.trim(),
              }
            : undefined,
        shelfId,
        batchCode: batchCode.trim(),
        quantity: amount,
        expiryDate: expiryDate ? new Date(`${expiryDate}T12:00:00`).toISOString() : undefined,
        note: note.trim() || undefined,
        requestId,
      });
      await onSuccess(`Đã tiếp nhận lô ${batchCode.trim()} và tạo payload QR.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không tiếp nhận được lô mới");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <ScrollView style={local.modal} contentContainerStyle={local.modalContent}>
          <Text style={local.modalEyebrow}>TIẾP NHẬN LÔ MỚI</Text>
          <Text style={local.modalTitle}>Nhập vật tư vào kho</Text>
          <Text style={local.modalMeta}>
            Tạo lô, ledger nhập và payload nhãn QR trong một giao dịch.
          </Text>
          <View style={local.optionWrap}>
            <Option
              active={mode === "existing"}
              label="Vật tư có sẵn"
              onPress={() => setMode("existing")}
            />
            <Option active={mode === "new"} label="Vật tư mới" onPress={() => setMode("new")} />
          </View>

          {mode === "existing" ? (
            <>
              <FieldLabel text="Chọn vật tư" />
              <View style={local.optionWrap}>
                {catalog.map((item) => (
                  <Option
                    active={itemId === item.id}
                    key={item.id}
                    label={`${item.sku} · ${item.name}`}
                    onPress={() => setItemId(item.id)}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <MobileTextField label="SKU" onChange={setSku} value={sku} />
              <MobileTextField label="Tên vật tư" onChange={setName} value={name} />
              <MobileTextField label="Danh mục" onChange={setCategoryName} value={categoryName} />
              <MobileTextField label="Đơn vị tính" onChange={setUnit} value={unit} />
              <Pressable
                onPress={() => setConsumable((value) => !value)}
                style={local.overrideToggle}
              >
                <View style={[local.checkbox, consumable && local.optionActive]} />
                <Text style={local.overrideTitle}>Vật tư tiêu hao</Text>
              </Pressable>
            </>
          )}

          <FieldLabel text="Kệ nhận hàng" />
          <View style={local.optionWrap}>
            {shelves
              .filter((shelf) => !shelf.isLocked)
              .map((shelf) => (
                <Option
                  active={shelfId === shelf.id}
                  key={shelf.id}
                  label={`${shelf.zone.code}-${shelf.code}`}
                  onPress={() => setShelfId(shelf.id)}
                />
              ))}
          </View>
          <MobileTextField label="Mã lô" onChange={setBatchCode} value={batchCode} />
          <MobileTextField
            keyboardType="number-pad"
            label="Số lượng"
            onChange={setQuantity}
            value={quantity}
          />
          <MobileTextField
            label="Hạn dùng (YYYY-MM-DD, nếu có)"
            onChange={setExpiryDate}
            value={expiryDate}
          />
          <MobileTextField label="Ghi chú" onChange={setNote} value={note} />

          {error ? <Text style={local.error}>{error}</Text> : null}
          <View style={local.modalButtons}>
            <Pressable disabled={busy} onPress={onClose} style={local.secondary}>
              <Text style={local.secondaryText}>Hủy</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void submit()}
              style={[local.primary, busy && local.disabled]}
            >
              <Text style={local.primaryText}>{busy ? "Đang tiếp nhận…" : "Tạo lô"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MobileTextField({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: "default" | "number-pad";
}) {
  return (
    <>
      <FieldLabel text={label} />
      <TextInput
        keyboardType={keyboardType}
        onChangeText={onChange}
        style={local.modalInput}
        value={value}
      />
    </>
  );
}

function BulkExportModal({
  token,
  batches,
  onClose,
  onSuccess,
}: {
  token: string;
  batches: InventoryBatch[];
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => createMutationRequestId("bulk-export"));
  const chosen = Object.entries(selected)
    .filter(([, quantity]) => quantity > 0)
    .map(([batchId, quantity]) => ({ batchId, quantity }));

  const submit = async () => {
    if (chosen.length === 0) {
      setError("Chọn ít nhất một lô.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await bulkExportBatches(token, chosen, note.trim() || undefined, requestId);
      await onSuccess(`Đã xuất đồng thời ${chosen.length} lô.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không xuất được nhiều lô");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <View style={[local.modal, { maxHeight: "88%" }]}>
          <View style={local.modalContent}>
            <Text style={local.modalEyebrow}>XUẤT KHẨN CẤP</Text>
            <Text style={local.modalTitle}>Xuất nhiều lô nguyên tử</Text>
            <Text style={local.modalMeta}>Một lô lỗi sẽ rollback toàn bộ danh sách.</Text>
          </View>
          <FlatList
            data={batches}
            keyExtractor={(batch) => batch.id}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            renderItem={({ item }) => {
              const quantity = selected[item.id] ?? 0;
              return (
                <View style={local.bulkRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={local.sku}>{item.item.sku}</Text>
                    <Text style={local.meta}>
                      {item.item.name} · tồn {item.quantity}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      setSelected((current) => ({
                        ...current,
                        [item.id]: Math.max(0, quantity - 1),
                      }))
                    }
                    style={local.stepper}
                  >
                    <Text style={local.stepperText}>−</Text>
                  </Pressable>
                  <Text style={local.stepperValue}>{quantity}</Text>
                  <Pressable
                    onPress={() =>
                      setSelected((current) => ({
                        ...current,
                        [item.id]: Math.min(item.quantity, quantity + 1),
                      }))
                    }
                    style={local.stepper}
                  >
                    <Text style={local.stepperText}>+</Text>
                  </Pressable>
                </View>
              );
            }}
          />
          <View style={local.modalContent}>
            <TextInput
              value={note}
              onChangeText={setNote}
              style={[local.modalInput, local.noteInput]}
              placeholder="Ghi chú xuất khẩn cấp"
              placeholderTextColor={c.muted}
            />
            {error ? <Text style={local.error}>{error}</Text> : null}
            <View style={local.modalButtons}>
              <Pressable disabled={busy} onPress={onClose} style={local.secondary}>
                <Text style={local.secondaryText}>Hủy</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => void submit()}
                style={[local.primary, busy && local.disabled]}
              >
                <Text style={local.primaryText}>
                  {busy ? "Đang xuất…" : `Xuất ${chosen.length} lô`}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QrScanner({
  open,
  onClose,
  onCode,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCode: (code: { sku: string; batchCode: string | null }) => void;
  onError: (message: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (open) setScanned(false);
  }, [open]);

  const handleScan = (result: BarcodeScanningResult) => {
    if (scanned) return;
    const code = parseScannedInventoryCode(result.data);
    if (!code) {
      setScanned(true);
      onError("QR không chứa SKU hợp lệ.");
      return;
    }
    setScanned(true);
    onCode(code);
  };

  if (!open) return null;
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={local.scanner}>
        {!permission ? (
          <ActivityIndicator color={c.amber} size="large" />
        ) : !permission.granted ? (
          <View style={local.center}>
            <Text style={local.errorTitle}>Cần quyền camera để quét QR</Text>
            <Pressable
              onPress={() => void requestPermission()}
              style={[local.primary, local.stackedAction]}
            >
              <Text style={local.primaryText}>Cho phép camera</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[local.secondary, local.stackedAction]}>
              <Text style={local.secondaryText}>Đóng</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CompatibleCameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanned ? undefined : handleScan}
            />
            <View style={local.scannerOverlay}>
              <Text style={local.scannerTitle}>Đưa QR vật tư vào khung</Text>
              <View style={local.scanFrame} />
              {scanned ? (
                <Pressable
                  onPress={() => setScanned(false)}
                  style={[local.primary, local.stackedAction]}
                >
                  <Text style={local.primaryText}>Quét lại</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} style={local.scannerClose}>
                <Text style={local.scannerCloseText}>Đóng</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[local.segmentButton, active && local.segmentActive]}>
      <Text style={[local.segmentText, active && local.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Option({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[local.option, active && local.optionActive]}>
      <Text style={[local.optionText, active && local.optionTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={local.fieldLabel}>{text}</Text>;
}

function ReturnField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={local.returnField}>
      <Text style={local.returnLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        style={local.returnInput}
      />
    </View>
  );
}

function actionLabel(action: InventoryAction): string {
  return BATCH_ACTIONS.find((candidate) => candidate.key === action)?.label ?? action;
}

function conditionLabel(condition: string): string {
  return (
    {
      NEW: "Mới",
      USED: "Đã dùng",
      NEEDS_CHECK: "Cần kiểm tra",
      DAMAGED: "Hỏng",
    }[condition] ?? condition
  );
}

const local = StyleSheet.create({
  qrOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  qrCard: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: c.surface,
    padding: 20,
  },
  qrItemName: { color: c.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  qrBatchCode: { color: c.muted, fontSize: 12 },
  qrImageFrame: { backgroundColor: "#ffffff", borderRadius: 12, padding: 12, marginTop: 4 },
  qrImage: { width: 220, height: 220 },
  qrHint: { color: c.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 6 },
  qrCloseButton: {
    marginTop: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  qrCloseText: { color: c.text, fontSize: 14, fontWeight: "700" },
  screen: { flex: 1, backgroundColor: c.bg },
  chooserScreen: {
    flex: 1,
    padding: 24,
    paddingTop: 48,
    gap: 12,
    backgroundColor: c.bg,
  },
  chooserHint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  chooserList: { gap: 10, marginTop: 8 },
  chooserSearch: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    backgroundColor: c.surface,
    color: c.text,
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  chooserEmpty: { color: c.muted, fontSize: 13, marginTop: 8 },
  chooserOption: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    backgroundColor: c.surface,
    padding: 14,
  },
  chooserOptionCurrent: { borderColor: c.amber, backgroundColor: "rgba(234,122,18,0.08)" },
  chooserOptionMain: { flexDirection: "row", alignItems: "center", gap: 8 },
  chooserOptionText: { color: c.text, fontSize: 15, fontWeight: "800" },
  chooserBadge: { color: c.amber, fontSize: 11, fontWeight: "800" },
  chooserCancel: { alignItems: "center", minHeight: 44, justifyContent: "center" },
  chooserCancelText: { color: c.muted, fontSize: 13, fontWeight: "700" },
  switchWarehouse: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    marginHorizontal: 16,
    marginBottom: 8,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  switchWarehouseText: { color: c.muted, fontSize: 12, fontWeight: "700" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 28,
    backgroundColor: c.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  eyebrow: {
    color: c.amber,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: { color: c.text, fontSize: 22, fontWeight: "900", marginTop: 3 },
  subtitle: { color: c.muted, fontSize: 12, marginTop: 3 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  /**
   * Hàng chip cuộn ngang không được giãn theo chiều dọc.
   *
   * ScrollView của react-native-web mang sẵn `flexGrow: 1`, nên đặt trong một
   * màn hình `flex: 1` là nó nuốt hết chỗ trống còn lại. Khoá lại ở đây một chỗ
   * cho mọi hàng chip trong màn hình này.
   */
  chipScroller: { flexGrow: 0, flexShrink: 0 },
  offline: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: c.amber,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 10,
    padding: 10,
  },
  offlineTitle: { color: c.amber, fontSize: 12, fontWeight: "800" },
  offlineText: { color: c.muted, fontSize: 11, marginTop: 2 },
  error: {
    color: c.red,
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: 16,
    marginTop: 9,
  },
  link: {
    color: c.amber,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  success: {
    color: c.green,
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: 16,
    marginTop: 9,
  },
  errorTitle: { color: c.text, fontSize: 18, fontWeight: "800" },
  muted: { color: c.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  segment: {
    flexDirection: "row",
    margin: 16,
    marginBottom: 10,
    padding: 4,
    backgroundColor: c.surface,
    borderRadius: 12,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 9,
  },
  segmentActive: { backgroundColor: c.surfaceAlt },
  segmentText: { color: c.muted, fontSize: 12, fontWeight: "700" },
  segmentTextActive: { color: c.text },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    color: c.text,
    fontSize: 13,
  },
  scanButton: {
    width: 52,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.amber,
    borderRadius: 11,
  },
  scanText: { color: "#111827", fontSize: 13, fontWeight: "900" },
  aiSearchButton: {
    width: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.amber,
    backgroundColor: "rgba(245,158,11,0.1)",
  },
  aiSearchText: { color: c.amber, fontSize: 13, fontWeight: "900" },
  bulkButton: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.amber,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  bulkText: { color: c.amber, fontSize: 12, fontWeight: "800" },
  listContent: { padding: 16, paddingTop: 4, paddingBottom: 110 },
  empty: {
    marginTop: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
  },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sku: { color: c.amber, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  itemName: { color: c.text, fontSize: 15, fontWeight: "800", marginTop: 3 },
  quantity: { color: c.text, fontSize: 24, fontWeight: "900" },
  unit: { color: c.muted, fontSize: 10, fontWeight: "600" },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 9,
  },
  meta: { color: c.muted, fontSize: 11 },
  actionScroller: { alignItems: "center", gap: 7, paddingTop: 12 },
  actionChip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionText: { color: c.text, fontSize: 11, fontWeight: "700" },
  loanFacts: { flexDirection: "row", gap: 14, marginTop: 10 },
  primarySmall: {
    alignSelf: "flex-start",
    backgroundColor: c.amber,
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 12,
  },
  disabled: { opacity: 0.4 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  modal: {
    backgroundColor: c.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  modalContent: { padding: 18, paddingBottom: 24 },
  modalEyebrow: {
    color: c.amber,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  modalTitle: { color: c.text, fontSize: 21, fontWeight: "900", marginTop: 4 },
  modalMeta: { color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  fieldLabel: {
    color: c.text,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 17,
    marginBottom: 7,
  },
  modalInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    borderRadius: 10,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: { minHeight: 74, textAlignVertical: "top" },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  optionActive: { borderColor: c.amber, backgroundColor: "rgba(245,158,11,0.1)" },
  optionText: { color: c.muted, fontSize: 11, fontWeight: "700" },
  optionTextActive: { color: c.amber },
  overrideToggle: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 11,
    marginTop: 14,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: c.border,
  },
  overrideTitle: { color: c.text, fontSize: 12, fontWeight: "800" },
  overrideNote: { color: c.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 20 },
  /**
   * Dùng kèm `primary`/`secondary` khi nút đứng trong một CỘT thay vì hàng ngang.
   *
   * `primary` và `secondary` sinh ra cho `modalButtons` — một hàng ngang, `flex: 1`
   * ở đó nghĩa là "chia đôi bề ngang". Đặt nguyên chúng vào một khối cột cao bằng
   * màn hình (`center`, `scannerOverlay`) thì `flex: 1` lại chia chiều DỌC: nút
   * "Cho phép camera" phình cao gần nửa màn hình, chữ trôi ra giữa khối cam.
   * Trông đúng như giao diện hỏng, dù bấm vẫn chạy.
   *
   * `flex: 0` trả nút về đúng chiều cao nội dung; `alignSelf: "stretch"` giữ nó
   * rộng hết dòng để vẫn dễ bấm; `maxWidth` chặn nút dài quá tay trên máy bảng.
   */
  stackedAction: { flex: 0, alignSelf: "stretch", maxWidth: 360, paddingVertical: 12 },
  primary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: c.amber,
    borderRadius: 10,
    paddingHorizontal: 15,
  },
  primaryText: { color: "#111827", fontSize: 12, fontWeight: "900" },
  secondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 15,
  },
  secondaryText: { color: c.text, fontSize: 12, fontWeight: "800" },
  returnField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  returnLabel: { flex: 1, color: c.text, fontSize: 12, fontWeight: "700" },
  returnInput: {
    width: 76,
    height: 42,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 9,
    backgroundColor: c.surface,
    color: c.text,
    textAlign: "center",
  },
  bulkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 11,
  },
  stepper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperText: { color: c.text, fontSize: 18, fontWeight: "800" },
  stepperValue: {
    width: 28,
    color: c.text,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
  },
  scanner: { flex: 1, backgroundColor: "#000" },
  scannerOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    padding: 24,
  },
  scannerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 22,
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: c.amber,
    borderRadius: 20,
    marginBottom: 24,
  },
  scannerClose: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  scannerCloseText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});

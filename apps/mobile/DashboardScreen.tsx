import { useNetInfo } from "@react-native-community/netinfo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { io, type Socket } from "socket.io-client";
import {
  fetchFirstWarehouse,
  fetchDailyBriefing,
  fetchOpenIncidents,
  fetchWarehouseBatches,
  fetchWarehouseInsights,
  fetchWarehouseReadiness,
  fetchWarehouses,
  type AuthUser,
  type IncidentSummary,
  type InventoryBatch,
  type DailyBriefing,
  type ReadinessComponentKey,
  type WarehouseReadiness,
  type WarehouseSummary,
  type WarehouseInsights,
} from "./api";
import { requireApiBase } from "./config";
import { buildInventorySummary } from "./dashboard-state";
import { splitBriefingSentences } from "@safestock/shared-types";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";
import { mobileRoleLabel } from "./role-labels";
import { c } from "./styles";

interface DashboardSnapshot {
  warehouse: WarehouseSummary;
  readiness: WarehouseReadiness;
  batches: InventoryBatch[];
  incidents: IncidentSummary[];
  insights?: WarehouseInsights;
  briefing?: DailyBriefing;
}

const COMPONENT_LABELS: Record<ReadinessComponentKey, string> = {
  quantityAvailability: "Số lượng khả dụng",
  itemCondition: "Tình trạng vật tư",
  expiry: "Hạn sử dụng",
  accessibility: "Khả năng tiếp cận",
  environment: "Môi trường bảo quản",
  dataReliability: "Độ tin cậy dữ liệu",
};

const STATUS_META = {
  READY: { label: "Sẵn sàng điều phối", color: "#15803d", tint: "#EAF7EE" },
  NEEDS_ACTION: { label: "Cần xử lý", color: "#C55A06", tint: "#FFF1E5" },
  NOT_DISPATCHABLE: {
    label: "Chưa thể điều phối",
    color: "#DC2626",
    tint: "#FEECEC",
  },
} as const;

export function DashboardScreen({
  token,
  user,
  view,
}: {
  token: string;
  user: AuthUser;
  view: "home" | "readiness";
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseSummary[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    user.warehouseId ?? null,
  );
  const netInfo = useNetInfo();
  const snapshotRef = useRef<DashboardSnapshot | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (options?: { refresh?: boolean; skipCache?: boolean }) => {
      const isRefresh = options?.refresh === true;
      if (isRefresh) setRefreshing(true);
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
              throw new Error("Đơn vị chưa có kho để theo dõi.");
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

        const activeWarehouseId = warehouse.id;
        const cacheScope = `operations-dashboard:${activeWarehouseId}`;
        if (!options?.skipCache && !snapshotRef.current) {
          try {
            const cached = await readOfflineCache<DashboardSnapshot>(user.id, cacheScope);
            if (cached) {
              hasCachedData = true;
              snapshotRef.current = cached.data;
              setSnapshot(cached.data);
              setCacheStoredAt(cached.storedAt);
              setLoading(false);
            }
          } catch {
            // Cache lỗi không được biến thành trạng thái thành công; tiếp tục tải live.
          }
        }
        const [readiness, batches, incidents, insights] = await Promise.all([
          fetchWarehouseReadiness(token, activeWarehouseId),
          fetchWarehouseBatches(token, activeWarehouseId),
          fetchOpenIncidents(token, activeWarehouseId),
          fetchWarehouseInsights(token, activeWarehouseId),
        ]);
        const live: DashboardSnapshot = {
          warehouse,
          readiness,
          batches,
          incidents,
          insights,
          briefing:
            snapshotRef.current?.warehouse.id === warehouse.id
              ? snapshotRef.current.briefing
              : undefined,
        };
        snapshotRef.current = live;
        setSnapshot(live);
        setCacheStoredAt(null);
        await writeOfflineCache(user.id, cacheScope, live);
        void fetchDailyBriefing(token, activeWarehouseId)
          .then(async (briefing) => {
            if (snapshotRef.current?.warehouse.id !== activeWarehouseId) return;
            const enriched = { ...snapshotRef.current, briefing };
            snapshotRef.current = enriched;
            setSnapshot(enriched);
            await writeOfflineCache(user.id, cacheScope, enriched);
          })
          .catch(() => {
            // Bản tin là lớp bổ sung; dashboard rule-based vẫn phải tải được.
          });
      } catch (loadError) {
        setError(
          hasCachedData
            ? "Không kết nối được ungphonhanh.life. Đang hiển thị bản lưu chỉ đọc."
            : loadError instanceof Error
              ? loadError.message
              : "Không tải được dashboard vận hành",
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
    if (warehouseId === selectedWarehouseId) return;
    snapshotRef.current = null;
    setSnapshot(null);
    setCacheStoredAt(null);
    setError(null);
    setLoading(true);
    setSelectedWarehouseId(warehouseId);
    void writeOfflineCache(user.id, "warehouse-selection", {
      warehouseId,
    }).catch(() => {
      // Không chặn chọn kho nếu thiết bị không lưu được preference.
    });
  };

  useEffect(() => {
    let socketBase: string;
    try {
      socketBase = requireApiBase();
    } catch {
      return;
    }
    const socket = io(socketBase, {
      transports: ["websocket"],
      auth: { token },
    });
    socketRef.current = socket;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => void load({ skipCache: true }), 900);
    };
    socket.on("notification", scheduleRefresh);
    socket.on("sensor_event", scheduleRefresh);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [load, token]);

  if (loading && !snapshot) {
    return (
      <View style={local.center}>
        <ActivityIndicator color={c.amber} size="large" />
        <Text style={local.muted}>Đang tổng hợp dữ liệu vận hành…</Text>
      </View>
    );
  }

  if (!snapshot && user.role === "ADMIN" && warehouseOptions.length > 0) {
    return (
      <View style={local.chooserScreen}>
        <Text style={local.eyebrow}>PHẠM VI DASHBOARD</Text>
        <Text style={local.title}>Chọn kho cần theo dõi</Text>
        <Text style={local.chooserHint}>
          Readiness, cảnh báo, dự báo và bản tin AI chỉ lấy dữ liệu của kho đã chọn.
        </Text>
        {error ? <Text style={local.inlineError}>{error}</Text> : null}
        <View style={local.chooserList}>
          {warehouseOptions.map((warehouse) => (
            <Pressable
              accessibilityRole="button"
              key={warehouse.id}
              onPress={() => selectWarehouse(warehouse.id)}
              style={local.chooserOption}
            >
              <Text style={local.chooserOptionText}>{warehouse.name}</Text>
              <Text style={local.chooserLink}>Mở dashboard →</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={local.center}>
        <Text style={local.errorTitle}>Không tải được dashboard</Text>
        <Text style={local.muted}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void load({ skipCache: true })}
          style={local.retryButton}
        >
          <Text style={local.retryText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  const offline = Boolean(cacheStoredAt) || netInfo.isConnected === false;
  return (
    <ScrollView
      style={local.screen}
      contentContainerStyle={local.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={c.amber}
          onRefresh={() => void load({ refresh: true, skipCache: true })}
        />
      }
    >
      <View style={local.heading}>
        <View style={{ flex: 1 }}>
          <Text style={local.eyebrow}>
            {view === "home" ? "TRUNG TÂM VẬN HÀNH" : "MỨC SẴN SÀNG"}
          </Text>
          <Text style={local.title}>
            {view === "home" ? `Chào ${mobileRoleLabel(user.role)}` : snapshot.warehouse.name}
          </Text>
          <Text style={local.subtitle}>
            {view === "home"
              ? snapshot.warehouse.name
              : snapshot.readiness.isStale
                ? `Dữ liệu readiness đã cũ · ${formatDateTime(snapshot.readiness.computedAt)}`
                : `Cập nhật ${formatDateTime(snapshot.readiness.computedAt)}`}
          </Text>
        </View>
        <View style={local.liveBadge}>
          <View style={[local.liveDot, { backgroundColor: offline ? c.amber : c.green }]} />
          <Text style={local.liveText}>{offline ? "BẢN LƯU" : "LIVE"}</Text>
        </View>
      </View>

      {offline ? (
        <View style={local.offlineBanner} accessibilityRole="alert">
          <Text style={local.offlineTitle}>Ngoại tuyến · chỉ đọc</Text>
          <Text style={local.offlineText}>
            {cacheStoredAt
              ? `Dữ liệu lưu lúc ${formatDateTime(cacheStoredAt)}`
              : "Thiết bị chưa kết nối được ungphonhanh.life."}
          </Text>
        </View>
      ) : null}
      {error && snapshot ? <Text style={local.inlineError}>{error}</Text> : null}

      {/* `flexGrow: 0` KHÔNG phải trang trí: ScrollView của react-native-web mặc
          định là `flexGrow: 1`, nên hàng chip nằm trong màn hình `flex: 1` sẽ
          phình ra chiếm hết chỗ trống theo chiều dọc. Cộng với `alignItems`
          mặc định là `stretch`, mỗi chip cao bằng cả vùng đó — mà `borderRadius:
          999` biến nó thành một hình bầu dục to bằng nửa màn hình. */}
      {user.role === "ADMIN" && warehouseOptions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={local.chipScroller}
          contentContainerStyle={local.warehouseChips}
        >
          {warehouseOptions.map((warehouse) => (
            <Pressable
              accessibilityRole="button"
              key={warehouse.id}
              onPress={() => selectWarehouse(warehouse.id)}
              style={[
                local.warehouseChip,
                warehouse.id === snapshot.warehouse.id && local.warehouseChipActive,
              ]}
            >
              <Text
                style={[
                  local.warehouseChipText,
                  warehouse.id === snapshot.warehouse.id && local.warehouseChipTextActive,
                ]}
              >
                {warehouse.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {view === "home" ? (
        <HomeDashboard snapshot={snapshot} />
      ) : (
        <ReadinessDashboard readiness={snapshot.readiness} />
      )}
    </ScrollView>
  );
}

function HomeDashboard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const summary = useMemo(() => buildInventorySummary(snapshot.batches), [snapshot.batches]);
  const readiness = snapshot.readiness;
  const status = STATUS_META[readiness.operationalStatus];

  return (
    <>
      <View style={[local.hero, { borderColor: status.color }]}>
        <View style={local.scoreBlock}>
          <Text style={[local.score, { color: status.color }]}>{Math.round(readiness.score)}</Text>
          <Text style={local.scoreUnit}>/100</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={local.heroLabel}>TRẠNG THÁI TOÀN KHO</Text>
          <Text style={[local.heroStatus, { color: status.color }]}>{status.label}</Text>
          <Text style={local.heroNote}>
            {readiness.blockers.length > 0
              ? `${readiness.blockers.length} điểm chặn cần xử lý`
              : "Không có điểm chặn điều phối đang mở"}
          </Text>
        </View>
      </View>

      <Text style={local.sectionTitle}>Tổng quan hôm nay</Text>
      <View style={local.metricGrid}>
        <Metric label="Mã vật tư" value={summary.skus} note={`${summary.batches} lô`} />
        <Metric label="Tổng số lượng" value={summary.quantity} note="đơn vị trong kho" />
        <Metric
          label="Cảnh báo mở"
          value={snapshot.incidents.length}
          note={highestSeverity(snapshot.incidents)}
          danger={snapshot.incidents.length > 0}
        />
        <Metric
          label="Lô cần chú ý"
          value={summary.damagedBatches + summary.expiringSoonBatches}
          note={`${summary.damagedBatches} hỏng · ${summary.expiringSoonBatches} gần hạn`}
          danger={summary.damagedBatches > 0}
        />
      </View>

      <ReadinessHighlights readiness={readiness} />

      {snapshot.briefing ? (
        <>
          <Text style={local.sectionTitle}>Bản tin đầu ngày</Text>
          <View style={local.aiCard}>
            <View style={local.aiHeader}>
              {/* Chỉ gắn nhãn khi KHÔNG phải AI viết. Nhãn hiện mọi lúc thì thành
                  nền, không ai đọc; còn lúc rơi về bản mẫu mới là tin phải nói,
                  vì câu chữ khô hơn hẳn. */}
              {snapshot.briefing.source === "AI" ? (
                <View />
              ) : (
                <Text style={local.aiBadge}>DỰ PHÒNG</Text>
              )}
              <Text style={local.aiTime}>{formatDateTime(snapshot.briefing.generatedAt)}</Text>
            </View>
            {/* Mỗi câu một dòng, không phải một đoạn liền: bản tin gộp bốn mảng
                vận hành (sẵn sàng, mưa, tồn kho, sự cố) nên đọc đoạn liền phải tự
                dò câu nào nói chuyện gì. Cắt bằng hàm dùng chung với web. */}
            {splitBriefingSentences(snapshot.briefing.narrative).map((sentence) => (
              <View key={sentence} style={local.aiLine}>
                <Text style={local.aiBullet}>–</Text>
                <Text style={local.aiNarrative}>{sentence}</Text>
              </View>
            ))}
            {snapshot.briefing.priorities.slice(0, 3).map((priority) => (
              <Text key={priority} style={local.aiPriority}>
                • {priority}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {snapshot.insights?.weatherAlert ? (
        <>
          <Text style={local.sectionTitle}>Dự báo mưa 72 giờ</Text>
          <View
            style={[
              local.weatherCard,
              snapshot.insights.weatherAlert.alert && { borderColor: c.red },
            ]}
          >
            <Text style={local.weatherValue}>
              {snapshot.insights.weatherAlert.totalRainMm.toFixed(1)} mm
            </Text>
            <Text style={local.weatherNote}>
              {snapshot.insights.weatherAlert.alert
                ? `${snapshot.insights.weatherDemand.filter((item) => item.atRisk).length} mặt hàng có nguy cơ thiếu do nhu cầu tăng`
                : "Chưa chạm ngưỡng nhân hệ số nhu cầu 100 mm/72 giờ"}
            </Text>
          </View>
        </>
      ) : null}

      <Text style={local.sectionTitle}>Cảnh báo ưu tiên</Text>
      {snapshot.incidents.length === 0 ? (
        <EmptyState text="Không có cảnh báo đang mở tại kho này." />
      ) : (
        snapshot.incidents.slice(0, 4).map((incident) => (
          <View key={incident.id} style={local.alertRow}>
            <View
              style={[local.severityMark, { backgroundColor: severityColor(incident.severity) }]}
            />
            <View style={{ flex: 1 }}>
              <Text style={local.rowTitle}>{incident.title}</Text>
              <Text style={local.rowMeta}>
                {incident.kind} · {incident.severity} · {formatDateTime(incident.detectedAt)}
              </Text>
            </View>
          </View>
        ))
      )}
    </>
  );
}

function ReadinessDashboard({ readiness }: { readiness: WarehouseReadiness }) {
  const status = STATUS_META[readiness.operationalStatus];
  const dimensions =
    readiness.dimensions.length > 0
      ? readiness.dimensions
      : readiness.components.map((component) => ({
          key: component.key,
          status:
            component.value >= 80
              ? ("READY" as const)
              : component.value >= 50
                ? ("NEEDS_ACTION" as const)
                : ("NOT_DISPATCHABLE" as const),
          referenceScore: component.value,
          reasons: component.reasons,
          recommendedAction: null,
        }));

  return (
    <>
      <View style={[local.readinessSummary, { backgroundColor: status.tint }]}>
        <Text style={[local.bigScore, { color: status.color }]}>{Math.round(readiness.score)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[local.heroStatus, { color: status.color }]}>{status.label}</Text>
          <Text style={local.heroNote}>Điểm tham khảo không được vượt qua điểm chặn vận hành.</Text>
        </View>
      </View>

      {readiness.blockers.length > 0 ? (
        <>
          <Text style={local.sectionTitle}>Điểm chặn điều phối</Text>
          {readiness.blockers.map((blocker) => (
            <View key={`${blocker.code}-${blocker.title}`} style={local.blocker}>
              <Text style={local.blockerTitle}>{blocker.title}</Text>
              {blocker.reasons.map((reason) => (
                <Text key={reason} style={local.blockerReason}>
                  • {reason}
                </Text>
              ))}
            </View>
          ))}
        </>
      ) : null}

      <Text style={local.sectionTitle}>Sáu thành phần</Text>
      {dimensions.map((dimension) => {
        const meta = STATUS_META[dimension.status];
        const score = Math.max(0, Math.min(100, dimension.referenceScore));
        return (
          <View key={dimension.key} style={local.dimension}>
            <View style={local.dimensionHead}>
              <Text style={local.dimensionName}>{COMPONENT_LABELS[dimension.key]}</Text>
              <Text style={[local.dimensionScore, { color: meta.color }]}>{Math.round(score)}</Text>
            </View>
            <View style={local.track}>
              <View style={[local.fill, { width: `${score}%`, backgroundColor: meta.color }]} />
            </View>
            {dimension.reasons.slice(0, 2).map((reason) => (
              <Text key={reason} style={local.reason}>
                {reason}
              </Text>
            ))}
            {dimension.recommendedAction ? (
              <Text style={local.action}>{dimension.recommendedAction}</Text>
            ) : null}
          </View>
        );
      })}

      <Text style={local.sectionTitle}>Việc nên làm tiếp</Text>
      {readiness.recommendedActions.length === 0 ? (
        <EmptyState text="Không có khuyến nghị mới." />
      ) : (
        readiness.recommendedActions.map((action, index) => (
          <View key={`${index}-${action}`} style={local.recommendation}>
            <Text style={local.recommendationIndex}>{index + 1}</Text>
            <Text style={local.recommendationText}>{action}</Text>
          </View>
        ))
      )}
    </>
  );
}

function ReadinessHighlights({ readiness }: { readiness: WarehouseReadiness }) {
  const weakest = [...readiness.components]
    .sort((left, right) => left.value - right.value)
    .slice(0, 3);
  return (
    <>
      <Text style={local.sectionTitle}>Thành phần cần chú ý</Text>
      {weakest.map((component) => (
        <View key={component.key} style={local.compactDimension}>
          <Text style={local.compactLabel}>{COMPONENT_LABELS[component.key]}</Text>
          <View style={local.compactTrack}>
            <View
              style={[
                local.fill,
                {
                  width: `${Math.max(0, Math.min(100, component.value))}%`,
                  backgroundColor:
                    component.value >= 80 ? c.green : component.value >= 50 ? c.amber : c.red,
                },
              ]}
            />
          </View>
          <Text style={local.compactScore}>{Math.round(component.value)}</Text>
        </View>
      ))}
    </>
  );
}

function Metric({
  label,
  value,
  note,
  danger = false,
}: {
  label: string;
  value: number;
  note: string;
  danger?: boolean;
}) {
  return (
    <View style={local.metric}>
      <Text style={local.metricLabel}>{label}</Text>
      <Text style={[local.metricValue, danger && { color: c.red }]}>{value}</Text>
      <Text style={local.metricNote}>{note}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={local.empty}>
      <Text style={local.muted}>{text}</Text>
    </View>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "không rõ"
    : date.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      });
}

function severityColor(severity: IncidentSummary["severity"]): string {
  if (severity === "CRITICAL") return "#dc2626";
  if (severity === "HIGH") return "#f97316";
  if (severity === "MEDIUM") return "#f59e0b";
  return "#38bdf8";
}

function highestSeverity(incidents: IncidentSummary[]): string {
  const order: IncidentSummary["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  return (
    order.find((severity) => incidents.some((incident) => incident.severity === severity)) ??
    "không có"
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 108 },
  chooserScreen: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: c.bg,
  },
  chooserHint: {
    color: c.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 18,
  },
  chooserList: { gap: 10 },
  chooserOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 13,
    padding: 15,
  },
  chooserOptionText: {
    flex: 1,
    color: c.text,
    fontSize: 14,
    fontWeight: "800",
  },
  chooserLink: { color: c.amber, fontSize: 12, fontWeight: "800" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 28,
    backgroundColor: c.bg,
  },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  eyebrow: {
    color: c.amber,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: { color: c.text, fontSize: 25, fontWeight: "800", marginTop: 4 },
  subtitle: { color: c.muted, fontSize: 13, marginTop: 4 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: c.text, fontSize: 10, fontWeight: "800" },
  offlineBanner: {
    borderWidth: 1,
    borderColor: c.amber,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  offlineTitle: { color: c.amber, fontSize: 13, fontWeight: "800" },
  offlineText: { color: c.muted, fontSize: 12, marginTop: 3 },
  inlineError: { color: c.amber, fontSize: 12, marginBottom: 12 },
  /** Xem ghi chú ở `InventoryScreen`: ScrollView web mặc định `flexGrow: 1`. */
  chipScroller: { flexGrow: 0, flexShrink: 0 },
  warehouseChips: { alignItems: "center", gap: 8, paddingBottom: 12 },
  warehouseChip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  warehouseChipActive: {
    borderColor: c.amber,
    backgroundColor: "rgba(245,158,11,0.1)",
  },
  warehouseChipText: { color: c.muted, fontSize: 11, fontWeight: "700" },
  warehouseChipTextActive: { color: c.amber },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderRadius: 16,
    padding: 18,
  },
  scoreBlock: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 7,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  score: { fontSize: 33, lineHeight: 37, fontWeight: "900" },
  scoreUnit: { color: c.muted, fontSize: 11, fontWeight: "700" },
  heroLabel: { color: c.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroStatus: { fontSize: 20, fontWeight: "900", marginTop: 4 },
  heroNote: { color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  sectionTitle: {
    color: c.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 24,
    marginBottom: 10,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metric: {
    width: "48%",
    minHeight: 110,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 14,
  },
  metricLabel: { color: c.muted, fontSize: 11, fontWeight: "700" },
  metricValue: { color: c.text, fontSize: 29, fontWeight: "900", marginTop: 8 },
  metricNote: { color: c.muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  compactDimension: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  compactLabel: { color: c.muted, fontSize: 12, width: 128 },
  compactTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.surfaceAlt,
    overflow: "hidden",
  },
  compactScore: {
    width: 28,
    textAlign: "right",
    color: c.text,
    fontSize: 12,
    fontWeight: "800",
  },
  fill: { height: "100%", borderRadius: 5 },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 13,
  },
  severityMark: { width: 5, height: 38, borderRadius: 3 },
  rowTitle: { color: c.text, fontSize: 14, fontWeight: "700" },
  rowMeta: { color: c.muted, fontSize: 11, marginTop: 4 },
  aiCard: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.amber,
    borderRadius: 14,
    padding: 15,
  },
  aiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  aiBadge: { color: c.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  aiTime: { color: c.muted, fontSize: 10 },
  // flex: 1 để câu dài tự xuống dòng THẲNG HÀNG dưới chữ đầu, không thụt về sát
  // gạch đầu dòng — thiếu nó là mỗi dòng gãy một kiểu, nhìn như lỗi.
  aiLine: { flexDirection: "row", gap: 8, marginBottom: 6 },
  aiBullet: { color: c.muted, fontSize: 13, lineHeight: 20 },
  aiNarrative: { color: c.text, flex: 1, fontSize: 13, lineHeight: 20 },
  aiPriority: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  weatherCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 15,
  },
  weatherValue: { color: c.text, fontSize: 28, fontWeight: "900" },
  weatherNote: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  readinessSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderRadius: 16,
    padding: 18,
  },
  bigScore: { fontSize: 52, fontWeight: "900" },
  blocker: {
    borderWidth: 1,
    borderColor: c.red,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 13,
    padding: 14,
    marginBottom: 10,
  },
  blockerTitle: { color: c.red, fontSize: 14, fontWeight: "800" },
  blockerReason: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  dimension: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  dimensionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dimensionName: { color: c.text, fontSize: 14, fontWeight: "700" },
  dimensionScore: { fontSize: 18, fontWeight: "900" },
  track: {
    height: 8,
    borderRadius: 5,
    backgroundColor: c.surfaceAlt,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 8,
  },
  reason: { color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  action: { color: c.amber, fontSize: 11, lineHeight: 16, marginTop: 7 },
  recommendation: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 13,
    marginBottom: 8,
  },
  recommendationIndex: {
    color: "#111827",
    backgroundColor: c.amber,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "900",
  },
  recommendationText: {
    flex: 1,
    color: c.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
  },
  muted: { color: c.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorTitle: { color: c.text, fontSize: 18, fontWeight: "800" },
  retryButton: {
    backgroundColor: c.amber,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: { color: "#111827", fontSize: 13, fontWeight: "800" },
});

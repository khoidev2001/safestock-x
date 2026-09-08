import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchMissions, type AuthUser, type MissionDetail } from "./api";
import { MissionSummaryCard } from "./MissionSummaryCard";
import {
  filterMissionsByNo,
  groupMissionsForFieldForce,
  missionPlaceLabel,
  missionStageForViewer,
  sortMissionsForFieldForce,
} from "./mission-state";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";
import { c, styles } from "./styles";

/**
 * Tab Nhiệm vụ — CHỈ danh sách nhiệm vụ, dùng chung cho trưởng thôn và đội cứu hộ.
 *
 * Trước đây muốn xem "tôi đang có nhiệm vụ nào" thì phải vào hộp Thông báo và tự
 * lọc bằng mắt: ở đó nhiệm vụ nằm lẫn với cảnh báo tồn kho, báo cáo kiểm kê và mọi
 * mẩu tin khác, mà mỗi nhiệm vụ lại sinh ra vài ba thông báo nên cùng một việc hiện
 * lên nhiều lần. Danh sách này lấy thẳng từ nhiệm vụ: mỗi việc đúng một dòng, và
 * dòng đó luôn nói trạng thái HIỆN TẠI chứ không phải trạng thái lúc tin được gửi.
 *
 * Thẻ vẽ y hệt thẻ trong hộp Thông báo (`MissionSummaryCard`) — người dùng đã quen
 * mắt với nó, đổi kiểu ở đây là bắt họ học lại từ đầu ở màn thứ hai.
 */
export function MissionListScreen({
  token,
  user,
  onOpenMission,
}: {
  token: string;
  user: AuthUser;
  onOpenMission: (missionId: string) => void;
}) {
  const [missions, setMissions] = useState<MissionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /**
   * Nhiệm vụ vừa mở, ghim lên đầu danh sách.
   *
   * Giữ trong bộ lưu chứ không chỉ trong bộ nhớ: người trực mở nhiệm vụ rồi tắt
   * app đút túi đi làm, mở lại vẫn phải thấy đúng việc đang dở ở ngay trên cùng.
   */
  const [lastViewedId, setLastViewedId] = useState<string | null>(null);
  /**
   * Ngăn đang mở. Chỉ đội cứu hộ có hai ngăn — xem `fieldForce` bên dưới.
   *
   * Mặc định là "đang thực hiện": mở app lên giữa đợt lũ thì việc đang chạy mới
   * là thứ phải thấy, còn nhiệm vụ đã đóng là thứ người ta chủ động đi tìm.
   */
  const [tab, setTab] = useState<"active" | "done">("active");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await readOfflineCache<{ missionId: string }>(
          user.id,
          "mission-last-viewed",
        );
        if (active && stored?.data.missionId) setLastViewedId(stored.data.missionId);
      } catch {
        // Không đọc được thì chỉ mất phần ghim, danh sách vẫn dùng bình thường.
      }
    })();
    return () => {
      active = false;
    };
  }, [user.id]);

  /** Mở một nhiệm vụ: nhớ lại để lần sau nó nằm trên cùng. */
  function openMission(missionId: string) {
    setLastViewedId(missionId);
    void writeOfflineCache(user.id, "mission-last-viewed", { missionId }).catch(() => undefined);
    onOpenMission(missionId);
  }

  const load = useCallback(async () => {
    let hasCache = false;
    try {
      const cached = await readOfflineCache<MissionDetail[]>(user.id, "missions");
      if (cached) {
        hasCache = true;
        setMissions(cached.data);
        setCacheStoredAt(cached.storedAt);
        setLoading(false);
      }
    } catch {
      // Bản lưu hỏng chỉ làm mất tiện lợi; vẫn tải bản mới bên dưới.
    }

    try {
      const live = await fetchMissions(token);
      setMissions(live);
      setCacheStoredAt(null);
      setError(null);
      await writeOfflineCache(user.id, "missions", live);
    } catch (loadError) {
      setError(
        hasCache
          ? "Chưa kết nối được ungphonhanh.life. Đang xem bản lưu chỉ đọc."
          : loadError instanceof Error
            ? loadError.message
            : "Không tải được danh sách nhiệm vụ",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    Xếp lúc VẼ, không phải lúc tải.
    
    Nhiệm vụ vừa xem đọc từ bộ lưu nên tới sau danh sách; xếp ngay lúc tải thì
    phần ghim chưa có gì để ghim, và thẻ chỉ nhảy lên đầu ở lần tải sau.
  */
  const ordered = useMemo(
    () => sortMissionsForFieldForce(missions, { pinnedMissionId: lastViewedId }),
    [missions, lastViewedId],
  );
  const matching = filterMissionsByNo(ordered, query);
  /**
   * Chia ngăn CHỈ cho đội cứu hộ.
   *
   * Thủ kho đọc danh sách này theo phiếu của kho mình, và một nhiệm vụ đã đóng
   * với họ chẳng khác gì một nhiệm vụ đã xuất xong — không có nút nào phải bấm
   * thêm. Ngăn "chưa trả vật tư" là việc của bên đang cầm hàng.
   */
  const fieldForce = user.role === "RESCUE";
  const groups = useMemo(() => groupMissionsForFieldForce(matching), [matching]);
  const shown = !fieldForce
    ? matching
    : tab === "active"
      ? groups.active
      : [...groups.awaitingReturn, ...groups.settled];
  const offline = cacheStoredAt !== null;

  /** Một thẻ nhiệm vụ — dựng ở một chỗ vì hai nhánh vẽ bên dưới cùng dùng. */
  const renderMission = (mission: MissionDetail) => (
    <MissionSummaryCard
      key={mission.id}
      missionNo={mission.missionNo}
      incidentType={mission.incidentType}
      affectedPeople={mission.affectedPeople}
      place={missionPlaceLabel(mission)}
      createdAt={mission.createdAt}
      role={user.role}
      // Chặng tính theo VAI: đội cứu hộ đọc chặng chung, trưởng thôn chỉ đọc
      // phiếu của chính kho mình — xem `missionStageForViewer`.
      stage={missionStageForViewer(mission, user.role, user.warehouseId)}
      justViewed={mission.id === lastViewedId}
      onPress={() => openMission(mission.id)}
    />
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {/* `flex: 1` + `minWidth: 0` để khối chữ co lại được, không đè khối bên phải. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.title}>
            Danh sách nhiệm vụ
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {loading
              ? "Đang tải…"
              : query.trim().length > 0
                ? `${shown.length}/${missions.length} nhiệm vụ khớp từ khoá`
                : `${missions.length} nhiệm vụ`}
          </Text>
        </View>
      </View>

      {/* Hai ngăn cho đội cứu hộ: việc đang chạy và việc đã đóng.
          Không dùng cho thủ kho — với họ một nhiệm vụ đã đóng không còn nút nào
          để bấm, nên tách ra chỉ thêm một cú chạm mà không thêm câu trả lời nào. */}
      {fieldForce ? (
        <View style={local.tabs}>
          <TabButton
            label="Đang thực hiện"
            count={groups.active.length}
            active={tab === "active"}
            onPress={() => setTab("active")}
          />
          <TabButton
            label="Đã hoàn thành"
            count={groups.awaitingReturn.length + groups.settled.length}
            // Còn khoản nợ nào là chấm nhắc trên đầu ngăn: đây là việc duy nhất
            // còn treo sau khi nhiệm vụ đã đóng, mà nó lại nằm ở ngăn người ta
            // không mở tới.
            badge={groups.awaitingReturn.length}
            active={tab === "done"}
            onPress={() => setTab("done")}
          />
        </View>
      ) : null}

      {/* Tìm theo SỐ HIỆU. Người trực nhớ việc bằng số — "nhiệm vụ 193 sao rồi" —
          chứ không nhớ nó nằm ở dòng thứ mấy. Chỉ hiện khi đã có nhiệm vụ: một ô
          tìm trên danh sách trống chỉ tổ làm người dùng tưởng mình đang lọc mất
          thứ gì đó. */}
      {missions.length > 0 ? (
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color={c.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            // Bàn phím số: từ khoá ở đây luôn là con số, mở sẵn bàn phím chữ là
            // bắt người đang vội bấm thêm một nhát để chuyển.
            keyboardType="number-pad"
            placeholder="Tìm theo số nhiệm vụ (vd: 193)"
            placeholderTextColor={c.muted}
            accessibilityLabel="Tìm nhiệm vụ theo số hiệu"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Xoá từ khoá"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {offline ? (
        <View style={local.offline} accessibilityRole="alert">
          <Text style={local.offlineTitle}>Ngoại tuyến · chỉ đọc</Text>
          <Text style={local.offlineText}>Đang xem bản lưu lần cuối tải được.</Text>
        </View>
      ) : null}
      {error ? <Text style={local.error}>{error}</Text> : null}

      <ScrollView
        contentContainerStyle={local.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {!loading && missions.length === 0 ? (
          <Text style={local.empty}>Chưa có nhiệm vụ nào.</Text>
        ) : null}
        {/* Lọc xong không còn gì thì nói rõ là do TỪ KHOÁ, đừng dùng chung câu
            "chưa có nhiệm vụ nào" — hai tình huống ấy đòi hai hành động khác hẳn. */}
        {!loading && missions.length > 0 && shown.length === 0 ? (
          <Text style={local.empty}>Không có nhiệm vụ nào mang số “{query.trim()}”.</Text>
        ) : null}

        {/* Ngăn "đã hoàn thành" chia làm hai đống có tiêu đề.
            CHƯA TRẢ VẬT TƯ lên trước vì nó vẫn là việc phải làm — đó là lý do
            ngăn này đáng mở ra. Trộn chung thì khoản nợ nằm lẫn giữa hàng chục
            nhiệm vụ đã xong hẳn và không ai tìm thấy nó nữa. */}
        {fieldForce && tab === "done" ? (
          <>
            <MissionGroup
              title={`Chưa trả vật tư (${groups.awaitingReturn.length})`}
              hint="Chở phần còn giữ về kho; người giữ kho bấm xác nhận sau khi đếm lại hàng."
              tone={c.amber}
              missions={groups.awaitingReturn}
              emptyText="Không còn khoản vật tư nào đang nợ kho."
              renderMission={renderMission}
            />
            <MissionGroup
              title={`Đã trả đủ vật tư (${groups.settled.length})`}
              missions={groups.settled}
              emptyText="Chưa có nhiệm vụ nào đóng hẳn."
              renderMission={renderMission}
            />
          </>
        ) : (
          shown.map(renderMission)
        )}
      </ScrollView>
    </View>
  );
}

/** Một ngăn ở đầu danh sách: tên, số lượng, và chấm nhắc khi còn việc treo. */
function TabButton({
  label,
  count,
  badge = 0,
  active,
  onPress,
}: {
  label: string;
  count: number;
  /** Số việc còn phải bấm trong ngăn này; 0 thì không vẽ chấm. */
  badge?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[local.tab, active && local.tabActive]}
    >
      <Text style={active ? local.tabTextActive : local.tabText}>
        {label} ({count})
      </Text>
      {badge > 0 ? (
        <View style={local.tabBadge}>
          <Text style={local.tabBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Một đống nhiệm vụ có tiêu đề, trong ngăn "đã hoàn thành". */
function MissionGroup({
  title,
  hint,
  tone,
  missions,
  emptyText,
  renderMission,
}: {
  title: string;
  hint?: string;
  tone?: string;
  missions: MissionDetail[];
  emptyText: string;
  renderMission: (mission: MissionDetail) => React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text style={[local.groupTitle, tone ? { color: tone } : null]}>{title}</Text>
        {hint ? <Text style={local.groupHint}>{hint}</Text> : null}
      </View>
      {missions.length === 0 ? (
        <Text style={local.groupEmpty}>{emptyText}</Text>
      ) : (
        missions.map(renderMission)
      )}
    </View>
  );
}

const local = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  tabActive: { backgroundColor: c.primary, borderColor: c.primary },
  tabText: { color: c.text, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  tabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: c.amber,
    alignItems: "center",
  },
  tabBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  groupTitle: { color: c.text, fontSize: 14, fontWeight: "800" },
  groupHint: { color: c.muted, fontSize: 12, marginTop: 2 },
  groupEmpty: { color: c.muted, fontSize: 13, paddingVertical: 8 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  offline: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: c.amberSoft,
    borderWidth: 1,
    borderColor: c.amber,
  },
  offlineTitle: { color: c.amber, fontWeight: "700", fontSize: 14 },
  offlineText: { color: c.text, fontSize: 13, marginTop: 2 },
  error: { color: c.red, fontSize: 13, paddingHorizontal: 16, paddingTop: 12 },
  empty: { color: c.muted, fontSize: 14, textAlign: "center", paddingVertical: 32 },
});

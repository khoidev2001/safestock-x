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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await readOfflineCache<{ missionId: string }>(user.id, "mission-last-viewed");
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
  const shown = filterMissionsByNo(ordered, query);
  const offline = cacheStoredAt !== null;

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

        {shown.map((mission) => (
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
        ))}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
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

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
  missionStageOptions,
  sortMissionsForFieldForce,
  type MissionWorkStage,
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
  /** Mốc đang lọc; `null` là xem tất cả. */
  const [stageFilter, setStageFilter] = useState<MissionWorkStage | null>(null);
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
    () => sortMissionsForFieldForce(missions, { pinnedMissionId: lastViewedId, role: user.role }),
    [missions, lastViewedId, user.role],
  );
  /**
   * Mốc của từng nhiệm vụ, tính MỘT LẦN rồi dùng cho cả bộ lọc lẫn thẻ.
   *
   * Tính hai lần thì hàng nút lọc và thẻ bên dưới có thể đọc ra hai mốc khác nhau
   * cho cùng một nhiệm vụ — và người dùng sẽ thấy nút "Cần tới lấy (3)" mở ra hai
   * thẻ.
   */
  const stageByMission = useMemo(() => {
    const map = new Map<string, MissionWorkStage>();
    for (const mission of missions) {
      map.set(mission.id, missionStageForViewer(mission, user.role, user.warehouseId));
    }
    return map;
  }, [missions, user.role, user.warehouseId]);

  /** Số nhiệm vụ ở mỗi mốc — nút không có việc nào thì không bày ra. */
  const stageOptions = useMemo(() => {
    const counts = new Map<MissionWorkStage, number>();
    for (const stage of stageByMission.values()) {
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return missionStageOptions(user.role)
      .map((option) => ({ ...option, count: counts.get(option.stage) ?? 0 }))
      .filter((option) => option.count > 0);
  }, [stageByMission, user.role]);

  const byStage = stageFilter
    ? ordered.filter((mission) => stageByMission.get(mission.id) === stageFilter)
    : ordered;
  const shown = filterMissionsByNo(byStage, query);
  const offline = cacheStoredAt !== null;
  const activeStageLabel = stageFilter
    ? (stageOptions.find((option) => option.stage === stageFilter)?.label ?? null)
    : null;

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
              : query.trim().length > 0 || stageFilter
                ? `${shown.length}/${missions.length} nhiệm vụ đang hiện`
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

      {/* Lọc theo MỐC CÔNG VIỆC. Ô tìm ngay trên chỉ tìm được khi đã biết số hiệu;
          câu hỏi thường gặp hơn là "còn việc nào tới lượt tôi" — mà trả lời câu đó
          bằng cách đọc nhãn của sáu chục thẻ thì không ai làm.

          Chỉ hiện những mốc CÓ nhiệm vụ: một nút bấm vào ra danh sách rỗng là một
          nút nói dối, và hàng nút dài ra vô ích trên màn hình điện thoại. */}
      {stageOptions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={local.filterRow}
        >
          <FilterChip
            label="Tất cả"
            count={missions.length}
            active={stageFilter === null}
            onPress={() => setStageFilter(null)}
          />
          {stageOptions.map((option) => (
            <FilterChip
              key={option.stage}
              label={option.label}
              count={option.count}
              active={stageFilter === option.stage}
              // Bấm lại đúng nút đang chọn = bỏ lọc. Không có đường này thì lối
              // duy nhất quay về "tất cả" là nhớ ra có nút "Tất cả" ở đầu hàng,
              // mà hàng này cuộn ngang nên nút đó thường đã trôi khỏi màn hình.
              onPress={() =>
                setStageFilter((current) => (current === option.stage ? null : option.stage))
              }
            />
          ))}
        </ScrollView>
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
          <Text style={local.empty}>
            {query.trim().length > 0
              ? `Không có nhiệm vụ nào mang số “${query.trim()}”${activeStageLabel ? ` ở mốc “${activeStageLabel}”` : ""}.`
              : `Không có nhiệm vụ nào ở mốc “${activeStageLabel ?? ""}”.`}
          </Text>
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
            stage={stageByMission.get(mission.id) ?? missionStageForViewer(mission, user.role, user.warehouseId)}
            justViewed={mission.id === lastViewedId}
            onPress={() => openMission(mission.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Một nút lọc: chữ mốc + số nhiệm vụ đang ở mốc đó. */
function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count} nhiệm vụ`}
      style={[local.chip, active && local.chipActive]}
    >
      <Text style={[local.chipText, active && local.chipTextActive]}>
        {label} ({count})
      </Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  filterRow: { paddingHorizontal: 16, paddingTop: 12, gap: 8, flexDirection: "row" },
  chip: {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
  chipText: { color: c.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: c.primary },
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

import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  completeMission,
  fetchMissions,
  type AuthUser,
  type DeliveryOutcome,
  type MissionDetail,
} from "./api";
import {
  fieldForceActionsFor,
  isMissionOpen,
  missionStatusLabel,
  sortMissionsForFieldForce,
} from "./mission-state";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";
import { c, styles } from "./styles";

const OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  DELIVERED: "Giao đủ",
  PARTIAL: "Giao một phần",
  FAILED: "Không giao được",
};

/**
 * Danh sách lệnh của lực lượng hiện trường.
 *
 * Đây là màn mở đầu sau khi đăng nhập: việc chính của họ là biết mình đang có
 * lệnh nào, chứ không phải đi tìm trong danh sách thông báo.
 */
export function MissionsScreen({
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    let hasCache = false;
    try {
      const cached = await readOfflineCache<MissionDetail[]>(user.id, "missions");
      if (cached) {
        hasCache = true;
        setMissions(sortMissionsForFieldForce(cached.data));
        setCacheStoredAt(cached.storedAt);
        setLoading(false);
      }
    } catch {
      // Bản lưu hỏng chỉ làm mất tiện lợi; vẫn tải bản mới bên dưới.
    }

    try {
      const live = await fetchMissions(token);
      setMissions(sortMissionsForFieldForce(live));
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

  const offline = cacheStoredAt !== null;

  async function runAction(missionId: string, action: () => Promise<unknown>, done: string) {
    setBusyId(missionId);
    try {
      await action();
      await load();
      Alert.alert("Đã ghi nhận", done);
    } catch (actionError) {
      Alert.alert(
        "Chưa gửi được",
        actionError instanceof Error ? actionError.message : "Vui lòng thử lại",
      );
    } finally {
      setBusyId(null);
    }
  }

  function askOutcome(missionId: string) {
    Alert.alert("Kết quả giao", "Chọn đúng tình hình thực tế tại điểm giao.", [
      {
        text: OUTCOME_LABEL.DELIVERED,
        onPress: () =>
          void runAction(
            missionId,
            () => completeMission(token, missionId, "DELIVERED"),
            "Đã báo giao đủ.",
          ),
      },
      {
        text: OUTCOME_LABEL.PARTIAL,
        onPress: () =>
          void runAction(
            missionId,
            () => completeMission(token, missionId, "PARTIAL"),
            "Đã báo giao một phần; kho giữ nguyên để đối soát.",
          ),
      },
      {
        text: OUTCOME_LABEL.FAILED,
        onPress: () =>
          void runAction(
            missionId,
            () => completeMission(token, missionId, "FAILED"),
            "Đã báo không giao được; vật tư hoàn về kho.",
          ),
      },
      { text: "Đóng", style: "cancel" },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Lệnh điều phối</Text>
          <Text style={styles.subtitle}>
            {loading
              ? "Đang tải…"
              : `${missions.filter((m) => isMissionOpen(m.status)).length} lệnh đang mở`}
          </Text>
        </View>
      </View>

      {offline ? (
        <View style={local.offline} accessibilityRole="alert">
          <Text style={local.offlineTitle}>Ngoại tuyến · chỉ đọc</Text>
          <Text style={local.offlineText}>
            Chưa báo được kết quả giao cho tới khi có mạng trở lại.
          </Text>
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
          <Text style={local.empty}>Chưa có lệnh nào được giao cho đội.</Text>
        ) : null}

        {missions.map((mission) => {
          const actions = offline ? [] : fieldForceActionsFor(mission.status);
          const busy = busyId === mission.id;
          return (
            <View key={mission.id} style={local.card}>
              <Pressable onPress={() => onOpenMission(mission.id)} accessibilityRole="button">
                <Text style={local.cardTitle}>{mission.incidentType}</Text>
                <Text style={local.cardMeta}>
                  {mission.location ?? "Chưa ghi địa điểm"} · {mission.affectedPeople} người
                </Text>
                <View style={local.statusRow}>
                  <View
                    style={[
                      local.statusDot,
                      { backgroundColor: isMissionOpen(mission.status) ? c.amber : c.muted },
                    ]}
                  />
                  <Text style={local.statusText}>{missionStatusLabel(mission.status)}</Text>
                </View>
              </Pressable>

              {actions.includes("complete") ? (
                <View style={local.actions}>
                  <Pressable
                    disabled={busy}
                    style={[local.button, local.buttonPrimary, busy && local.buttonDisabled]}
                    onPress={() => askOutcome(mission.id)}
                  >
                    <Text style={local.buttonText}>{busy ? "Đang gửi…" : "Báo kết quả giao"}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardTitle: { color: c.text, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: c.muted, fontSize: 13, marginTop: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: c.text, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: { backgroundColor: c.primary },
  buttonGhost: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  buttonGhostText: { color: c.text, fontSize: 15, fontWeight: "600" },
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

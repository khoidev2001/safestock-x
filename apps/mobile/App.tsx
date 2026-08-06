import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as ThanhTrangThaiHeDieuHanh,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { io, type Socket } from "socket.io-client";
import {
  ApiError,
  fetchNotifications,
  login,
  logout as revokeServerSession,
  refreshSession,
  type AuthUser,
  type LoginResult,
  type Notification,
} from "./api";
import { MissionDetailScreen } from "./MissionDetail";
import { ReportScreen } from "./ReportScreen";
import { DashboardScreen } from "./DashboardScreen";
import { InventoryScreen } from "./InventoryScreen";
import { MonthlyReportScreen } from "./MonthlyReportScreen";
import { requireApiBase } from "./config";
import { c, styles } from "./styles";
import { initialTabForRole, tabsForRole, type MobileTab } from "./dashboard-state";
import { MissionsScreen } from "./MissionsScreen";
import { clearStoredSession, loadStoredSession, saveStoredSession } from "./session-store";
import { clearOfflineCache, readOfflineCache, writeOfflineCache } from "./offline-cache";
import {
  assessDanger,
  disasterOf,
  formatShortTime,
  kindIcon,
  parseMissionSummary,
} from "./disaster";
import { mobileRoleLabel } from "./role-labels";

const brandLogo = require("./assets/brand/ung-pho-nhanh-logo.png");

/**
 * Khoảng chừa cho thanh trạng thái của điện thoại (giờ, sóng, pin).
 *
 * `SafeAreaView` của React Native **chỉ có tác dụng trên iOS**; trên Android nó
 * là một View bình thường, không chừa gì cả. Từ Android 15, app nhắm targetSdk 35
 * trở lên bị ép vẽ tràn viền, nên nội dung nằm THẲNG DƯỚI thanh trạng thái. Trên
 * màn hình Báo cáo tình huống, dòng "Báo cáo tình huống" và nút "Đăng xuất" bị
 * đồng hồ với biểu tượng sóng đè lên; ở các tab khác thì dải thông tin phiên mảnh
 * hơn nên lọt hẳn xuống dưới thanh trạng thái, mất tăm mà không ai để ý.
 *
 * Chừa ở lớp ngoài cùng nên mọi màn hình được sửa một lần, không phải đi vá từng
 * cái — và cái tiếp theo viết ra cũng đúng sẵn.
 */
const CHIEU_CAO_THANH_TRANG_THAI =
  Platform.OS === "android" ? (ThanhTrangThaiHeDieuHanh.currentHeight ?? 0) : 0;

export default function App() {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const refreshToken = session?.refreshToken;

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadStoredSession();
      if (!stored) {
        if (active) setRestoringSession(false);
        return;
      }
      try {
        const renewed = await refreshSession(stored.refreshToken);
        await saveStoredSession(renewed);
        if (active) setSession(renewed);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearStoredSession();
        } else if (active) {
          // Mất LAN khi mở app: giữ session đã lưu để đọc cache; mutation vẫn fail-closed.
          setSession(stored);
        }
      } finally {
        if (active) setRestoringSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!refreshToken) return;
    let refreshing = false;
    const renew = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const renewed = await refreshSession(refreshToken);
        await saveStoredSession(renewed);
        setSession(renewed);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearStoredSession();
          setSession(null);
        }
      } finally {
        refreshing = false;
      }
    };
    const interval = setInterval(() => void renew(), 12 * 60 * 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void renew();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refreshToken]);

  async function handleLogin(result: LoginResult) {
    await saveStoredSession(result);
    setSession(result);
  }

  async function logout() {
    const userId = session?.user.id;
    const accessToken = session?.accessToken;
    // Thu hồi phiên phía máy chủ trước (tokenVersion++) để refresh token cũ hết hiệu lực.
    // Best-effort: mất mạng/hết hạn vẫn xoá sạch phiên cục bộ để không kẹt trên thiết bị.
    if (accessToken) {
      try {
        await revokeServerSession(accessToken);
      } catch {
        // Bỏ qua lỗi mạng — vẫn tiếp tục đăng xuất cục bộ.
      }
    }
    await clearStoredSession();
    if (userId) await clearOfflineCache(userId);
    setSession(null);
  }

  if (restoringSession) {
    return (
      <SafeAreaView style={[styles.screen, { paddingTop: CHIEU_CAO_THANH_TRANG_THAI }]}>
        <StatusBar style="dark" backgroundColor={c.bg} />
        <View style={styles.center}>
          <Image
            source={brandLogo}
            style={styles.restoreLogo}
            resizeMode="contain"
            accessibilityLabel="Logo Ứng phó nhanh"
          />
          <Text style={styles.emptyText}>Đang khôi phục phiên an toàn…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { paddingTop: CHIEU_CAO_THANH_TRANG_THAI }]}>
      <StatusBar style="dark" backgroundColor={c.bg} />
      {!session ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <MobileRoleShell token={session.accessToken} user={session.user} onLogout={logout} />
      )}
    </SafeAreaView>
  );
}

function MobileRoleShell({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: AuthUser;
  onLogout: () => void;
}) {
  const tabs = tabsForRole(user.role);
  const [tab, setTab] = useState<MobileTab>(() => initialTabForRole(user.role));
  const [missionFromList, setMissionFromList] = useState<string | null>(null);

  return (
    <View style={shellStyles.shell}>
      {tab !== "alerts" && tab !== "report" ? (
        <View style={shellStyles.sessionBar}>
          <Text style={shellStyles.sessionText} numberOfLines={1}>
            {user.fullName ?? user.email} · {mobileRoleLabel(user.role)}
          </Text>
          <Pressable onPress={onLogout} accessibilityRole="button">
            <Text style={shellStyles.logout}>Đăng xuất</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={shellStyles.content}>
        {missionFromList ? (
          <MissionDetailScreen
            token={token}
            userId={user.id}
            role={user.role}
            missionId={missionFromList}
            onBack={() => setMissionFromList(null)}
          />
        ) : tab === "home" ? (
          <DashboardScreen token={token} user={user} view="home" />
        ) : tab === "readiness" ? (
          <DashboardScreen token={token} user={user} view="readiness" />
        ) : tab === "inventory" ? (
          <InventoryScreen token={token} user={user} />
        ) : tab === "monthly-report" ? (
          <MonthlyReportScreen token={token} user={user} />
        ) : tab === "missions" ? (
          <MissionsScreen token={token} user={user} onOpenMission={setMissionFromList} />
        ) : tab === "report" ? (
          <ReportScreen token={token} user={user} onLogout={onLogout} />
        ) : (
          <NotificationsScreen token={token} user={user} onLogout={onLogout} />
        )}
      </View>
      <View style={shellStyles.tabBar}>
        {tabs.map((item) => (
          <Pressable
            key={item}
            onPress={() => {
              // Rời tab thì thoát luôn màn chi tiết đang mở, nếu không người dùng
              // bấm tab khác mà vẫn thấy nhiệm vụ cũ đè lên.
              setMissionFromList(null);
              setTab(item);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            style={shellStyles.tab}
          >
            <Text style={[shellStyles.tabIcon, tab === item && shellStyles.tabIconActive]}>
              {tabIcon(item)}
            </Text>
            <Text style={[shellStyles.tabLabel, tab === item && shellStyles.tabLabelActive]}>
              {tabLabel(item)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function tabLabel(tab: MobileTab): string {
  return {
    home: "Tổng quan",
    readiness: "Sẵn sàng",
    inventory: "Kho",
    "monthly-report": "Kiểm kê",
    missions: "Lệnh",
    alerts: "Thông báo",
    report: "Báo cáo",
  }[tab];
}

/**
 * Biểu tượng trên thanh tab.
 *
 * Trước đây là số thứ tự "01".."05", và chúng vừa VÔ NGHĨA vừa TRÙNG NHAU: tab
 * Tổng quan và tab Lệnh cùng mang số 01, Sẵn sàng và Báo cáo cùng mang 02. Người
 * dùng không đọc số để chọn tab, họ đọc nhãn — nên con số chỉ chiếm chỗ, và khi
 * trùng thì còn khiến hai tab trông như một.
 *
 * Đổi sang biểu tượng gợi đúng việc của từng tab, mỗi tab một cái khác nhau.
 */
function tabIcon(tab: MobileTab): string {
  return {
    home: "◉",
    readiness: "✓",
    inventory: "▦",
    "monthly-report": "☑",
    missions: "➤",
    alerts: "!",
    report: "✎",
  }[tab];
}

/** Màn đăng nhập chung cho người báo cáo và Lực lượng hiện trường. */
function LoginScreen({ onLogin }: { onLogin: (result: LoginResult) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await login(email.trim(), password);
      await onLogin(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.loginContainer}>
      <Image
        source={brandLogo}
        style={styles.brandLogo}
        resizeMode="contain"
        accessibilityLabel="Logo Ứng phó nhanh"
      />
      <View style={styles.loginCard}>
        <Text style={styles.label}>Địa chỉ email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="email@ungphonhanh.vn"
          placeholderTextColor={c.muted}
          aria-label="Email đăng nhập"
        />

        <Text style={styles.label}>Mật khẩu</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Mật khẩu"
          placeholderTextColor={c.muted}
          aria-label="Mật khẩu"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.button, busy && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Màn danh sách thông báo + WebSocket realtime. */
function NotificationsScreen({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: AuthUser;
  onLogout: () => void;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const netInfo = useNetInfo();

  const load = useCallback(async () => {
    setError(null);
    let hasCachedData = false;
    try {
      const cached = await readOfflineCache<Notification[]>(user.id, "notifications");
      if (cached) {
        hasCachedData = true;
        setItems(cached.data);
        setCacheStoredAt(cached.storedAt);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const notifications = await fetchNotifications(token);
      setItems(notifications);
      setCacheStoredAt(null);
      await writeOfflineCache(user.id, "notifications", notifications);
    } catch (e) {
      setError(
        hasCachedData
          ? "Đang dùng dữ liệu đã lưu vì chưa kết nối được ungphonhanh.life."
          : e instanceof Error
            ? e.message
            : "Lỗi tải dữ liệu",
      );
    } finally {
      setLoading(false);
    }
  }, [token, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  // The backend derives the realtime room from the authenticated user.
  useEffect(() => {
    let socketBase: string;
    try {
      socketBase = requireApiBase();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "APK chưa được cấu hình địa chỉ ungphonhanh.life.",
      );
      return;
    }
    const socket = io(socketBase, {
      transports: ["websocket"],
      auth: { token },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("notification", (n: Notification) => {
      // Đưa lên đầu, đánh dấu MỚI, chống trùng nếu cùng id (updateAndPush).
      setItems((prev) => {
        const next = [n, ...prev.filter((x) => x.id !== n.id)];
        void writeOfflineCache(user.id, "notifications", next);
        return next;
      });
      setCacheStoredAt(null);
      setNewIds((prev) => new Set(prev).add(n.id));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user.id]);

  if (selectedMissionId) {
    return (
      <MissionDetailScreen
        token={token}
        userId={user.id}
        role={user.role}
        missionId={selectedMissionId}
        onBack={() => setSelectedMissionId(null)}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Thông báo điều phối</Text>
          <Text style={styles.subtitle}>
            {user.fullName ?? user.email} · {mobileRoleLabel(user.role)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <View style={styles.pill}>
            <View style={[styles.dot, { backgroundColor: connected ? c.green : c.muted }]} />
            <Text style={styles.pillText}>{connected ? "Đã kết nối" : "Mất kết nối"}</Text>
          </View>
          <Pressable onPress={onLogout} accessibilityRole="button">
            <Text style={[styles.pillText, { color: c.amber }]}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>

      {cacheStoredAt || netInfo.isConnected === false ? (
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: c.amber,
            backgroundColor: "rgba(245,158,11,0.12)",
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
          accessibilityRole="alert"
        >
          <Text style={{ color: c.amber, fontSize: 12, fontWeight: "700" }}>
            Ngoại tuyến · chỉ đọc
            {cacheStoredAt ? ` · dữ liệu lưu lúc ${formatCacheTime(cacheStoredAt)}` : ""}
          </Text>
        </View>
      ) : null}
      {error && items.length > 0 ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Text style={{ color: c.amber, fontSize: 12 }}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={{ padding: 16 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Không tải được</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={load} accessibilityRole="button">
            <Text style={styles.linkText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
          <Text style={styles.emptyText}>
            Khi điều phối viên gửi nhiệm vụ, thông báo sẽ hiện ở đây ngay lập tức.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Card
              item={item}
              isNew={newIds.has(item.id)}
              onPress={item.missionId ? () => setSelectedMissionId(item.missionId!) : undefined}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * Thẻ thông báo. Nếu gắn nhiệm vụ (có missionId + parse được số người) → thẻ nổi bật
 * làm rõ 3 tín hiệu: loại thiên tai · mức nguy hiểm · số người gặp nạn.
 * Ngược lại → thẻ thông tin gọn (sự cố kho, readiness…).
 */
function Card({
  item,
  isNew,
  onPress,
}: {
  item: Notification;
  isNew: boolean;
  onPress?: () => void;
}) {
  const summary = item.missionId ? parseMissionSummary(item.body) : null;
  if (onPress && summary) {
    return <MissionCard item={item} summary={summary} isNew={isNew} onPress={onPress} />;
  }
  return <InfoCard item={item} isNew={isNew} onPress={onPress} />;
}

function formatCacheTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "không rõ"
    : date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Thẻ nhiệm vụ nổi bật để Lực lượng hiện trường nắm bắt nhanh. */
function MissionCard({
  item,
  summary,
  isNew,
  onPress,
}: {
  item: Notification;
  summary: { type?: string; people: number };
  isNew: boolean;
  onPress: () => void;
}) {
  const disaster = disasterOf(summary.type ?? "");
  const danger = assessDanger(summary.type ?? "", summary.people);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${disaster.label}, ${danger.label}, ${summary.people} người gặp nạn`}
      style={({ pressed }) => [
        styles.missionCard,
        isNew && styles.missionCardNew,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: danger.stripe }]} />
      <View style={styles.missionBody}>
        <View style={styles.disasterRow}>
          <Text style={styles.disasterIcon}>{disaster.icon}</Text>
          <Text style={styles.disasterName}>{disaster.label}</Text>
          {isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>MỚI</Text>
            </View>
          ) : null}
          <View style={[styles.dangerBadge, { backgroundColor: danger.bg }]}>
            <Text style={[styles.dangerBadgeText, { color: danger.color }]}>{danger.label}</Text>
          </View>
        </View>

        <View style={styles.peopleRow}>
          <Text style={styles.peopleNumber}>{summary.people}</Text>
          <Text style={styles.peopleUnit}>người gặp nạn</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaTime}>🕐 {formatShortTime(item.createdAt)}</Text>
          <Text style={styles.metaHint}>Xem chi tiết ›</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Thẻ thông tin gọn — thông báo không gắn nhiệm vụ. */
function InfoCard({
  item,
  isNew,
  onPress,
}: {
  item: Notification;
  isNew: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.infoCard,
        isNew && styles.infoCardNew,
        pressed && onPress && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.infoIcon}>{kindIcon(item.kind)}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.infoTitle}>{item.title}</Text>
          {isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>MỚI</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.infoBody}>{item.body}</Text>
        <Text style={styles.infoTime}>🕐 {formatShortTime(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const shellStyles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: c.bg },
  content: { flex: 1 },
  sessionBar: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  sessionText: { flex: 1, color: c.muted, fontSize: 10, fontWeight: "700" },
  logout: { color: c.primary, fontSize: 11, fontWeight: "800" },
  tabBar: {
    minHeight: 66,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: c.border,
    color: c.muted,
    textAlign: "center",
    lineHeight: 22,
    fontSize: 9,
    fontWeight: "900",
  },
  tabIconActive: {
    borderColor: c.primary,
    backgroundColor: c.primary,
    color: "#FFFFFF",
  },
  tabLabel: { color: c.muted, fontSize: 9, fontWeight: "700" },
  tabLabelActive: { color: c.primary },
});

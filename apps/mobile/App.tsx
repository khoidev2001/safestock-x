import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ApiError,
  fetchMissions,
  fetchWarehouseMaterialRequests,
  login,
  logout as revokeServerSession,
  refreshSession,
  type AuthUser,
  type LoginResult,
  type Notification,
} from "./api";
import { MissionDetailScreen } from "./MissionDetail";
import { ReportScreen } from "./ReportScreen";
import { AccountScreen } from "./AccountScreen";
import { DashboardScreen } from "./DashboardScreen";
import { InventoryScreen } from "./InventoryScreen";
import { MonthlyReportScreen } from "./MonthlyReportScreen";
import { c, styles } from "./styles";
import { NotificationToasts } from "./NotificationToasts";
import { useNotificationFeed, type NotificationFeed } from "./use-notification-feed";
import { filterNotificationsByMissionNo } from "./notification-feed-state";
import { PAGE_SIZE } from "./paged-list-state";
import { missionWorkStage, type MissionWorkStage } from "./mission-state";
import {
  initialTabForRole,
  tabsForRole,
  warehouseSectionsForRole,
  type MobileTab,
  type WarehouseSection,
} from "./dashboard-state";
import { clearStoredSession, loadStoredSession, saveStoredSession } from "./session-store";
import { clearOfflineCache } from "./offline-cache";
import { formatShortTime, kindIcon, parseMissionSummary } from "./disaster";
import { MissionListScreen } from "./MissionListScreen";
import { MissionSummaryCard } from "./MissionSummaryCard";
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
const STATUS_BAR_HEIGHT = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) : 0;

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

  /**
   * Ghi lại hồ sơ vừa đổi vào phiên đang mở, và vào phiên lưu trên máy.
   *
   * Không lưu thì số điện thoại vừa xác minh biến mất ngay khi thoát app —
   * người dùng làm lại từ đầu và tưởng lần trước hỏng. Phiên lưu trên máy cũng
   * chính là thứ dựng lại màn hình lúc mở app mà chưa có mạng.
   */
  async function handleProfileChanged(updated: AuthUser) {
    setSession((current) => (current ? { ...current, user: updated } : current));
    const stored = session ? { ...session, user: updated } : null;
    if (stored) await saveStoredSession(stored);
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
      <SafeAreaView style={[styles.screen, { paddingTop: STATUS_BAR_HEIGHT }]}>
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
    <SafeAreaView style={[styles.screen, { paddingTop: STATUS_BAR_HEIGHT }]}>
      <StatusBar style="dark" backgroundColor={c.bg} />
      {!session ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <MobileRoleShell
          token={session.accessToken}
          user={session.user}
          onLogout={logout}
          onProfileChanged={handleProfileChanged}
        />
      )}
    </SafeAreaView>
  );
}

function MobileRoleShell({
  token,
  user,
  onLogout,
  onProfileChanged,
}: {
  token: string;
  user: AuthUser;
  onLogout: () => void;
  onProfileChanged: (user: AuthUser) => void;
}) {
  const tabs = tabsForRole(user.role);
  const warehouseSections = warehouseSectionsForRole(user.role);
  const [tab, setTab] = useState<MobileTab>(() => initialTabForRole(user.role));
  const [warehouseSection, setWarehouseSection] = useState<WarehouseSection>(
    () => warehouseSections[0] ?? "inventory",
  );
  const [missionFromList, setMissionFromList] = useState<string | null>(null);
  // Socket nằm ở vỏ app nên mở suốt phiên, không phụ thuộc tab nào đang hiện.
  const feed = useNotificationFeed(token, user.id);

  function openFromToast(toast: { key: string; id: string; missionId: string | null }) {
    feed.dismiss(toast.key);
    // Có nhiệm vụ kèm theo thì mở thẳng màn chi tiết — đó là việc cần làm ngay.
    // Không thì đưa về danh sách Thông báo để đọc trọn nội dung.
    if (toast.missionId) {
      setMissionFromList(toast.missionId);
      return;
    }
    // Vai không có tab Thông báo (ADMIN chỉ quét QR tại kệ) thì không chuyển đi
    // đâu cả — chuyển sang một tab không có trên thanh sẽ để thanh tab không ô
    // nào sáng, người dùng mất dấu mình đang ở đâu.
    if (!tabs.includes("alerts")) return;
    setMissionFromList(null);
    setTab("alerts");
  }

  return (
    <View style={shellStyles.shell}>
      {tab !== "alerts" && tab !== "report" && tab !== "account" ? (
        <View style={shellStyles.sessionBar}>
          <Text style={shellStyles.sessionText} numberOfLines={1}>
            {user.fullName ?? user.email} · {mobileRoleLabel(user.role)}
          </Text>
        </View>
      ) : null}
      {/* Thanh chọn mục con của tab Quản lý kho. Ẩn khi chỉ có một mục (ADMIN),
          vì lúc đó nó chỉ là một nút bấm vào không đi đâu. */}
      {tab === "warehouse" && !missionFromList && warehouseSections.length > 1 ? (
        <View style={shellStyles.sectionBar}>
          {warehouseSections.map((section) => {
            const active = warehouseSection === section;
            return (
              <Pressable
                key={section}
                onPress={() => setWarehouseSection(section)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={warehouseSectionLabel(section)}
                style={[shellStyles.section, active && shellStyles.sectionActive]}
              >
                <MaterialCommunityIcons
                  name={warehouseSectionIcon(section)}
                  size={15}
                  color={active ? "#FFFFFF" : c.muted}
                />
                <Text style={[shellStyles.sectionLabel, active && shellStyles.sectionLabelActive]}>
                  {warehouseSectionLabel(section)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={shellStyles.content}>
        {missionFromList ? (
          <MissionDetailScreen
            token={token}
            userId={user.id}
            role={user.role}
            warehouseId={user.warehouseId}
            missionId={missionFromList}
            // Thông báo mới nhất của CHÍNH nhiệm vụ đang mở. Kho xuất hàng hay ký
            // nhận xong là màn hình tự tải lại, người dùng không phải thoát ra rồi
            // vào lại mới thấy — mà lúc đang đứng ở kho thì không ai nghĩ tới
            // chuyện đó.
            refreshSignal={
              feed.items.find((item) => item.missionId === missionFromList)?.id ?? null
            }
            onBack={() => setMissionFromList(null)}
          />
        ) : tab === "home" ? (
          <DashboardScreen token={token} user={user} view="home" />
        ) : tab === "warehouse" ? (
          warehouseSection === "missions" ? (
            <MissionListScreen token={token} user={user} onOpenMission={setMissionFromList} />
          ) : warehouseSection === "readiness" ? (
            <DashboardScreen token={token} user={user} view="readiness" />
          ) : warehouseSection === "monthly-report" ? (
            <MonthlyReportScreen token={token} user={user} />
          ) : (
            <InventoryScreen token={token} user={user} />
          )
        ) : tab === "missions" ? (
          <MissionListScreen token={token} user={user} onOpenMission={setMissionFromList} />
        ) : tab === "report" ? (
          <ReportScreen token={token} user={user} />
        ) : tab === "account" ? (
          <AccountScreen
            token={token}
            user={user}
            onLogout={onLogout}
            onProfileChanged={onProfileChanged}
          />
        ) : (
          <NotificationsScreen
            token={token}
            user={user}
            feed={feed}
            onOpenMission={setMissionFromList}
          />
        )}
      </View>
      <View style={shellStyles.tabBar}>
        {tabs.map((item) => {
          const active = tab === item;
          return (
            <Pressable
              key={item}
              onPress={() => {
                // Rời tab thì thoát luôn màn chi tiết đang mở, nếu không người dùng
                // bấm tab khác mà vẫn thấy nhiệm vụ cũ đè lên.
                setMissionFromList(null);
                setTab(item);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={shellStyles.tab}
            >
              <View
                style={[
                  shellStyles.tabIcon,
                  // Tab đang chọn: nền đặc màu của chính nó. Tab khác: viền cùng
                  // màu nhưng nền trống, đủ để phân biệt mà không tranh chú ý với
                  // tab đang mở.
                  active
                    ? { backgroundColor: tabColor(item), borderColor: tabColor(item) }
                    : { borderColor: tabColor(item) },
                ]}
              >
                <MaterialCommunityIcons
                  name={tabIcon(item)}
                  size={16}
                  color={active ? "#FFFFFF" : tabColor(item)}
                />
              </View>
              <Text style={[shellStyles.tabLabel, active && { color: tabColor(item) }]}>
                {tabLabel(item)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* Không nổi thông báo khi người dùng ĐANG NHÌN VÀO danh sách thông báo: ở
          đó nó đã tự chèn lên đầu kèm nhãn MỚI, nổi thêm chỉ là che mất chính cái
          danh sách đang đọc.

          Nhưng mở một nhiệm vụ TỪ danh sách đó thì không còn là đang đọc danh
          sách nữa. Trước đây màn chi tiết mở ra bằng state riêng bên trong màn
          Thông báo, nên vỏ app vẫn tưởng người dùng đứng ở danh sách và nuốt hết
          thông báo nổi: kho báo đã xuất hàng mà người đang xem đúng nhiệm vụ đó
          không thấy gì, phải thoát ra mới biết. Giờ chỉ có MỘT chỗ giữ "đang mở
          nhiệm vụ nào", nên điều kiện này luôn đúng với thứ đang hiện trên màn. */}
      <NotificationToasts
        toasts={tab === "alerts" && !missionFromList ? [] : feed.toasts}
        onDismiss={feed.dismiss}
        onOpen={openFromToast}
      />
    </View>
  );
}

function tabLabel(tab: MobileTab): string {
  return {
    home: "Tổng quan",
    report: "Báo cáo",
    warehouse: "Quản lý kho",
    missions: "Nhiệm vụ",
    alerts: "Thông báo",
    account: "Tài khoản",
  }[tab];
}

/** Tên mục con trong tab Quản lý kho. */
function warehouseSectionLabel(section: WarehouseSection): string {
  return {
    // Ghi rõ "Nhiệm vụ CỨU HỘ", không phải "Nhiệm vụ" trống không như thanh tab
    // của đội cứu hộ. Trưởng thôn còn có việc của riêng mình — báo cáo kiểm kê,
    // nhập xuất kho — nên một chữ "Nhiệm vụ" đứng cạnh chúng đọc ra như "việc phải
    // làm nói chung". Thêm hai chữ là hết mơ hồ: đây là lệnh từ xã xuống.
    missions: "Cứu hộ",
    readiness: "Sẵn sàng",
    inventory: "Kho",
    "monthly-report": "Kiểm kê",
  }[section];
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * Biểu tượng trên thanh tab.
 *
 * Trước đây là ký tự Unicode gõ thẳng ("◉", "▦", "✎"…). Chúng có hai vấn đề:
 * hình dạng phụ thuộc bộ phông của từng máy nên mỗi điện thoại hiện một kiểu, và
 * bản thân chúng là hình hình học trừu tượng — không ai nhìn "▦" mà đoán ra kho.
 *
 * Dùng bộ Material Community Icons đi kèm Expo: nét vẽ giống hệt nhau trên mọi
 * máy, và mỗi tab lấy đúng hình của việc nó làm — biểu đồ cho tổng quan, loa cho
 * báo cáo, thùng hàng cho kho, chuông cho thông báo.
 */
function tabIcon(tab: MobileTab): IconName {
  return {
    home: "view-dashboard",
    report: "bullhorn",
    warehouse: "package-variant-closed",
    missions: "clipboard-text",
    alerts: "bell",
    account: "account-circle",
  }[tab] as IconName;
}

function warehouseSectionIcon(section: WarehouseSection): IconName {
  return {
    // Cùng hình với tab Nhiệm vụ của đội cứu hộ: hai vai nhìn vào cùng một thứ.
    missions: "clipboard-text",
    readiness: "shield-check",
    inventory: "package-variant-closed",
    "monthly-report": "clipboard-list",
  }[section] as IconName;
}

/**
 * Màu riêng cho từng tab.
 *
 * Trước đây các biểu tượng cùng một màu xám, và tab đang chọn thì tô xanh — tức
 * là hình dạng là dấu hiệu DUY NHẤT để phân biệt. Trên màn hình điện thoại nhỏ,
 * mấy hình nhỏ xíu cùng màu nhìn như một dãy ô vuông giống hệt nhau; người dùng
 * phải đọc nhãn mới biết bấm vào đâu, mà đọc nhãn thì biểu tượng thành vô dụng.
 *
 * Màu chọn theo NGHĨA chứ không cho đẹp: việc phải làm màu xanh dương, cảnh
 * huống nguy màu đỏ, chờ xử lý màu cam, đã xong màu xanh lá. Nhìn quen rồi thì
 * chỉ liếc màu là biết tab nào.
 */
function tabColor(tab: MobileTab): string {
  return {
    home: c.primary,
    report: c.amber,
    warehouse: c.green,
    // XANH LÁ, không phải cam. Cam trong hệ màu này nghĩa là "đang chờ xử lý" —
    // dùng cho tab Báo cáo, nơi người dùng gửi việc đi rồi ngồi đợi. Tab Nhiệm vụ
    // thì ngược lại: đó là chỗ NHẬN việc và làm cho xong. Để cam thì hai tab cạnh
    // nhau cùng màu và mất luôn tác dụng phân biệt bằng màu.
    missions: c.green,
    alerts: c.red,
    account: c.muted,
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
        <Text style={styles.label}>Tên đăng nhập</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="vd: longchau"
          placeholderTextColor={c.muted}
          aria-label="Tên đăng nhập"
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

/**
 * Màn danh sách thông báo.
 *
 * Socket KHÔNG còn ở đây — nó nằm ở vỏ app (`useNotificationFeed`) để chạy suốt
 * phiên đăng nhập. Màn này chỉ hiển thị dữ liệu nhận được, nên rời tab rồi quay
 * lại không mất kết nối và không phải tải lại từ đầu.
 */
function NotificationsScreen({
  token,
  user,
  feed,
  onOpenMission,
}: {
  token: string;
  user: AuthUser;
  feed: NotificationFeed;
  onOpenMission: (missionId: string) => void;
}) {
  const { items, loading, error, cacheStoredAt, connected, newIds } = feed;
  const netInfo = useNetInfo();
  const [missionQuery, setMissionQuery] = useState("");
  const stages = useMissionStages(token, user.role, items[0]?.id ?? null);
  const shown = filterNotificationsByMissionNo(items, missionQuery);
  const searching = shown.length !== items.length || missionQuery.trim().length > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {/* `flex: 1` + `minWidth: 0` để khối chữ CO LẠI được.
            Thiếu hai thứ này thì cột trái giãn theo dòng chữ dài nhất và đè lên
            khối bên phải. Lỗi chỉ lộ ở tài khoản có họ tên hoặc tên vai dài, nên
            rất dễ lọt qua lúc thử bằng một tài khoản tên ngắn. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.title}>
            Thông báo điều phối
          </Text>
          {/* Cắt ở một dòng: tên người kèm vai có thể rất dài, mà đây chỉ là dòng
              phụ — xuống dòng thì nó đẩy cả thanh tiêu đề cao lên. */}
          <Text numberOfLines={1} style={styles.subtitle}>
            {user.fullName ?? user.email} · {mobileRoleLabel(user.role)}
          </Text>
        </View>
        <View style={[styles.pill, { flexShrink: 0, marginLeft: 12 }]}>
          <View style={[styles.dot, { backgroundColor: connected ? c.green : c.muted }]} />
          <Text style={styles.pillText}>{connected ? "Đã kết nối" : "Mất kết nối"}</Text>
        </View>
      </View>

      {/* Tìm theo SỐ HIỆU nhiệm vụ.
          Người trực nhớ việc bằng số — "nhiệm vụ 193 sao rồi" — chứ không nhớ nó
          nằm ở dòng thứ mấy. Sau một đêm bão, danh sách dài vài chục dòng và
          cuộn tay tìm lại một số là việc vô vọng.
          Chỉ hiện khi đã có thông báo: một ô tìm trên danh sách trống chỉ tổ làm
          người dùng tưởng mình đang lọc mất thứ gì đó. */}
      {items.length > 0 ? (
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color={c.muted} />
          <TextInput
            style={styles.searchInput}
            value={missionQuery}
            onChangeText={setMissionQuery}
            // Bàn phím số: từ khoá ở đây luôn là con số, mở sẵn bàn phím chữ là
            // bắt người đang vội bấm thêm một nhát để chuyển.
            keyboardType="number-pad"
            placeholder="Tìm theo số nhiệm vụ (vd: 193)"
            placeholderTextColor={c.muted}
            accessibilityLabel="Tìm thông báo theo số hiệu nhiệm vụ"
          />
          {missionQuery.length > 0 ? (
            <Pressable
              onPress={() => setMissionQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Xoá từ khoá"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
          <Pressable onPress={feed.reload} accessibilityRole="button">
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
      ) : searching && shown.length === 0 ? (
        /* Nói rõ đang LỌC chứ không phải hết thông báo: hai chuyện này nhìn
           giống hệt nhau trên một danh sách trống. */
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Không có nhiệm vụ nào khớp</Text>
          <Text style={styles.emptyText}>
            Không có thông báo nào của nhiệm vụ số “{missionQuery}” trong {items.length} thông báo
            đang có.
          </Text>
          <Pressable onPress={() => setMissionQuery("")} accessibilityRole="button">
            <Text style={styles.linkText}>Xoá từ khoá</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Card
              item={item}
              isNew={newIds.has(item.id)}
              role={user.role}
              stage={item.missionId ? stages[item.missionId] : undefined}
              onPress={item.missionId ? () => onOpenMission(item.missionId!) : undefined}
            />
          )}
          /* Cuộn tới đâu tải tới đó. Sau một đêm bão hộp này dài hàng trăm dòng;
             tải hết một lượt là người trực ngồi nhìn màn hình trắng vài giây
             trước khi thấy dòng đầu tiên — mà dòng đầu tiên mới là dòng họ cần.

             Ngưỡng 0.6: bắn khi còn hơn nửa màn hình nữa mới tới đáy, để trang
             sau kịp về trước lúc người dùng cuộn tới nơi. Bắn đúng lúc chạm đáy
             thì lần nào cuộn nhanh cũng thấy khựng lại một nhịp. */
          onEndReached={() => feed.loadMore()}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            feed.loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator color={c.primary} />
              </View>
            ) : feed.moreError ? (
              /* Tải thêm hỏng KHÁC HẲN đã xem hết: phần chưa tải vẫn còn đó, và
                 người dùng cần biết để thử lại chứ không phải yên tâm đóng máy. */
              <Pressable
                onPress={() => feed.loadMore()}
                accessibilityRole="button"
                style={{ paddingVertical: 16 }}
              >
                <Text style={{ color: c.amber, fontSize: 12, textAlign: "center" }}>
                  Chưa tải thêm được thông báo cũ hơn. Chạm để thử lại.
                </Text>
              </Pressable>
            ) : feed.hasMore ? null : items.length > PAGE_SIZE ? (
              /* Chỉ nói "hết" khi đã cuộn qua ít nhất một trang: với hộp chỉ có
                 dăm dòng thì câu này là chữ thừa dưới một danh sách ngắn tũn. */
              <Text
                style={{
                  color: c.muted,
                  fontSize: 12,
                  textAlign: "center",
                  paddingVertical: 16,
                }}
              >
                Đã xem hết thông báo.
              </Text>
            ) : null
          }
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
  role,
  stage,
  onPress,
}: {
  item: Notification;
  isNew: boolean;
  role: string;
  stage?: MissionWorkStage;
  onPress?: () => void;
}) {
  const summary = item.missionId ? parseMissionSummary(item.body) : null;
  if (onPress && summary) {
    return (
      <MissionCard
        item={item}
        summary={summary}
        isNew={isNew}
        role={role}
        stage={stage}
        onPress={onPress}
      />
    );
  }
  return <InfoCard item={item} isNew={isNew} onPress={onPress} />;
}

/**
 * Nhiệm vụ nào đang nằm ở mốc nào, tra theo id.
 *
 * Thông báo là một mẩu tin của quá khứ: nó ghi lại lúc kho được giao việc, chứ
 * không biết mười phút sau kho đã xuất hàng. Thẻ muốn nói đúng việc còn phải làm
 * thì phải hỏi lại trạng thái HIỆN TẠI.
 *
 * Mỗi vai hỏi một đường vì mỗi vai chỉ được thấy phần của mình: đội cứu hộ đọc
 * danh sách nhiệm vụ của đội, kho thôn đọc phiếu vật tư của chính kho mình.
 *
 * Tải lại khi có thông báo mới nhất khác đi — một mẩu tin mới về gần như luôn
 * đồng nghĩa có thứ gì đó vừa đổi trạng thái.
 */
function useMissionStages(
  token: string,
  role: string,
  newestNotificationId: string | null,
): Record<string, MissionWorkStage> {
  const [stages, setStages] = useState<Record<string, MissionWorkStage>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadStages() {
      try {
        if (role === "RESCUE") {
          const missions = await fetchMissions(token);
          if (cancelled) return;
          setStages(
            Object.fromEntries(
              missions.map((mission) => [
                mission.id,
                missionWorkStage(mission.status, mission.warehouseRequests),
              ]),
            ),
          );
          return;
        }
        const requests = await fetchWarehouseMaterialRequests(token);
        if (cancelled) return;
        const byMission = new Map<string, { status: string }[]>();
        for (const request of requests) {
          const list = byMission.get(request.missionId) ?? [];
          list.push({ status: request.status });
          byMission.set(request.missionId, list);
        }
        setStages(
          Object.fromEntries(
            [...byMission].map(([missionId, list]) => [missionId, missionWorkStage("", list)]),
          ),
        );
      } catch {
        // Không lấy được thì thẻ vẫn đọc được, chỉ thiếu dòng trạng thái. Đây là
        // thông tin phụ của màn hình thông báo — báo lỗi ở đây chỉ tổ che mất
        // chính những thông báo người dùng vào để đọc.
      }
    }
    void loadStages();
    return () => {
      cancelled = true;
    };
  }, [token, role, newestNotificationId]);

  return stages;
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

/**
 * Thẻ nhiệm vụ trong hộp thông báo.
 *
 * Chỉ còn là lớp chuyển đổi: rút số hiệu, loại thiên tai và số người ra khỏi bản
 * ghi thông báo rồi đưa cho thẻ dùng chung vẽ. Phần hình hài nằm ở
 * `MissionSummaryCard`, để tab Nhiệm vụ và hộp Thông báo không bao giờ lệch nhau.
 */
function MissionCard({
  item,
  summary,
  isNew,
  role,
  stage,
  onPress,
}: {
  item: Notification;
  summary: { type?: string; people: number };
  isNew: boolean;
  role: string;
  stage?: MissionWorkStage;
  onPress: () => void;
}) {
  return (
    <MissionSummaryCard
      missionNo={item.missionNo}
      incidentType={summary.type ?? ""}
      affectedPeople={summary.people}
      createdAt={item.createdAt}
      isNew={isNew}
      role={role}
      stage={stage}
      onPress={onPress}
    />
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
        {/* Danh tính của việc, đặt TRÊN tiêu đề. Người trực chạy nhiều nhiệm vụ
            cùng lúc: "Toàn bộ vật tư đã sẵn sàng" mà không nói của nhiệm vụ nào
            thì họ phải mở từng nhiệm vụ ra dò xem cái nào vừa xong. */}
        {item.missionNo != null ? (
          <Text style={styles.infoMissionNo}>Nhiệm vụ số {item.missionNo}</Text>
        ) : null}
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
  sectionBar: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  section: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  sectionActive: { backgroundColor: c.primary, borderColor: c.primary },
  sectionLabel: { color: c.muted, fontSize: 12, fontWeight: "800" },
  sectionLabelActive: { color: "#FFFFFF" },
  tabBar: {
    minHeight: 66,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: c.border,
    // Nền xám tách thanh tab khỏi nội dung phía trên. Các màn hình đều nền
    // trắng, nên thanh trắng viền mảnh dễ trôi lẫn vào cuối trang khi cuộn.
    backgroundColor: c.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 20,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  // `textAlign: "center"` để nhãn dài như "Quản lý kho" xuống dòng cho cân, thay
  // vì dạt về trái khi thanh tab đã có tới năm ô.
  tabLabel: { color: c.muted, fontSize: 10, fontWeight: "700", textAlign: "center" },
});

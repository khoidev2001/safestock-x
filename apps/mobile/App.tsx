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
  login,
  logout as revokeServerSession,
  refreshSession,
  resendLoginOtp,
  verifyLoginOtp,
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
import { ErrorBanner, ErrorLine } from "./error-banner";
import { useNotificationFeed, type NotificationFeed } from "./use-notification-feed";
import { filterNotificationsByMissionNo } from "./notification-feed-state";
import { PAGE_SIZE } from "./paged-list-state";
import {
  initialTabForRole,
  tabsForRole,
  warehouseSectionsForRole,
  type MobileTab,
  type WarehouseSection,
} from "./dashboard-state";
import { clearStoredSession, loadStoredSession, saveStoredSession } from "./session-store";
import {
  configureForegroundBehavior,
  registerForPush,
  unregisterForPush,
} from "./push-registration";
import { clearOfflineCache } from "./offline-cache";
import { clearOfflineMapTiles } from "./offline-map-tiles";
import { formatShortTime, kindIcon } from "./disaster";
import { MissionListScreen } from "./MissionListScreen";
import { mobileRoleLabel } from "./role-labels";
import {
  isLoginOtpChallenge,
  loginOtpInputError,
  loginOtpView,
  type LoginOtpChallenge,
} from "./login-otp-state";

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
  /**
   * Token thông báo đẩy đã ghi danh cho phiên này.
   *
   * Giữ lại để lúc đăng xuất gỡ đúng cái máy này khỏi danh sách nhận — không gỡ
   * thì người mượn máy sau vẫn nghe chuông lệnh của người trước.
   */
  const [pushToken, setPushToken] = useState<string | null>(null);
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

  /**
   * Ghi danh nhận thông báo mỗi lần có phiên — kể cả phiên khôi phục lúc mở app.
   *
   * Gửi lại chứ không chỉ đăng ký lần đầu: token do hệ điều hành cấp và nó đổi khi
   * người dùng xoá dữ liệu app hoặc khôi phục máy. Thất bại thì im lặng bỏ qua,
   * người dùng vẫn làm việc bình thường với thông báo trong app.
   */
  useEffect(() => {
    const accessToken = session?.accessToken;
    if (!accessToken) return;
    let cancelled = false;
    configureForegroundBehavior();
    void registerForPush(accessToken).then((token) => {
      if (!cancelled) setPushToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  async function logout() {
    const userId = session?.user.id;
    const accessToken = session?.accessToken;
    if (accessToken) await unregisterForPush(accessToken, pushToken);
    setPushToken(null);
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
    await clearOfflineMapTiles().catch(() => undefined);
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
      {/* Dải báo lỗi gắn ở GỐC, ngoài cả hai nhánh, và chỉ gắn đúng MỘT lần.

          Trước đây nó nằm trong vỏ app đã đăng nhập. Màn đăng nhập vẫn đẩy lỗi
          qua `showError(...)`, nhưng lúc đó chưa có dải nào lắng nghe — nên sai
          mật khẩu hay mất mạng đều bị nuốt: nút quay vài giây rồi trở về như cũ,
          không một chữ nào. Người dùng sẽ bấm lại mãi, rồi kết luận app hỏng.

          Đặt SAU cùng để dải nằm trên mọi thứ khác. */}
      <ErrorBanner />
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
            // Thông báo mới nhất của CHÍNH nhiệm vụ đang mở, ghép với tín hiệu
            // "nhiệm vụ vừa đổi" không kèm chuông. Kho xuất hàng hay ký nhận xong
            // là màn hình tự tải lại, người dùng không phải thoát ra rồi vào lại
            // mới thấy — mà lúc đang đứng ở kho thì không ai nghĩ tới chuyện đó.
            // Chỉ dựa vào thông báo thì hụt: kho ký nhận bàn giao chỉ báo điều
            // phối, nên màn của đội cứu hộ cứ đứng yên ở "soạn xong · tới lấy được".
            refreshSignal={`${
              feed.items.find((item) => item.missionId === missionFromList)?.id ?? ""
            }#${feed.missionUpdates[missionFromList] ?? 0}`}
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
          <NotificationsScreen user={user} feed={feed} onOpenMission={setMissionFromList} />
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Có giá trị = tài khoản quản trị đã đúng mật khẩu, đang chờ nhập mã từ email. */
  const [challenge, setChallenge] = useState<LoginOtpChallenge | null>(null);

  /*
    Trên trình duyệt Edge/IE, ô mật khẩu có sẵn một con mắt riêng — chính là thứ
    làm "chạy localhost xem được mật khẩu" trong khi máy thật thì không. App đã tự
    vẽ nút mắt dưới đây, nên giấu con mắt của trình duyệt để khỏi hai nút chồng nhau.
  */
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = "input::-ms-reveal,input::-ms-clear{display:none}";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await login(email.trim(), password);
      if (isLoginOtpChallenge(res)) {
        setChallenge(res);
        return;
      }
      await onLogin(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <View style={styles.loginContainer}>
        <Image
          source={brandLogo}
          style={styles.brandLogo}
          resizeMode="contain"
          accessibilityLabel="Logo Ứng phó nhanh"
        />
        <LoginOtpStep
          challenge={challenge}
          onChallenge={setChallenge}
          onLogin={onLogin}
          onRestart={(message) => {
            setChallenge(null);
            setPassword("");
            setError(message);
          }}
        />
      </View>
    );
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
          placeholder="Tài khoản"
          placeholderTextColor={c.muted}
          aria-label="Tên đăng nhập"
        />

        <Text style={styles.label}>Mật khẩu</Text>
        {/* Nút mắt để xem lại mật khẩu vừa gõ. Trên điện thoại bàn phím nhỏ, gõ
            nhầm một ký tự là chuyện thường, mà không xem được thì chỉ còn cách xoá
            hết gõ lại — trong khi người dùng có thể đang đứng ngoài mưa. */}
        <View style={{ width: "100%", marginBottom: 18, justifyContent: "center" }}>
          <TextInput
            style={[styles.input, { marginBottom: 0, paddingRight: 52 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Mật khẩu"
            placeholderTextColor={c.muted}
            aria-label="Mật khẩu"
          />
          <Pressable
            onPress={() => setPasswordVisible((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            hitSlop={8}
            style={{
              position: "absolute",
              right: 4,
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={c.muted}
            />
          </Pressable>
        </View>

        <ErrorLine error={error} />

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
 * Bước hai khi tài khoản quản trị đăng nhập: nhập mã 6 số gửi tới email.
 *
 * Nút "Gửi lại mã" KHÔNG hiện trong 60 giây đầu, chỉ có dòng đếm ngược — mốc lấy từ
 * máy chủ nên đồng hồ điện thoại lệch vài giây cũng không mở nút sớm.
 */
function LoginOtpStep({
  challenge,
  onChallenge,
  onLogin,
  onRestart,
}: {
  challenge: LoginOtpChallenge;
  onChallenge: (next: LoginOtpChallenge) => void;
  onLogin: (result: LoginResult) => Promise<void>;
  /** Thẻ thử thách không còn dùng được: quay về ô mật khẩu kèm lý do. */
  onRestart: (message: string | null) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Mã mới tới thì xoá mã cũ đang gõ.
  useEffect(() => {
    setCode("");
    setNow(Date.now());
  }, [challenge.challengeToken, challenge.expiresAt]);

  const view = loginOtpView(challenge, now);

  function failed(e: unknown, fallback: string) {
    const message = e instanceof Error ? e.message : fallback;
    if (e instanceof ApiError && e.status === 401) {
      onRestart(message);
      return;
    }
    setError(message);
  }

  async function verify() {
    const problem = loginOtpInputError(code, challenge, Date.now());
    if (problem) {
      setError(problem);
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onLogin(await verifyLoginOtp(challenge.challengeToken, code.trim()));
    } catch (e) {
      failed(e, "Chưa xác nhận được mã. Vui lòng thử lại.");
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await resendLoginOtp(challenge.challengeToken);
      onChallenge(next);
      setNotice(`Đã gửi mã mới tới ${next.email}.`);
    } catch (e) {
      failed(e, "Chưa gửi lại được mã. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.loginCard}>
      <Text style={{ fontSize: 18, fontWeight: "800", color: c.text, marginBottom: 8 }}>
        Xác nhận đăng nhập
      </Text>
      <Text style={{ color: c.text, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
        Tài khoản quản trị cần thêm một bước. Mã 6 số vừa được gửi tới{" "}
        <Text style={{ fontWeight: "800" }}>{challenge.email}</Text>.
      </Text>
      {challenge.devCode ? (
        <Text style={{ color: c.muted, fontSize: 12, marginBottom: 10 }}>
          Máy chủ chưa cấu hình email — mã thử: {challenge.devCode}
        </Text>
      ) : null}

      <Text style={styles.label}>Mã đăng nhập</Text>
      <TextInput
        style={[
          styles.input,
          { textAlign: "center", fontSize: 24, letterSpacing: 8, marginBottom: 6 },
        ]}
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        editable={!busy}
        aria-label="Mã đăng nhập"
      />
      <Text
        style={{
          color: view.expired ? c.red : c.muted,
          fontWeight: view.expired ? "800" : "400",
          fontSize: 13,
          marginBottom: 14,
        }}
      >
        {view.expired
          ? "Mã đã hết hạn. Hãy gửi lại mã mới."
          : `Mã còn hiệu lực ${view.secondsLeft} giây.`}
      </Text>

      <ErrorLine error={error} />
      {!error && notice ? (
        <Text style={{ color: c.green, fontSize: 13, marginBottom: 12 }}>{notice}</Text>
      ) : null}

      <Pressable
        style={[styles.button, (busy || code.length !== 6) && { opacity: 0.6 }]}
        onPress={verify}
        disabled={busy || code.length !== 6}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{busy ? "Đang xử lý…" : "Xác nhận"}</Text>
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          width: "100%",
        }}
      >
        <Pressable
          onPress={() => onRestart(null)}
          disabled={busy}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={{ color: c.muted, fontWeight: "700" }}>← Đổi tài khoản</Text>
        </Pressable>
        {view.canResend ? (
          <Pressable onPress={resend} disabled={busy} accessibilityRole="button" hitSlop={8}>
            <Text style={{ color: c.primary, fontWeight: "800" }}>Gửi lại mã</Text>
          </Pressable>
        ) : (
          <Text style={{ color: c.muted }}>Gửi lại mã sau {view.resendIn} giây</Text>
        )}
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
  user,
  feed,
  onOpenMission,
}: {
  user: AuthUser;
  feed: NotificationFeed;
  onOpenMission: (missionId: string) => void;
}) {
  const { items, loading, error, cacheStoredAt, connected, newIds } = feed;
  const netInfo = useNetInfo();
  const [missionQuery, setMissionQuery] = useState("");
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
      {/* Còn dữ liệu cũ trên màn thì lượt tải hỏng chỉ là chuyện thoáng qua —
          đẩy xuống dải ở đáy, đừng chèn một dòng chữ vào giữa danh sách. */}
      {items.length > 0 ? <ErrorLine error={error} /> : null}

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
            <InfoCard
              item={item}
              isNew={newIds.has(item.id)}
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
 * HỘP THÔNG BÁO CHỈ CÒN THẺ THÔNG BÁO.
 *
 * Trước đây thông báo gắn nhiệm vụ được vẽ lại thành thẻ nhiệm vụ lớn — đúng
 * cái thẻ mà tab Nhiệm vụ đang hiển thị. Người trực phải đọc cùng một việc ở hai
 * chỗ, mà hai chỗ ấy còn lệch nhau: tab Nhiệm vụ nói việc đang phải làm, hộp
 * thông báo nói lại lúc việc được giao. Ở đây chỉ còn `InfoCard` — mẩu tin gọn,
 * ai cần làm việc thì chạm để mở nhiệm vụ hoặc sang thẳng tab Nhiệm vụ.
 */
function formatCacheTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "không rõ"
    : date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
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
    minHeight: 56,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: c.border,
    // Nền xám tách thanh tab khỏi nội dung phía trên. Các màn hình đều nền
    // trắng, nên thanh trắng viền mảnh dễ trôi lẫn vào cuối trang khi cuộn.
    backgroundColor: c.surfaceAlt,
    paddingHorizontal: 6,
    // Đệm dọc 8 chứ không phải 20: cộng cả biểu tượng 28 và nhãn thì thanh cũ
    // cao tới ~84 điểm, ăn hơn một phần mười màn hình chỉ để chứa năm chữ nhỏ.
    // Còn ~60 điểm thì vẫn vượt trần 48 điểm cho vùng chạm mà trả lại chỗ cho
    // nội dung — trên màn 6 inch đó là thêm gần trọn một thẻ hàng.
    paddingVertical: 8,
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

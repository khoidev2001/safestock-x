import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";
import { io, type Socket } from "socket.io-client";
import { fetchNotifications, login, type AuthUser, type Notification } from "./api";
import { MissionDetailScreen } from "./MissionDetail";
import { API_BASE } from "./config";
import { c, styles } from "./styles";

export default function App() {
  const [session, setSession] = useState<{ token: string; user: AuthUser } | null>(null);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      {session ? (
        <NotificationsScreen
          token={session.token}
          user={session.user}
          onLogout={() => setSession(null)}
        />
      ) : (
        <LoginScreen onLogin={(token, user) => setSession({ token, user })} />
      )}
    </SafeAreaView>
  );
}

/** Màn đăng nhập — điền sẵn tài khoản cứu hộ để test nhanh. */
function LoginScreen({ onLogin }: { onLogin: (token: string, user: AuthUser) => void }) {
  const [email, setEmail] = useState("rescue@safestock.vn");
  const [password, setPassword] = useState("rescue123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await login(email.trim(), password);
      onLogin(res.accessToken, res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.center}>
      <Text style={styles.logo}>SafeStock</Text>
      <Text style={[styles.subtitle, { marginBottom: 28 }]}>Đội cứu hộ · Nhận điều phối</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="email@safestock.vn"
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
  const [connected, setConnected] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchNotifications(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // WebSocket: join room theo role, nhận notification đẩy tức thì.
  useEffect(() => {
    const socket = io(API_BASE, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-role", { role: user.role });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("notification", (n: Notification) => {
      // Đưa lên đầu, đánh dấu MỚI, chống trùng nếu cùng id (updateAndPush).
      setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
      setNewIds((prev) => new Set(prev).add(n.id));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user.role]);

  if (selectedMissionId) {
    return (
      <MissionDetailScreen
        token={token}
        missionId={selectedMissionId}
        onBack={() => setSelectedMissionId(null)}
        onResolved={() => {
          setSelectedMissionId(null);
          load();
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Thông báo điều phối</Text>
          <Text style={styles.subtitle}>{user.fullName ?? user.email} · {user.role}</Text>
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

      {loading ? (
        <View style={{ padding: 16 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : error ? (
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

function Card({
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
      style={({ pressed }) => [styles.card, isNew && styles.cardNew, pressed && onPress && { opacity: 0.7 }]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {isNew ? (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>MỚI</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardBody}>{item.body}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {onPress ? <Text style={styles.cardTime}>Xem chi tiết ›</Text> : null}
          <View style={[styles.chip, { marginTop: 8 }]}>
            <Text style={styles.chipText}>{item.kind}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** HH:mm dd/MM — giờ do backend cấp (createdAt), client chỉ format hiển thị. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

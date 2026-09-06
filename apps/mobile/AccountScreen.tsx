import { useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { updateOwnPhone, type AuthUser } from "./api";
import { confirmAction } from "./dialog";
import { mobileRoleLabel } from "./role-labels";
import { c, styles } from "./styles";

/**
 * Màn Tài khoản — hồ sơ người đang đăng nhập, và nút đăng xuất.
 *
 * Trước đây nút đăng xuất nằm rải rác: một cái ở dải phiên trên cùng, một cái ở
 * góc màn Thông báo, một cái nữa ở màn Báo cáo. Cùng một việc mà ba chỗ, và
 * không chỗ nào là chỗ người dùng nghĩ tới đầu tiên khi muốn đổi tài khoản.
 *
 * Nút đặt ở CUỐI trang, sau phần thông tin: đăng xuất là việc không quay lại
 * được, nên nó không nên nằm ngay dưới ngón cái lúc người dùng đang lướt xem
 * thông tin.
 */
export function AccountScreen({
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
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = user.fullName?.trim() || user.email;

  /**
   * Hỏi lại trước khi đăng xuất.
   *
   * Đăng xuất không chỉ là đóng phiên: nó xoá luôn dữ liệu đã lưu ngoại tuyến
   * trên máy, và cắt kết nối nhận thông báo điều phối. Ngoài hiện trường mà bấm
   * nhầm rồi mất sóng thì không đăng nhập lại được — nên phải hỏi, và phải nói
   * rõ mất gì chứ không chỉ "bạn có chắc không".
   */
  async function askLogout() {
    if (loggingOut) return;
    const agreed = await confirmAction({
      title: "Đăng xuất khỏi tài khoản?",
      message:
        "Dữ liệu đã lưu ngoại tuyến trên máy sẽ bị xoá, và bạn sẽ không nhận được thông báo điều phối cho tới khi đăng nhập lại.",
      confirmLabel: "Đăng xuất",
      cancelLabel: "Ở lại",
    });
    if (!agreed) return;
    setLoggingOut(true);
    onLogout();
  }
  const rows: { icon: IconName; label: string; value: string }[] = [
    {
      icon: "account-outline",
      label: "Họ và tên",
      value: user.fullName?.trim() || "Chưa cập nhật",
    },
    { icon: "shield-account-outline", label: "Vai trò", value: mobileRoleLabel(user.role) },
    { icon: "email-outline", label: "Email", value: user.email },
  ];
  if (user.unitName) {
    rows.push({ icon: "domain", label: "Đơn vị", value: user.unitName });
  }
  if (user.warehouseName) {
    rows.push({
      icon: "package-variant-closed",
      label: "Kho phụ trách",
      value: user.warehouseName,
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={local.scroll}>
        <View style={local.identity}>
          <View style={local.avatar}>
            <Text style={local.avatarText}>{initialsOf(displayName)}</Text>
          </View>
          {/* `minWidth: 0` để tên dài co lại được thay vì đẩy tràn khối bên phải. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={local.name} numberOfLines={2}>
              {displayName}
            </Text>
            <Text style={local.role} numberOfLines={1}>
              {mobileRoleLabel(user.role)}
            </Text>
          </View>
        </View>

        <Text style={local.sectionTitle}>Thông tin tài khoản</Text>
        <View style={local.card}>
          {rows.map((row, index) => (
            <View key={row.label} style={[local.row, index > 0 && local.rowDivided]}>
              <MaterialCommunityIcons name={row.icon} size={18} color={c.muted} />
              <Text style={local.rowLabel}>{row.label}</Text>
              <Text style={local.rowValue} numberOfLines={2}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <PhoneSection token={token} user={user} onProfileChanged={onProfileChanged} />

        <Text style={local.hint}>
          Họ tên, vai trò và kho phụ trách do quản trị viên cấp xã cập nhật. Số điện thoại thì bạn
          tự sửa được ở trên.
        </Text>

        <Pressable
          onPress={() => void askLogout()}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất khỏi tài khoản"
          accessibilityState={{ disabled: loggingOut }}
          style={({ pressed }) => [local.logout, (pressed || loggingOut) && { opacity: 0.6 }]}
        >
          <MaterialCommunityIcons name="logout" size={18} color={c.red} />
          <Text style={local.logoutText}>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * Số điện thoại của chính mình — tự nhập, tự sửa, tự gỡ.
 *
 * Đây là số người điều phối bấm để gọi khi kho cần chi viện. Trước đây phải báo
 * quản trị viên mới sửa được, nên số cũ nằm đó cho tới khi có người nhớ ra —
 * đúng lúc cần gọi thì gọi vào số không ai nghe.
 *
 * Kiểm định dạng ngay trên máy trước khi gửi: nút không bấm được là biết số chưa
 * đúng, không phải đợi một vòng mạng mới biết. Luật kiểm khớp với máy chủ
 * (`auth/dto.ts`) nên số hợp lệ ở đây cũng hợp lệ ở đó.
 */
const PHONE_PATTERN = /^[+0-9][0-9 .()-]{7,19}$/;

function PhoneSection({
  token,
  user,
  onProfileChanged,
}: {
  token: string;
  user: AuthUser;
  onProfileChanged: (user: AuthUser) => void;
}) {
  const savedPhone = user.phone?.trim() || null;
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const typed = phone.trim();
  const valid = PHONE_PATTERN.test(typed);

  async function save(next: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateOwnPhone(token, next);
      onProfileChanged(updated);
      setEditing(false);
      setNotice(next ? "Đã lưu số điện thoại." : "Đã gỡ số khỏi hồ sơ.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa lưu được số điện thoại");
    } finally {
      setBusy(false);
    }
  }

  async function askRemove() {
    const agreed = await confirmAction({
      title: "Gỡ số điện thoại?",
      message:
        "Người điều phối sẽ không gọi thẳng cho bạn được nữa khi cần chi viện. Thêm lại lúc nào cũng được.",
      confirmLabel: "Gỡ số",
      cancelLabel: "Giữ lại",
    });
    if (agreed) void save(null);
  }

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={local.sectionTitle}>Số điện thoại</Text>
      <View style={local.card}>
        <View style={local.row}>
          <MaterialCommunityIcons name="phone-outline" size={18} color={c.muted} />
          <Text style={local.rowLabel}>Số của bạn</Text>
          <Text style={local.rowValue} numberOfLines={1}>
            {savedPhone ?? "Chưa cập nhật"}
          </Text>
        </View>
      </View>

      {!editing ? (
        <View style={local.phoneActions}>
          <Pressable
            onPress={() => {
              setEditing(true);
              setPhone(savedPhone ?? "");
              setError(null);
              setNotice(null);
            }}
            accessibilityRole="button"
            style={local.phonePrimary}
          >
            <MaterialCommunityIcons name="phone-plus-outline" size={18} color="#FFFFFF" />
            <Text style={local.phonePrimaryText}>
              {savedPhone ? "Đổi số" : "Thêm số điện thoại"}
            </Text>
          </Pressable>
          {savedPhone ? (
            <Pressable
              onPress={() => void askRemove()}
              disabled={busy}
              accessibilityRole="button"
              style={local.phoneGhost}
            >
              <Text style={local.phoneGhostText}>Gỡ số</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={local.phoneBox}>
          <Text style={local.phoneLabel}>Nhập số điện thoại</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus
            placeholder="Ví dụ: 0912345678"
            placeholderTextColor={c.muted}
            accessibilityLabel="Số điện thoại của bạn"
            style={local.phoneInput}
          />
          <Text style={local.phoneHelp}>
            Số này hiện trong danh sách tài khoản của xã, để người điều phối gọi thẳng cho bạn khi
            cần chi viện.
          </Text>
          <View style={local.phoneActions}>
            <Pressable
              onPress={() => void save(typed)}
              disabled={busy || !valid}
              accessibilityRole="button"
              style={[local.phonePrimary, (busy || !valid) && local.disabled]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={local.phonePrimaryText}>{busy ? "Đang lưu…" : "Lưu số"}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setEditing(false);
                setError(null);
              }}
              accessibilityRole="button"
              style={local.phoneGhost}
            >
              <Text style={local.phoneGhostText}>Huỷ</Text>
            </Pressable>
          </View>
        </View>
      )}

      {error ? <Text style={local.phoneError}>{error}</Text> : null}
      {notice ? <Text style={local.phoneNotice}>{notice}</Text> : null}
    </View>
  );
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Chữ cái đầu để làm ảnh đại diện — tối đa hai chữ, ví dụ "Nguyễn Văn A" → "NA". */
function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

const local = StyleSheet.create({
  // `flexGrow: 1` ở đây cộng với `marginTop: "auto"` trên nút đăng xuất đẩy nút
  // xuống đáy màn hình khi nội dung ngắn, nhưng vẫn cho nó trôi theo khi nội
  // dung dài quá một màn.
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 28 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 8,
    marginBottom: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.primarySoft,
    borderWidth: 1,
    borderColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: c.primary, fontSize: 21, fontWeight: "900" },
  name: { color: c.text, fontSize: 20, fontWeight: "800" },
  role: { color: c.muted, fontSize: 13, fontWeight: "700", marginTop: 3 },

  sectionTitle: {
    color: c.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13 },
  rowDivided: { borderTopWidth: 1, borderTopColor: c.border },
  rowLabel: { color: c.muted, fontSize: 13, fontWeight: "700" },
  // Giá trị đẩy sang phải và co được, để nhãn bên trái không bị đè khi giá trị dài.
  rowValue: { flex: 1, color: c.text, fontSize: 13, fontWeight: "700", textAlign: "right" },

  hint: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 12 },

  phoneBox: {
    marginTop: 10,
    backgroundColor: c.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 8,
  },
  phoneLabel: { color: c.text, fontSize: 14, fontWeight: "800" },
  phoneInput: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.bg,
  },
  phoneHelp: { color: c.muted, fontSize: 12, lineHeight: 18 },
  phoneActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  phonePrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: c.primary,
  },
  phonePrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  phoneGhost: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  phoneGhostText: { color: c.text, fontSize: 14, fontWeight: "700" },
  phoneError: { color: c.red, fontSize: 13, fontWeight: "700", marginTop: 10 },
  phoneNotice: { color: c.green, fontSize: 13, fontWeight: "700", marginTop: 10 },
  disabled: { opacity: 0.6 },

  logout: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.red,
    backgroundColor: c.surface,
  },
  logoutText: { color: c.red, fontSize: 15, fontWeight: "800" },
});

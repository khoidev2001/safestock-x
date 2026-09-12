import { useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { updateOwnPhone, updateOwnProfile, type AuthUser } from "./api";
import { pickAvatarImage } from "./avatar-image";
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
  // Họ và tên KHÔNG nằm trong danh sách này nữa: nó tự sửa được nên có khối riêng
  // ngay dưới. Bốn dòng còn lại là thứ quản trị viên cấp xã đặt — xem ghi chú ở
  // cuối màn để biết vì sao.
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: "shield-account-outline", label: "Vai trò", value: mobileRoleLabel(user.role) },
    { icon: "email-outline", label: "Tên đăng nhập", value: user.email },
  ];
  // Ghi TÊN XÃ chứ không ghi tên đơn vị đầy đủ: người trực chỉ cần biết mình
  // thuộc xã nào, còn "Hội Chữ thập đỏ xã Đồng Xuân" thì dài mà phần đầu giống
  // hệt nhau ở mọi tài khoản, không phân biệt được gì.
  //
  // Lùi về tên đơn vị đầy đủ khi máy chủ không rút được tên xã (đơn vị đặt tên
  // không theo mẫu): thà đọc dài còn hơn mất hẳn dòng này.
  const communeLabel = user.communeName?.trim() || user.unitName?.trim() || null;
  if (communeLabel) {
    rows.push({ icon: "domain", label: "Xã", value: communeLabel });
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
          <AvatarPicker token={token} user={user} onProfileChanged={onProfileChanged} />
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

        <NameSection token={token} user={user} onProfileChanged={onProfileChanged} />

        <Text style={[local.sectionTitle, { marginTop: 20 }]}>Thông tin tài khoản</Text>
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
 * Ảnh đại diện — bấm thẳng vào ảnh để đổi.
 *
 * Không làm một nút "Đổi ảnh" riêng: chính cái ảnh là thứ người dùng nhìn và
 * chạm vào đầu tiên khi muốn đổi nó. Huy hiệu máy ảnh ở góc để người chưa từng
 * bấm cũng biết là bấm được — nếu không thì nó chỉ trông như một hình tròn.
 *
 * Ảnh được thu về 256×256 ngay trên máy trước khi gửi (xem `avatar-image.ts`).
 */
function AvatarPicker({
  token,
  user,
  onProfileChanged,
}: {
  token: string;
  user: AuthUser;
  onProfileChanged: (user: AuthUser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedAvatar = user.avatarUrl?.trim() || null;
  const displayName = user.fullName?.trim() || user.email;

  async function save(dataUrl: string | null) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateOwnProfile(token, { avatarUrl: dataUrl });
      onProfileChanged(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa lưu được ảnh đại diện");
    } finally {
      setBusy(false);
    }
  }

  async function change() {
    if (busy) return;
    setError(null);
    const picked = await pickAvatarImage();
    // Bấm huỷ không phải là lỗi: im lặng quay lại, đừng hiện thông báo gì.
    if (picked.kind === "cancelled") return;
    if (picked.kind === "denied") {
      setError("Cần cho phép ứng dụng xem thư viện ảnh thì mới đổi được ảnh đại diện.");
      return;
    }
    if (picked.kind === "too-large") {
      setError("Ảnh này quá nặng dù đã nén hết cỡ. Chọn ảnh khác giúp tôi.");
      return;
    }
    await save(picked.dataUrl);
  }

  async function askRemove() {
    if (busy) return;
    const agreed = await confirmAction({
      title: "Gỡ ảnh đại diện?",
      message: "Hồ sơ sẽ quay lại hiện chữ cái đầu của tên bạn. Đặt ảnh mới lúc nào cũng được.",
      confirmLabel: "Gỡ ảnh",
      cancelLabel: "Giữ lại",
    });
    if (agreed) await save(null);
  }

  return (
    <View>
      <Pressable
        onPress={() => void change()}
        onLongPress={savedAvatar ? () => void askRemove() : undefined}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={savedAvatar ? "Đổi ảnh đại diện" : "Thêm ảnh đại diện"}
        accessibilityHint={savedAvatar ? "Nhấn giữ để gỡ ảnh hiện tại" : undefined}
        style={({ pressed }) => [local.avatar, pressed && { opacity: 0.7 }]}
      >
        {busy ? (
          <ActivityIndicator color={c.primary} />
        ) : savedAvatar ? (
          <Image source={{ uri: savedAvatar }} style={local.avatarImage} />
        ) : (
          <Text style={local.avatarText}>{initialsOf(displayName)}</Text>
        )}
        <View style={local.avatarBadge}>
          <MaterialCommunityIcons name="camera" size={12} color="#FFFFFF" />
        </View>
      </Pressable>
      {error ? <Text style={local.avatarError}>{error}</Text> : null}
    </View>
  );
}

/**
 * Họ và tên — tự sửa được.
 *
 * Trước đây phải nhờ quản trị viên cấp xã, mà tên hiển thị là thứ người điều
 * phối đọc để biết đang nói chuyện với ai. Tên sai nằm đó cho tới khi có người
 * nhớ ra thì báo — đúng lúc cần gọi lại không biết gọi ai.
 *
 * Vẫn giữ trần 2 ký tự và 100 ký tự khớp với máy chủ (`auth/dto.ts`), để nút
 * không bấm được là biết ngay chứ không phải đợi một vòng mạng.
 */
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

function NameSection({
  token,
  user,
  onProfileChanged,
}: {
  token: string;
  user: AuthUser;
  onProfileChanged: (user: AuthUser) => void;
}) {
  const savedName = user.fullName?.trim() || null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const typed = name.trim();
  const valid = typed.length >= NAME_MIN_LENGTH && typed.length <= NAME_MAX_LENGTH;

  async function save() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateOwnProfile(token, { fullName: typed });
      onProfileChanged(updated);
      setEditing(false);
      setNotice("Đã lưu họ và tên.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa lưu được họ và tên");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={local.sectionTitle}>Họ và tên</Text>
      {!editing ? (
        <>
          <View style={local.card}>
            <View style={local.row}>
              <MaterialCommunityIcons name="account-outline" size={18} color={c.muted} />
              <Text style={local.rowLabel}>Tên hiển thị</Text>
              <Text style={local.rowValue} numberOfLines={2}>
                {savedName ?? "Chưa cập nhật"}
              </Text>
            </View>
          </View>
          <View style={local.phoneActions}>
            <Pressable
              onPress={() => {
                setEditing(true);
                setName(savedName ?? "");
                setError(null);
                setNotice(null);
              }}
              accessibilityRole="button"
              style={local.phonePrimary}
            >
              <MaterialCommunityIcons name="account-edit-outline" size={18} color="#FFFFFF" />
              <Text style={local.phonePrimaryText}>{savedName ? "Đổi tên" : "Thêm họ và tên"}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={local.phoneBox}>
          <Text style={local.phoneLabel}>Nhập họ và tên</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={NAME_MAX_LENGTH}
            placeholder="Ví dụ: Nguyễn Văn A"
            placeholderTextColor={c.muted}
            accessibilityLabel="Họ và tên của bạn"
            style={local.phoneInput}
          />
          <Text style={local.phoneHelp}>
            Tên này hiện trong danh sách tài khoản của xã và trên mọi phiếu bạn ký nhận.
          </Text>
          <View style={local.phoneActions}>
            <Pressable
              onPress={() => void save()}
              disabled={busy || !valid}
              accessibilityRole="button"
              style={[local.phonePrimary, (busy || !valid) && local.disabled]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={local.phonePrimaryText}>{busy ? "Đang lưu…" : "Lưu tên"}</Text>
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
  /**
   * Bo tròn đặt trên chính ẢNH, không phải `overflow: "hidden"` ở khối bao.
   *
   * Cắt ở khối bao thì huy hiệu máy ảnh — cũng là con của khối ấy và cố tình
   * thò ra ngoài mép — bị xén mất theo. Ảnh phủ kín 60×60 nên bo 30 là tròn.
   */
  avatarImage: { width: "100%", height: "100%", borderRadius: 30 },
  /**
   * Huy hiệu máy ảnh ở góc dưới phải, thò ra ngoài mép ảnh 2 điểm.
   *
   * Viền cùng màu nền màn hình để nó tách khỏi ảnh dù ảnh sáng hay tối.
   */
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.primary,
    borderWidth: 2,
    borderColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarError: { color: c.red, fontSize: 11, fontWeight: "700", marginTop: 6, maxWidth: 140 },
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

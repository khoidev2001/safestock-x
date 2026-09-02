import { useState, type ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { AuthUser } from "./api";
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
export function AccountScreen({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
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
    { icon: "account-outline", label: "Họ và tên", value: user.fullName?.trim() || "Chưa cập nhật" },
    { icon: "shield-account-outline", label: "Vai trò", value: mobileRoleLabel(user.role) },
    { icon: "email-outline", label: "Email", value: user.email },
    { icon: "phone-outline", label: "Số điện thoại", value: user.phone?.trim() || "Chưa cập nhật" },
  ];
  if (user.unitName) {
    rows.push({ icon: "domain", label: "Đơn vị", value: user.unitName });
  }
  if (user.warehouseName) {
    rows.push({ icon: "package-variant-closed", label: "Kho phụ trách", value: user.warehouseName });
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

        <Text style={local.hint}>
          Thông tin tài khoản do quản trị viên cấp xã cập nhật. Cần sửa họ tên, số điện thoại hay kho
          phụ trách thì báo cho quản trị viên.
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

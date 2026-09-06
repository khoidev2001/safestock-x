import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { kindIcon } from "./disaster";
import { TOAST_VISIBLE_MS, type ToastEntry } from "./notification-feed-state";
import { c } from "./styles";

/**
 * Chồng thông báo nổi ở đầu màn hình.
 *
 * Nổi trên mọi tab chứ không chỉ tab Thông báo: người giữ kho đang kiểm kê mà có
 * lệnh điều phối về thì phải thấy ngay, không đợi tới lúc tình cờ mở tab khác.
 *
 * `pointerEvents="box-none"` ở lớp phủ để chỗ trống hai bên và bên dưới KHÔNG
 * nuốt chạm — thiếu nó thì suốt 5 giây thông báo hiện, cả đầu màn hình không bấm
 * được gì.
 */
export function NotificationToasts({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: ToastEntry[];
  onDismiss: (key: string) => void;
  onOpen: (toast: ToastEntry) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <View style={local.overlay} pointerEvents="box-none">
      {toasts.map((toast) => (
        <Toast key={toast.key} toast={toast} onDismiss={onDismiss} onOpen={onOpen} />
      ))}
    </View>
  );
}

/**
 * Màu theo LOẠI thông báo, không phải một màu chung.
 *
 * Người dùng đang làm việc khác thì cái đầu tiên họ nhận ra là mảng màu, chưa
 * phải chữ. Sự cố mới phát hiện màu đỏ, mức sẵn sàng tụt màu cam, kho đã sẵn
 * hàng hay nhiệm vụ xong màu xanh lá — liếc một cái là biết có phải bỏ việc
 * đang làm để xử lý ngay hay không.
 */
function toneOf(kind: string): { color: string; soft: string; label: string } {
  switch (kind) {
    case "INCIDENT_DETECTED":
      return { color: c.red, soft: "rgba(220,38,38,0.12)", label: "Cảnh huống mới" };
    case "READINESS_DEGRADED":
      return { color: c.amber, soft: c.amberSoft, label: "Mức sẵn sàng tụt" };
    case "WAREHOUSE_READY":
      return { color: c.green, soft: "rgba(21,128,61,0.12)", label: "Kho đã sẵn hàng" };
    case "MISSION_COMPLETED":
      return { color: c.green, soft: "rgba(21,128,61,0.12)", label: "Nhiệm vụ hoàn thành" };
    case "MISSION_CANCELLED":
      return { color: c.muted, soft: c.surfaceAlt, label: "Nhiệm vụ đã huỷ" };
    case "INTER_WAREHOUSE_REQUEST":
      return { color: c.primary, soft: c.primarySoft, label: "Yêu cầu điều chuyển" };
    default:
      return { color: c.primary, soft: c.primarySoft, label: "Thông báo mới" };
  }
}

function Toast({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: ToastEntry;
  onDismiss: (key: string) => void;
  onOpen: (toast: ToastEntry) => void;
}) {
  const tone = toneOf(toast.kind);
  const enter = useRef(new Animated.Value(0)).current;
  // Vạch đếm ngược chạy từ 1 về 0 đúng bằng thời gian thông báo còn hiện.
  const countdown = useRef(new Animated.Value(1)).current;
  // Giữ callback trong ref để bộ đếm 5 giây KHÔNG bị đặt lại mỗi lần component
  // cha render — nếu không, thông báo dồn dập sẽ liên tục làm mới bộ đếm của
  // những cái đang hiện và chúng ở lại vô thời hạn.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(enter, {
        toValue: 1,
        speed: 14,
        bounciness: 7,
        useNativeDriver: true,
      }),
      Animated.timing(countdown, {
        toValue: 0,
        duration: TOAST_VISIBLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();
    const timer = setTimeout(() => dismissRef.current(toast.key), TOAST_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [enter, countdown, toast.key]);

  return (
    <Animated.View
      style={[
        local.toast,
        { borderColor: tone.color, shadowColor: tone.color },
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      {/* Sọc màu dày chạy dọc mép trái — dấu hiệu nhìn thấy được ngay cả bằng
          khoé mắt, khi người dùng đang tập trung vào việc khác giữa màn hình. */}
      <View style={[local.stripe, { backgroundColor: tone.color }]} />
      <Pressable
        onPress={() => onOpen(toast)}
        accessibilityRole="button"
        accessibilityLiveRegion="assertive"
        accessibilityLabel={`${tone.label}: ${toast.title}. ${toast.body}`}
        style={({ pressed }) => [local.body, pressed && { opacity: 0.8 }]}
      >
        <View style={[local.iconBox, { backgroundColor: tone.soft, borderColor: tone.color }]}>
          <Text style={local.icon}>{kindIcon(toast.kind)}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[local.tone, { color: tone.color }]} numberOfLines={1}>
            {tone.label.toUpperCase()}
          </Text>
          <Text style={local.title} numberOfLines={2}>
            {toast.title}
          </Text>
          <Text style={local.text} numberOfLines={3}>
            {toast.body}
          </Text>
          <Text style={[local.cta, { color: tone.color }]}>
            {toast.missionId ? "Chạm để mở nhiệm vụ ›" : "Chạm để xem ›"}
          </Text>
        </View>

        <Pressable
          onPress={() => onDismiss(toast.key)}
          accessibilityRole="button"
          accessibilityLabel="Đóng thông báo"
          // Vùng chạm rộng hơn hình vẽ: dấu × là quá nhỏ để bấm trúng khi đang đi
          // ngoài hiện trường, tay ướt hoặc đeo găng.
          hitSlop={14}
          style={local.close}
        >
          <MaterialCommunityIcons name="close" size={20} color={c.muted} />
        </Pressable>
      </Pressable>

      {/* Đếm ngược bằng scaleX chứ không phải width: chỉ có transform mới chạy
          được trên luồng riêng của giao diện, nên vạch không giật khi màn hình
          đang bận tải dữ liệu. */}
      <View style={local.countdownTrack}>
        <Animated.View
          style={[
            local.countdownFill,
            { backgroundColor: tone.color, transform: [{ scaleX: countdown }] },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const local = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 10,
    left: 8,
    right: 8,
    zIndex: 20,
    // Android không dùng zIndex cho thứ tự vẽ; phải có elevation thì lớp phủ mới
    // nằm trên nội dung màn hình bên dưới.
    elevation: 20,
    gap: 10,
  },
  toast: {
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: c.surface,
    overflow: "hidden",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6 },
  body: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingLeft: 18,
    paddingRight: 12,
    paddingVertical: 14,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 22, lineHeight: 27 },
  tone: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: c.text, fontSize: 16, fontWeight: "900", marginTop: 3, lineHeight: 21 },
  text: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  cta: { fontSize: 12, fontWeight: "800", marginTop: 7 },
  close: { paddingLeft: 4, paddingTop: 2 },

  countdownTrack: { height: 4, backgroundColor: c.border },
  countdownFill: {
    height: 4,
    // Neo về mép trái để vạch rút ngắn từ phải sang, thay vì co lại từ hai đầu.
    width: "100%",
    transformOrigin: "left",
  },
});

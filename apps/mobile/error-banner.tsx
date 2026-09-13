/**
 * Dải báo lỗi trượt lên từ đáy màn hình.
 *
 * Gắn MỘT lần ở gốc ứng dụng; mọi màn gọi `showError(...)` là nó hiện, không phải
 * truyền hàm qua từng lớp component. Trước đây mỗi màn tự giữ một `error` rồi vẽ
 * một dòng chữ đỏ ở đầu trang — mười bảy chỗ, mười bảy kiểu, và chỗ nào cũng nằm
 * ngoài tầm mắt người vừa bấm nút ở giữa màn.
 *
 * Nằm trên thanh tab (`bottom: 76`) chứ không sát đáy: đè lên thanh tab thì đúng
 * lúc báo lỗi lại chặn mất đường thoát sang màn khác.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ERROR_BANNER_VISIBLE_MS,
  createErrorChannel,
  nextErrorBanner,
  type ErrorBanner as ErrorBannerData,
} from "./error-banner-state";
import { c } from "./styles";

type Listener = (message: string) => void;

/**
 * Kênh phát lỗi toàn ứng dụng.
 *
 * Một biến mô-đun chứ không phải React context: lỗi hay được ném ra từ trong
 * `catch` của một hàm bất đồng bộ, chỗ không có hook nào dùng được. Context sẽ
 * bắt mọi hàm như thế phải nhận thêm tham số, hoặc phải bọc lại bằng hook.
 */
const channel = createErrorChannel();

/**
 * Hiện dải lỗi. Gọi được từ bất cứ đâu, kể cả ngoài component.
 *
 * Lỗi đi tới dải gắn SAU CÙNG — xem `createErrorChannel` về chuyện biểu mẫu mở
 * bằng `Modal` che mất dải của app.
 */
export function showError(message: string): void {
  channel.emit(message);
}

/**
 * Thả vào đúng chỗ dòng chữ đỏ cũ: không vẽ gì, chỉ đẩy lỗi xuống dải ở đáy.
 *
 * Làm thành component thay vì bắt mỗi màn tự viết `useEffect`: mỗi tệp có nhiều
 * component con, mỗi con giữ một `error` riêng, và đặt hook nhầm cấp thì lỗi của
 * hộp thoại lại nổ ra ở màn nền. Thả đúng chỗ cũ thì không thể nhầm cấp.
 */
export function ErrorLine({ error }: { error: string | null | undefined }) {
  useEffect(() => {
    if (error) showError(error);
  }, [error]);
  return null;
}

/** Dải lỗi. Gắn một lần, đặt SAU nội dung để nó nằm trên cùng. */
/**
 * `bottom`: khoảng cách tới đáy. Mặc định chừa chỗ cho thanh tab; trong một biểu
 * mẫu toàn màn hình không có thanh tab thì hạ thấp xuống sát đáy.
 */
export function ErrorBanner({ bottom = 76 }: { bottom?: number } = {}) {
  const [banner, setBanner] = useState<ErrorBannerData | null>(null);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener: Listener = (message) => {
      setBanner((current) => nextErrorBanner(current, message, Date.now()));
    };
    return channel.subscribe(listener);
  }, []);

  useEffect(() => {
    if (!banner) return;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => setBanner(null), ERROR_BANNER_VISIBLE_MS);
    return () => clearTimeout(timer);
    // Chạy lại theo `key`, không theo cả đối tượng: cùng một lỗi lặp lại thì
    // `nextErrorBanner` trả về đúng đối tượng cũ, và bộ đếm phải được giữ nguyên.
  }, [banner?.key, banner, enter]);

  if (!banner) return null;
  return (
    <Animated.View
      style={[
        local.wrap,
        { bottom },
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) },
          ],
        },
      ]}
      // Chỉ chính dải này nhận chạm; khoảng trống quanh nó không được nuốt thao tác.
      pointerEvents="box-none"
      accessibilityRole="alert"
    >
      <View style={local.banner}>
        <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#FFFFFF" />
        <Text style={local.text} numberOfLines={4}>
          {banner.message}
        </Text>
        <Pressable
          onPress={() => setBanner(null)}
          accessibilityRole="button"
          accessibilityLabel="Đóng báo lỗi"
          hitSlop={10}
        >
          <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const local = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    // Trên thanh tab: đè lên nó thì lúc báo lỗi lại chặn mất đường sang màn khác.
    bottom: 76,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.red,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    // Bóng đổ để dải tách khỏi nội dung phía sau, kể cả khi nền cũng đang đỏ.
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  // `flex: 1` để câu dài đẩy nút đóng ra sát mép phải thay vì tràn ra ngoài.
  text: { flex: 1, color: "#FFFFFF", fontSize: 13, fontWeight: "700", lineHeight: 18 },
});

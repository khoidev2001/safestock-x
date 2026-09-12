import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushDevice, unregisterPushDevice } from "./api";

/**
 * Thông báo đẩy: xin quyền, lấy token của máy, ghi danh với máy chủ xã.
 *
 * Vì sao cần: kênh thời gian thực qua socket chỉ sống khi app đang mở. Lệnh điều
 * phối thì gửi bất cứ lúc nào — kể cả hai giờ sáng, tới người đang để máy trong
 * túi. Không có lớp này thì lệnh nằm chờ tới khi ai đó tự mở app ra xem.
 *
 * Mọi hàm ở đây đều NUỐT LỖI và trả về trạng thái, không ném ra ngoài. Máy không
 * có Google Play, người dùng từ chối quyền, hay máy chủ chưa cấu hình Firebase —
 * cả ba đều là chuyện bình thường ngoài hiện trường, và không cái nào được phép
 * chặn người ta đăng nhập vào làm việc.
 */

/** Kênh thông báo của Android — quyết định máy có rung và kêu hay chỉ hiện lặng lẽ. */
const CHANNEL_ID = "ung-pho-nhanh-nhiem-vu";

export type PushSetupResult =
  | { status: "ready"; pushToken: string }
  | { status: "denied" }
  | { status: "unsupported"; reason: string };

/**
 * Thông báo đến lúc app đang mở thì vẫn hiện lên và kêu.
 *
 * Mặc định của hệ thống là im lặng khi app ở tiền cảnh, với lý do "người dùng
 * đang nhìn màn hình rồi". Ở đây thì không đúng: người trực có thể đang mở màn
 * hình kho trong khi lệnh mới rơi vào — im lặng là bỏ lỡ.
 */
export function configureForegroundBehavior(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Tạo kênh thông báo Android.
 *
 * Bắt buộc với Android 8 trở lên: không khai kênh thì thông báo rơi vào kênh mặc
 * định, và mức ưu tiên mặc định KHÔNG bật màn hình cũng không đổ chuông. Lệnh
 * điều phối cần cả hai.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Lệnh điều phối",
    description: "Nhiệm vụ cứu hộ, yêu cầu chuẩn bị vật tư và cảnh báo kho.",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 260, 120, 260],
    lightColor: "#2f9e6e",
    sound: "default",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Xin quyền và lấy token FCM của máy này.
 *
 * Dùng `getDevicePushTokenAsync` (token FCM thật) chứ không phải token của dịch
 * vụ đẩy Expo: bản APK này build tại chỗ bằng Gradle và máy chủ gọi thẳng FCM,
 * nên không có khâu nào của Expo đứng giữa để đổi token.
 */
export async function setupPushNotifications(): Promise<PushSetupResult> {
  if (!Device.isDevice) {
    return { status: "unsupported", reason: "Máy ảo không nhận được thông báo đẩy" };
  }
  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return { status: "denied" };

    const token = await Notifications.getDevicePushTokenAsync();
    const value = typeof token.data === "string" ? token.data : String(token.data);
    if (!value) return { status: "unsupported", reason: "Không lấy được mã thiết bị" };
    return { status: "ready", pushToken: value };
  } catch (error) {
    // Máy không có dịch vụ Google Play, hoặc bản build thiếu google-services.json.
    return {
      status: "unsupported",
      reason: error instanceof Error ? error.message : "Thiết bị không hỗ trợ thông báo đẩy",
    };
  }
}

/** Tên máy để người dùng nhận ra thiết bị của mình trong danh sách. */
export function deviceLabel(): string {
  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(" ").trim();
  return name || "Thiết bị Android";
}

/**
 * Ghi danh máy với máy chủ, sau khi đã đăng nhập.
 *
 * Trả về token đã ghi danh để nơi gọi giữ lại — lúc đăng xuất cần đúng token đó
 * để gỡ. Thất bại thì trả null và không nói gì thêm: người dùng vẫn làm việc bình
 * thường, chỉ là máy chưa nhận được thông báo khi đóng app.
 */
export async function registerForPush(sessionToken: string): Promise<string | null> {
  const result = await setupPushNotifications();
  if (result.status !== "ready") return null;
  try {
    await registerPushDevice(sessionToken, {
      pushToken: result.pushToken,
      platform: Platform.OS === "ios" ? "ios" : "android",
      deviceName: deviceLabel(),
    });
    return result.pushToken;
  } catch {
    return null;
  }
}

/** Gỡ máy khỏi danh sách nhận. Best-effort: mất mạng thì vẫn cho đăng xuất. */
export async function unregisterForPush(
  sessionToken: string,
  pushToken: string | null,
): Promise<void> {
  if (!pushToken) return;
  try {
    await unregisterPushDevice(sessionToken, pushToken);
  } catch {
    /* Đăng xuất không được phép hỏng vì lý do này. */
  }
}
